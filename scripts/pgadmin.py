#!/usr/bin/env python3
"""Install and manage the private, native pgAdmin service for InpaCare."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import tarfile
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / ".data" / "pgadmin"
VENV = DATA / "venv"
PYTHON = VENV / "bin" / "python"
SITE = VENV / "lib" / "python3.12" / "site-packages" / "pgadmin4"
SETUP = SITE / "setup.py"
CONFIG_LOCAL = SITE / "config_local.py"
VENV_SITE = VENV / "lib" / "python3.12" / "site-packages"
for import_path in (SITE, VENV_SITE):
    if str(import_path) not in sys.path:
        sys.path.insert(0, str(import_path))
SERVICE_NAME = "inpacare-pgadmin.service"
OWNER_EMAIL = "admin@inpacare.hailmary.my.id"
OWNER_DB_ROLE = "inpacare_pgadmin_owner"
VIEWER_GROUP = "inpacare_data_viewer"
EDITOR_GROUP = "inpacare_data_editor"
ALLOWED_TABLES = (
    "cycle_requests", "cycles", "doctors", "invoice_lines", "invoices",
    "medical_records", "notifications", "nurses", "observations", "patients", "placements",
    "room_items", "rooms", "tasks", "vital_signs",
)
EXCLUDED_TABLES = (
    "_sqlx_migrations", "cycle_history", "invoice_history", "medical_history",
    "migrations", "sessions", "task_history", "users",
)
CLOUDFLARE_PROXY_CIDRS = (
    "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "104.16.0.0/13", "104.24.0.0/14", "108.162.192.0/18",
    "131.0.72.0/22", "141.101.64.0/18", "162.158.0.0/15",
    "172.64.0.0/13", "173.245.48.0/20", "188.114.96.0/20",
    "190.93.240.0/20", "197.234.240.0/22", "198.41.128.0/17",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
    "2c0f:f248::/32",
)


def run(args: list[str], *, check: bool = True, capture: bool = False,
        env: dict[str, str] | None = None,
        cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(args, check=False, text=True,
                                stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                                stderr=subprocess.PIPE if capture else subprocess.DEVNULL,
                                env=env, cwd=cwd)
    except FileNotFoundError as exc:
        raise RuntimeError(f"required executable not found: {args[0]}") from exc
    if check and result.returncode:
        details = ""
        if capture:
            details = " (details suppressed; inspect the relevant service/config locally)"
        raise RuntimeError(f"command failed ({args[0]}, exit {result.returncode}){details}")
    return result


def private_write(path: Path, contents: str, *, exclusive: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(contents)
        handle.flush()
        os.fsync(handle.fileno())
    path.chmod(0o600)


def password() -> str:
    # Avoid shell metacharacters and keep generated credentials high entropy.
    return secrets.token_urlsafe(36)


def env_from_native() -> dict[str, str]:
    path = ROOT / ".data" / "native.env"
    values: dict[str, str] = {}
    if not path.is_file():
        raise RuntimeError("missing private .data/native.env")
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if key.strip() == "DATABASE_URL":
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values["DATABASE_URL"] = value
    if not values.get("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is absent from private native.env")
    return values


def load_pgadmin() -> dict[str, str]:
    if not PYTHON.exists() or not SETUP.exists():
        raise RuntimeError("pgAdmin is not installed; run scripts/setup-pgadmin.sh")
    return {"PATH": f"{VENV / 'bin'}:{os.environ.get('PATH', '')}",
            "PYTHONPATH": str(SITE), "PYTHONUNBUFFERED": "1"}


def ensure_web_assets() -> bool:
    """Build the official 9.19 web bundle when the PyPI wheel omits it."""
    static = SITE / "pgadmin" / "static"
    generated = static / "js" / "generated"
    required = ("style.css", "vendor.main.js", "vendor.react.js",
                "vendor.others.js", "vendor.sqleditor.js", "pgadmin_commons.js")
    if all((generated / name).is_file() and (generated / name).stat().st_size
           for name in required):
        return False

    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to build pgAdmin's missing web assets")
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    source_url = "https://github.com/pgadmin-org/pgadmin4/archive/refs/tags/REL-9_19.tar.gz"
    yarn_url = "https://repo.yarnpkg.com/4.15.0/packages/yarnpkg-cli/bin/yarn.js"
    source_sha256 = "a78485f162748b4383f9d97ea334338c3e737e81a98f461718e948211bb99ba2"
    yarn_sha256 = "31cb07af197fac43b14bf97a8a03a7010dda364ec8d8b78b0d3d437fdf41a072"
    with tempfile.TemporaryDirectory(prefix="pgadmin-assets-", dir=DATA) as tmp:
        work = Path(tmp)
        archive = work / "pgadmin.tar.gz"
        yarn = work / "yarn.js"
        for url, destination, expected in (
                (source_url, archive, source_sha256),
                (yarn_url, yarn, yarn_sha256)):
            urllib.request.urlretrieve(url, destination)
            digest = hashlib.sha256(destination.read_bytes()).hexdigest()
            if digest != expected:
                raise RuntimeError("downloaded pgAdmin web build input failed its SHA-256 check")
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            if any(Path(member.name).is_absolute() or ".." in Path(member.name).parts
                   for member in members):
                raise RuntimeError("official pgAdmin source archive contains an unsafe path")
            bundle.extractall(work, members=members, filter="data")
        source = work / "pgadmin4-REL-9_19" / "web"
        env = {**os.environ, "CI": "1"}
        run([node, str(yarn), "install", "--immutable"], env=env, cwd=source)
        run([node, str(yarn), "run", "bundle"], env=env, cwd=source)
        built = source / "pgadmin" / "static" / "js" / "generated"
        if not all((built / name).is_file() and (built / name).stat().st_size
                   for name in required):
            raise RuntimeError("official pgAdmin 9.19 build did not produce its required web bundles")
        replacement = work / "generated"
        shutil.copytree(built, replacement)
        generated.parent.mkdir(parents=True, exist_ok=True)
        previous = work / "previous-generated"
        if generated.exists():
            os.replace(generated, previous)
        try:
            os.replace(replacement, generated)
        except Exception:
            if previous.exists():
                os.replace(previous, generated)
            raise
    return True


def setup_call(*args: str, capture: bool = True,
               env_overrides: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    if args and args[0] == "add-user":
        # pgAdmin's CLI takes the password as a positional argument, making it
        # visible in process listings. Use its documented JSON import with a
        # short-lived owner-only file instead; the file is removed immediately.
        email, password_value = args[1], args[2]
        admin = "--admin" in args
        payload = {"users": [{"username": email, "email": email,
                              "password": password_value,
                              "role": "Administrator" if admin else "User",
                              "active": True, "auth_source": "internal"}]}
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=DATA, delete=False) as f:
            os.chmod(f.name, 0o600)
            json.dump(payload, f)
            user_file = Path(f.name)
        try:
            result = run([str(PYTHON), str(SETUP), "load-users", str(user_file)],
                         capture=True, env={**os.environ, **load_pgadmin()})
        finally:
            user_file.unlink(missing_ok=True)
        if not any(str(row.get("email", "")).lower() == email.lower()
                   for row in pgadmin_users() if isinstance(row, dict)):
            raise RuntimeError("pgAdmin account creation was not confirmed")
        return result
    return run([str(PYTHON), str(SETUP), *args], capture=capture,
               env={**os.environ, **load_pgadmin(), **(env_overrides or {})})


def pgadmin_users() -> list[dict]:
    result = setup_call("get-users", "--json")
    try:
        data = json.loads(result.stdout or "[]")
        return data if isinstance(data, list) else data.get("users", [])
    except (json.JSONDecodeError, AttributeError):
        return []


def ensure_owner_credentials() -> None:
    owner_file = DATA / "owner-credentials.txt"
    users = pgadmin_users()
    owner_exists = any(str(row.get("email", "")).lower() == OWNER_EMAIL.lower()
                       for row in users if isinstance(row, dict))
    if owner_file.exists():
        if owner_file.stat().st_mode & 0o077:
            owner_file.chmod(0o600)
        if not owner_exists:
            owner_pw = password()
            setup_call("add-user", OWNER_EMAIL, owner_pw, "--admin", "--active")
            with owner_file.open("a", encoding="utf-8") as f:
                f.write(f"\npgAdmin password: {owner_pw}\n")
            owner_file.chmod(0o600)
        return
    if owner_exists:
        raise RuntimeError("owner account exists but its private credential file is missing")
    owner_pw = password()
    setup_call("add-user", OWNER_EMAIL, owner_pw, "--admin", "--active")
    private_write(owner_file,
                  f"pgAdmin login: {OWNER_EMAIL}\npgAdmin password: {owner_pw}\n",
                  exclusive=True)


def ensure_owner_secret_file() -> None:
    owner_file = DATA / "owner-credentials.txt"
    if not owner_file.exists():
        sqlite_path = DATA / "data" / "pgadmin4.db"
        if sqlite_path.exists():
            users = pgadmin_users()
            if any(str(row.get("email", "")).lower() == OWNER_EMAIL.lower()
                   for row in users if isinstance(row, dict)):
                raise RuntimeError("owner pgAdmin account exists but its private credential file is missing")
        private_write(owner_file,
                      f"pgAdmin login: {OWNER_EMAIL}\npgAdmin password: {password()}\n",
                      exclusive=True)
    owner_file.chmod(0o600)


def source_config() -> tuple[str, str, str]:
    """Return host, port, db from DATABASE_URL without logging its credentials."""
    from psycopg.conninfo import conninfo_to_dict
    dsn = env_from_native()["DATABASE_URL"]
    parsed = conninfo_to_dict(dsn)
    return (parsed.get("host", "127.0.0.1"), parsed.get("port", "5432"),
            parsed.get("dbname", "postgres"))


def ensure_role_and_login(role_name: str, group: str, password_value: str) -> None:
    """Create/refresh a narrow login via the cluster bootstrap credential."""
    import psycopg
    from psycopg import sql
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    dsn = env_from_native()["DATABASE_URL"]
    admin_pw_path = ROOT / ".data" / "admin-password"
    if not admin_pw_path.is_file():
        raise RuntimeError("private cluster bootstrap credential is unavailable")
    admin_pw = admin_pw_path.read_text(encoding="utf-8").strip()
    admin_dsn = make_conninfo(dsn, user="inpacare_admin", password=admin_pw)
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT rolname FROM pg_roles WHERE rolname = ANY(%s)",
                        ([VIEWER_GROUP, EDITOR_GROUP, role_name],))
            present = {row[0] for row in cur.fetchall()}
            for group_role in (VIEWER_GROUP, EDITOR_GROUP):
                if group_role not in present:
                    cur.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS").format(sql.Identifier(group_role)))
            if role_name not in present:
                cur.execute(sql.SQL("CREATE ROLE {} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4 PASSWORD {}").format(sql.Identifier(role_name), sql.Literal(password_value)))
            else:
                cur.execute("SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=%s", (role_name,))
                attrs = cur.fetchone()
                if attrs != (False, False, False, False, False):
                    raise RuntimeError(f"existing managed login has unexpected elevated attributes: {role_name}")
                cur.execute(sql.SQL("ALTER ROLE {} PASSWORD {}").format(sql.Identifier(role_name), sql.Literal(password_value)))
            cur.execute("SELECT pg_has_role(%s, %s, 'MEMBER')", (role_name, group))
            if not cur.fetchone()[0]:
                cur.execute(sql.SQL("GRANT {} TO {}").format(sql.Identifier(group), sql.Identifier(role_name)))
            database = conninfo_to_dict(dsn).get("dbname", "postgres")
            cur.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                sql.Identifier(database), sql.Identifier(role_name)))
            # TEMPORARY is granted to PUBLIC by default in PostgreSQL. Remove
            # that implicit DDL capability for shared users, while preserving
            # it for the existing application login in case the app uses it.
            cur.execute(sql.SQL("REVOKE TEMPORARY ON DATABASE {} FROM PUBLIC").format(sql.Identifier(database)))
            cur.execute(sql.SQL("GRANT TEMPORARY ON DATABASE {} TO inpacare").format(sql.Identifier(database)))
            cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(group)))
            cur.execute(sql.SQL("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM {}, {}").format(
                sql.Identifier(VIEWER_GROUP), sql.Identifier(EDITOR_GROUP)))
            cur.execute(sql.SQL("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM {}, {}").format(
                sql.Identifier(VIEWER_GROUP), sql.Identifier(EDITOR_GROUP)))
            tables = sql.SQL(", ").join(sql.Identifier("public", table) for table in ALLOWED_TABLES)
            cur.execute(sql.SQL("GRANT SELECT ON TABLE {} TO {}").format(tables, sql.Identifier(VIEWER_GROUP)))
            cur.execute(sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {} TO {}").format(tables, sql.Identifier(EDITOR_GROUP)))
            cur.execute("""SELECT seq_ns.nspname, seq.relname
                           FROM pg_class AS seq
                           JOIN pg_namespace AS seq_ns ON seq_ns.oid = seq.relnamespace
                           JOIN pg_depend AS dep ON dep.objid = seq.oid
                             AND dep.classid = 'pg_class'::regclass
                             AND dep.refclassid = 'pg_class'::regclass
                             AND dep.deptype IN ('a', 'i')
                           JOIN pg_class AS tbl ON tbl.oid = dep.refobjid
                           WHERE seq.relkind = 'S' AND tbl.relnamespace = 'public'::regnamespace
                             AND tbl.relname = ANY(%s)
                           ORDER BY seq_ns.nspname, seq.relname""", (list(ALLOWED_TABLES),))
            for sequence_schema, sequence_name in cur.fetchall():
                cur.execute(sql.SQL("GRANT USAGE, SELECT ON SEQUENCE {}.{} TO {}").format(
                    sql.Identifier(sequence_schema), sql.Identifier(sequence_name),
                    sql.Identifier(EDITOR_GROUP)))
            # Remove stale direct schema-create grants on these managed roles.
            cur.execute(sql.SQL("REVOKE CREATE ON SCHEMA public FROM {}, {}, {}, {}").format(
                sql.Identifier(VIEWER_GROUP), sql.Identifier(EDITOR_GROUP),
                sql.Identifier(role_name), sql.Identifier(OWNER_DB_ROLE)))


def ensure_owner_db_login() -> None:
    path = DATA / "owner-db-password.txt"
    if path.exists():
        dbpw = next((line.split(": ", 1)[1] for line in
                     path.read_text(encoding="utf-8").splitlines()
                     if line.startswith("PostgreSQL password: ")), None)
        if not dbpw:
            raise RuntimeError("managed owner DB credential file is malformed")
    else:
        dbpw = password()
    ensure_role_and_login(OWNER_DB_ROLE, EDITOR_GROUP, dbpw)
    if not path.exists():
        private_write(path, f"PostgreSQL login: {OWNER_DB_ROLE}\nPostgreSQL password: {dbpw}\n", exclusive=True)


def make_config() -> None:
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    (DATA / "data").mkdir(mode=0o700, exist_ok=True)
    (DATA / "logs").mkdir(mode=0o700, exist_ok=True)
    storage = DATA / "data" / "storage"
    storage.mkdir(mode=0o700, exist_ok=True)
    config = f'''# Private InpaCare pgAdmin server configuration. Managed by scripts/setup-pgadmin.sh.
import os
SERVER_MODE = True
DATA_DIR = {str(DATA / "data")!r}
LOG_FILE = {str(DATA / "logs" / "pgadmin4.log")!r}
SQLITE_PATH = {str(DATA / "data" / "pgadmin4.db")!r}
SESSION_DB_PATH = {str(DATA / "data" / "sessions")!r}
STORAGE_DIR = {str(storage)!r}
AZURE_CREDENTIAL_CACHE_DIR = {str(DATA / "data" / "azurecredentialcache")!r}
KERBEROS_CCACHE_DIR = {str(DATA / "data" / "kerberoscache")!r}
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
WTF_CSRF_ENABLED = True
DEFAULT_SERVER = '127.0.0.1'
DEFAULT_SERVER_PORT = 5050
ALLOW_SAVE_PASSWORD = False
'''
    private_write(CONFIG_LOCAL, config)
    for directory in (DATA, DATA / "data", DATA / "logs", storage):
        directory.chmod(0o700)


def import_server_for(user_email: str, db_role: str) -> None:
    host, port, dbname = source_config()
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=DATA, delete=False) as dump:
        os.chmod(dump.name, 0o600)
        existing_path = Path(dump.name)
    try:
        setup_call("dump-servers", str(existing_path), "--user", user_email)
        try:
            existing = json.loads(existing_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
        servers = existing.get("Servers", {}) if isinstance(existing, dict) else {}
        if any(server.get("Name") == "InpaCare PostgreSQL"
               for server in servers.values() if isinstance(server, dict)):
            return
    finally:
        existing_path.unlink(missing_ok=True)
    payload = {
        "Servers": {
            "InpaCare": {
                "Name": "InpaCare PostgreSQL",
                "Group": "Servers",
                "Host": host,
                "Port": int(port),
                "MaintenanceDB": dbname,
                "Username": db_role,
                "SSLMode": "prefer",
                "PassFile": "",
                "SavePassword": False,
                "Shared": False,
                "Comment": "Application database; use the dedicated pgAdmin editor login.",
                "DBRestriction": None,
                "SSHTunnel": False,
                "TunnelHost": "",
                "TunnelPort": "22",
                "TunnelUsername": "",
                "TunnelAuthentication": 0,
                "TunnelIdentityFile": "",
                "TunnelPassword": "",
                "TunnelKeepAlive": 0,
                "KerberosAuthentication": False,
                "ConnectionParameters": {},
            }
        }
    }
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=DATA, delete=False) as f:
        os.chmod(f.name, 0o600)
        json.dump(payload, f)
        temp = Path(f.name)
    try:
        result = setup_call("load-servers", str(temp), "--user", user_email)
        if result.returncode != 0:
            detail = (result.stderr or "").lower()
            if "already exists" not in detail and "duplicate" not in detail:
                raise RuntimeError("failed to pre-register owner DB server (details suppressed)")
    finally:
        temp.unlink(missing_ok=True)


def setup_service() -> None:
    unit_src = ROOT / "ops" / "native" / SERVICE_NAME
    unit_dst = Path.home() / ".config" / "systemd" / "user" / SERVICE_NAME
    unit_dst.parent.mkdir(parents=True, exist_ok=True)
    contents = unit_src.read_text(encoding="utf-8").replace("@ROOT@", str(ROOT))
    changed = not unit_dst.exists() or unit_dst.read_text(encoding="utf-8") != contents
    if changed:
        private_write(unit_dst, contents)
    run(["systemctl", "--user", "daemon-reload"])
    run(["systemctl", "--user", "enable", "--now", SERVICE_NAME])
    if changed:
        run(["systemctl", "--user", "restart", SERVICE_NAME])


def setup_caddy() -> None:
    import re
    caddy_dir = Path.home() / ".local" / "share" / "mac-cloud-drive"
    caddyfile = caddy_dir / "public.d" / "inpacare.caddy"
    caddy = caddy_dir / "caddy"
    backup_dir = DATA / "backups"
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_dir / "inpacare.caddy.before-pgadmin"
    current = caddyfile.read_text(encoding="utf-8")
    original = current
    changed = False
    trusted_proxies = "            trusted_proxies " + " ".join(CLOUDFLARE_PROXY_CIDRS) + "\n"
    if "@pgadmin path /db /db/*" not in current:
        if current.count("https://inpacare.hailmary.my.id {") != 1:
            raise RuntimeError("could not safely identify the existing InpaCare Caddy site")
        if "reverse_proxy 127.0.0.1:8089" not in current:
            raise RuntimeError("expected existing InpaCare reverse proxy is absent")
        if not backup.exists():
            private_write(backup, current, exclusive=True)
        block = '''    @pgadmin path /db /db/*
    handle @pgadmin {
        reverse_proxy 127.0.0.1:5050 {
            header_up X-Script-Name /db
            header_up X-Scheme {scheme}
''' + trusted_proxies + '''        }
    }
'''
        updated, count = re.subn(r"(?m)^[ \t]*reverse_proxy 127\.0\.0\.1:8089", block + "    reverse_proxy 127.0.0.1:8089", current, count=1)
        if count != 1:
            raise RuntimeError("failed to insert the narrow pgAdmin route")
        current = updated
        changed = True
    else:
        route_match = re.search(r"(?ms)^[ \t]*reverse_proxy 127\.0\.0\.1:5050[ \t]*\{.*?^[ \t]*\}", current)
        if not route_match:
            raise RuntimeError("could not safely identify the existing pgAdmin proxy route")
        route = route_match.group()
        if "trusted_proxies " not in route:
            route, count = re.subn(
                r"(?m)^([ \t]*)header_up X-Scheme \{scheme\}[ \t]*$",
                r"\g<0>\n\g<1>trusted_proxies " + " ".join(CLOUDFLARE_PROXY_CIDRS),
                route, count=1)
            if count != 1:
                raise RuntimeError("could not safely update the existing pgAdmin proxy route")
            current = current[:route_match.start()] + route + current[route_match.end():]
            changed = True
    if changed:
        if not backup.exists():
            private_write(backup, caddyfile.read_text(encoding="utf-8"), exclusive=True)
        private_write(caddyfile, current)
    config = str(caddy_dir / "Caddyfile")
    check = run([str(caddy), "validate", "--config", config, "--adapter", "caddyfile"], check=False, capture=True)
    if check.returncode:
        if changed:
            private_write(caddyfile, original)
        raise RuntimeError("whole Caddy gateway validation failed; original site config restored")
    if not changed:
        return
    reload = run([str(caddy), "reload", "--config", config, "--adapter", "caddyfile"], check=False, capture=True)
    if reload.returncode:
        # The existing gateway has `admin off`, so Caddy's hot-reload API is
        # intentionally unavailable. A systemd restart still gives Caddy a
        # graceful shutdown/start and is the supported way to load this config.
        restart = run(["systemctl", "--user", "restart", "local.macclouddrive.gateway.service"],
                      check=False, capture=True)
        if restart.returncode:
            raise RuntimeError("Caddy API reload is disabled and its graceful systemd restart failed")
        active = run(["systemctl", "--user", "is-active", "local.macclouddrive.gateway.service"],
                     check=False, capture=True)
        if active.stdout.strip() != "active":
            raise RuntimeError("Caddy graceful restart did not return the gateway to active")


def install() -> None:
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("uv is required to create the venv without changing system packages")
    if not PYTHON.exists():
        run([uv, "venv", str(VENV), "--python", sys.executable])
    installed = run([str(PYTHON), "-c",
                     "import importlib.metadata as m; print(m.version('pgadmin4')+' '+m.version('gunicorn'))"],
                    check=False, capture=True)
    if installed.returncode or installed.stdout.strip() != "9.19 23.0.0":
        run([uv, "pip", "install", "--python", str(PYTHON), "pgadmin4==9.19", "gunicorn==23.0.0"])
    assets_changed = ensure_web_assets()
    make_config()
    ensure_owner_secret_file()
    owner_pw = next(line.split(": ", 1)[1] for line in
                    (DATA / "owner-credentials.txt").read_text(encoding="utf-8").splitlines()
                    if line.startswith("pgAdmin password: "))
    setup_call("setup-db", env_overrides={"PGADMIN_SETUP_EMAIL": OWNER_EMAIL,
                                          "PGADMIN_SETUP_PASSWORD": owner_pw})
    ensure_owner_credentials()
    ensure_owner_db_login()
    import_server_for(OWNER_EMAIL, OWNER_DB_ROLE)
    setup_service()
    if assets_changed:
        run(["systemctl", "--user", "restart", SERVICE_NAME])
    setup_caddy()


def status() -> None:
    version = run([str(PYTHON), "-c", "import importlib.metadata as m; print(m.version('pgadmin4'))"], capture=True)
    print(f"pgAdmin: {version.stdout.strip()} installed in the project data directory")
    result = run(["systemctl", "--user", "is-active", SERVICE_NAME], check=False, capture=True)
    print(f"Service: {result.stdout.strip() or 'inactive'}")
    print("Listen: 127.0.0.1:5050")
    print("URL: https://inpacare.hailmary.my.id/db/")
    print(f"Owner credential file: {DATA / 'owner-credentials.txt'}")
    print(f"Backup: {DATA / 'backups' / 'inpacare.caddy.before-pgadmin'}")


def slug(email: str) -> str:
    local = email.split("@", 1)[0].lower()
    cleaned = "".join(c if c.isalnum() else "_" for c in local).strip("_")
    return (cleaned or "teammate")[:25]


def provision(email: str, access: str) -> None:
    if "@" not in email or not email.strip():
        raise RuntimeError("provide a valid individual pgAdmin login email")
    access = access.lower()
    if access not in ("viewer", "editor"):
        raise RuntimeError("access must be viewer or editor")
    slugpart = slug(email)
    role = f"inpacare_{slugpart}_{access}"
    group = VIEWER_GROUP if access == "viewer" else EDITOR_GROUP
    cred_dir = DATA / "credentials"
    cred_path = cred_dir / f"{role}.txt"
    if not cred_path.exists():
        existing_pgadmin = any(str(row.get("email", "")).lower() == email.lower()
                               for row in pgadmin_users() if isinstance(row, dict))
        if existing_pgadmin:
            raise RuntimeError("pgAdmin user exists without its managed credential file; refusing to reset it")
        dbpw = password()
        pgpw = password()
        setup_call("add-user", email, pgpw, "--role", "User", "--active")
        try:
            ensure_role_and_login(role, group, dbpw)
            import_server_for(email, role)
        except Exception:
            try:
                setup_call("delete-user", email, "--yes")
            except Exception:
                pass
            raise
        private_write(cred_path,
                     f"pgAdmin login: {email}\npgAdmin password: {pgpw}\n"
                     f"PostgreSQL login: {role}\nPostgreSQL password: {dbpw}\n"
                     f"Access: {access}\n", exclusive=True)
    else:
        if not any(str(row.get("email", "")).lower() == email.lower()
                   for row in pgadmin_users() if isinstance(row, dict)):
            raise RuntimeError("managed credential file exists but the pgAdmin user is absent")
        lines = cred_path.read_text(encoding="utf-8").splitlines()
        dbpw = next((line.split(": ", 1)[1] for line in lines if line.startswith("PostgreSQL password: ")), None)
        if not dbpw:
            raise RuntimeError("managed teammate credential file is malformed")
        ensure_role_and_login(role, group, dbpw)
        import_server_for(email, role)
    print(f"Provisioned pgAdmin user and PostgreSQL {access} login for {email}.")
    print(f"Private credentials: {cred_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("install", help="install/repair pgAdmin, service, DB roles and Caddy route")
    sub.add_parser("status", help="show sanitized installation and service status")
    user = sub.add_parser("add-user", help="create one pgAdmin user and matching restricted DB login")
    user.add_argument("email")
    user.add_argument("access", choices=("viewer", "editor"))
    args = parser.parse_args()
    try:
        if args.command == "install":
            install()
        elif args.command == "status":
            status()
        else:
            provision(args.email, args.access)
    except Exception as exc:
        print(f"pgAdmin management failed: {type(exc).__name__} (details suppressed)", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
