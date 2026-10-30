# Tasks and clinical records module contract

API prefix `/api/v1`; all routes require a live server session. JSON uses camelCase. Patient and staff IDs are opaque strings. Lists cap at 100 and default to 50. Source anchors: Modul 2 task rules §§2.1 task use cases lines 216–360, SQL model lines 10935–11065, task pseudocode lines 12959–13178; medical record/vitals entities lines 11067–11192 and use cases summarized in [requirements evidence](../planning/sources/requirements-evidence.md).

## Nursing tasks

### `GET /tasks`

Optional query: `search`, `status` (`todo | in_progress | done | cancelled`), `priority` (`low | normal | high`), `roomId`, `limit`. `todo` is the API alias for source status `baru` and is displayed as “Belum Dikerjakan.” A coordinator sees all live ward tasks; a PIC sees only tasks currently assigned to that user's account. Search covers task title, patient name and medical record number. Response:

```json
{"items":[{"id":"…","title":"Pemeriksaan tanda vital","description":"…","notes":"…","patientId":"…","patientName":"…","medicalRecordNo":"RM-…","roomId":"…","roomName":"Melati 02","picId":"…","picName":"Dina Putri","priority":"high","status":"todo","startsAt":"2026-10-29T03:00:00Z","endsAt":"2026-10-29T03:30:00Z","version":1}],"total":1}
```

`total` is the full scoped/filter-matched count; `counts` gives status totals. `limit` (default 50, maximum 100) and `offset` support the board pagination. Rows sort by schedule then opaque ID.

### `POST /tasks`

Coordinator only. Body `{ patientId, placementId, picId, title, description?, notes?, priority, startsAt, endsAt }`. Timestamps must be RFC3339 with timezone; `endsAt` must be at or after `startsAt` (including the source-allowed zero-duration case). Priority is one of `low`, `normal`, `high`. The referenced active placement must match the patient and cover both local-calendar dates; PIC must be an active nurse. The server takes `roomId` from the placement. Creates `todo` version 1 and a history row in one transaction. Returns the created task.

### `GET /tasks/{id}`

Coordinator or currently assigned PIC. Returns the task object above. Former PIC receives 404 after reassignment.

### `PATCH /tasks/{id}`

Coordinator or current PIC. Body `{ expectedVersion, status?, notes?, reason? }`; at least `status` or `notes` is required. Every save compares/locks the version and writes task plus history atomically. PIC can progress `todo -> in_progress -> done`; coordinator also can progress those states and cancel `todo`/`in_progress` with a non-empty `reason`. No status reopens a terminal task. Stale version is 409; invalid progression or missing cancellation reason is 422. Returns the updated task.

### `POST /tasks/{id}/reassign`

Coordinator only. Body `{ expectedVersion, picId, reason }`; PIC must be active and reason non-empty. A completed/cancelled/deleted task cannot be reassigned. Change and history are atomic. The former PIC immediately loses detail and history access. Returns updated task.

### `DELETE /tasks/{id}`

Coordinator only. Body `{ expectedVersion, reason }`. Sets `deleted_at`, increments version, and writes a history record with reason atomically. It never hard-deletes the record. Returns `{ "deleted": true }`.

### `GET /tasks/{id}/history`

Coordinator or current PIC, and only while the task is active. Returns `{items:[{id,actorId,actorName,action,reason,before,after,createdAt}],total}` ordered by time and opaque history ID. Deleted tasks' history stays preserved for coordinators.

## Medical records

Admisi cannot call these endpoints. Doctors can read records for their assigned cycle patients; nurses share the single demo ward context. Only the record's authoring doctor can edit it. Nurses can add observations, never modify doctor-authored text. All command bodies reject unknown properties.

### `GET /medical-records`

Optional `search`, `limit`. Response `{items:[{id,patientId,patientName,medicalRecordNo,doctorName,recordDate,diagnosis,treatment,notes,version,createdAt,observationCount}],total}`. Bounded to 100 newest records in the actor's scope.

### `POST /medical-records`

Assigned doctor only. Body `{patientId,complaint,diagnosis,treatment,notes?,recordDate}`. Required text fields are non-empty; `recordDate` is `YYYY-MM-DD`. Author ID comes from the authenticated session. Returns full record details.

### `GET /medical-records/{id}`

Doctor assigned to the patient or a nurse; returns the medical record with `observations:[{id,nurseId,nurseName,symptoms,nursingNote,observedAt,temperature,bloodPressure,pulse,respiratoryRate,spo2}]`. `bloodPressure` formats the source blood-pressure string from structured systolic/diastolic values as `"120/80"`; null means no paired value was supplied.

### `PATCH /medical-records/{id}`

The record's authoring doctor only. Body `{expectedVersion,complaint,diagnosis,treatment,notes?,recordDate}`. Uses a row lock and optimistic version. Conflict is 409; non-authoring doctor is 403. Returns the updated record with observations.

### `POST /medical-records/{id}/observations`

Nurse only. Body `{symptoms,nursingNote?,observedAt,temperature?,systolic?,diastolic?,pulse?,respiratoryRate?,spo2?}`. `observedAt` is RFC3339 with timezone. Systolic/diastolic must be both supplied or both absent. Numeric measurements cannot be negative; oxygen saturation is 0–100. These checks only validate stored values; the system does not interpret measurements clinically. The observation and optional vital signs are inserted in one transaction. Returns the full updated record.

Clinical form failures return a localized 422; missing/expired sessions 401; prohibited roles 403; out-of-scope record IDs 404. These workflows do not imply real hospital deployment or clinical decision support.
