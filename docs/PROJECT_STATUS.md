# Project status

InpaCare implements an educational inpatient-care workflow with synthetic data. The current source includes six domain areas, authenticated roles, and a server-rendered frontend. This document describes implemented scope, not a production deployment guarantee.

## Implemented

- Identity: Argon2 passwords, server-side sessions, logout/revocation, role/coordinator capabilities, and same-origin/CSRF checks.
- Rooms: list/detail/create/edit, equipment/facility items, exact inventory cost, nurse PIC, capacity checks, and version conflicts.
- Placement: inclusive weekly occupancy, admission placement, maintenance/overlap checks, and transactional patient/room capacity locking.
- Nursing: task creation, delegation, progress, notes, reassignment, reason-required cancellation/logical deletion, and atomic history. Former PIC access is removed after reassignment.
- Clinical: assigned-doctor records with versioned edits and nursing observations/vitals. Admissions staff cannot read clinical text.
- Care cycles: scoped recaps, active-placement progression, durable extension/release requests, assigned-doctor decisions, history, and notifications.
- Billing: admissions-only invoices, decimal-string totals, recorded insurance coverage, payment status, and versioned history. No payment or insurance-service transaction is performed.

Demo defaults and unresolved source decisions are recorded in [implementation rules](development/BUILD_CONTRACT.md) and [planning](planning/REQUIREMENTS_AND_DECISIONS.md).

## Validation evidence

The implementation was checked on 2026-10-29 with 4 Rust unit tests, 11 PostgreSQL/API workflows, 4 Playwright workflows, frontend type checking, and production builds. The Linux executable and native host were also checked with isolated API tests, HTTP/SSR role checks, and database persistence across service restart. These are historical results; use the [current CI run](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml) for the published revision.

The retained [synthetic read smoke](validation/performance-smoke.json) covers 60 loopback reads with 5 concurrent workers. It is not a sustained capacity, field Web Vitals, or production-readiness measurement. Private machine and account diagnostics are excluded from public source.

## Follow-up areas

- Complete visual parity with the captured design states and improve responsive/accessibility coverage.
- Monthly calendar, placement rescheduling/cancellation, and associated task/cycle effects.
- Attach or replace placements after creating a pending recap.
- Account administration and recovery, retention/deletion rules, and idempotent create requests.
- Invoice-line editing, full claim workflows, and separately specified external integrations.
- Sustained load testing, backup restoration exercises, and operational deployment controls.

Use [feature requests](https://github.com/Malwildan/inpacare/issues/new/choose) to discuss scope and acceptance criteria before implementing changes to domain rules.
