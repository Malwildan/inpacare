# Rooms and occupancy API contract

Routes are mounted below /api/v1. JSON uses camelCase. IDs are opaque strings. All writes require a server session and validate the stored actor role. Errors use the shared { error: { code, message } } shape.

## GET /rooms

Available to authenticated DOKTER, PERAWAT and ADMISI. Returns at most 100 rooms sorted by name:

    { "items": [{
      "id": "room-id", "name": "Melati 01", "roomClass": "Kelas I",
      "capacity": 2, "status": "available", "picId": "nurse-id", "picName": "Ns. Ratna",
      "dailyRate": "450000.00", "version": 1, "occupants": 1, "totalCost": "425000.00",
      "items": [{ "id": "item-id", "name": "Bed", "category": "patient_equipment", "quantity": 1, "unitPrice": "425000.00" }]
    }]}

totalCost is the sum of quantity * unitPrice. occupants is the count with an active placement covering the facility current date. ADMISI may read equipment and room context but cannot edit it.

## GET /rooms/{id}

Same room object as list; 404 if missing. Authenticated base roles may read.

## POST /rooms

PERAWAT only.

    { "name":"Melati 01", "roomClass":"Kelas I", "capacity":2, "status":"available", "picId":"nurse-id", "dailyRate":"450000.00" }

status defaults to available; dailyRate defaults to "0". Capacity is 1–20. Names and class are required. Status is available or maintenance. Daily rate is nonnegative with at most two decimal places. Duplicate room names return 409. Response is the saved room object.

## PATCH /rooms/{id}

PERAWAT only. Full edit; expectedVersion is required. Request matches POST, with required status, dailyRate, and positive expectedVersion. A stale version returns 409. Capacity cannot be lowered below any already-booked peak occupancy. Response is the saved room object with incremented version.

## POST /rooms/{id}/items

PERAWAT only. Add a room equipment/facility item.

    { "name":"Infusion stand", "category":"medical_equipment", "quantity":1, "unitPrice":"125000.00" }

Name/category required, quantity 1–10,000, price nonnegative with at most two decimal places. Response is the saved room object with updated items and server-computed totalCost.

## GET /occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD&roomId=...

Authenticated base roles may read. Doctors receive only patients attached to their cycles; nurses and Admisi use the demo ward scope. Both inclusive dates are required and to >= from. Maximum span is 31 days. Optional room filter.

    { "items":[{
      "id":"placement-id","patientId":"patient-id","patientName":"Nadia Sari","medicalRecordNo":"RM-24042",
      "roomId":"room-id","roomName":"Melati 01","roomClass":"Kelas I",
      "startsOn":"2026-10-20","endsOn":"2026-10-25","status":"active","version":1
    }], "from":"2026-10-19", "to":"2026-10-25" }

Only active placements intersecting the inclusive range are returned, sorted by room/start/patient. The range and result limit bound the query.

## POST /placements

PERAWAT only. Creates a patient/room placement; no rescheduling or cancellation operation is included in this P0 contract.

    { "patientId":"patient-id", "roomId":"room-id", "startsOn":"2026-10-20", "endsOn":"2026-10-25" }

Both FKs must exist; inclusive end must not precede start; maximum placement span is 366 inclusive dates. A maintenance room returns 409. Only one active overlapping placement may exist per patient. Room capacity is enforced as peak concurrent occupancy over every date in the candidate interval (not the total count of rows that happen to intersect a longer interval). To serialize concurrent admissions, begin one transaction, lock patient first and room second, check conflicts/capacity, insert and commit. The demo serializes conflicting writers on the relevant parent rows. On success returns { id, patientId, roomId, startsOn, endsOn, status:"active", version:1 }. Conflict/capacity errors return 409; invalid dates return 422.

## Deliberate demo limits

Room deletion, placement cancellation/rescheduling, month calendar navigation, multiple independent beds/slots, historical deletion policy and links from a placement into a fully modelled cycle are outside this route set. Existing native Final screenshots are manajemen-ruangan.png and kalender-ruangan.png. The weekly UI maps to an inclusive seven-date window. These API statements describe implemented demo behavior, not additional source requirements or hospital deployment readiness.
