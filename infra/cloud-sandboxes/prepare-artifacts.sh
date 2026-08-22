#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
artifacts_dir="$script_dir/artifacts"

mkdir -p "$artifacts_dir"
cd "$repo_root"

bun run --filter @zusehq/server build:bundle
bun run --filter @zusehq/serve build
if rg -q '^import .* from "(effect|@zusehq/server)(/[^" ]*)?"|^import\("(effect|@zusehq/server)(/[^" ]*)?"\)' \
  packages/serve/dist --glob '*.mjs'; then
	printf 'Cloud sandbox serve bundle contains an unresolved runtime import.\n' >&2
  exit 1
fi
npm pack ./apps/server --pack-destination "$artifacts_dir"
npm pack ./packages/serve --pack-destination "$artifacts_dir"
server_version="$(node -p "require('./apps/server/package.json').version")"
serve_version="$(node -p "require('./packages/serve/package.json').version")"
cp "$artifacts_dir/zusehq-server-$server_version.tgz" \
  "$artifacts_dir/zusehq-server.tgz"
cp "$artifacts_dir/zusehq-serve-$serve_version.tgz" \
  "$artifacts_dir/zusehq-serve.tgz"
cp "$repo_root/apps/server/scripts/runtime-updater.mjs" \
  "$artifacts_dir/runtime-updater.mjs"
