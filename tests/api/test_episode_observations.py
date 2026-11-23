"""Episode observations against the disposable synthetic PostgreSQL demo."""
import unittest
import uuid
from datetime import date

from test_workflows import Api
import test_workflows as legacy


class EpisodeObservations(unittest.TestCase):
    def test_observations_follow_episode_before_and_after_a_medical_record(self):
        clients = {}
        for name in ("dina", "bima", "hendra", "maya", "admisi", "rina"):
            clients[name] = Api()
            self.assertEqual(clients[name].sign_in(name)[0], 200)
        dina, bima, hendra, maya, admisi, rina = (clients[name] for name in clients)

        status, patient = admisi.request("POST", "/patients", {
            "name": f"Pasien observasi {uuid.uuid4().hex[:8]}",
            "birthDate": "2000-01-01", "gender": "P", "bpjs": False,
        })
        self.assertEqual(status, 200, patient)
        status, cycle = dina.request("POST", "/cycles", {
            "patientId": patient["id"], "doctorId": hendra.user["id"],
        })
        self.assertEqual(status, 201, cycle)
        path = f"/cycles/{cycle['id']}/observations"
        self.assertEqual(hendra.request("GET", f"/medical-records?patientId={patient['id']}"), (200, {"items": [], "total": 0}))

        payload = {
            "symptoms": "Kondisi sintetis sebelum rekam medis", "nursingNote": "Catatan awal",
            "observedAt": legacy.Workflows.later(-1), "systolic": 120, "diastolic": 80,
            "temperature": 36.55, "respiratoryRate": 18, "spo2": 98,
        }
        for changes in ({"temperature": 46}, {"pulse": 20.5}, {"spo2": 101}, {"diastolic": None},
                        {"observedAt": "2026-11-01T08:00:00"}, {"patientId": "PT-001"}, {"diagnosis": "Tidak boleh"}):
            status, result = dina.request("POST", path, {**payload, **changes})
            self.assertEqual(status, 422, result)
        self.assertEqual(hendra.request("GET", path), (200, {"items": []}))
        self.assertEqual(hendra.request("POST", path, payload)[0], 403)
        self.assertEqual(admisi.request("GET", path)[0], 403)
        self.assertEqual(bima.request("POST", path, payload)[0], 404)
        self.assertEqual(bima.request("GET", path)[0], 404)
        self.assertEqual(maya.request("GET", path)[0], 404)

        status, result = dina.request("POST", path, payload)
        self.assertEqual(status, 201, result)
        self.assertEqual(len(result["items"]), 1)
        observation = result["items"][0]
        self.assertEqual(observation["symptoms"], payload["symptoms"])
        self.assertEqual(observation["temperature"], 36.55)
        self.assertEqual(observation["bloodPressure"], "120/80")
        self.assertEqual(observation["nurseId"], dina.user["id"])
        self.assertTrue(observation["createdAt"])
        self.assertEqual(hendra.request("GET", path), (200, result))
        self.assertEqual(dina.request("DELETE", f"/cycles/{cycle['id']}", {
            "expectedVersion": cycle["version"], "reason": "Uji retensi",
        })[0], 409)

        record_input = {
            "patientId": patient["id"], "cycleId": cycle["id"], "recordDate": date.today().isoformat(),
            "complaint": "Keluhan", "diagnosis": "Diagnosis", "treatment": "Tindakan",
        }
        self.assertEqual(hendra.request("POST", "/medical-records", {**record_input, "cycleId": "CY-001"})[0], 404)
        status, record = hendra.request("POST", "/medical-records", record_input)
        self.assertEqual(status, 200, record)
        self.assertEqual(record["observations"], [observation])
        record_path = f"/medical-records/{record['id']}"
        self.assertEqual(bima.request("GET", record_path)[0], 404)
        self.assertEqual(bima.request("POST", f"{record_path}/observations", payload)[0], 404)
        self.assertEqual(dina.request("PATCH", record_path, {"diagnosis": "Tidak boleh"})[0], 403)
        self.assertEqual(dina.request("PATCH", f"{record_path}/observations/OB-001", {
            **payload, "expectedVersion": 1, "reason": "Uji cakupan",
        })[0], 404)

        status, corrected = dina.request("PATCH", f"{record_path}/observations/{observation['id']}", {
            **payload, "symptoms": "Observasi terkoreksi", "expectedVersion": 1, "reason": "Uji koreksi",
        })
        self.assertEqual(status, 200, corrected)
        self.assertEqual(corrected["observations"][0]["id"], observation["id"])
        self.assertEqual(corrected["observations"][0]["version"], 2)
        self.assertEqual(hendra.request("GET", path), (200, {"items": corrected["observations"]}))

        status, records = rina.request("GET", f"/medical-records?patientId={patient['id']}")
        self.assertEqual(status, 200, records)
        self.assertEqual([item["id"] for item in records["items"]], [record["id"]])
        self.assertEqual(rina.request("GET", path), (200, {"items": corrected["observations"]}))
        self.assertEqual(rina.request("POST", path, payload)[0], 404)

        status, reassigned = rina.request("PATCH", f"/cycles/{cycle['id']}/assignee", {
            "nurseId": bima.user["id"], "expectedVersion": cycle["version"], "reason": "Alih tugas sif",
        })
        self.assertEqual(status, 200, reassigned)
        self.assertEqual(dina.request("GET", path)[0], 404)
        self.assertEqual(dina.request("POST", path, payload)[0], 404)
        self.assertEqual(dina.request("GET", record_path)[0], 404)
        self.assertEqual(dina.request("POST", f"{record_path}/observations", payload)[0], 404)
        self.assertEqual(bima.request("GET", path), (200, {"items": corrected["observations"]}))
        status, appended = bima.request("POST", path, {**payload, "symptoms": "Observasi setelah pengalihan"})
        self.assertEqual(status, 201, appended)
        self.assertEqual({item["nurseId"] for item in appended["items"]}, {dina.user["id"], bima.user["id"]})
        self.assertEqual(hendra.request("GET", path), (200, appended))
