import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy-native.py"
SPEC = importlib.util.spec_from_file_location("deploy_native", SCRIPT)
deploy_native = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy_native)


SHA = "a" * 40


def make_release(folder: Path, sha=SHA, extra=None):
    source = folder / "source"
    (source / "bin").mkdir(parents=True, exist_ok=True)
    (source / "apps/web/build").mkdir(parents=True, exist_ok=True)
    (source / "scripts").mkdir(parents=True, exist_ok=True)
    (source / "REVISION").write_text(sha + "\n")
    (source / "bin/inpacare-api").write_text("binary")
    (source / "bin/inpacare-api").chmod(0o755)
    (source / "package.json").write_text("{}")
    (source / "package-lock.json").write_text("{}")
    (source / "apps/web/package.json").write_text("{}")
    (source / "apps/web/build/index.js").write_text("web")
    (source / "apps/web/build/handler.js").write_text("handler")
    (source / "scripts/native-host.sh").write_text("#!/bin/sh\n")
    (source / "scripts/native-web.mjs").write_text("// web\n")
    archive = folder / deploy_native.ASSETS[0]
    with tarfile.open(archive, "w:gz") as bundle:
        for path in source.rglob("*"):
            bundle.add(path, arcname=path.relative_to(source).as_posix())
        if extra:
            extra(bundle)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    sums = folder / deploy_native.ASSETS[1]
    sums.write_text(f"{checksum}  {archive.name}\n")
    return archive, sums


def fake_root(folder: Path):
    root = folder / "install"
    (root / ".data/postgres").mkdir(parents=True)
    (root / ".data/postgres/PG_VERSION").write_text("16\n")
    (root / ".data/native.env").write_text("DATABASE_URL=postgres://demo:secret@127.0.0.1:55432/inpacare\n")
    for tool in ("node/bin/node", "node/bin/npm", "postgres/usr/lib/postgresql/16/bin/pg_dump"):
        path = root / ".runtime" / tool
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("tool")
        path.chmod(0o755)
    (root / "REVISION").write_text("old\n")
    return root


class DeployNativeTests(unittest.TestCase):
    def test_no_release_yet_is_a_successful_noop(self):
        error = HTTPError("https://api.github.com/releases/latest", 404, "Not Found", {}, None)
        with patch.object(deploy_native, "http_json", side_effect=error):
            self.assertIsNone(deploy_native.latest_release())

    def test_discovery_does_not_create_local_files_or_touch_services(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "not-an-installation"
            with patch.object(sys, "argv", ["deploy-native.py", "--root", str(root), "--check"]), \
                 patch.object(deploy_native, "latest_release", return_value=None), \
                 patch.object(deploy_native, "verify_root") as verify, \
                 patch.object(deploy_native, "run") as run:
                self.assertEqual(deploy_native.main(), 0)
                verify.assert_not_called()
                run.assert_not_called()
                self.assertFalse(root.exists())

    def test_invalid_and_prerelease_releases_are_ignored(self):
        for tag in ("native-" + "A" * 40, "native-" + "a" * 39, "native-" + "a" * 40 + "-rc1"):
            with self.subTest(tag=tag), patch.object(deploy_native, "http_json", return_value={"tag_name": tag, "draft": False, "prerelease": False}):
                self.assertIsNone(deploy_native.latest_release())
        with patch.object(deploy_native, "http_json", return_value={"tag_name": f"native-{SHA}", "draft": False, "prerelease": True}):
            self.assertIsNone(deploy_native.latest_release())

    def test_checksum_traversal_and_link_entries_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            archive, sums = make_release(folder)
            sums.write_text("0" * 64 + "  inpacare-linux-x86_64.tar.gz\n")
            with self.assertRaisesRegex(deploy_native.DeployError, "checksum"):
                deploy_native.verify_archive(archive, sums, SHA, folder / "out1")

            def add_traversal(bundle):
                info = tarfile.TarInfo("../escape")
                info.size = 1
                bundle.addfile(info, io.BytesIO(b"x"))
            archive, sums = make_release(folder, extra=add_traversal)
            sums.write_text(f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n")
            with self.assertRaisesRegex(deploy_native.DeployError, "Unsafe archive path"):
                deploy_native.verify_archive(archive, sums, SHA, folder / "out2")

            def add_link(bundle):
                info = tarfile.TarInfo("link")
                info.type = tarfile.SYMTYPE
                info.linkname = "REVISION"
                bundle.addfile(info)
            archive, sums = make_release(folder, extra=add_link)
            sums.write_text(f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n")
            with self.assertRaisesRegex(deploy_native.DeployError, "Unsupported archive entry"):
                deploy_native.verify_archive(archive, sums, SHA, folder / "out3")

    def run_deployment(self, succeed, *, backup_fails=False, main_advances=False):
        temp = tempfile.TemporaryDirectory()
        folder = Path(temp.name)
        root = fake_root(folder)
        archive, sums = make_release(folder)
        release = {"assets": [{"name": name, "browser_download_url": deploy_native.asset_url(SHA, name)} for name in deploy_native.ASSETS]}
        events = []

        def download(url, dest):
            shutil_source = archive if url.endswith(deploy_native.ASSETS[0]) else sums
            dest.write_bytes(shutil_source.read_bytes())

        def fake_run(args, **kwargs):
            if Path(args[0]).name == "npm":
                (kwargs["cwd"] / "node_modules").mkdir()
            elif "pg_dump" in args[0]:
                events.append("backup")
                if backup_fails:
                    raise deploy_native.DeployError("Backup failed")
                Path(args[args.index("--file") + 1]).write_bytes(b"backup")
            elif args[:4] == ["systemctl", "--user", "stop", "inpacare-web"]:
                events.append("stop")
            return type("Result", (), {"returncode": 0, "stdout": "active\n", "stderr": ""})()

        patches = [patch.object(deploy_native, "main_sha", side_effect=[SHA, "b" * 40 if main_advances else SHA]),
                   patch.object(deploy_native, "download", side_effect=download),
                   patch.object(deploy_native, "run", side_effect=fake_run),
                   patch.object(deploy_native, "wait_healthy", return_value=succeed)]
        for item in patches:
            item.start()
        try:
            with patch.object(deploy_native, "health", return_value=True):
                deploy_native.deploy(root, SHA, release, deploy_native.private_env(root / ".data/native.env"))
        except deploy_native.DeployError:
            if succeed and not backup_fails:
                raise
        finally:
            for item in reversed(patches):
                item.stop()
        return temp, root, events

    def test_success_keeps_data_and_backs_up_before_stop(self):
        temp, root, events = self.run_deployment(True)
        try:
            self.assertEqual((root / ".data/postgres/PG_VERSION").read_text(), "16\n")
            self.assertTrue((root / ".data/native.env").is_file())
            self.assertEqual((root / ".deploy/current/REVISION").read_text().strip(), SHA)
            self.assertLess(events.index("backup"), events.index("stop"))
            self.assertTrue(list((root / ".data/backups").glob("*.dump")))
        finally:
            temp.cleanup()

    def test_failed_health_restores_old_pointer(self):
        temp, root, _ = self.run_deployment(False)
        try:
            self.assertEqual((root / ".deploy/current").resolve(), root.resolve())
            self.assertEqual((root / ".data/postgres/PG_VERSION").read_text(), "16\n")
        finally:
            temp.cleanup()

    def test_backup_failure_keeps_the_running_app_untouched(self):
        temp, root, events = self.run_deployment(False, backup_fails=True)
        try:
            self.assertIn("backup", events)
            self.assertNotIn("stop", events)
            self.assertFalse((root / ".deploy/current").exists())
            self.assertFalse(list((root / ".data/backups").glob("*.dump")))
        finally:
            temp.cleanup()

    def test_new_main_commit_during_preparation_skips_activation(self):
        temp, root, events = self.run_deployment(True, main_advances=True)
        try:
            self.assertEqual(events, [])
            self.assertFalse((root / ".deploy/current").exists())
            self.assertTrue((root / ".deploy/releases" / SHA).is_dir())
        finally:
            temp.cleanup()

    def test_main_mismatch_prevents_download_or_deployment(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            root = fake_root(folder)
            release = {"assets": []}
            with patch.object(deploy_native, "main_sha", return_value="b" * 40), patch.object(deploy_native, "download") as download:
                with self.assertRaisesRegex(deploy_native.DeployError, "current main"):
                    deploy_native.deploy(root, SHA, release, {})
                download.assert_not_called()


if __name__ == "__main__":
    unittest.main()
