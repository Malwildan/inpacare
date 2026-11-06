import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "pgadmin_ops", Path(__file__).resolve().parents[2] / "scripts" / "pgadmin.py")
pgadmin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pgadmin)


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


if __name__ == "__main__":
    unittest.main()
