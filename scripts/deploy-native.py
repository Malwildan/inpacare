#!/usr/bin/env python3
"""Install the latest verified InpaCare native Linux release."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen


API = "https://api.github.com/repos/Malwildan/inpacare"
ASSETS = ("inpacare-linux-x86_64.tar.gz", "SHA256SUMS")
REQUIRED = (
    "REVISION", "apps/api/package.json", "apps/api/dist/main.js", "apps/api/dist/database/cli.js",
    "apps/web/build/index.js", "apps/web/build/handler.js", "package.json",
    "package-lock.json", "apps/web/package.json", "scripts/native-host.sh",
    "scripts/native-web.mjs",
)
SHA_RE = re.compile(r"native-([0-9a-f]{40})\Z")
TIMEOUT = 20


class DeployError(RuntimeError):
    pass


def http_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "InpaCare-native-updater"})
    with urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read(1_000_001))


def latest_release() -> tuple[str, dict] | None:
    try:
        release = http_json(f"{API}/releases/latest")
    except HTTPError as error:
        if error.code == 404:
            error.close()
            return None
        raise
    match = SHA_RE.fullmatch(str(release.get("tag_name", "")))
    if not match or release.get("draft") or release.get("prerelease"):
        return None
    return match.group(1), release


def asset_url(sha: str, name: str) -> str:
    return f"https://github.com/Malwildan/inpacare/releases/download/native-{sha}/{name}"


def download(url: str, destination: Path) -> None:
    request = Request(url, headers={"User-Agent": "InpaCare-native-updater"})
    with urlopen(request, timeout=TIMEOUT) as response, destination.open("wb") as out:
        limit = 256 * 1024 * 1024
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                raise DeployError("Release asset exceeds the 256 MiB download limit")
            out.write(chunk)


def verify_archive(archive: Path, sums: Path, sha: str, target: Path) -> None:
    expected_line = next((line for line in sums.read_text(encoding="ascii").splitlines()
                          if re.fullmatch(r"[0-9a-fA-F]{64}\s+\*?inpacare-linux-x86_64\.tar\.gz", line)), None)
    if not expected_line:
        raise DeployError("SHA256SUMS does not contain the required archive checksum")
    expected = expected_line.split()[0].lower()
    hasher = hashlib.sha256()
    with archive.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    if digest != expected:
        raise DeployError("Release archive checksum mismatch")

    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or "\\" in member.name:
                raise DeployError(f"Unsafe archive path: {member.name!r}")
            if not (member.isdir() or member.isfile()):
                raise DeployError(f"Unsupported archive entry: {member.name!r}")
        target.mkdir(parents=True, exist_ok=True)
        bundle.extractall(target, members=members, filter="data")

    revision = (target / "REVISION").read_text(encoding="ascii").strip()
    if revision != sha:
        raise DeployError("Archive REVISION does not match the release tag")
    for required in REQUIRED:
        path = target / required
        if not path.is_file():
            raise DeployError(f"Release is missing required path: {required}")


def run(args: list[str], *, env: dict | None = None, timeout: int = 120,
        check: bool = True, cwd: Path | None = None) -> subprocess.CompletedProcess:
    result = subprocess.run(args, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, timeout=timeout, cwd=cwd)
    if check and result.returncode:
        raise DeployError(f"Command failed ({Path(args[0]).name}, exit {result.returncode})")
    return result


def private_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def verify_root(root: Path) -> dict[str, str]:
    if not root.is_absolute() or not root.is_dir():
        raise DeployError("--root must name an existing absolute installed application directory")
    data, runtime = root / ".data", root / ".runtime"
    env_file = data / "native.env"
    if not env_file.is_file() or not (data / "postgres/PG_VERSION").is_file():
        raise DeployError("Existing native.env and PostgreSQL data are required; run native setup first")
    tools = (runtime / "node/bin/node", runtime / "node/bin/npm",
             runtime / "postgres/usr/lib/postgresql/16/bin/pg_dump",
             runtime / "postgres/usr/lib/postgresql/16/bin/psql")
    if any(not tool.is_file() or not os.access(tool, os.X_OK) for tool in tools):
        raise DeployError("Bundled Node/npm and PostgreSQL 16 pg_dump/psql must be installed")
    for service in ("inpacare-db", "inpacare-api", "inpacare-web"):
        result = run(["systemctl", "--user", "is-active", service], check=False, timeout=10)
        if result.returncode or result.stdout.strip() != "active":
            raise DeployError(f"Required user service is not active: {service}")
    values = private_env(env_file)
    db_url = values.get("DATABASE_URL")
    if not db_url:
        raise DeployError("native.env is missing DATABASE_URL")
    return values


def main_sha() -> str:
    data = http_json(f"{API}/git/ref/heads/main")
    sha = data.get("object", {}).get("sha", "")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise DeployError("GitHub main ref returned an invalid commit SHA")
    return sha


def atomic_pointer(current: Path, destination: Path) -> None:
    temp = current.with_name(f".current-{os.getpid()}")
    with contextlib.suppress(FileNotFoundError):
        temp.unlink()
    temp.symlink_to(destination, target_is_directory=True)
    if os.name == "nt" and current.is_symlink():
        # Windows cannot replace an existing directory symlink with os.replace.
        current.unlink()
    os.replace(temp, current)


def health(url: str) -> bool:
    try:
        request = Request(url, headers={"User-Agent": "InpaCare-native-updater"})
        with urlopen(request, timeout=3) as response:
            return 200 <= response.status < 400
    except (OSError, HTTPError, URLError):
        return False


def wait_api_healthy() -> bool:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if health("http://127.0.0.1:8080/health"):
            return True
        time.sleep(1)
    return False


def wait_healthy(values: dict[str, str], sha: str) -> bool:
    urls = ["http://127.0.0.1:8080/health", "http://127.0.0.1:8088/login"]
    if values.get("HTTPS_PROXY_PORT"):
        # native-web serves HTTP locally while marking proxied requests as HTTPS.
        urls.append("http://127.0.0.1:8089/login")
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if all(health(url) for url in urls):
            try:
                if all(http_json(url.replace('/login', '/__version')) ==
                       {"revision": sha, "backend": "nestjs"} for url in urls[1:]):
                    return True
            except (OSError, HTTPError, URLError, ValueError):
                pass
        time.sleep(1)
    return False


def database_backup(root: Path, values: dict[str, str], sha: str) -> Path:
    parsed = urlsplit(values["DATABASE_URL"])
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.username or not parsed.password:
        raise DeployError("DATABASE_URL must contain PostgreSQL host, user, and password")
    if parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise DeployError("DATABASE_URL must point to the installed local PostgreSQL server")
    env = os.environ.copy()
    env.update({"PGHOST": parsed.hostname, "PGPORT": str(parsed.port or 5432),
                "PGUSER": unquote(parsed.username), "PGPASSWORD": unquote(parsed.password),
                "PGDATABASE": unquote(parsed.path.lstrip("/"))})
    pg_bin = root / ".runtime/postgres/usr/lib/postgresql/16/bin"
    env["LD_LIBRARY_PATH"] = str(root / ".runtime/postgres/usr/lib/x86_64-linux-gnu") + ":" + str(pg_bin.parent / "lib")
    backup_dir = root / ".data/backups"
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(backup_dir, 0o700)
    path = backup_dir / f"pre-update-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}-{sha}.dump"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    try:
        run([str(pg_bin / "pg_dump"), "--format=custom", "--no-owner", "--no-acl", "--file", str(path)], env=env, timeout=600)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return path


def require_explicit_adoption(root: Path, values: dict[str, str], release_dir: Path) -> None:
    parsed = urlsplit(values["DATABASE_URL"])
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.username or not parsed.password:
        raise DeployError("DATABASE_URL must contain PostgreSQL host, user, and password")
    env = os.environ.copy()
    env.update({"PGHOST": parsed.hostname, "PGPORT": str(parsed.port or 5432),
                "PGUSER": unquote(parsed.username), "PGPASSWORD": unquote(parsed.password),
                "PGDATABASE": unquote(parsed.path.lstrip("/"))})
    pg_bin = root / ".runtime/postgres/usr/lib/postgresql/16/bin"
    env["LD_LIBRARY_PATH"] = str(root / ".runtime/postgres/usr/lib/x86_64-linux-gnu") + ":" + str(pg_bin.parent / "lib")
    psql = str(pg_bin / "psql")
    has_history = run([psql, "-X", "-qAt", "-c", "SELECT to_regclass('migrations') IS NOT NULL"], env=env, timeout=30).stdout.strip() == "t"
    baseline = has_history and run([psql, "-X", "-qAt", "-c", "SELECT count(*) FROM migrations WHERE name='Baseline1793577600000'"], env=env, timeout=30).stdout.strip() == "1"
    tables = int(run([psql, "-X", "-qAt", "-c", "SELECT count(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' AND table_name NOT IN ('migrations','_sqlx_migrations')"], env=env, timeout=30).stdout.strip())
    if tables and not baseline:
        raise DeployError(f"Existing database needs explicit NestJS adoption before updating. Prepared release: {release_dir}. Disable the update timer, back up the database, stop API/web, source `.data/native.env`, run `npm run migration:adopt --workspace @inpacare/api` from that release, then restart the current app and re-enable the timer.")


def deploy(root: Path, sha: str, release: dict, values: dict[str, str]) -> None:
    if main_sha() != sha:
        raise DeployError("Latest native release is not the current main commit")
    assets = {asset.get("name"): asset for asset in release.get("assets", [])}
    if any(name not in assets for name in ASSETS):
        raise DeployError("Release is missing its archive or SHA256SUMS")
    deploy_dir = root / ".deploy"
    releases = deploy_dir / "releases"
    releases.mkdir(mode=0o700, parents=True, exist_ok=True)
    release_dir = releases / sha
    env = os.environ.copy()
    node_bin = str(root / ".runtime/node/bin")
    env["PATH"] = node_bin + os.pathsep + env.get("PATH", "")
    prepared = (release_dir / "REVISION").is_file() and (release_dir / "REVISION").read_text().strip() == sha and (release_dir / "node_modules").is_dir()
    if not prepared:
        if release_dir.exists():
            failed = releases / f"{sha}.failed-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}"
            release_dir.rename(failed)
        stage = Path(tempfile.mkdtemp(prefix=f".{sha}-", dir=releases))
        # Preserve failed stages for diagnosis; the next attempt uses a fresh directory.
        archive, sums = stage / ASSETS[0], stage / ASSETS[1]
        for name in ASSETS:
            url = asset_url(sha, name)
            if assets[name].get("browser_download_url") != url:
                raise DeployError(f"Unexpected release asset URL: {name}")
            download(url, stage / name)
        unpacked = stage / "unpacked"
        unpacked.mkdir()
        verify_archive(archive, sums, sha, unpacked)
        archive.unlink()
        sums.unlink()
        for item in unpacked.iterdir():
            item.rename(stage / item.name)
        unpacked.rmdir()
        (stage / ".data").symlink_to(root / ".data", target_is_directory=True)
        (stage / ".runtime").symlink_to(root / ".runtime", target_is_directory=True)
        run([str(root / ".runtime/node/bin/npm"), "ci", "--omit=dev", "--no-audit", "--no-fund",
             "--workspace", "apps/api", "--workspace", "apps/web", "--include-workspace-root=false"], env=env, cwd=stage, timeout=600)
        stage.rename(release_dir)

    if main_sha() != sha:
        print("Main advanced while preparing the release; keeping the running version.")
        return

    require_explicit_adoption(root, values, release_dir)

    database_backup(root, values, sha)
    if main_sha() != sha:
        print("Main advanced while preparing the release; keeping the running version.")
        return
    current = deploy_dir / "current"
    if current.is_symlink():
        old_target = current.resolve()
    else:
        old_target = root
        atomic_pointer(current, root)
    switched = False
    try:
        # Keep dependent tunnel units running during the brief API/web restart.
        run(["systemctl", "--user", "stop", "inpacare-web", "inpacare-api", "--job-mode=ignore-dependencies"], timeout=30)
        migration_env = os.environ.copy()
        migration_env.update(values)
        migration_env["PATH"] = node_bin + os.pathsep + migration_env.get("PATH", "")
        run([str(root / ".runtime/node/bin/npm"), "run", "migration:run", "--workspace", "@inpacare/api"],
            env=migration_env, cwd=release_dir, timeout=600)
        atomic_pointer(current, release_dir)
        switched = True
        run(["systemctl", "--user", "daemon-reload"], timeout=30)
        run(["systemctl", "--user", "start", "inpacare-api"], timeout=60)
        if not wait_api_healthy():
            raise DeployError("Updated API failed health checks; web traffic was not opened")
        run(["systemctl", "--user", "start", "inpacare-web"], timeout=60)
        if not wait_healthy(values, sha):
            raise DeployError("Updated API/web failed health checks")
    except Exception:
        if switched:
            with contextlib.suppress(Exception):
                run(["systemctl", "--user", "stop", "inpacare-web", "inpacare-api", "--job-mode=ignore-dependencies"], timeout=30)
            atomic_pointer(current, old_target)
            with contextlib.suppress(Exception):
                run(["systemctl", "--user", "daemon-reload"], timeout=30)
        print("Update failed; the database was backed up before the explicit migration and was not automatically restored.", file=sys.stderr)
        with contextlib.suppress(Exception):
            run(["systemctl", "--user", "start", "inpacare-api", "inpacare-web"], timeout=60)
        raise
    print(f"Installed native-{sha}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="discover latest stable release without deploying")
    options = parser.parse_args()
    try:
        if options.check:
            release = latest_release()
            print(f"Latest native release: {release[0]}" if release else "No valid stable native release found")
            return 0
        if not sys.platform.startswith("linux"):
            raise DeployError("Deployment requires Linux")
        root = options.root
        if not root.is_absolute() or not root.is_dir():
            raise DeployError("--root must name an existing absolute installed application directory")
        lock_dir = root / ".deploy"
        lock_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        import fcntl  # Linux-only; keep module importable for cross-platform unit tests.
        with (lock_dir / "update.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            release = latest_release()
            if not release:
                print("No valid stable native release found")
                return 0
            sha, metadata = release
            current = lock_dir / "current"
            if current.is_symlink() and (current / "REVISION").is_file() and (current / "REVISION").read_text().strip() == sha:
                print(f"Already current at {sha}")
                return 0
            if not current.exists() and (root / "REVISION").is_file() and (root / "REVISION").read_text().strip() == sha:
                print(f"Already current at {sha}")
                return 0
            values = verify_root(root)
            deploy(root, sha, metadata, values)
        return 0
    except (DeployError, OSError, HTTPError, URLError, TimeoutError, subprocess.TimeoutExpired, tarfile.TarError, ValueError) as error:
        print(f"Native update failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
