"""Room master permissions through authenticated HTTP on the disposable demo DB."""
import unittest
import uuid
from datetime import date, timedelta

from test_workflows import Api


class RoomPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clients = {}
        for username in ("rina", "dina", "hendra", "admisi"):
            client = Api()
            status, result = client.sign_in(username)
            if status != 200:
                raise RuntimeError(f"Synthetic login failed: {status}")
            cls.clients[username] = client

    def setUp(self):
        self.coordinator = self.clients["rina"]
        self.nurse = self.clients["dina"]
        self.input = {
            "name": f"Permissions {uuid.uuid4().hex[:10]}", "roomClass": "I", "capacity": 2,
            "status": "available", "picId": "USR-NURSE-1", "dailyRate": "125000.25",
        }
        status, self.room = self.coordinator.request("POST", "/rooms", self.input)
        self.assertEqual(status, 200, self.room)
        self.path = f"/rooms/{self.room['id']}"

    def assert_error(self, response, status, code):
        actual, payload = response
        self.assertEqual(actual, status, payload)
        self.assertEqual(payload.get("error", {}).get("code"), code, payload)

    def test_read_access_and_coordinator_crud_with_direct_write_denials(self):
        item = {"name": "Bed", "category": "Facility", "quantity": 3, "unitPrice": "0.10"}
        status, room = self.coordinator.request("POST", f"{self.path}/items", item)
        self.assertEqual(status, 200, room)
        self.assertEqual(room["totalCost"], "0.30")
        item_path = f"{self.path}/items/{room['items'][0]['id']}"
        edit = {**self.input, "name": f"Updated {uuid.uuid4().hex[:10]}", "roomClass": "II",
                "capacity": 3, "picId": "USR-NURSE-2", "expectedVersion": room["version"]}
        for username in ("dina", "hendra", "admisi"):
            client = self.clients[username]
            with self.subTest(username=username):
                status, listed = client.request("GET", "/rooms")
                self.assertEqual(status, 200, listed)
                self.assertTrue(any(entry["id"] == room["id"] for entry in listed["items"]))
                status, detail = client.request("GET", self.path)
                self.assertEqual(status, 200, detail)
                self.assertEqual(detail, room)
                for method, path, body in (
                    ("POST", "/rooms", {**self.input, "name": "Denied"}),
                    ("PATCH", self.path, edit),
                    ("DELETE", self.path, {"expectedVersion": room["version"]}),
                    ("POST", f"{self.path}/items", item),
                    ("PATCH", item_path, {**item, "expectedVersion": room["version"]}),
                    ("DELETE", item_path, {"expectedVersion": room["version"]}),
                ):
                    self.assert_error(client.request(method, path, body), 403, "FORBIDDEN")
        self.assertEqual(self.nurse.request("GET", self.path)[1], room)
        self.assert_error(self.coordinator.request("PATCH", self.path, {**edit, "picId": "USR-DOCTOR-1"}), 422, "VALIDATION_FAILED")
        self.assert_error(self.coordinator.request("PATCH", self.path, {**edit, "name": " "}), 422, "VALIDATION_FAILED")
        status, room = self.coordinator.request("PATCH", self.path, edit)
        self.assertEqual(status, 200, room)
        for key in ("name", "roomClass", "capacity", "picId", "dailyRate"):
            self.assertEqual(room[key], edit[key])
        self.assert_error(self.coordinator.request("PATCH", self.path, edit), 409, "CONFLICT")
        status, room = self.coordinator.request("PATCH", item_path, {**item, "quantity": 7, "expectedVersion": room["version"]})
        self.assertEqual(status, 200, room)
        self.assertEqual(room["totalCost"], "0.70")
        status, room = self.coordinator.request("DELETE", item_path, {"expectedVersion": room["version"]})
        self.assertEqual(status, 200, room)
        self.assertEqual(room["items"], [])
        self.assertEqual(self.coordinator.request("DELETE", self.path, {"expectedVersion": room["version"]})[0], 200)
        self.assert_error(self.nurse.request("GET", self.path), 404, "NOT_FOUND")

    def test_active_placements_block_shrinking_and_archival(self):
        placements = []
        for patient in ("PT-009", "PT-010"):
            status, placement = self.nurse.request("POST", "/placements", {
                "patientId": patient, "roomId": self.room["id"],
                "startsOn": (date.today() + timedelta(days=210)).isoformat(),
                "endsOn": (date.today() + timedelta(days=215)).isoformat(),
            })
            self.assertEqual(status, 201, placement)
            placements.append(placement)
        version = {"expectedVersion": self.room["version"]}
        self.assert_error(self.coordinator.request("PATCH", self.path, {**self.input, **version, "capacity": 1}), 409, "CONFLICT")
        self.assert_error(self.coordinator.request("DELETE", self.path, version), 409, "CONFLICT")
        self.assertEqual(self.nurse.request("GET", self.path)[1], self.room)
        for placement in placements:
            status, calendar = self.nurse.request("GET", f"/occupancy?from={placement['startsOn']}&to={placement['endsOn']}&roomId={self.room['id']}")
            self.assertEqual(status, 200, calendar)
            detail = next(entry for entry in calendar["items"] if entry["id"] == placement["id"])
            self.assertEqual(detail["status"], "active")
            self.assertEqual(self.nurse.request("GET", f"/patients/{placement['patientId']}/context")[0], 200)

    def test_archiving_preserves_historical_placements_and_patients(self):
        placements = []
        for patient in ("PT-009", "PT-010"):
            status, placement = self.nurse.request("POST", "/placements", {
                "patientId": patient, "roomId": self.room["id"],
                "startsOn": (date.today() - timedelta(days=210)).isoformat(),
                "endsOn": (date.today() - timedelta(days=205)).isoformat(),
            })
            self.assertEqual(status, 201, placement)
            placements.append(placement)
        self.assert_error(self.coordinator.request("PATCH", self.path, {
            **self.input, "capacity": 1, "expectedVersion": self.room["version"],
        }), 409, "CONFLICT")
        self.assertEqual(self.coordinator.request("DELETE", self.path, {"expectedVersion": self.room["version"]})[0], 200)
        for placement in placements:
            status, calendar = self.nurse.request("GET", f"/occupancy?from={placement['startsOn']}&to={placement['endsOn']}&roomId={self.room['id']}")
            self.assertEqual(status, 200, calendar)
            detail = next(entry for entry in calendar["items"] if entry["id"] == placement["id"])
            self.assertEqual(detail["status"], "active")
            self.assertEqual(detail["patientId"], placement["patientId"])
            self.assertEqual(self.nurse.request("GET", f"/patients/{placement['patientId']}/context")[0], 200)
