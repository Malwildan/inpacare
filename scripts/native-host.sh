#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
RUNTIME="$ROOT/.runtime"
DATA="$ROOT/.data"
PGBIN="$RUNTIME/postgres/usr/lib/postgresql/16/bin"
export LD_LIBRARY_PATH="$RUNTIME/postgres/usr/lib/x86_64-linux-gnu:$RUNTIME/postgres/usr/lib/postgresql/16/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PATH="$RUNTIME/node/bin:$PGBIN:$PATH"
load_env() {
  if [ ! -f "$DATA/native.env" ]; then printf '%s\n' 'Missing private runtime environment; run prepare first.' >&2; exit 1; fi
  set -a; source "$DATA/native.env"; set +a
}
wait_db() {
  for attempt in $(seq 1 50); do if "$PGBIN/pg_isready" -h 127.0.0.1 -p 55432 -q; then return 0; fi; sleep .2; done
  printf '%s\n' 'PostgreSQL did not become ready.' >&2; return 1
}
case "${1:-status}" in
  prepare)
    umask 077
    mkdir -p "$DATA" "$DATA/socket" "$ROOT/bin"
    chmod 700 "$DATA" "$DATA/socket"
    export INPACARE_ROOT="$ROOT"
    python3 - <<'PY'
import os,pathlib,secrets
root=pathlib.Path(os.environ['INPACARE_ROOT']);data=root/'.data';env=data/'native.env'
if not env.exists():
    if (data/'postgres/PG_VERSION').exists():raise SystemExit('Existing database has no environment file; restore its original credentials.')
    admin=secrets.token_hex(32);app=secrets.token_hex(32)
    for path,contents in [(data/'admin-password',admin+'\n'),(env,'\n'.join(['DATABASE_URL=postgres://inpacare:'+app+'@127.0.0.1:55432/inpacare','API_BIND=127.0.0.1:8080','API_ORIGIN=http://127.0.0.1:8080','HOST=0.0.0.0','PORT=8088','SEED_DEMO=1','NODE_OPTIONS=--max-old-space-size=192'])+'\n')]:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream:stream.write(contents)
PY
    if [ ! -f "$DATA/postgres/PG_VERSION" ]; then
      "$PGBIN/initdb" -D "$DATA/postgres" -L "$RUNTIME/postgres/usr/share/postgresql/16" --username=inpacare_admin --pwfile="$DATA/admin-password" --auth-local=scram-sha-256 --auth-host=scram-sha-256 --encoding=UTF8 --locale=C.UTF-8 --no-instructions
      cat >> "$DATA/postgres/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 55432
unix_socket_directories = '$DATA/socket'
shared_buffers = '32MB'
work_mem = '2MB'
maintenance_work_mem = '16MB'
max_connections = 20
max_wal_size = '256MB'
min_wal_size = '32MB'
jit = off
EOF
    fi
    temporary_server=0
    if ! "$PGBIN/pg_ctl" -D "$DATA/postgres" status >/dev/null 2>&1; then
      "$PGBIN/pg_ctl" -D "$DATA/postgres" -l "$DATA/postgres-bootstrap.log" -w start
      temporary_server=1
    fi
    load_env
    python3 - <<'PY'
import os,pathlib,subprocess,urllib.parse
root=pathlib.Path(os.environ['INPACARE_ROOT']);admin=(root/'.data/admin-password').read_text().strip();password=urllib.parse.urlsplit(os.environ['DATABASE_URL']).password
env=dict(os.environ,PGPASSWORD=admin)
def sql(command):
    p=subprocess.run(['psql','-X','-qAt','-h','127.0.0.1','-p','55432','-U','inpacare_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=command,capture_output=True,text=True,env=env)
    if p.returncode:raise SystemExit('Database bootstrap failed: '+p.stderr.replace(admin,'<redacted>').replace(password,'<redacted>')[:800])
    return p.stdout.strip()
if sql("SELECT 1 FROM pg_roles WHERE rolname='inpacare'")!='1':sql("CREATE ROLE inpacare LOGIN PASSWORD '"+password+"';")
if sql("SELECT 1 FROM pg_database WHERE datname='inpacare'")!='1':sql('CREATE DATABASE inpacare OWNER inpacare;')
print('Native database and private application role are ready.')
PY
    if [ "$temporary_server" = 1 ]; then "$PGBIN/pg_ctl" -D "$DATA/postgres" -m fast -w stop; fi
    ;;
  install)
    bash "$0" prepare
    test -x "$ROOT/bin/inpacare-api"
    test -f "$ROOT/apps/web/build/index.js"
    test -f "$ROOT/scripts/native-web.mjs"
    mkdir -p "$HOME/.config/systemd/user"
    for service in db api web; do sed "s|@ROOT@|$ROOT|g" "$ROOT/ops/native/inpacare-$service.service" > "$HOME/.config/systemd/user/inpacare-$service.service"; done
    systemd-analyze --user verify "$HOME/.config/systemd/user/inpacare-db.service" "$HOME/.config/systemd/user/inpacare-api.service" "$HOME/.config/systemd/user/inpacare-web.service"
    systemctl --user daemon-reload
    systemctl --user enable --now inpacare-db inpacare-api inpacare-web
    for attempt in $(seq 1 50); do
      if curl --fail --silent http://127.0.0.1:8080/health >/dev/null && curl --fail --silent http://127.0.0.1:8088/login >/dev/null; then
        printf '%s\n' 'InpaCare is running at http://127.0.0.1:8088 (LAN/private-network port 8088).'; exit 0
      fi
      sleep .3
    done
    printf '%s\n' 'Check systemctl --user status inpacare-{db,api,web} and journalctl --user -u inpacare-api.' >&2; exit 1
    ;;
  run-db) exec "$PGBIN/postgres" -D "$DATA/postgres" ;;
  wait-db) wait_db ;;
  run-api) load_env; exec "$ROOT/bin/inpacare-api" ;;
  run-web) load_env; exec "$RUNTIME/node/bin/node" "$ROOT/scripts/native-web.mjs" ;;
  stop) systemctl --user stop inpacare-web inpacare-api inpacare-db ;;
  start) systemctl --user start inpacare-db inpacare-api inpacare-web ;;
  status) systemctl --user status inpacare-db inpacare-api inpacare-web --no-pager ;;
  *) printf '%s\n' 'Usage: native-host.sh prepare|install|start|stop|status' >&2; exit 2 ;;
esac
