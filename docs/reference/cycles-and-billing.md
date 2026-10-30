# Dashboard, cycle, notification, and billing API

Base path `/api/v1`. All calls require the session cookie; write calls also require the readable session CSRF token and same-origin `Origin` header. JSON request keys are camelCase. IDs are opaque strings. Timestamps include an offset. Amounts are decimal strings. These shapes are implemented by `apps/api/src/cycle.rs`, `billing.rs`, and `notifications.rs`.

## Cycles and dashboard

### `GET /cycles`

Doctors receive cycles assigned to them; nurses receive cycles assigned to them. Admisi receives `403 FORBIDDEN`. Returns at most 100 newest items and a total.

```json
{"items":[{"id":"cyc-1","patientId":"pat-1","patientName":"Siti Rahmawati","medicalRecordNo":"RM-004218","placementId":"plc-1","room":"Melati 01","doctorName":"dr. Hendra Wijaya","nurseName":"Dina Putri","status":"in_care","version":2,"createdAt":"2026-10-29T10:00:00Z","requests":[]}],"total":1}
```

### `POST /cycles` (PERAWAT)

Starts a pending recap; a placement can be omitted for a newly admitted patient. The doctor must be an active DOKTER and an optional placement must be active for the selected patient. The active-patient uniqueness constraint blocks duplicate cycles.

```json
{"patientId":"pat-1","doctorId":"usr-doctor-1","placementId":"plc-1"}
```

Returns `201` with `id`, `patientId`, `placementId`, `doctorId`, `nurseId`, `status`, and `version`.

### `GET /cycles/{id}`

Returns the same cycle record with assigned user IDs and its request history. Only the assigned nurse or doctor can read it.

### `PATCH /cycles/{id}` (assigned PERAWAT)

Only `pending -> assigned -> in_care` is supported. A linked active placement is required before advancing; a pending recap without one returns 409 without changing its version. Linking a placement after recap creation remains follow-up scope. Requires the current version:

```json
{"status":"assigned","expectedVersion":1}
```

Returns `{"ok":true,"status":"assigned","version":2}`. An invalid transition, lost assignment, or stale version returns a conflict and makes no change.

### `POST /cycles/{id}/requests` (assigned PERAWAT)

Requires an in-care cycle, reason, and no existing pending request. Only `extend` and `release` are available.

```json
{"kind":"extend","requestedEnd":"2026-11-05","reason":"Dokter meminta observasi tambahan."}
```

For release, send `{"kind":"release","requestedEnd":null,"reason":"Kondisi sudah stabil."}`. Returns `201` with request ID, cycle ID, kind, date, reason, and `status:"pending"`. A partial request is rejected; only one pending request per cycle is allowed.

### `POST /cycles/{id}/requests/{requestId}/decision` (assigned DOKTER)

The assigned doctor must provide a decision note and current cycle version:

```json
{"decision":"approve","note":"Jadwal observasi dilanjutkan.","expectedVersion":3}
```

`decision` is `approve` or `reject`. Approval is one transaction with the request state, linked placement/cycle, and persistent nurse notification. Extension must lengthen the active placement and pass a capacity check over every day. Release shortens an already-started placement to facility local today; it is refused if unfinished future tasks remain. Rejection changes no placement or cycle status but records the decision. The response is `{"ok":true,"status":"approved","version":4}`. Stale decisions and unsafe linked-state changes conflict without partial writes.

## Notifications

### `GET /notifications`

Returns up to 50 records belonging to the current user, ordered newest first:

```json
{"items":[{"id":"ntf-1","cycleId":"cyc-1","message":"Permintaan extend disetujui.","readAt":null,"createdAt":"2026-10-29T10:15:00Z"}],"total":1}
```

### `POST /notifications/{id}/read`

Marks only the current user's record as read, idempotently. Unknown or another user's notification returns 404.

## Invoices

Only ADMISI can list, create, read detail, or change invoice payment status. The API returns patient identity and billing data without medical-record content.

### `GET /invoices?search=&status=&limit=`

Supports bounded search over patient name, MR number or invoice ID; optional status `unpaid|paid`; the page limit defaults to 50 and caps at 100. The returned `total` is the number of rows in this page. Each item contains ID, patient identity, placement, BPJS snapshot, exact `totalAmount`, `coveredAmount`, `payableAmount`, payment status, version, timestamp, and line count.

### `POST /invoices`

Requires 1–30 line items. Amounts are non-negative decimal strings with up to two fractional digits. Each line subtotal and invoice totals are calculated with Rust Decimal on the server. BPJS coverage is an explicit snapshot; it cannot exceed gross or be used when the selected patient has no BPJS flag. No browser-calculated amount is trusted.

```json
{"patientId":"pat-1","placementId":"plc-1","coveredAmount":"500000.00","lines":[{"description":"Kamar kelas 2 (malam)","quantity":2,"unitPrice":"650000.00"}]}
```

Returns `201` with invoice ID, patient identity, BPJS snapshot, exact totals, initial `status:"unpaid"`, `version:1`, and stored line items. The invoice, all line snapshots, and creation history commit atomically.

### `GET /invoices/{id}`

Returns billing-only patient context, line details with subtotal, totals, and audit history. It omits clinical notes, diagnoses, observations and vitals.

### `PATCH /invoices/{id}`

Changes only payment status; requires a nonempty reason (up to 500 characters) and optimistic version:

```json
{"status":"paid","reason":"Bukti pembayaran dicocokkan.","expectedVersion":1}
```

Returns the updated status and version. The row lock, version check, edit and history entry commit atomically. Repeated status and stale-version writes are rejected.

## Shared error contract

```json
{"error":{"code":"CONFLICT","message":"Tagihan telah berubah. Muat ulang lalu coba lagi."}}
```

Malformed or unsupported values are `422 VALIDATION_FAILED`; missing or expired sessions are `401`; prohibited role/scope is `403`; unavailable scoped records are `404`; stale state and concurrency constraints are `409`. Raw SQL errors and medical data are not returned.

## Known source adaptation

The source provides inpatient status labels and doctor approval but leaves the exact storage/state mapping unresolved. The implementation uses persisted pending requests and an explicit decision to avoid changing committed state before doctor approval. Financial coverage and payment values remain staff-entered demo fields; no external payer, BPJS or payment verification is claimed. Capacity and release safeguards are engineering choices needed to keep demo data coherent.
