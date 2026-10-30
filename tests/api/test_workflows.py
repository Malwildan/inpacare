"""API-level InpaCare checks against a fresh, isolated PostgreSQL demo database.

Start the API with DATABASE_URL pointing at inpacare_test and SEED_DEMO=1,
then run: python -m unittest discover -s tests/api -v
"""
from __future__ import annotations

import concurrent.futures
import http.cookiejar
import json
import os
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal


API = os.environ.get("INPACARE_TEST_URL", "http://127.0.0.1:8081/api/v1").rstrip("/")
ORIGIN = urllib.parse.urlsplit(API).scheme + "://" + urllib.parse.urlsplit(API).netloc
PASSWORD = "InpaCareDemo!2026"


class Api:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""
        self.user: dict = {}

    def request(self, method: str, path: str, body: dict | None = None, *, same_origin: bool = True) -> tuple[int, dict]:
        payload = None if body is None else json.dumps(body).encode()
        headers = {"Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if self.csrf and method not in ("GET", "HEAD", "OPTIONS"):
            headers["X-CSRF-Token"] = self.csrf
            if same_origin:
                headers["Origin"] = ORIGIN
        req = urllib.request.Request(f"{API}{path}", data=payload, headers=headers, method=method)
        try:
            response = self.http.open(req, timeout=15)
        except urllib.error.HTTPError as exc:
            response = exc
        raw = response.read()
        response.close()
        value = json.loads(raw) if raw else {}
        return response.code, value

    def sign_in(self, username: str, password: str = PASSWORD) -> dict:
        req = urllib.request.Request(
            f"{API}/session", data=json.dumps({"username": username, "password": password}).encode(),
            headers={"Content-Type": "application/json", "Accept": "application/json", "Origin": ORIGIN},
            method="POST",
        )
        try:
            response = self.http.open(req, timeout=15)
        except urllib.error.HTTPError as exc:
            response = exc
        raw = response.read()
        response.close()
        value = json.loads(raw) if raw else {}
        if response.code == 200:
            self.user = value["user"]
            self.csrf = self.user["csrfToken"]
        return response.code, value


class Workflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.users: dict[str, Api] = {}
        for name in ("rina", "dina", "bima", "hendra", "maya", "admisi"):
            client = Api()
            status, result = client.sign_in(name)
            if status != 200:
                raise RuntimeError(f"Could not sign in synthetic {name} account; API returned {status}.")
            cls.users[name] = client

    def setUp(self) -> None:
        self.tag = uuid.uuid4().hex[:10]
        self.rina = self.users["rina"]
        self.dina = self.users["dina"]
        self.bima = self.users["bima"]
        self.hendra = self.users["hendra"]
        self.admisi = self.users["admisi"]

    def assert_error(self, response: tuple[int, dict], status: int, code: str | None = None) -> dict:
        actual, payload = response
        self.assertEqual(actual, status, payload)
        if code:
            self.assertEqual(payload.get("error", {}).get("code"), code, payload)
        return payload

    @staticmethod
    def later(hours: int = 3) -> str:
        return (datetime.now(timezone.utc) + timedelta(hours=hours)).replace(microsecond=0).isoformat()

    def create_task(self, title: str, pic: str = "USR-NURSE-1") -> dict:
        status, task = self.rina.request("POST", "/tasks", {
            "patientId": "PT-001", "placementId": "PL-001", "picId": pic, "title": title,
            "description": "Automated integration test", "priority": "normal",
            "startsAt": self.later(), "endsAt": self.later(4),
        })
        self.assertIn(status, (200, 201), task)
        return task

    def test_session_roles_csrf_and_unavailable_sessions(self) -> None:
        anonymous = Api()
        self.assert_error(anonymous.request("GET", "/tasks"), 401, "UNAUTHENTICATED")
        status, user = Api().sign_in("rina", "wrong-password")
        self.assertEqual(status, 401, user)
        self.assertEqual(user["error"]["code"], "INVALID_CREDENTIALS")

        self.assertEqual(self.dina.user["role"], "PERAWAT")
        denied = self.hendra.request("POST", "/tasks", {
            "patientId": "PT-001", "placementId": "PL-001", "picId": "USR-NURSE-1",
            "title": "Spoofed role", "priority": "normal", "startsAt": self.later(), "endsAt": self.later(1),
            "role": "PERAWAT", "coordinator": True,
        })
        self.assert_error(denied, 422, "VALIDATION_FAILED")
        self.assert_error(anonymous.request("POST", "/session", {"username":"rina","password":PASSWORD}, same_origin=False), 403, "FORBIDDEN")
        self.assert_error(self.admisi.request("GET", "/cycles"), 403, "FORBIDDEN")

    def test_coordinator_task_pic_scope_audit_and_version_conflict(self) -> None:
        task = self.create_task(f"Tes reassignment {self.tag}")
        task_id = task["id"]
        self.assertEqual(task["status"], "todo")
        self.assertEqual(self.dina.request("GET", f"/tasks/{task_id}")[0], 200)

        status, started = self.dina.request("PATCH", f"/tasks/{task_id}", {"expectedVersion": 1, "status": "in_progress"})
        self.assertEqual(status, 200, started)
        self.assertEqual(started["version"], 2)
        before = self.rina.request("GET", f"/tasks/{task_id}/history")[1]["total"]
        self.assert_error(self.dina.request("PATCH", f"/tasks/{task_id}", {"expectedVersion": 1, "status": "done"}), 409, "CONFLICT")
        self.assertEqual(self.rina.request("GET", f"/tasks/{task_id}/history")[1]["total"], before)

        status, reassigned = self.rina.request("POST", f"/tasks/{task_id}/reassign", {
            "expectedVersion": 2, "picId": "USR-NURSE-2", "reason": "Pembagian jadwal tes",
        })
        self.assertEqual(status, 200, reassigned)
        self.assertEqual(reassigned["picId"], "USR-NURSE-2")
        self.assert_error(self.dina.request("GET", f"/tasks/{task_id}"), 404, "NOT_FOUND")
        self.assert_error(self.dina.request("GET", f"/tasks/{task_id}/history"), 404, "NOT_FOUND")
        status, done = self.bima.request("PATCH", f"/tasks/{task_id}", {"expectedVersion": 3, "status": "done"})
        self.assertEqual(status, 200, done)
        self.assertEqual(done["version"], 4)
        self.assert_error(self.hendra.request("GET", f"/tasks/{task_id}"), 403, "FORBIDDEN")
        history = self.rina.request("GET", f"/tasks/{task_id}/history")[1]["items"]
        self.assertTrue(any(row["action"] == "reassigned" and row["reason"] == "Pembagian jadwal tes" for row in history))

    def test_same_version_concurrent_task_updates_have_one_winner(self) -> None:
        task = self.create_task(f"Tes concurrency {self.tag}")
        task_id = task["id"]
        base_count = self.rina.request("GET", f"/tasks/{task_id}/history")[1]["total"]
        peers = [Api(), Api()]
        for client in peers:
            status, payload = client.sign_in("rina")
            self.assertEqual(status, 200, payload)
        write = {"expectedVersion": 1, "status": "in_progress"}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda client: client.request("PATCH", f"/tasks/{task_id}", write), peers))
        self.assertEqual(sorted(status for status, _ in results), [200, 409], results)
        history = self.rina.request("GET", f"/tasks/{task_id}/history")
        self.assertEqual(history[0], 200, history)
        self.assertEqual(history[1]["total"], base_count + 1)

    def test_task_list_paginates_and_returns_full_counts(self) -> None:
        status, page = self.rina.request("GET", "/tasks?limit=10&offset=0")
        self.assertEqual(status, 200, page)
        self.assertEqual(len(page["items"]), 10)
        self.assertGreater(page["total"], len(page["items"]))
        self.assertEqual(set(page["counts"]), {"todo", "in_progress", "done", "cancelled"})
        self.assertEqual(sum(page["counts"].values()), page["total"])

    def test_task_cancel_requires_reason_and_logical_delete_preserves_history(self) -> None:
        task = self.create_task(f"Tes delete {self.tag}")
        task_id = task["id"]
        self.assert_error(self.rina.request("PATCH", f"/tasks/{task_id}", {"expectedVersion": 1, "status": "cancelled"}), 422, "VALIDATION_FAILED")
        status, canceled = self.rina.request("PATCH", f"/tasks/{task_id}", {"expectedVersion": 1, "status": "cancelled", "reason": "Penjadwalan demonstrasi"})
        self.assertEqual(status, 200, canceled)
        self.assertEqual(canceled["version"], 2)
        self.assert_error(self.rina.request("DELETE", f"/tasks/{task_id}", {"expectedVersion": 2, "reason": "  "}), 422, "VALIDATION_FAILED")
        status, deleted = self.rina.request("DELETE", f"/tasks/{task_id}", {"expectedVersion": 2, "reason": "Data demo ditutup"})
        self.assertEqual(status, 200, deleted)
        self.assertTrue(deleted["deleted"])
        self.assert_error(self.dina.request("GET", f"/tasks/{task_id}"), 404, "NOT_FOUND")
        history = self.rina.request("GET", f"/tasks/{task_id}/history")
        self.assertEqual(history[0], 200)
        self.assertTrue(any(row["action"] == "deleted" and row["reason"] == "Data demo ditutup" for row in history[1]["items"]))

    def test_medical_record_author_scope_nurse_observation_and_admisi_privacy(self) -> None:
        self.assert_error(self.admisi.request("GET", "/medical-records"), 403, "FORBIDDEN")
        self.assert_error(self.hendra.request("GET", "/patients/PT-002/context"), 404, "NOT_FOUND")
        create = {
            "patientId": "PT-001", "complaint": f"Keluhan tes {self.tag}", "diagnosis": "Catatan sintetik",
            "treatment": "Rencana contoh", "notes": "Pemeriksaan integrasi", "recordDate": date.today().isoformat(),
        }
        status, record = self.hendra.request("POST", "/medical-records", create)
        self.assertIn(status, (200, 201), record)
        self.assertTrue(record.get("id"), record)
        update = {
            "expectedVersion": 1, "complaint": create["complaint"], "diagnosis": create["diagnosis"],
            "treatment": create["treatment"], "notes": create["notes"], "recordDate": create["recordDate"],
        }
        self.assert_error(self.users["maya"].request("PATCH", f"/medical-records/{record['id']}", update), 403, "FORBIDDEN")
        observation = {
            "symptoms": "Keluhan berkurang", "nursingNote": "Observasi demonstrasi",
            "observedAt": self.later(0), "temperature": 36.5, "systolic": 120, "diastolic": 80,
            "pulse": 78, "respiratoryRate": 18, "spo2": 98,
        }
        status, observed = self.dina.request("POST", f"/medical-records/{record['id']}/observations", observation)
        self.assertIn(status, (200, 201), observed)
        detail_status, detail = self.dina.request("GET", f"/medical-records/{record['id']}")
        self.assertEqual(detail_status, 200, detail)
        self.assertTrue(any(row["symptoms"] == observation["symptoms"] for row in detail["observations"]))
        updated = {**update, "diagnosis": "Diagnosis sintetik diperbarui"}
        status, edited = self.hendra.request("PATCH", f"/medical-records/{record['id']}", updated)
        self.assertEqual(status, 200, edited)
        self.assert_error(self.hendra.request("PATCH", f"/medical-records/{record['id']}", updated), 409, "CONFLICT")
        self.assert_error(self.admisi.request("GET", f"/medical-records/{record['id']}"), 403, "FORBIDDEN")

    def test_room_item_cost_is_computed_from_server_prices(self) -> None:
        name = f"QA-{self.tag}"
        status, room = self.dina.request("POST", "/rooms", {
            "name": name, "roomClass": "Kelas uji", "capacity": 2, "status": "available",
            "picId": "USR-NURSE-1", "dailyRate": "125000.50",
        })
        self.assertIn(status, (200, 201), room)
        room_id = room["id"]
        status, updated = self.dina.request("POST", f"/rooms/{room_id}/items", {
            "name": "Perangkat uji", "category": "Peralatan", "quantity": 3, "unitPrice": "125000.25",
        })
        self.assertIn(status, (200, 201), updated)
        self.assertEqual(Decimal(updated["totalCost"]), Decimal("375000.75"))
        self.assertEqual(self.admisi.request("GET", f"/rooms/{room_id}")[0], 200)
        self.assert_error(self.admisi.request("POST", "/rooms", {
            "name": f"Denied-{self.tag}", "roomClass": "Kelas uji", "capacity": 1,
            "status": "available", "dailyRate": "0",
        }), 403, "FORBIDDEN")

    def test_placement_range_capacity_and_concurrent_admissions(self) -> None:
        status, room = self.dina.request("POST", "/rooms", {
            "name": f"QA capacity {self.tag}", "roomClass": "Kapasitas uji", "capacity": 1,
            "status": "available", "dailyRate": "0",
        })
        self.assertIn(status, (200, 201), room)
        start = (date.today() + timedelta(days=45)).isoformat()
        end = (date.today() + timedelta(days=50)).isoformat()
        # Two long intervals on distinct dates share a room with one bed.
        for offset, patient_id in ((0, "PT-009"), (12, "PT-010")):
            booking_start = (date.fromisoformat(start) + timedelta(days=offset)).isoformat()
            booking_end = (date.fromisoformat(end) + timedelta(days=offset)).isoformat()
            status, result = self.dina.request("POST", "/placements", {
                "patientId": patient_id, "roomId": room["id"], "startsOn": booking_start, "endsOn": booking_end,
            })
            self.assertIn(status, (200, 201), result)

        collision_start = (date.fromisoformat(start) + timedelta(days=30)).isoformat()
        collision_end = (date.fromisoformat(end) + timedelta(days=30)).isoformat()
        inputs = [
            ("PT-011", collision_start, collision_end),
            ("PT-012", collision_start, collision_end),
        ]
        clients = [self.users["dina"], Api()]
        auth, login = clients[1].sign_in("bima")
        self.assertEqual(auth, 200, login)

        def place(args: tuple[Api, tuple[str, str, str]]) -> tuple[int, dict]:
            client, (patient, begins, finishes) = args
            return client.request("POST", "/placements", {
                "patientId": patient, "roomId": room["id"], "startsOn": begins, "endsOn": finishes,
            })

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(place, zip(clients, inputs)))
        self.assertEqual(sorted(status for status, _ in results), [201, 409], results)

    def test_cycle_approval_is_persisted_and_notified(self) -> None:
        status, request = self.dina.request("POST", "/cycles/CY-003/requests", {
            "kind": "extend", "requestedEnd": (date.today() + timedelta(days=20)).isoformat(),
            "reason": f"Perpanjangan tes {self.tag}",
        })
        self.assertEqual(status, 201, request)
        status, decision = self.hendra.request("POST", f"/cycles/CY-003/requests/{request['id']}/decision", {
            "decision": "approve", "note": "Permintaan tes disetujui", "expectedVersion": 1,
        })
        self.assertEqual(status, 200, decision)
        self.assertEqual(decision["status"], "approved")
        self.assertEqual(self.dina.request("GET", "/notifications")[0], 200)
        self.assertTrue(any("extend" in item["message"] for item in self.dina.request("GET", "/notifications")[1]["items"]))
        self.assert_error(self.hendra.request("POST", f"/cycles/CY-003/requests/{request['id']}/decision", {
            "decision": "approve", "note": "Pemutaran ulang", "expectedVersion": 1,
        }), 404, "NOT_FOUND")

        status, blocked = self.dina.request("POST", "/cycles/CY-004/requests", {
            "kind": "release", "requestedEnd": None, "reason": f"Pelepasan tes {self.tag}",
        })
        self.assertEqual(status, 201, blocked)
        self.assert_error(self.users["maya"].request("POST", f"/cycles/CY-004/requests/{blocked['id']}/decision", {
            "decision": "approve", "note": "Cek penugasan", "expectedVersion": 1,
        }), 409, "CONFLICT")

    def test_unplaced_cycle_cannot_advance_but_placed_cycle_can(self) -> None:
        status, cycle = self.dina.request("POST", "/cycles", {"patientId":"PT-009","doctorId":"USR-DOCTOR-1","placementId":None})
        self.assertEqual(status, 201, cycle)
        self.assert_error(self.dina.request("PATCH", f"/cycles/{cycle['id']}", {"status":"assigned","expectedVersion":1}), 409, "CONFLICT")
        status, saved = self.dina.request("GET", f"/cycles/{cycle['id']}")
        self.assertEqual(status, 200, saved)
        self.assertEqual(saved["status"], "pending")
        self.assertEqual(saved["version"], 1)
        for version, next_status in [(1,"assigned"),(2,"in_care")]:
            status, changed = self.dina.request("PATCH", "/cycles/CY-001", {"status":next_status,"expectedVersion":version})
            self.assertEqual(status, 200, changed)
            self.assertEqual(changed["version"], version+1)

    def test_invoice_totals_coverage_and_status_history(self) -> None:
        invoice_input = {
            "patientId": "PT-001", "placementId": "PL-001", "coveredAmount": "600000.04",
            "lines": [{"description": "Layanan integrasi", "quantity": 4, "unitPrice": "650000.01"}],
        }
        status, invoice = self.admisi.request("POST", "/invoices", invoice_input)
        self.assertEqual(status, 201, invoice)
        self.assertEqual(Decimal(invoice["totalAmount"]), Decimal("2600000.04"))
        self.assertEqual(Decimal(invoice["payableAmount"]), Decimal("2000000.00"))
        self.assert_error(self.admisi.request("POST", "/invoices", {
            **invoice_input, "patientId": "PT-002", "placementId": "PL-002", "coveredAmount": "1.00",
        }), 422, "VALIDATION_FAILED")
        status, paid = self.admisi.request("PATCH", f"/invoices/{invoice['id']}", {
            "status": "paid", "reason": "Bukti pembayaran dicocokkan", "expectedVersion": 1,
        })
        self.assertEqual(status, 200, paid)
        self.assertEqual(paid["version"], 2)
        self.assert_error(self.admisi.request("PATCH", f"/invoices/{invoice['id']}", {
            "status": "unpaid", "reason": "Versi lama", "expectedVersion": 1,
        }), 409, "CONFLICT")
        detail_status, detail = self.admisi.request("GET", f"/invoices/{invoice['id']}")
        self.assertEqual(detail_status, 200, detail)
        self.assertTrue(any(row["reason"] == "Bukti pembayaran dicocokkan" for row in detail["history"]))
        self.assertNotIn("diagnosis", detail)


if __name__ == "__main__":
    unittest.main(verbosity=2)
