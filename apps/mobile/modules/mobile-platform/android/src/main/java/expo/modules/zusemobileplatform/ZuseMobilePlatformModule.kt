package expo.modules.zusemobileplatform

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Android stand-in for the iOS Quick Look, Photos, and background-task bridge.
 * Background execution stays best-effort: there is no UIApplication task, so
 * the ids match the "no task" result the JS already treats as optional.
 */
class ZuseMobilePlatformModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ZuseMobilePlatform")

    AsyncFunction("beginBackgroundTask") { 0 }

    AsyncFunction("endBackgroundTask") { _: Int -> }

    AsyncFunction("saveImageToPhotos") { uri: String ->
      saveImage(uri)
    }

    Function("presentQuickLook") { uri: String ->
      openExternal(uri, Intent.ACTION_VIEW, "")
    }

    Function("shareFile") { uri: String, title: String ->
      openExternal(uri, Intent.ACTION_SEND, title)
    }
  }

  private fun context() = appContext.reactContext

  private fun authority(): String? {
    val packageName = context()?.packageName ?: return null
    return "$packageName.zusemobileplatform.fileprovider"
  }

  private fun saveImage(uri: String): Boolean {
    val context = context() ?: return false
    val mime = mimeType(uri).ifBlank { "image/jpeg" }
    val resolver = context.contentResolver
    val values =
      ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName(uri))
        put(MediaStore.Images.Media.MIME_TYPE, mime)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(
            MediaStore.Images.Media.RELATIVE_PATH,
            "${Environment.DIRECTORY_PICTURES}/Zuse",
          )
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      }
    val collection =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      }
    val destination = resolver.insert(collection, values) ?: return false
    try {
      val input = openInput(uri) ?: throw IOException("unreadable image")
      val output =
        resolver.openOutputStream(destination) ?: throw IOException("unwritable image")
      output.use { target ->
        input.use { source -> source.copyTo(target) }
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val published = ContentValues()
        published.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(destination, published, null, null)
      }
      return true
    } catch (_: IOException) {
      resolver.delete(destination, null, null)
      return false
    } catch (_: SecurityException) {
      resolver.delete(destination, null, null)
      return false
    }
  }

  private fun openExternal(uri: String, action: String, title: String): Boolean {
    val context = context() ?: return false
    val content = shareableUri(uri) ?: return false
    val mime = mimeType(uri).ifBlank { "application/octet-stream" }
    val intent =
      Intent(action).apply {
        if (action == Intent.ACTION_SEND) {
          type = mime
          putExtra(Intent.EXTRA_STREAM, content)
          if (title.isNotEmpty()) putExtra(Intent.EXTRA_TITLE, title)
        } else {
          setDataAndType(content, mime)
        }
        clipData = android.content.ClipData.newRawUri(title, content)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    val chooser =
      Intent.createChooser(intent, title.ifBlank { "Open" }).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    return onMain {
      try {
        val activity: Activity? = appContext.currentActivity
        if (activity != null) {
          activity.startActivity(chooser)
        } else {
          context.startActivity(chooser)
        }
        true
      } catch (_: ActivityNotFoundException) {
        false
      }
    }
  }

  private fun shareableUri(uri: String): Uri? {
    val context = context() ?: return null
    val parsed = Uri.parse(uri)
    if (parsed.scheme == "content") return parsed
    val source = fileFor(uri) ?: return null
    val authority = authority() ?: return null
    return try {
      FileProvider.getUriForFile(context, authority, source)
    } catch (_: IllegalArgumentException) {
      val copy = File(context.cacheDir, "zuse-share/${source.name}")
      copy.parentFile?.mkdirs()
      source.copyTo(copy, overwrite = true)
      FileProvider.getUriForFile(context, authority, copy)
    }
  }

  private fun openInput(uri: String) =
    when (Uri.parse(uri).scheme) {
      "content" -> context()?.contentResolver?.openInputStream(Uri.parse(uri))
      else -> fileFor(uri)?.let { FileInputStream(it) }
    }

  private fun fileFor(uri: String): File? {
    val parsed = Uri.parse(uri)
    val path =
      when (parsed.scheme) {
        "file" -> parsed.path
        null -> uri
        else -> null
      } ?: return null
    val file = File(path)
    return if (file.isFile) file else null
  }

  private fun displayName(uri: String): String {
    val name = Uri.parse(uri).lastPathSegment?.substringAfterLast('/')?.trim().orEmpty()
    return if (name.isEmpty()) "image.jpg" else name
  }

  private fun mimeType(uri: String): String {
    val extension = displayName(uri).substringAfterLast('.', "").lowercase()
    if (extension.isEmpty()) return ""
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: ""
  }

  private fun onMain(block: () -> Boolean): Boolean {
    if (Looper.myLooper() == Looper.getMainLooper()) return block()
    val latch = CountDownLatch(1)
    var result = false
    mainHandler.post {
      result = block()
      latch.countDown()
    }
    latch.await(2, TimeUnit.SECONDS)
    return result
  }
}
