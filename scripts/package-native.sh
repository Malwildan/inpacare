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
test -f apps/api/dist/main.js
test -f apps/api/dist/database/cli.js
mkdir -p "$stage/apps/api" "$stage/apps/web" "$stage/scripts"
cp apps/api/package.json "$stage/apps/api/"
cp -R apps/api/dist "$stage/apps/api/"
cp -R apps/web/build "$stage/apps/web/"
cp package.json package-lock.json "$stage/"
cp apps/web/package.json "$stage/apps/web/"
cp scripts/native-host.sh scripts/native-web.mjs "$stage/scripts/"
printf '%s\n' "$revision" > "$stage/REVISION"
tar -czf "$output/inpacare-linux-x86_64.tar.gz" -C "$stage" \
  REVISION apps package.json package-lock.json scripts
cd "$output"
sha256sum inpacare-linux-x86_64.tar.gz > SHA256SUMS
