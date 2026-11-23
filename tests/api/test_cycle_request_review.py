"""Doctor request review and approval checks against synthetic PostgreSQL data."""
import unittest
import uuid
from datetime import datetime, timedelta, timezone

from test_workflows import Api


class CycleRequestReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name in ("admisi", "rina", "dina", "hendra", "maya"):
            client = Api()
            status, payload = client.sign_in(name)
            if status != 200:
                raise RuntimeError(f"Could not sign in {name}: {status} {payload}")
            setattr(cls, name, client)

    @staticmethod
    def day(offset=0):
        jakarta = timezone(timedelta(hours=7))
        return (datetime.now(jakarta).date() + timedelta(days=offset)).isoformat()

    @staticmethod
    def instant(hours):
        return (datetime.now(timezone.utc) + timedelta(hours=hours)).replace(microsecond=0).isoformat()

    def call(self, client, method, path, expected, data=None):
        status, body = client.request(method, path, data)
        self.assertEqual(status, expected, body)
        return body

    def patient(self):
        return self.call(self.admisi, "POST", "/patients", 200, {
            "name": f"Pasien tinjauan {uuid.uuid4().hex[:10]}",
            "birthDate": "2000-01-01", "gender": "P", "bpjs": False,
        })

    def cycle(self):
        patient = self.patient()
        room = self.call(self.rina, "POST", "/rooms", 200, {
            "name": f"Ruang tinjauan {patient['medicalRecordNo']}",
            "roomClass": "Uji", "capacity": 1, "dailyRate": "0",
        })
        cycle = self.call(self.dina, "POST", "/cycles", 201, {
            "patientId": patient["id"], "doctorId": self.hendra.user["id"],
            "newPlacement": {"roomId": room["id"], "startsOn": self.day(-1), "endsOn": self.day(3)},
        })
        path = f"/cycles/{cycle['id']}"
        self.call(self.dina, "PATCH", path, 200, {"status": "in_care", "expectedVersion": cycle["version"]})
        return path, patient, room

    def test_review_context_scope_stale_version_and_decision_history(self):
        path, patient, room = self.cycle()
        request = self.call(self.dina, "POST", f"{path}/requests", 201, {
            "kind": "extend", "requestedEnd": self.day(6), "reason": "Perlu pemantauan lebih lama",
        })
        review_path = f"{path}/requests/{request['id']}/review"
        decision_path = f"{path}/requests/{request['id']}/decision"
        empty = self.call(self.hendra, "GET", review_path, 200)
        self.assertEqual(empty["records"], [])
        self.assertEqual(empty["observations"], [])
        observed_at = self.instant(-1)
        observation = self.call(self.dina, "POST", f"{path}/observations", 201, {
            "symptoms": "Kondisi sebelum rekam medis", "observedAt": observed_at, "temperature": 36.8,
        })["items"][0]
        review = self.call(self.hendra, "GET", review_path, 200)
        self.assertEqual(review["cycle"], {
            "id": path.split("/")[-1], "patientId": patient["id"], "patientName": patient["name"],
            "medicalRecordNo": patient["medicalRecordNo"], "status": "in_care", "version": 2,
        })
        self.assertEqual(review["request"]["requestedEnd"], self.day(6))
        self.assertEqual(review["request"]["requestedBy"], self.dina.user["name"])
        self.assertEqual(review["request"]["reason"], "Perlu pemantauan lebih lama")
        self.assertEqual(review["request"]["status"], "pending")
        self.assertEqual(review["placement"]["room"], room["name"])
        self.assertEqual(review["placement"]["startsOn"], self.day(-1))
        self.assertEqual(review["placement"]["endsOn"], self.day(3))
        self.assertIsNone(review["approvalBlocker"])
        self.assertEqual(review["records"], [])
        self.assertEqual(review["observations"], [observation])
        self.assertEqual(observation["nurseName"], self.dina.user["name"])
        self.assertEqual(datetime.fromisoformat(observation["observedAt"]), datetime.fromisoformat(observed_at))
        payload = {"decision": "reject", "note": "Lanjutkan pemantauan awal", "expectedVersion": 2}
        for other, code in ((self.maya, 404), (self.rina, 403), (self.dina, 403)):
            self.call(other, "GET", review_path, code)
            self.call(other, "POST", decision_path, code, payload)
        self.call(self.hendra, "POST", decision_path, 422, {**payload, "note": "  "})

        record = self.call(self.hendra, "POST", "/medical-records", 200, {
            "patientId": patient["id"], "cycleId": review["cycle"]["id"], "recordDate": self.day(),
            "complaint": "Keluhan sintetis", "diagnosis": "Diagnosis sintetis",
            "treatment": "Tindakan sintetis", "notes": "Catatan medis untuk keputusan",
        })
        self.call(self.rina, "PATCH", f"{path}/assignee", 200, {
            "nurseId": self.rina.user["id"], "expectedVersion": 2, "reason": "Pengalihan sif",
        })
        self.call(self.hendra, "POST", decision_path, 409, payload)
        refreshed = self.call(self.hendra, "GET", review_path, 200)
        self.assertEqual(refreshed["cycle"]["version"], 3)
        self.assertEqual(refreshed["request"]["status"], "pending")
        self.assertEqual(refreshed["records"][0]["id"], record["id"])
        self.assertEqual(refreshed["records"][0]["notes"], "Catatan medis untuk keputusan")

        result = self.call(self.hendra, "POST", decision_path, 200, {**payload, "expectedVersion": 3})
        self.assertEqual(result, {"ok": True, "status": "rejected", "cycleStatus": "in_care", "version": 4})
        decided = self.call(self.hendra, "GET", review_path, 200)["request"]
        self.assertEqual(decided["status"], "rejected")
        self.assertEqual(decided["note"], payload["note"])
        self.assertEqual(decided["decidedBy"], self.hendra.user["name"])
        self.assertTrue(decided["decidedAt"])
        self.call(self.hendra, "POST", decision_path, 404, {**payload, "expectedVersion": 4})
        self.assertEqual(self.call(self.hendra, "GET", f"{path}/requests/{request['id']}", 200), decided)
        notices = self.call(self.rina, "GET", "/notifications", 200)["items"]
        self.assertEqual(len([notice for notice in notices if notice["requestId"] == request["id"]]), 1)

    def test_approval_rechecks_capacity_and_release_tasks_after_review(self):
        path, patient, room = self.cycle()
        extension = self.call(self.dina, "POST", f"{path}/requests", 201, {
            "kind": "extend", "requestedEnd": self.day(6), "reason": "Perpanjang perawatan",
        })
        endpoint = f"{path}/requests/{extension['id']}"
        open_review = self.call(self.hendra, "GET", f"{endpoint}/review", 200)
        self.assertIsNone(open_review["approvalBlocker"])
        other = self.patient()
        capacity_booking = self.call(self.dina, "POST", "/placements", 201, {
            "patientId": other["id"], "roomId": room["id"], "startsOn": self.day(4), "endsOn": self.day(5),
        })
        approve = {"decision": "approve", "note": "Perpanjangan sesuai tinjauan", "expectedVersion": open_review["cycle"]["version"]}
        failure = self.call(self.hendra, "POST", f"{endpoint}/decision", 409, approve)
        blocked = self.call(self.hendra, "GET", f"{endpoint}/review", 200)
        self.assertIn("Ruang penuh", failure["error"]["message"])
        self.assertEqual(blocked["approvalBlocker"], failure["error"]["message"])
        self.assertEqual(blocked["request"]["status"], "pending")
        self.call(self.rina, "DELETE", f"/placements/{capacity_booking['id']}", 200, {
            "expectedVersion": capacity_booking["version"], "reason": "Kapasitas tersedia kembali",
        })
        overlap_room = self.call(self.rina, "POST", "/rooms", 200, {
            "name": f"Ruang bentrok {patient['medicalRecordNo']}",
            "roomClass": "Uji", "capacity": 1, "dailyRate": "0",
        })
        overlap = self.call(self.dina, "POST", "/placements", 201, {
            "patientId": patient["id"], "roomId": overlap_room["id"], "startsOn": self.day(4), "endsOn": self.day(5),
        })
        failure = self.call(self.hendra, "POST", f"{endpoint}/decision", 409, approve)
        self.assertIn("penempatan lain", failure["error"]["message"])
        self.call(self.rina, "DELETE", f"/placements/{overlap['id']}", 200, {
            "expectedVersion": overlap["version"], "reason": "Jadwal penempatan berubah",
        })
        result = self.call(self.hendra, "POST", f"{endpoint}/decision", 200, approve)
        self.assertEqual(result["cycleStatus"], "extend")
        self.assertEqual(self.call(self.hendra, "GET", f"{endpoint}/review", 200)["placement"]["endsOn"], self.day(6))

        release = self.call(self.dina, "POST", f"{path}/requests", 201, {"kind": "release", "reason": "Pasien dapat pulang"})
        endpoint = f"{path}/requests/{release['id']}"
        open_review = self.call(self.hendra, "GET", f"{endpoint}/review", 200)
        self.assertEqual(open_review["reviewDate"], self.day())
        self.assertEqual(open_review["blockingTasks"], [])
        task = self.call(self.rina, "POST", "/tasks", 201, {
            "patientId": patient["id"], "placementId": open_review["placement"]["id"], "picId": self.dina.user["id"],
            "title": "Tugas ditambahkan setelah tinjauan", "priority": "normal",
            "startsAt": self.instant(1), "endsAt": self.instant(2),
        })
        approve = {"decision": "approve", "note": "Pelepasan sesuai tinjauan", "expectedVersion": open_review["cycle"]["version"]}
        failure = self.call(self.hendra, "POST", f"{endpoint}/decision", 409, approve)
        blocked = self.call(self.hendra, "GET", f"{endpoint}/review", 200)
        self.assertEqual(blocked["approvalBlocker"], failure["error"]["message"])
        self.assertEqual(blocked["request"]["status"], "pending")
        self.assertEqual([item["id"] for item in blocked["blockingTasks"]], [task["id"]])
        self.assertEqual(blocked["blockingTasks"][0]["title"], task["title"])
        self.call(self.hendra, "GET", f"/tasks/{task['id']}", 403)
        self.call(self.rina, "PATCH", f"/tasks/{task['id']}", 200, {
            "status": "cancelled", "expectedVersion": task["version"], "reason": "Tugas tidak diperlukan",
        })
        result = self.call(self.hendra, "POST", f"{endpoint}/decision", 200, approve)
        self.assertEqual(result["cycleStatus"], "released")
        self.assertEqual(self.call(self.hendra, "GET", f"{endpoint}/review", 200)["request"]["status"], "approved")
