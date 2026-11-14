# InpaCare implementation contract

Implementation date: 2026-10-29. The one-day plan and captured Modul 2 / Figma Final evidence remain the source. This file freezes **explicit demo decisions**, not new hospital policy. Synthetic data only; no external hospital/BPJS/payment service. User authorized non-Luna agents.

## Historical implementation ownership

This section records the original one-day agent assignments, not current contributor ownership. New contributions follow [CONTRIBUTING.md](../../CONTRIBUTING.md).

Integrator owns migrations, seed, Cargo/package manifests, auth, shared UI/styles, contracts and startup. Agent A owns `apps/api/src/rooms.rs`, `placements.rs`, and web `(app)/rooms`, `(app)/calendar`. Agent B owns `tasks.rs`, `medical_records.rs`, and `(app)/tasks`, `(app)/medical-records`. Agent C owns `cycle.rs`, `billing.rs`, `notifications.rs`, and `(app)/dashboard`, `(app)/invoices`. Runtime agent owns project-local tools and scripts specified in its brief. Never overwrite another owner's files. No nested delegation.

## Explicit demo rules

- Stored roles DOKTER / PERAWAT / ADMISI, protected `coordinator` boolean on PERAWAT. PIC is the assigned user. UI never chooses authority at login. Single synthetic ward: nurses share patient/room context; doctors see their assigned cycle patients and their own authored records; Admisi sees identity/placement/billing and **no clinical text**.
- Coordinator creates/reassigns/cancels/logically deletes tasks. PIC may move todo -> in_progress -> done; coordinator may also do so. Cancel/delete/reassign require a reason. Terminal tasks cannot restart. Old PIC loses task detail/history access after reassignment unless coordinator. All task writes require expectedVersion, row locking and atomic history. A task must fit an active placement; choose the room from that placement. No nurse can change a doctor's record.
- Rooms are capacity-counted units; active placements use inclusive dates (ends_on >= starts_on). Serialize placement commands by locking patient then room. Concurrent overlapping placements cannot exceed room capacity or double-place a patient. P0 create only; cancellation/rescheduling deferred because linked task/cycle policy is unresolved.
- Cycle statuses pending -> assigned -> in_care. Nurse creates a request for extend/release; assigned doctor approves/rejects with reason. Request and decision durable. Extension changes placement end only after capacity check; release shortens placement to facility current date only if no future active task would be orphaned. All linked writes atomic. Pending requests do not change committed cycle state. No physical deletion.
- Clinical content is user-entered text/measurements, with plausible numeric-format validation only, no automated clinical interpretations.
- Invoices snapshot patient BPJS boolean, explicit approved coverage amount and exact decimal line prices. Server computes quantity * unit price and payable = gross - coverage; coverage cannot exceed gross or apply to uninsured patients. Status unpaid/paid. An Admisi status edit has reason, optimistic version and history. No real payment or insurance verification is implied.
- Cookie: opaque random server session, SHA256 token stored, HttpOnly / SameSite=Lax / Path=/, persistent 30-day expiry from login (matching database expiry and CSRF cookie lifetime), Secure on HTTPS. Sessions survive browser/API restarts against the same database; logout revokes them immediately. Existing sessions keep their original expiry until the next login. JSON mutations require same-origin Origin check and a session CSRF token. Argon2 password hashing. Public demo credentials are synthetic and disabled unless seed explicitly requested. No new registration/recovery flow.
- Opaque IDs, camelCase JSON, ISO dates and timezone-bearing instants, money decimal strings. Indonesian display labels. Facility timezone Asia/Jakarta (source project location; explicit demo assumption).

## Shared Rust API

`AppState { pub pool: PgPool }`, cloned. `AuthUser` extractor provides `id`, `username`, `name`, `role`, `coordinator`, `csrf_token`; methods `require_roles(&[&str]) -> Result<(), AppError>`, `require_coordinator()`, `is_nurse()`, `is_doctor()`, `is_admission()`.

`AppError::validation(message)`, `forbidden()`, `not_found()`, `conflict(message)`; `From<sqlx::Error>`; errors `{ error: { code, message } }`, appropriate HTTP codes. `AppResult<T> = Result<T, AppError>`. Each module exports `pub fn router() -> Router<AppState>` using paths relative to `/api/v1`. Parent merges routers. `crate::db::json_rows(query)` is NOT provided: use SQLx queries directly. Prefer `sqlx::query_scalar::<_, serde_json::Value>("SELECT jsonb_build_object(...) ...")` for JSON aggregate rows; numeric money cast text and dates serialize ISO. Lists `{items:[...], total:N}`, bounded limit max100 default50. Avoid per-row queries.

Schema canonical in `apps/api/migrations/0001_initial.sql`. Shared helpers: `crate::access::can_read_patient(&PgPool, &AuthUser, &str) -> AppResult<()>`; `crate::access::require_clinical(&AuthUser) -> AppResult<()>`; `crate::db::id() -> String`; `crate::db::today() -> NaiveDate` (UTC+7); `crate::db::nonempty(value:&str,label:&str,max:usize) -> AppResult<()>`. Use `AuthUser` plus `State<AppState>` extractors, `Path<String>`, `Query<...>`, `Json<...>`. All request structs deny_unknown_fields to prevent ignored privilege/field edits. Never add APIs to fake unavailable flows.

## Shared Svelte UI

The current frontend uses Svelte 5, SvelteKit SSR with adapter-node, and feature-first architecture. Protected route loads supply user/reference data; app composition injects operations into feature presentation. After successful mutations, refresh authoritative server state. Preserve role restrictions, required reasons, optimistic versions, decimal-string money and date/time serialization.

General controls use editable shadcn-svelte registry source under `$lib/shared/ui/<component>/`. Use the existing Button, Input, Native Select, Textarea, Card, Table, Badge and overlay components; customize tokens or compose feature layouts instead of rebuilding primitives. Buttons that submit forms explicitly set `type="submit"`. Keep semantic Indonesian labels, keyboard operation, pending states, failure drafts and focus return.

See [Frontend architecture](FRONTEND_ARCHITECTURE.md) for dependency rules and [UI components](UI_COMPONENTS.md) for component ownership, customization and upstream updates. The approved migration refreshes layouts while retaining InpaCare's blue identity and DM Sans. The Rust API sections and original ownership above are historical implementation context.

## Endpoint/DTO ownership

- A: GET/POST `/rooms`, GET/PATCH `/rooms/{id}`, POST `/rooms/{id}/items` (item mutation optional P1), GET `/occupancy?from=&to=`, POST `/placements`.
- B: GET/POST `/tasks`, GET/PATCH/DELETE `/tasks/{id}`, GET `/tasks/{id}/history`, POST `/tasks/{id}/reassign`; GET/POST `/medical-records`, GET/PATCH `/medical-records/{id}`, POST `/medical-records/{id}/observations`.
- C: GET/POST `/cycles`, GET `/cycles/{id}`, PATCH `/cycles/{id}` for nurse transitions, POST `/cycles/{id}/requests`, POST `/cycles/{id}/requests/{request_id}/decision`; GET/POST `/invoices`, GET/PATCH `/invoices/{id}`; GET `/notifications`, POST `/notifications/{id}/read`.
- Parent: `/session`, `/reference`, `/patients`, `/patients/{id}/context`, `/health`, OpenAPI documentation. Agents must write a short `docs/module-<track>-contract.md` with exact payload/response and validation; parent incorporates OpenAPI from these. Do not claim generated types until generation actually runs.

## Validation

Each track writes meaningful Rust unit tests for pure validation/transitions/calculation and reports actual checks. Parent owns real DB/API integration checks and browser E2E. Avoid Cargo/npm manifest edits and installs. Wait for parent runtime availability for compilation; code against migrations now. Do not commit/stage other existing files.
