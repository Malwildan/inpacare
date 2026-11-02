#!/usr/bin/env bash
set -euo pipefail
SOURCE=$(cd -- "$(dirname -- "$0")/.." && pwd)
ROOT=$(cd -- "${1:?Usage: install-native-cd.sh EXISTING_APP_ROOT}" && pwd)
[[ "$(uname -s)" = Linux ]] && [[ "$(uname -m)" = x86_64 ]]
python3 -c 'import sys; assert sys.version_info >= (3, 12), "Python 3.12+ is required"'
[[ "$ROOT" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Use an absolute app path without spaces or shell metacharacters.' >&2; exit 1; }
test -f "$ROOT/.data/native.env"
test -f "$ROOT/.data/postgres/PG_VERSION"
test -x "$ROOT/.runtime/node/bin/node"
test -x "$ROOT/.runtime/node/bin/npm"
test -x "$ROOT/.runtime/postgres/usr/lib/postgresql/16/bin/pg_dump"
systemctl --user is-active --quiet inpacare-db inpacare-api inpacare-web
umask 077
mkdir -p "$ROOT/.deploy/releases" "$HOME/.config/systemd/user"
if [ ! -L "$ROOT/.deploy/current" ]; then
  test ! -e "$ROOT/.deploy/current"
  ln -s "$ROOT" "$ROOT/.deploy/current"
fi
install -m 700 "$SOURCE/scripts/deploy-native.py" "$ROOT/.deploy/deploy-native.py"
# Keep the optional tunnel alive while CD intentionally restarts API/web.
tunnel_unit="$HOME/.config/systemd/user/inpacare-ngrok.service"
if [ -f "$tunnel_unit" ]; then
  sed -i 's/^Requires=inpacare-web\.service$/Wants=inpacare-web.service/' "$tunnel_unit"
fi
for service in api web; do
  dropin="$HOME/.config/systemd/user/inpacare-$service.service.d"
  mkdir -p "$dropin"
  cat > "$dropin/continuous-delivery.conf" <<EOF
[Service]
ExecStart=
ExecStart=/bin/bash "$ROOT/.deploy/current/scripts/native-host.sh" run-$service
WorkingDirectory=$ROOT/.deploy/current
EOF
done
for unit in inpacare-update.service inpacare-update.timer; do
  sed "s|@ROOT@|$ROOT|g" "$SOURCE/ops/native/$unit" > "$HOME/.config/systemd/user/$unit"
done
systemd-analyze --user verify "$HOME/.config/systemd/user/inpacare-update.service" "$HOME/.config/systemd/user/inpacare-update.timer"
systemctl --user daemon-reload
systemctl --user enable --now inpacare-update.timer
echo 'Native CD is enabled. The running API, frontend, database, and tunnel were not restarted.'
systemctl --user list-timers inpacare-update.timer --no-pager
