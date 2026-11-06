#!/usr/bin/env python3
"""Sanitized permission, HTTPS login, prefix, and cookie checks for pgAdmin."""
from __future__ import annotations

import os
import re
import secrets
import socket
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / ".data" / "pgadmin"
BASE = "https://inpacare.hailmary.my.id/db"


def read_secret(path: Path, key: str) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(key + ": "):
            return line.split(": ", 1)[1]
    raise RuntimeError("required private credential field is missing")


def env_db_url() -> str:
    for line in (ROOT / ".data" / "native.env").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            value = line.split("=", 1)[1].strip()
            return value[1:-1] if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'" else value
    raise RuntimeError("DATABASE_URL is missing")


def db_checks() -> None:
    import psycopg
    from psycopg.conninfo import make_conninfo
    from psycopg import errors

    url = env_db_url()
    viewer_pass = read_secret(DATA / "credentials" / "inpacare_selfcheck_viewer.txt", "PostgreSQL password")
    editor_pass = read_secret(DATA / "credentials" / "inpacare_selfcheck_editor_editor.txt", "PostgreSQL password")
    viewer = make_conninfo(url, user="inpacare_selfcheck_viewer", password=viewer_pass)
    editor = make_conninfo(url, user="inpacare_selfcheck_editor_editor", password=editor_pass)

    with psycopg.connect(viewer) as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM public.rooms LIMIT 0")
        cur.execute("SELECT 1 FROM public.medical_records LIMIT 0")
        for protected in ("users", "sessions", "_sqlx_migrations", "cycle_history",
                          "invoice_history", "medical_history", "task_history", "migrations"):
            try:
                cur.execute(f'SELECT 1 FROM public."{protected}" LIMIT 0')
            except errors.InsufficientPrivilege:
                conn.rollback()
            else:
                raise RuntimeError(f"viewer unexpectedly has access to protected table {protected}")
        try:
            cur.execute("UPDATE public.rooms SET id=id WHERE false")
        except errors.InsufficientPrivilege:
            conn.rollback()
        else:
            raise RuntimeError("viewer unexpectedly has write access")
        try:
            cur.execute("CREATE TEMP TABLE pgadmin_selfcheck_temp_probe (id integer)")
        except errors.InsufficientPrivilege:
            conn.rollback()
        else:
            conn.rollback()
            raise RuntimeError("viewer unexpectedly has temporary DDL permission")
    print("PASS: viewer can read allowed tables and is denied auth, session, history, migration, and DML access")

    with psycopg.connect(editor) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM public.rooms LIMIT 0")
            for protected in ("users", "sessions", "_sqlx_migrations", "cycle_history",
                              "invoice_history", "medical_history", "task_history", "migrations"):
                try:
                    cur.execute(f'SELECT 1 FROM public."{protected}" LIMIT 0')
                except errors.InsufficientPrivilege:
                    conn.rollback()
                else:
                    raise RuntimeError(f"editor unexpectedly has access to protected table {protected}")
            try:
                cur.execute("CREATE TABLE public.pgadmin_selfcheck_ddl_probe (id integer)")
            except errors.InsufficientPrivilege:
                conn.rollback()
            else:
                conn.rollback()
                raise RuntimeError("editor unexpectedly has public schema DDL permission")
            try:
                cur.execute("CREATE TEMP TABLE pgadmin_selfcheck_temp_probe (id integer)")
            except errors.InsufficientPrivilege:
                conn.rollback()
            else:
                conn.rollback()
                raise RuntimeError("editor unexpectedly has temporary DDL permission")
            try:
                cur.execute("TRUNCATE TABLE public.patients")
            except errors.InsufficientPrivilege:
                conn.rollback()
            else:
                conn.rollback()
                raise RuntimeError("editor unexpectedly has TRUNCATE permission")
            cur.execute("SELECT id FROM public.rooms ORDER BY id LIMIT 1")
            room = cur.fetchone()
            if not room:
                raise RuntimeError("no room exists for safe synthetic room_items write verification")
            probe_id = "pgadmin_probe_" + secrets.token_hex(8)
            try:
                cur.execute("INSERT INTO public.room_items (id, room_id, name, category, quantity, unit_price) VALUES (%s, %s, %s, %s, 1, 0)",
                            (probe_id, room[0], "pgAdmin permission verification", "system"))
                cur.execute("DELETE FROM public.room_items WHERE id = %s", (probe_id,))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    print("PASS: editor can write and delete one synthetic room item; protected tables, persistent/temp DDL, and TRUNCATE are denied")

    admin_password = (ROOT / ".data" / "admin-password").read_text(encoding="utf-8").strip()
    admin = make_conninfo(url, user="inpacare_admin", password=admin_password)
    with psycopg.connect(admin) as conn, conn.cursor() as cur:
        for role in ("inpacare_pgadmin_owner", "inpacare_selfcheck_viewer",
                     "inpacare_selfcheck_editor_editor"):
            cur.execute("SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=%s", (role,))
            attrs = cur.fetchone()
            if attrs != (False, False, False, False, False):
                raise RuntimeError("managed DB login has unexpected elevated attributes")
            cur.execute("SELECT has_database_privilege(%s, current_database(), 'TEMP')", (role,))
            if cur.fetchone()[0]:
                raise RuntimeError("managed login unexpectedly has database temporary-object permission")
        excluded = ("users", "sessions", "_sqlx_migrations", "cycle_history",
                    "invoice_history", "medical_history", "task_history", "migrations")
        cur.execute("""SELECT seq.oid, tbl.relname
                       FROM pg_class AS seq
                       JOIN pg_depend AS dep ON dep.objid=seq.oid
                         AND dep.classid='pg_class'::regclass
                         AND dep.refclassid='pg_class'::regclass AND dep.deptype IN ('a','i')
                       JOIN pg_class AS tbl ON tbl.oid=dep.refobjid
                       WHERE seq.relkind='S' AND tbl.relnamespace='public'::regnamespace
                         AND tbl.relname=ANY(%s)""", (list(excluded),))
        for sequence_oid, _ in cur.fetchall():
            for role in ("inpacare_pgadmin_owner", "inpacare_selfcheck_viewer",
                         "inpacare_selfcheck_editor_editor"):
                cur.execute("SELECT has_sequence_privilege(%s, %s, 'USAGE')", (role, sequence_oid))
                if cur.fetchone()[0]:
                    raise RuntimeError("managed login unexpectedly has an excluded sequence privilege")
    print("PASS: owner and teammate DB logins have no elevated role attributes or excluded sequence access")


def http_checks() -> None:
    import requests
    requests.packages.urllib3.disable_warnings()
    owner_file = DATA / "owner-credentials.txt"
    email = read_secret(owner_file, "pgAdmin login")
    password = read_secret(owner_file, "pgAdmin password")
    resolver = socket.getaddrinfo
    socket.getaddrinfo = lambda host, port, *args, **kwargs: resolver(
        "127.0.0.1" if host == "inpacare.hailmary.my.id" else host,
        port, *args, **kwargs)
    session = requests.Session()
    session.verify = True
    session.headers["X-Script-Name"] = "/attacker-prefix"
    protected = session.get(BASE + "/browser/", allow_redirects=False, timeout=20)
    if protected.status_code not in (301, 302, 303, 307, 308) or "/db/login" not in protected.headers.get("Location", ""):
        raise RuntimeError("unauthenticated browser route was not redirected to the pgAdmin login")
    login = session.get(BASE + "/login", allow_redirects=True, timeout=20)
    if login.status_code != 200 or "/db/login" not in login.url:
        raise RuntimeError("pgAdmin login page did not load below the /db prefix")
    if not re.search(r"/(?:db/)?static/|/db/static/", login.text):
        raise RuntimeError("login page HTML lacks a pgAdmin static asset reference")
    csrf = re.search(r'"csrfToken"\s*:\s*"([^"]+)"', login.text)
    if not csrf:
        raise RuntimeError("login CSRF token was not found")
    response = session.post(BASE + "/authenticate/login", data={"email": email, "password": password,
                                                                 "csrf_token": csrf.group(1)},
                            allow_redirects=False, timeout=20)
    if response.status_code not in (302, 303, 307, 308):
        raise RuntimeError("valid owner credentials did not complete login")
    redirect = response.headers.get("Location", "")
    if not redirect.startswith("/db"):
        raise RuntimeError("post-login redirect escaped the /db prefix")
    cookies = response.headers.get("Set-Cookie", "")
    lower_cookie = cookies.lower()
    if "secure" not in lower_cookie or "httponly" not in lower_cookie or "path=/db" not in lower_cookie:
        raise RuntimeError("HTTPS session cookie lacks Secure, HttpOnly, or /db path flags")
    if "samesite=lax" not in lower_cookie:
        raise RuntimeError("session cookie lacks SameSite=Lax")
    body = session.get(BASE + "/browser/", timeout=20).text
    if "/db/static/" not in body and "src=\"/db/" not in body and "href=\"/db/" not in body:
        raise RuntimeError("authenticated page did not retain its /db asset URL prefix")
    print("PASS: HTTPS login required; authenticated redirects/assets and secure session cookie stay under /db")


def cleanup_test_user(email: str, role: str, group: str, access: str) -> None:
    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo
    try:
        pgadmin_users.setup_call("delete-user", email, "--yes")
    except Exception:
        pass
    dsn = make_conninfo(env_db_url(), user="inpacare_admin",
                        password=(ROOT / ".data" / "admin-password").read_text(encoding="utf-8").strip())
    with psycopg.connect(dsn, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,))
        if cur.fetchone():
            cur.execute(sql.SQL("REVOKE {} FROM {}").format(sql.Identifier(group), sql.Identifier(role)))
            cur.execute(sql.SQL("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM {}").format(sql.Identifier(role)))
            cur.execute(sql.SQL("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM {}").format(sql.Identifier(role)))
            cur.execute(sql.SQL("REVOKE USAGE, CREATE ON SCHEMA public FROM {}").format(sql.Identifier(role)))
            cur.execute(sql.SQL("REVOKE CONNECT, TEMPORARY ON DATABASE inpacare FROM {}").format(sql.Identifier(role)))
            cur.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))
    (DATA / "credentials" / f"{role}.txt").unlink(missing_ok=True)


def main() -> int:
    created = []
    try:
        # Create a disposable pgAdmin user with paired DB logins for this check.
        pgadmin_users.provision("selfcheck@inpacare.hailmary.my.id", "viewer")
        created.append(("selfcheck@inpacare.hailmary.my.id", "inpacare_selfcheck_viewer",
                        "inpacare_data_viewer", "viewer"))
        pgadmin_users.provision("selfcheck_editor@inpacare.hailmary.my.id", "editor")
        created.append(("selfcheck_editor@inpacare.hailmary.my.id", "inpacare_selfcheck_editor_editor",
                        "inpacare_data_editor", "editor"))
        db_checks()
        http_checks()
    except Exception as exc:
        print(f"FAIL: {type(exc).__name__} (details suppressed)", file=sys.stderr)
        return 1
    finally:
        for item in reversed(created):
            try:
                cleanup_test_user(*item)
            except Exception as exc:
                print(f"CLEANUP REQUIRED for disposable self-check account: {type(exc).__name__}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    import importlib.util
    spec = importlib.util.spec_from_file_location("pgadmin_ops", ROOT / "scripts" / "pgadmin.py")
    pgadmin_users = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = pgadmin_users
    spec.loader.exec_module(pgadmin_users)
    raise SystemExit(main())
