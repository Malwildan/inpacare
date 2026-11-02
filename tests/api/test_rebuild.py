"""Nest rebuild acceptance against the disposable synthetic demo database."""
import concurrent.futures
import unittest
import uuid
from datetime import date, timedelta

from test_workflows import Api
import test_workflows as legacy


class RebuildWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clients = {}
        for username in ("rina", "dina", "hendra", "admisi"):
            client = Api()
            status, value = client.sign_in(username)
            if status != 200:
                raise RuntimeError(f"Synthetic login failed: {status}")
            cls.clients[username] = client

    def room(self, capacity=1):
        status, room = self.clients["dina"].request("POST", "/rooms", {
            "name": f"Nest {uuid.uuid4().hex[:10]}", "roomClass": "Kelas uji", "capacity": capacity,
            "status": "available", "dailyRate": "125000.25",
        })
        self.assertIn(status, (200, 201), room)
        return room

    def test_room_item_version_archive_and_placement_reschedule_cancel(self):
        nurse = self.clients["dina"]
        room = self.room()
        status, room = nurse.request("POST", f"/rooms/{room['id']}/items", {
            "name": "Peralatan uji", "category": "Peralatan", "quantity": 3, "unitPrice": "0.10",
        })
        self.assertIn(status, (200, 201), room)
        item = room["items"][0]
        status, updated = nurse.request("PATCH", f"/rooms/{room['id']}/items/{item['id']}", {
            "name": "Peralatan uji", "category": "Peralatan", "quantity": 7,
            "unitPrice": "0.10", "expectedVersion": room["version"],
        })
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["totalCost"], "0.70")
        stale, _ = nurse.request("DELETE", f"/rooms/{room['id']}/items/{item['id']}", {"expectedVersion": room["version"]})
        self.assertEqual(stale, 409)
        status, updated = nurse.request("DELETE", f"/rooms/{room['id']}/items/{item['id']}", {"expectedVersion": updated["version"]})
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["items"], [])

        start = (date.today() + timedelta(days=60)).isoformat()
        end = (date.today() + timedelta(days=65)).isoformat()
        payload = {"patientId": "PT-011", "roomId": room["id"], "startsOn": start, "endsOn": end}
        status, placement = nurse.request("POST", "/placements", payload)
        self.assertEqual(status, 201, placement)
        status, placement = nurse.request("PATCH", f"/placements/{placement['id']}", {**payload, "expectedVersion": 1})
        self.assertEqual(status, 200, placement)
        status, canceled = nurse.request("DELETE", f"/placements/{placement['id']}", {"expectedVersion": placement["version"]})
        self.assertEqual(status, 200, canceled)
        self.assertEqual(canceled["status"], "cancelled")
        status, result = nurse.request("DELETE", f"/rooms/{room['id']}", {"expectedVersion": updated["version"]})
        self.assertEqual(status, 200, result)
        status, result = nurse.request("POST", "/placements", payload)
        self.assertIn(status, (404, 409), result)

    def test_pending_cycle_recovery_release_and_no_placement_reuse(self):
        nurse, doctor = self.clients["dina"], self.clients["hendra"]
        room = self.room()
        # Delete an unplaced draft then recover with a new draft for the same patient.
        status, draft = nurse.request("POST", "/cycles", {"patientId": "PT-012", "doctorId": "USR-DOCTOR-1"})
        self.assertEqual(status, 201, draft)
        status, result = nurse.request("DELETE", f"/cycles/{draft['id']}", {"expectedVersion": 1, "reason": "Draft keliru"})
        self.assertEqual(status, 200, result)
        status, cycle = nurse.request("POST", "/cycles", {"patientId": "PT-012", "doctorId": "USR-DOCTOR-1"})
        self.assertEqual(status, 201, cycle)
        status, placement = nurse.request("POST", "/placements", {
            "patientId": "PT-012", "roomId": room["id"], "startsOn": date.today().isoformat(),
            "endsOn": (date.today() + timedelta(days=3)).isoformat(),
        })
        self.assertEqual(status, 201, placement)
        status, cycle = nurse.request("PATCH", f"/cycles/{cycle['id']}", {
            "placementId": placement["id"], "status": "assigned", "expectedVersion": 1,
        })
        self.assertEqual(status, 200, cycle)
        cycle_id = next(item["id"] for item in nurse.request("GET", "/cycles")[1]["items"] if item.get("placementId") == placement["id"])
        status, cycle = nurse.request("PATCH", f"/cycles/{cycle_id}", {"status": "in_care", "expectedVersion": 2})
        self.assertEqual(status, 200, cycle)
        status, request = nurse.request("POST", f"/cycles/{cycle_id}/requests", {"kind": "release", "reason": "Perawatan selesai"})
        self.assertEqual(status, 201, request)
        decision = {"decision": "approve", "note": "Disetujui", "expectedVersion": 3}
        def approve(_):
            return doctor.request("POST", f"/cycles/{cycle_id}/requests/{request['id']}/decision", decision)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(approve, range(2)))
        self.assertEqual(sum(status == 200 for status, _ in results), 1, results)
        self.assertTrue(all(status in (200, 404, 409) for status, _ in results), results)
        status, blocked = nurse.request("POST", "/cycles", {"patientId": "PT-012", "doctorId": "USR-DOCTOR-1", "placementId": placement["id"]})
        self.assertEqual(status, 409, blocked)
        coordinator = self.clients["rina"]
        status, blocked = coordinator.request("POST", "/tasks", {
            "patientId": "PT-012", "placementId": placement["id"], "picId": "USR-NURSE-1",
            "title": "Tugas setelah pulang", "startsAt": legacy.Workflows.later(), "endsAt": legacy.Workflows.later(4), "priority": "normal",
        })
        self.assertIn(status, (409, 422), blocked)
        status, dashboard = nurse.request("GET", "/cycles/dashboard")
        self.assertEqual(status, 200, dashboard)

    def test_invoice_line_exact_totals_claim_audit_and_paid_immutability(self):
        admisi = self.clients["admisi"]
        status, invoice = admisi.request("POST", "/invoices", {
            "patientId": "PT-001", "coveredAmount": "0.10",
            "lines": [{"description": "Layanan uji", "quantity": 3, "unitPrice": "0.10"}],
        })
        self.assertEqual(status, 201, invoice)
        self.assertEqual(invoice["totalAmount"], "0.30")
        invoice_id, line_id = invoice["id"], invoice["lines"][0]["id"]
        line = {"description": "Layanan dikoreksi", "quantity": 5, "unitPrice": "0.10", "expectedVersion": 1, "reason": "Koreksi rincian"}
        status, result = admisi.request("PATCH", f"/invoices/{invoice_id}/lines/{line_id}", line)
        self.assertEqual(status, 200, result)
        self.assertEqual(result["payableAmount"], "0.40")
        status, result = admisi.request("POST", f"/invoices/{invoice_id}/claim-verification", {"verified": True, "expectedVersion": 2, "reason": "Bukti diperiksa manual"})
        self.assertIn(status, (200, 201), result)
        status, result = admisi.request("PATCH", f"/invoices/{invoice_id}", {"status": "paid", "expectedVersion": 3, "reason": "Pembayaran dicatat"})
        self.assertEqual(status, 200, result)
        status, result = admisi.request("PATCH", f"/invoices/{invoice_id}/lines/{line_id}", {**line, "expectedVersion": 4})
        self.assertEqual(status, 409, result)
        status, result = admisi.request("DELETE", f"/invoices/{invoice_id}", {"expectedVersion": 4, "reason": "Uji tagihan lunas"})
        self.assertEqual(status, 409, result)

    def test_medical_observation_correction_stale_conflict_and_privacy(self):
        doctor, nurse, admisi = self.clients["hendra"], self.clients["dina"], self.clients["admisi"]
        status, record = doctor.request("POST", "/medical-records", {
            "patientId": "PT-001", "complaint": "Keluhan sintetis", "diagnosis": "Diagnosis sintetis", "treatment": "Tindakan sintetis", "recordDate": date.today().isoformat(),
        })
        self.assertEqual(status, 200, record)
        status, record = nurse.request("POST", f"/medical-records/{record['id']}/observations", {"symptoms": "Kondisi sintetis", "observedAt": legacy.Workflows.later(), "temperature": 36.5, "systolic": 120, "diastolic": 80})
        self.assertEqual(status, 200, record)
        observation = record["observations"][0]
        correction = {"symptoms": "Kondisi dikoreksi", "observedAt": legacy.Workflows.later(), "temperature": 37.1, "systolic": 121, "diastolic": 81, "expectedVersion": observation["version"], "reason": "Koreksi pengukuran"}
        path = f"/medical-records/{record['id']}/observations/{observation['id']}"
        status, result = nurse.request("PATCH", path, correction)
        self.assertEqual(status, 200, result)
        status, result = nurse.request("PATCH", path, correction)
        self.assertEqual(status, 409, result)
        status, projection = admisi.request("GET", f"/medical-records/{record['id']}")
        self.assertEqual(status, 200, projection)
        self.assertEqual(set(projection), {"id", "patientId", "doctorId", "recordDate"})
