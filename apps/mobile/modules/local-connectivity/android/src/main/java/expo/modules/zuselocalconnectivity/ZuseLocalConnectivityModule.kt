package expo.modules.zuselocalconnectivity

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import kotlin.math.min
import kotlin.math.pow

private const val TAG = "zuse-nearby"
private const val SERVICE_TYPE = "_zuse._tcp."

class NearbyServiceRecord : Record {
  @Field
  var name: String = ""

  @Field
  var type: String = "_zuse._tcp"

  @Field
  var domain: String = "local."

  @Field
  var tlsCertificatePin: String = ""
}

/**
 * Android counterpart of the Apple Network.framework bridge: NSD discovery of
 * `_zuse._tcp` plus a localhost TCP proxy that checks the same SHA-256
 * certificate pin the iOS browser publishes.
 */
class ZuseLocalConnectivityModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val endpoints = ConcurrentHashMap<String, ResolvedService>()
  private val proxies = ConcurrentHashMap<String, LocalProxy>()
  private val pendingResolves = ArrayDeque<NsdServiceInfo>()

  private var nsdManager: NsdManager? = null
  private var connectivityManager: ConnectivityManager? = null
  private var multicastLock: WifiManager.MulticastLock? = null
  private var discovering = false
  private var resolving = false
  private var pathRegistered = false
  private var ignoreNextPath = false
  private var wantDiscovery = false
  private var browserGeneration = 0
  private var pathGeneration = 0
  private var retryAttempt = 0
  private var lastPathSignature: String? = null

  private val retryRunnable = Runnable { startBrowser() }
  private val pathRestartRunnable = Runnable {
    if (!wantDiscovery) return@Runnable
    stopBrowser()
    startBrowser()
  }

  override fun definition() = ModuleDefinition {
    Name("ZuseLocalConnectivity")
    Events("onServicesChanged", "onPathChanged", "onDiscoveryStateChanged")

    AsyncFunction("startDiscovery") {
      mainHandler.post { startDiscoveryOnMain() }
    }

    AsyncFunction("stopDiscovery") {
      mainHandler.post { stopDiscoveryOnMain() }
    }

    AsyncFunction("openProxy") { service: NearbyServiceRecord ->
      openProxy(service)
    }

    AsyncFunction("closeProxy") { id: String ->
      proxies.remove(id)?.close()
    }

    OnActivityEntersForeground {
      mainHandler.post { startDiscoveryOnMain() }
    }

    OnActivityEntersBackground {
      mainHandler.post { stopDiscoveryOnMain() }
    }

    OnDestroy {
      mainHandler.post { stopDiscoveryOnMain() }
    }
  }

  private fun context(): Context =
    appContext.reactContext ?: error("React context is unavailable")

  private fun startDiscoveryOnMain() {
    wantDiscovery = true
    val appContext = context().applicationContext
    if (nsdManager == null) {
      nsdManager = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    }
    if (connectivityManager == null) {
      connectivityManager =
        appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }
    acquireMulticastLock(appContext)
    registerPathMonitor()
    startBrowser()
  }

  private fun stopDiscoveryOnMain() {
    wantDiscovery = false
    mainHandler.removeCallbacks(retryRunnable)
    mainHandler.removeCallbacks(pathRestartRunnable)
    stopBrowser()
    unregisterPathMonitor()
    endpoints.clear()
    emitServices()
    proxies.values.forEach { it.close() }
    proxies.clear()
    multicastLock?.let { lock ->
      if (lock.isHeld) lock.release()
    }
    multicastLock = null
  }

  private fun startBrowser() {
    if (!wantDiscovery || discovering) return
    val nsd = nsdManager ?: return
    browserGeneration += 1
    pendingResolves.clear()
    resolving = false
    emitState("starting")
    try {
      nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
      discovering = true
    } catch (error: Exception) {
      discovering = false
      Log.w(TAG, "discoverServices failed", error)
      emitState("failed", error.message ?: "discover_failed")
      scheduleRetry()
    }
  }

  private fun stopBrowser() {
    if (!discovering) return
    discovering = false
    pendingResolves.clear()
    resolving = false
    try {
      nsdManager?.stopServiceDiscovery(discoveryListener)
    } catch (error: Exception) {
      Log.w(TAG, "stopServiceDiscovery failed", error)
    }
  }

  private fun scheduleRetry() {
    if (!wantDiscovery) return
    retryAttempt += 1
    val seconds = min(16.0, 2.0.pow(maxOf(0, retryAttempt - 1).toDouble()))
    mainHandler.removeCallbacks(retryRunnable)
    mainHandler.postDelayed(retryRunnable, (seconds * 1000).toLong())
  }

  private fun enqueueResolve(info: NsdServiceInfo) {
    pendingResolves.add(info)
    pumpResolve()
  }

  @Suppress("DEPRECATION")
  private fun pumpResolve() {
    if (resolving) return
    val next = pendingResolves.removeFirstOrNull() ?: return
    val nsd = nsdManager ?: return
    resolving = true
    try {
      nsd.resolveService(next, resolveListener)
    } catch (error: Exception) {
      resolving = false
      Log.w(TAG, "resolveService failed", error)
      mainHandler.post { pumpResolve() }
    }
  }

  private fun remember(info: NsdServiceInfo) {
    val rawPin = info.attributes?.get("tls")?.toString(Charsets.UTF_8)?.trim() ?: return
    if (rawPin.length != 43) return
    @Suppress("DEPRECATION")
    val host = info.host ?: return
    if (info.port <= 0) return
    val type = info.serviceType.removeSuffix(".").ifEmpty { "_zuse._tcp" }
    endpoints[rawPin] =
      ResolvedService(
        name = info.serviceName,
        type = type,
        domain = "local.",
        pin = rawPin,
        host = host,
        port = info.port,
      )
    emitServices()
  }

  private fun emitServices() {
    val generation = browserGeneration
    val services =
      endpoints.values.map { service ->
        mapOf(
          "id" to "${service.name}|${service.type}|${service.domain}|$generation",
          "name" to service.name,
          "type" to service.type,
          "domain" to service.domain,
          "tlsCertificatePin" to service.pin,
        )
      }
    sendEvent(
      "onServicesChanged",
      mapOf("services" to services),
    )
    sendEvent(
      "onDiscoveryStateChanged",
      mapOf(
        "state" to "ready",
        "rawResultCount" to services.size,
        "serviceCount" to services.size,
      ),
    )
  }

  private fun emitState(state: String, reason: String? = null) {
    val body = mutableMapOf<String, Any?>("state" to state)
    if (reason != null) body["reason"] = reason
    sendEvent("onDiscoveryStateChanged", body)
  }

  private fun openProxy(service: NearbyServiceRecord): Map<String, Any> {
    val endpoint =
      endpoints.values.firstOrNull {
        it.name == service.name && it.pin == service.tlsCertificatePin
      } ?: throw IllegalStateException("nearby_service_unresolved")
    val proxy = LocalProxy(endpoint)
    val port = proxy.start()
    proxies[proxy.id] = proxy
    return mapOf("id" to proxy.id, "host" to "127.0.0.1", "port" to port)
  }

  private fun acquireMulticastLock(appContext: Context) {
    if (multicastLock?.isHeld == true) return
    try {
      val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      multicastLock =
        wifi.createMulticastLock("zuse-nearby").apply {
          setReferenceCounted(false)
          acquire()
        }
    } catch (error: Exception) {
      Log.w(TAG, "multicast lock unavailable", error)
    }
  }

  private fun registerPathMonitor() {
    if (pathRegistered) return
    val manager = connectivityManager ?: return
    ignoreNextPath = true
    try {
      manager.registerDefaultNetworkCallback(networkCallback)
      pathRegistered = true
    } catch (error: Exception) {
      ignoreNextPath = false
      Log.w(TAG, "path monitor unavailable", error)
    }
  }

  private fun unregisterPathMonitor() {
    if (!pathRegistered) return
    pathRegistered = false
    lastPathSignature = null
    try {
      connectivityManager?.unregisterNetworkCallback(networkCallback)
    } catch (error: Exception) {
      Log.w(TAG, "unregister path monitor failed", error)
    }
  }

  private fun emitPath(network: Network?, restartBrowser: Boolean) {
    val manager = connectivityManager
    val caps = network?.let { manager?.getNetworkCapabilities(it) }
    val satisfied =
      caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    val usesWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    val usesCellular = caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true
    val status = if (satisfied) "satisfied" else "unsatisfied"
    val signature = "$status|$usesWifi|$usesCellular"
    if (signature == lastPathSignature && !restartBrowser) return
    val changed = signature != lastPathSignature
    lastPathSignature = signature
    pathGeneration += 1
    sendEvent(
      "onPathChanged",
      mapOf(
        "status" to status,
        "usesWifi" to usesWifi,
        "usesCellular" to usesCellular,
        "generation" to pathGeneration,
      ),
    )
    if (restartBrowser && changed && satisfied) {
      mainHandler.removeCallbacks(pathRestartRunnable)
      mainHandler.postDelayed(pathRestartRunnable, 500)
    }
  }

  private val discoveryListener =
    object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String) {
        retryAttempt = 0
        emitState("ready")
      }

      override fun onDiscoveryStopped(serviceType: String) {
        emitState("stopped")
      }

      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        discovering = false
        emitState("failed", "start_$errorCode")
        scheduleRetry()
      }

      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        discovering = false
      }

      override fun onServiceFound(serviceInfo: NsdServiceInfo) {
        mainHandler.post { enqueueResolve(serviceInfo) }
      }

      override fun onServiceLost(serviceInfo: NsdServiceInfo) {
        mainHandler.post {
          val removed = endpoints.entries.removeIf { it.value.name == serviceInfo.serviceName }
          if (removed) emitServices()
        }
      }
    }

  @Suppress("DEPRECATION")
  private val resolveListener =
    object : NsdManager.ResolveListener {
      override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
        resolving = false
        mainHandler.post { pumpResolve() }
      }

      override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
        remember(serviceInfo)
        resolving = false
        mainHandler.post { pumpResolve() }
      }
    }

  private val networkCallback =
    object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        val restart = !ignoreNextPath
        ignoreNextPath = false
        emitPath(network, restartBrowser = restart)
      }

      override fun onLost(network: Network) {
        emitPath(null, restartBrowser = false)
      }

      override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
        if (ignoreNextPath) return
        emitPath(network, restartBrowser = false)
      }
    }
}

private data class ResolvedService(
  val name: String,
  val type: String,
  val domain: String,
  val pin: String,
  val host: InetAddress,
  val port: Int,
)

private class LocalProxy(private val endpoint: ResolvedService) {
  val id: String = UUID.randomUUID().toString()
  private val server = ServerSocket()
  private val closed = AtomicBoolean(false)

  fun start(): Int {
    server.reuseAddress = true
    server.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
    server.soTimeout = 500
    thread(name = "zuse-proxy-accept-$id", isDaemon = true) {
      while (!closed.get()) {
        try {
          val client = server.accept()
          thread(name = "zuse-proxy-session-$id", isDaemon = true) { bridge(client) }
        } catch (_: SocketTimeoutException) {
        } catch (_: IOException) {
          break
        }
      }
    }
    return server.localPort
  }

  fun close() {
    if (!closed.compareAndSet(false, true)) return
    runCatching { server.close() }
  }

  private fun bridge(client: Socket) {
    var remote: Socket? = null
    try {
      client.tcpNoDelay = true
      remote = connectPinned(endpoint)
      remote.tcpNoDelay = true
      val finished = AtomicBoolean(false)
      fun finish() {
        if (!finished.compareAndSet(false, true)) return
        runCatching { client.close() }
        runCatching { remote?.close() }
      }
      thread(isDaemon = true) {
        pump(client.getInputStream(), remote.getOutputStream(), ::finish)
      }
      pump(remote.getInputStream(), client.getOutputStream(), ::finish)
    } catch (error: Exception) {
      Log.w(TAG, "proxy session failed", error)
      runCatching { client.close() }
      runCatching { remote?.close() }
    }
  }
}

private fun pump(input: InputStream, output: OutputStream, onDone: () -> Unit) {
  try {
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
      output.flush()
    }
  } catch (_: IOException) {
  } finally {
    onDone()
  }
}

private fun connectPinned(endpoint: ResolvedService): SSLSocket {
  val sslContext = SSLContext.getInstance("TLS")
  sslContext.init(null, arrayOf<TrustManager>(PinningTrustManager(endpoint.pin)), SecureRandom())
  val socket = sslContext.socketFactory.createSocket() as SSLSocket
  socket.soTimeout = 20_000
  socket.connect(InetSocketAddress(endpoint.host, endpoint.port), 8_000)
  val parameters = socket.sslParameters
  parameters.endpointIdentificationAlgorithm = null
  socket.sslParameters = parameters
  socket.startHandshake()
  return socket
}

private class PinningTrustManager(private val expectedPin: String) : X509TrustManager {
  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    throw CertificateException("client auth is not used")
  }

  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    val leaf = chain?.firstOrNull() ?: throw CertificateException("empty certificate chain")
    val actual = sha256Base64Url(leaf.encoded)
    if (actual != expectedPin) throw CertificateException("certificate pin mismatch")
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

private fun sha256Base64Url(data: ByteArray): String {
  val digest = MessageDigest.getInstance("SHA-256").digest(data)
  return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}

private fun thread(name: String? = null, isDaemon: Boolean = false, block: () -> Unit): Thread {
  val created =
    if (name == null) Thread(block) else Thread(block, name)
  created.isDaemon = isDaemon
  created.start()
  return created
}
