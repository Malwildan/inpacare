# InpaCare — one-day implementation plan

Date: 2026-10-29. Status: source-grounded one-day plan for one developer assisted by AI agents. **Timebox: eight focused working hours**, assumed within the user's requested one day. No application code or deployment is created by this planning task.

## Outcome and scope

Day-one target: a **runnable, connected demo across the six modules**, using **SvelteKit + TypeScript**, **Rust + Axum/Tokio**, and **PostgreSQL**, with genuine sessions, persistence and server permissions. This is an aggressive timeboxed target with the scope and checkpoints below. Full parity with every source operation and all 107 Final frames remains the product backlog; it is not promised in eight hours.

The six functional areas are:

1. Inpatient-cycle dashboard, recaps, extend/release requests and doctor decisions.
2. Room management and the room's equipment/facility items and computed cost.
3. Occupancy calendar, patient placement and cancellation.
4. Nursing-task creation, delegation, scoped board/detail, updates and history.
5. Medical records, nursing observations and vital measurements.
6. Admission-role billing, invoice details, BPJS/payment/claim-verification information and history.

Authentication, access policy, shared patient/staff context, notifications, testing and deployment support these areas. Equipment remains connected to its source domain; the plan does not assume an unrelated inventory product. External hospital, payment or BPJS integration is not established by the supplied sources.

## Day-one scope and explicit cut lines

P0 is the day's implementation target. P1 is follow-up scope unless every P0 check passes early. This is a proposed prioritization for the deadline, not a change to the canonical requirements.

| Area | P0 — working day-one baseline | P1 — follow-up depth |
| --- | --- | --- |
| Login and shell | Real cookie session; seeded synthetic staff; doctor/nurse/coordinator/Admisi views; authorized navigation and direct API checks; logout. | Account administration, recovery, email aliases and optional remember-me behavior after rules are resolved. |
| Rooms | List/detail and basic create/edit; room items and server-computed item cost. | Complex deletion/cascade behavior and every confirmation/success visual variant. |
| Calendar/placement | One usable weekly view; place a seeded patient; reject a conflicting interval; show committed occupancy. | Month view, rescheduling, cancellation integration and every boundary/turnover variant after the linked-state rules are agreed. |
| Nursing tasks | Create/delegate, scoped board/detail, authorized status update, reassignment, cancellation/logical deletion with required reasons, history and stale-version rejection. | Exhaustive filters, fine visual variants and the complete 21-frame parity set. |
| Medical records | Doctor list/detail/create/edit; nurse condition/vital observation; permitted read-only downstream context. | Deletion/retention handling and comprehensive clinical-form variants. |
| Inpatient cycle | List/create recap; simple resolved transitions; extend/release request and doctor approve/reject with persisted decision/history/notification. | Recap deletion, rescheduling/occupancy edge cases and all role-specific visual states. |
| Billing | List/create/detail, service/item totals computed server-side, BPJS snapshot and an authorized payment-status edit with history. | Full invoice-line editing/deletion, deeper claim workflows, actual payment/insurance integrations. |
| Cross-module UI | Shared Final shell and eight route families; patient-context links; usable forms and errors. | Pixel parity across all 107 frames, exhaustive responsive QA and presentation animations. |

Always retain authentication, authorization, source-required validation, atomic writes and truthful error reporting in the implemented P0 flows. If a behavior-changing rule is not resolved in the first decision pass, mark its dependent action unimplemented; do not make a sample/prototype transition stand in for business logic.

## Source of truth

| Source | Exact target | Use in this plan |
| --- | --- | --- |
| Requirements | [Kelompok 2_RSI — Modul 2](https://docs.google.com/document/d/1MDNjrTaaqyml-3hnH4L3X_hsodEB5lYt0HRwzQCMRjs/edit?tab=t.35pzydmpv5ma#heading=h.30j0zll) | Functional behavior, actors, rules, class/data model and pseudocode; sections 2.1–2.7 across all five author groups. |
| UI | [RSI — KELOMPOK 2 (Copy) — Final](https://www.figma.com/design/Vo3C9LOAj2uQ1sK9QtZsX8/RSI---KELOMPOK-2--Copy-?node-id=2002-1259) | Exact file `Vo3C9LOAj2uQ1sK9QtZsX8`, page `2002:1259`; target layouts, menus, controls, visual states and navigation. |
| User constraints | This conversation | Performance priority; the agreed working stack; one developer with AI agents. |

The fresh document capture has 15,041 lines, includes the 17 explicitly modeled entities, and is retained with its hash in [requirements evidence](sources/requirements-evidence.md). The live Final page has **107 screen frames**, mapped to eight logical route families in [the screen implementation map](SCREEN_IMPLEMENTATION_MAP.json). [Figma evidence](sources/figma-final-evidence.md) records that the historical prototype entry/reachability was not reproduced. Source conflicts are documented in [requirements and decisions](REQUIREMENTS_AND_DECISIONS.md), rather than silently converted into implementation rules.

Figma sample data, login choices and transitions describe a prototype. The application must implement server-issued identity, authorization, persistence and cross-module effects. A modal, role variant or validation state usually becomes a state of a logical page; a separate Figma frame does not automatically require another route or database table.

## Planning constraints

- You are the developer and integrator; agents take bounded assignments with explicit contracts and file ownership.
- The user requests one implementation day. Eight focused hours is the scheduling assumption; start/end clock times are relative. A host and budget have not been specified.
- The one-day deliverable uses synthetic data and is a demo/review build. Actual hospital operating requirements and a real-data release have not been established.
- Missing business rules do not justify inventing clinical/status/permission behavior. Unaffected foundation work can proceed while dependent module rules are resolved.

## The nine workstreams

| Workstream | Decisions/deliverables | Where detailed |
| --- | --- | --- |
| 1. Scope and business rules | Full module/use-case mapping, actor responsibilities, canonical status vocabulary, state transitions and unresolved behavior. | [Requirements and decision register](REQUIREMENTS_AND_DECISIONS.md). |
| 2. Architecture | One-origin frontend/API boundary, initial SSR, modular Rust application, transaction ownership, repository layout. | [Technical design](TECHNICAL_DESIGN.md). |
| 3. Database | 17 source entities and relationships, PostgreSQL type adaptation, migrations, histories, constraints and measured query indexes. | Technical design, domain/database section. |
| 4. Authentication and permissions | Real sessions, base roles/coordinator capability, per-record and per-field scope; account/reference-data provisioning. | Technical design, identity section; decisions D-01/D-09/D-10. |
| 5. API and live updates | OpenAPI and generated TypeScript types, filtered reads, commands, errors, conflict versions, notifications and any accepted SSE behavior. | Technical design, API section. |
| 6. Backend | Axum handlers, domain operations, SQLx queries, atomic writes, audit, idempotency and structured errors. | Technical design; milestone acceptance scenarios. |
| 7. Frontend | Logical routes, shared Final shell/tokens/components, role-specific UI, forms, error/empty/conflict states and responsive adaptations. | Technical design, frontend section; verified Final inventory. |
| 8. Performance and testing | Real PostgreSQL integration tests, cross-session concurrency, critical browser workflows, representative synthetic workload and measurable budgets. | [Delivery and validation](DELIVERY_AND_VALIDATION.md). |
| 9. Deployment and operations | Reproducible environments, CI, private database, health/logging, migration, backup/restore and rollback runbooks. | Delivery and validation, deployment section. |

## Eight-hour implementation schedule

Reserve the last four hours for integration, fixes, verification and packaging. Three agents implement bounded module slices during the parallel build window; you own shared contracts, schema, authentication, shell integration and accepting the combined result. The M0–M7 references in the supporting documents describe product milestones; the P0 subset is the day-one target.

| Elapsed time | Work | Exit/checkpoint |
| --- | --- | --- |
| **00:00–00:30** | Freeze P0 scope, role/field rules, critical source decisions, shared entity names and request/response shapes. | Everyone uses the same schema/API/status mapping; dependent unresolved actions are explicitly out of the day's cut. |
| **00:30–01:30** | Scaffold web/API, apply baseline migrations and synthetic seeds, implement session/login, shared shell and a generated typed client. Agents prepare their own modules/components against the frozen contracts. | **Checkpoint A:** the browser signs in and reads actual PostgreSQL-backed data through Rust. |
| **01:30–04:00** | Three parallel full-stack module tracks implement the P0 subsets below. Integrate small batches as they arrive. | **Checkpoint B:** stop new scope at hour 4; each track hands back its runnable flow, contract changes, checks and missing items. |
| **04:00–05:30** | Integrate cross-module references and permissions; exercise the task, cycle and billing paths with actual sessions. | **Checkpoint C:** persisted changes survive reload; denied/stale/invalid requests have correct outcomes; core flows have real API evidence. |
| **05:30–06:30** | Reserved defect buffer. Fix the most consequential failures; cut P1 and reduce incomplete secondary flows transparently. | No new libraries, features or infrastructure work. A failing critical flow gets attention before visual extras. |
| **06:30–07:30** | Release build; representative Final comparisons; basic narrow-layout check; short workload/query/bundle smoke measurements. | Capture actual results and remaining limitations. Do not label this full 107-frame parity or a proven capacity result. |
| **07:30–08:00** | Package a reproducible local start, seeds, environment example, demo script and completed/partial/deferred ledger. Deploy only if a ready host/config already exists. | **Checkpoint D:** another clean local start works and the demo can be repeated from documented steps. |

If Checkpoint A fails by 01:30, move the day onto the fallback: make authentication, patient/room context and the complete nursing-task slice reliable first; secondary modules may finish as explicitly incomplete read/create subsets. If Checkpoint B slips, end parallel feature work and integrate the proven subset. Report which P0 targets were missed; do not present a list-only or mocked module as functionally complete.

The first integration proof should show: a coordinator signs in, selects a valid patient/room/active PIC, creates a task, the PIC updates it, and both see committed state/history within their allowed scope. A concurrent stale write must fail safely. Reassignment must change the old/new PIC's effective access. This is the core correctness path to preserve if the day's scope must shrink.

## Performance approach

Start with release builds, bounded data queries and a small initial UI payload. Retain SSR for initial content; keep domain logic and authorization in Rust. Locate the frontend/API/database close together and measure the users' actual end-to-end latency separately.

Day one includes useful SQL predicates/indexes, bounded lists/date ranges, no per-row request waterfalls, deferred heavy UI code and a release-build smoke measurement. Suggested development seeds are 10–20 patients, five rooms, around 200 tasks and enough records/invoices for each role and failure scenario.

Proposed follow-up budgets are p95 core reads ≤ 200 ms, p95 routine writes ≤ 300 ms, unexpected failures < 1%, and UX goals of LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1. They are engineering proposals, not source NFRs or achieved results. The larger dataset, sustained 50-user/arrival-rate tests and full recovery rehearsal in [delivery and validation](DELIVERY_AND_VALIDATION.md#performance-plan) are follow-up work, rather than a condition silently crammed into this day.

Optimize query plans, missing indexes/N+1 requests, oversized responses and unnecessary browser work before profiling lower-level CPU costs. Add caching, a broker or extra services when a measured need and coherent invalidation/recovery behavior justify them.

## Decisions that most affect the build

The full register has D-01–D-13. Spend the opening 30 minutes selecting explicit demo decisions for the implemented P0 flows; prioritize these:

1. **Who can do what?** Map coordinator/PIC and Admin/Admisi to stored identity; define patient/field scopes and exact task mutation/delete rights.
2. **What is the approval state machine?** Reconcile doctor approval with pseudocode that directly changes extend/release status.
3. **Which record owns occupancy?** Reconcile placement intervals, recap room references, cancellation, invoices and date boundaries.
4. **What are the allowed values?** Agree task/default aliases, transitions, priorities, required fields and cancellation rules.
5. **What does deletion mean?** Decide logical/physical removal, historical references, cascade restrictions and retention.
6. **What does billing record?** Confirm charge units/formula, BPJS source/snapshot, status changes and whether actual payment/claim transactions are required.

Routine technical choices such as internal endpoint names are proposals in the technical design. Behavior-changing source ambiguities are kept separate so an agent does not accidentally settle them while implementing a form or migration.

## Solo developer + AI-agent execution

Use three full-stack tracks after the shared foundation is stable:

| Owner | Module ownership | Owned implementation paths |
| --- | --- | --- |
| You — integrator | Shared schema/migrations, session/access policy, shared shell/components, OpenAPI/client generation, integration and acceptance. | Shared/auth/reference/contract/ops files; review all cross-track changes. |
| Agent A | Rooms and occupancy/calendar P0. | `apps/api/src/rooms`, `placements`; corresponding room/calendar routes and local components. |
| Agent B | Nursing tasks and medical observations/records P0. | `apps/api/src/tasks`, `medical_records`; corresponding task/record routes and local components. |
| Agent C | Inpatient cycle/doctor decisions and billing P0. | `apps/api/src/cycle`, `billing`, `notifications`; corresponding cycle/invoice routes and local components. |

All tracks use the same read-only shared contracts and design primitives. Agents request shared model/permission/contract changes through you instead of editing those files simultaneously. Their first priority is a small complete P0 flow, followed by the rest of their assigned subset. Agent briefs reference source sections/frames, owned files, expected errors and acceptance checks. If you cannot review incoming batches, reduce active assignments and integrate first.

You accept the combined diff and runnable workflow evidence. A useful handback contains what changed, actual validation, unresolved risks and any deviation from the sources. Agent output or prototype screenshots do not replace application checks. The [agent workflow](DELIVERY_AND_VALIDATION.md#working-with-ai-agents) provides a reusable brief structure.

## Day-end acceptance and handoff

1. A clean local start applies migrations/seeds and serves the release build through the documented setup.
2. Each claimed P0 flow uses real session identity and PostgreSQL data; changes survive reload and prohibited direct API requests fail.
3. The task workflow demonstrates history, required reasons, old/new PIC behavior and rejection of a stale version. Task mutation plus history is atomic.
4. For implemented cycle/medical/billing flows, roles and field scopes are enforced; doctor decisions and invoice totals come from the server, not prototype state changes.
5. Representative screens follow Final's shared shell and module layout; missing visual states are listed instead of claimed as verified.
6. The handoff includes actual checks/measurements, remaining source decisions, and a feature-by-feature completed/partial/deferred list. P0 is a target, not a predetermined passing report.

This deliverable contains planning files and read-only source evidence. Implementation begins with the opening decision/contract pass when the user starts the build task.
