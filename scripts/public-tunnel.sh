#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
BIN="$ROOT/.runtime/ngrok/ngrok"
CONFIG="$ROOT/.data/ngrok.yml"
case "${1:-url}" in
  install)
    test -f "$ROOT/.data/native.env"
    test -f "$ROOT/apps/web/build/handler.js"
    if [ ! -f "$CONFIG" ]; then printf '%s\n' 'Missing .data/ngrok.yml; see docs/deployment/NATIVE_HOSTING.md for private configuration.' >&2; exit 1; fi
    if [ ! -x "$BIN" ]; then python3 "$ROOT/scripts/setup-ngrok.py"; fi
    chmod 600 "$CONFIG"
    "$BIN" config check --config "$CONFIG"
    export INPACARE_ROOT="$ROOT"
    python3 - <<'PY'
import os,pathlib,socket
root=pathlib.Path(os.environ['INPACARE_ROOT']);path=root/'.data/native.env'
lines=path.read_text().splitlines()
existing=[line.split('=',1)[1] for line in lines if line.startswith('HTTPS_PROXY_PORT=')]
if existing and existing!=['8089']:raise SystemExit('Existing HTTPS proxy port differs; preserving its configuration.')
if not existing:
    with socket.socket() as probe:
        try:probe.bind(('127.0.0.1',8089))
        except OSError:raise SystemExit('Port 8089 is already occupied; no configuration was changed.')
    with path.open('a') as stream:stream.write('HTTPS_PROXY_PORT=8089\n')
    path.chmod(0o600)
PY
    mkdir -p "$HOME/.config/systemd/user"
    sed "s|@ROOT@|$ROOT|g" "$ROOT/ops/native/inpacare-ngrok.service" > "$HOME/.config/systemd/user/inpacare-ngrok.service"
    systemd-analyze --user verify "$HOME/.config/systemd/user/inpacare-ngrok.service"
    systemctl --user daemon-reload
    systemctl --user restart inpacare-web
    systemctl --user enable --now inpacare-ngrok
    ;;
  start) systemctl --user start inpacare-ngrok ;;
  stop) systemctl --user stop inpacare-ngrok ;;
  status) systemctl --user status inpacare-ngrok --no-pager ;;
  url)
    if ! systemctl --user --quiet is-active inpacare-ngrok; then printf '%s\n' 'The public tunnel is not running.' >&2; exit 1; fi
    python3 - <<'PY'
import json,urllib.request
with urllib.request.urlopen('http://127.0.0.1:4049/api/tunnels',timeout=4) as response:state=json.load(response)
urls=[t['public_url'] for t in state.get('tunnels',[]) if t.get('public_url','').startswith('https://')]
if not urls:raise SystemExit('The ngrok endpoint is not ready; try again shortly.')
print(urls[0])
PY
    ;;
  *) printf '%s\n' 'Usage: public-tunnel.sh install|start|stop|status|url' >&2; exit 2 ;;
esac
