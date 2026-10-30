#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
RUNTIME="$ROOT/.runtime"
DOWNLOADS="$RUNTIME/downloads"
mkdir -p "$DOWNLOADS" "$RUNTIME/postgres" "$ROOT/.data"
chmod 700 "$ROOT/.data"
if [ ! -x "$RUNTIME/node/bin/node" ]; then
  node_version=v24.18.1
  archive="node-$node_version-linux-x64.tar.xz"
  curl -fLsS --retry 2 --connect-timeout 20 "https://nodejs.org/dist/$node_version/$archive" -o "$DOWNLOADS/$archive"
  curl -fLsS --retry 2 --connect-timeout 20 "https://nodejs.org/dist/$node_version/SHASUMS256.txt" -o "$DOWNLOADS/node-SHASUMS256.txt"
  (cd "$DOWNLOADS"; grep " $archive\$" node-SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$DOWNLOADS/$archive" -C "$RUNTIME"
  mv "$RUNTIME/node-$node_version-linux-x64" "$RUNTIME/node"
fi
if [ ! -x "$RUNTIME/postgres/usr/lib/postgresql/16/bin/postgres" ]; then
  mkdir -p "$DOWNLOADS/debs"
  (cd "$DOWNLOADS/debs"; apt-get download postgresql-16 postgresql-client-16 libpq5 libllvm17t64 libldap2)
  for package in "$DOWNLOADS/debs/"*.deb; do dpkg-deb -x "$package" "$RUNTIME/postgres"; done
fi
export LD_LIBRARY_PATH="$RUNTIME/postgres/usr/lib/x86_64-linux-gnu:$RUNTIME/postgres/usr/lib/postgresql/16/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$RUNTIME/node/bin/node" --version
"$RUNTIME/postgres/usr/lib/postgresql/16/bin/postgres" --version
missing=$(ldd "$RUNTIME/postgres/usr/lib/postgresql/16/bin/postgres" | grep 'not found' || true)
if [ -n "$missing" ]; then printf '%s\n' "$missing" >&2; exit 1; fi
printf '%s\n' 'Native Linux tools are installed inside the project. No system packages or services were modified.'
