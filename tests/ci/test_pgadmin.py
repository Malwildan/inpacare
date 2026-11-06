import importlib.util
import io
from pathlib import Path
from datetime import timedelta
from types import SimpleNamespace
import tarfile
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "pgadmin_ops", Path(__file__).resolve().parents[2] / "scripts" / "pgadmin.py")
pgadmin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pgadmin)
check_spec = importlib.util.spec_from_file_location(
    "pgadmin_checks", Path(__file__).resolve().parents[2] / "scripts" / "check-pgadmin.py")
checks = importlib.util.module_from_spec(check_spec)
check_spec.loader.exec_module(checks)


class OwnerCredentialsTests(unittest.TestCase):
    def test_reinstall_reuses_the_password_field_without_rotating_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            credentials = data / "owner-db-password.txt"
            original = "PostgreSQL login: inpacare_pgadmin_owner\nPostgreSQL password: synthetic-owner-password\n"
            credentials.write_text(original, encoding="utf-8")
            with patch.object(pgadmin, "DATA", data), patch.object(pgadmin, "ensure_role_and_login") as ensure:
                pgadmin.ensure_owner_db_login()
                pgadmin.ensure_owner_db_login()
            self.assertEqual(ensure.call_count, 2)
            for call in ensure.call_args_list:
                self.assertEqual(call.args[2], "synthetic-owner-password")
            self.assertEqual(credentials.read_text(encoding="utf-8"), original)

    def test_malformed_existing_credentials_fail_before_changing_the_database(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            (data / "owner-db-password.txt").write_text("Unexpected content\n", encoding="utf-8")
            with patch.object(pgadmin, "DATA", data), patch.object(pgadmin, "ensure_role_and_login") as ensure:
                with self.assertRaisesRegex(RuntimeError, "malformed"):
                    pgadmin.ensure_owner_db_login()
                ensure.assert_not_called()


class WebAssetsTests(unittest.TestCase):
    bundles = ("style.css", "vendor.main.js", "vendor.react.js", "vendor.others.js",
               "vendor.sqleditor.js", "pgadmin_commons.js")

    def test_complete_installation_does_not_download_or_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            generated = site / "pgadmin/static/js/generated"
            generated.mkdir(parents=True)
            for name in self.bundles:
                (generated / name).write_text("bundle")
            with patch.object(pgadmin, "SITE", site), patch.object(pgadmin.urllib.request, "urlretrieve") as download:
                self.assertFalse(pgadmin.ensure_web_assets())
                download.assert_not_called()

    def test_missing_bundles_build_in_the_extracted_source_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            site, data = root / "site", root / "data"
            archive = root / "fixture.tar.gz"
            with tarfile.open(archive, "w:gz") as bundle:
                entry = tarfile.TarInfo("pgadmin4-REL-9_19/web/package.json")
                entry.size = 2
                bundle.addfile(entry, io.BytesIO(b"{}"))

            def download(url, destination):
                destination.write_bytes(archive.read_bytes() if url.endswith(".tar.gz") else b"// yarn fixture")

            def build(args, *, env, cwd):
                self.assertEqual(cwd.name, "web")
                self.assertTrue((cwd / "package.json").is_file())
                if args[-2:] == ["run", "bundle"]:
                    generated = cwd / "pgadmin/static/js/generated"
                    generated.mkdir(parents=True)
                    for name in self.bundles:
                        (generated / name).write_text("built bundle")

            # Download verification is isolated here; this test exercises build
            # ownership and installation without fetching or executing Yarn.
            source_hash = "a78485f162748b4383f9d97ea334338c3e737e81a98f461718e948211bb99ba2"
            yarn_hash = "31cb07af197fac43b14bf97a8a03a7010dda364ec8d8b78b0d3d437fdf41a072"
            digests = [SimpleNamespace(hexdigest=lambda value=value: value) for value in (source_hash, yarn_hash)]
            with patch.object(pgadmin, "SITE", site), patch.object(pgadmin, "DATA", data), \
                    patch.object(pgadmin.shutil, "which", return_value="node"), \
                    patch.object(pgadmin.urllib.request, "urlretrieve", side_effect=download), \
                    patch.object(pgadmin.hashlib, "sha256", side_effect=digests), \
                    patch.object(pgadmin, "run", side_effect=build) as run:
                self.assertTrue(pgadmin.ensure_web_assets())
                self.assertEqual(run.call_count, 2)
            for name in self.bundles:
                self.assertEqual((site / "pgadmin/static/js/generated" / name).read_text(), "built bundle")

    def test_invalid_download_is_rejected_before_building(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(pgadmin, "SITE", root / "site"), \
                    patch.object(pgadmin, "DATA", root / "data"), \
                    patch.object(pgadmin.shutil, "which", return_value="node"), \
                    patch.object(pgadmin.urllib.request, "urlretrieve",
                                 side_effect=lambda url, path: path.write_bytes(b"invalid download")), \
                    patch.object(pgadmin, "run") as run:
                with self.assertRaisesRegex(RuntimeError, "SHA-256"):
                    pgadmin.ensure_web_assets()
                run.assert_not_called()

    def test_referenced_script_missing_empty_or_html_response_fails(self):
        html = '<script src="/db/static/js/generated/vendor.main.js?ver=91900"></script>'
        for status, mime, content in ((404, "text/html", b"missing"),
                                      (200, "text/html", b"login"),
                                      (200, "application/javascript", b"")):
            with self.subTest(status=status, mime=mime, empty=not content):
                response = SimpleNamespace(status_code=status, content=content,
                    headers={"Content-Type": mime}, elapsed=timedelta(milliseconds=1))
                requester = SimpleNamespace(get=lambda *args, **kwargs: response)
                with self.assertRaises(RuntimeError):
                    checks.check_html_assets(html, "dashboard", requester)

    def test_asset_check_ignores_external_sources_and_deduplicates_references(self):
        url = "/db/static/js/generated/vendor.main.js"
        html = f'<script src="{url}"></script><script src="{url}"></script>' \
               '<script src="https://other.example/db/static/private.js"></script>'
        response = SimpleNamespace(status_code=200, content=b"bundle",
            headers={"Content-Type": "application/javascript"}, elapsed=timedelta(milliseconds=1))
        from unittest.mock import Mock
        requester = SimpleNamespace(get=Mock(return_value=response))
        result = checks.check_html_assets(html, "dashboard", requester)
        self.assertEqual(len(result), 1)
        requester.get.assert_called_once_with("https://inpacare.hailmary.my.id" + url, timeout=30)


class ProxyUpgradeTests(unittest.TestCase):
    def test_existing_route_gets_scoped_trust_once_for_spaces_or_tabs(self):
        for indent in ("    ", "\t"):
            with self.subTest(indent=repr(indent)), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                caddy_dir = root / ".local/share/mac-cloud-drive/public.d"
                caddy_dir.mkdir(parents=True)
                site = caddy_dir / "inpacare.caddy"
                site.write_text("https://inpacare.hailmary.my.id {\n"
                    + indent + "@pgadmin path /db /db/*\n"
                    + indent + "handle @pgadmin {\n"
                    + indent * 2 + "reverse_proxy 127.0.0.1:5050 {\n"
                    + indent * 3 + "header_up X-Scheme {scheme}\n"
                    + indent * 2 + "}\n" + indent + "}\n"
                    + indent + "reverse_proxy 127.0.0.1:8089\n}\n")
                with patch.object(pgadmin.Path, "home", return_value=root), \
                        patch.object(pgadmin, "DATA", root / "private"), \
                        patch.object(pgadmin, "run", return_value=SimpleNamespace(returncode=0)):
                    pgadmin.setup_caddy()
                    upgraded = site.read_text()
                    pgadmin.setup_caddy()
                self.assertEqual(site.read_text(), upgraded)
                self.assertEqual(upgraded.count("trusted_proxies "), 1)
                self.assertNotIn("trusted_proxies", upgraded.split("reverse_proxy 127.0.0.1:8089")[1])


if __name__ == "__main__":
    unittest.main()
