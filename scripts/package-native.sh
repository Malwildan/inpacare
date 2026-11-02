#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
revision=${1:?Usage: package-native.sh COMMIT_SHA OUTPUT_DIRECTORY}
output=${2:?Usage: package-native.sh COMMIT_SHA OUTPUT_DIRECTORY}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }
mkdir -p "$output"
output=$(cd -- "$output" && pwd)
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
cd "$ROOT"
test -f apps/web/build/index.js
test -f apps/web/build/handler.js
binary=apps/api/target/x86_64-unknown-linux-musl/release/inpacare-api
test -x "$binary"
# A native release must not depend on the build runner's dynamic loader.
if readelf --program-headers "$binary" | grep -q INTERP; then
  echo 'Expected a static Linux API executable.' >&2
  exit 1
fi
mkdir -p "$stage/bin" "$stage/apps/web" "$stage/scripts"
install -m 755 "$binary" "$stage/bin/inpacare-api"
cp -R apps/web/build "$stage/apps/web/"
cp package.json package-lock.json "$stage/"
cp apps/web/package.json "$stage/apps/web/"
cp scripts/native-host.sh scripts/native-web.mjs "$stage/scripts/"
printf '%s\n' "$revision" > "$stage/REVISION"
tar -czf "$output/inpacare-linux-x86_64.tar.gz" -C "$stage" \
  REVISION bin apps package.json package-lock.json scripts
cd "$output"
sha256sum inpacare-linux-x86_64.tar.gz > SHA256SUMS
