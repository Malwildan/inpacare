# InpaCare — one-day delivery and follow-up validation

Date: 2026-10-29. Planning artifact; no application has been implemented or benchmarked by this planning task. **The eight-hour schedule and P0/P1 cutoff in [the one-day plan](IMPLEMENTATION_PLAN.md) govern day one.** The complete product milestones, sustained workload tests and recovery exercises below retain follow-up scope; they are not all promised within that day.

## Delivery constraints

- One developer, assisted by AI agents, as confirmed by the user.
- The user requests one implementation day. Assume eight focused working hours. Host and budget remain open; prepare a reproducible local demo as the default day-end delivery.
- Coursework versus deployment with real hospital data has not been confirmed. The first runnable environment uses synthetic data. Requirements for an actual hospital release remain an explicit release decision.
- Preserve the agreed SvelteKit/TypeScript frontend, Rust/Axum backend, and PostgreSQL direction. The canonical product sources are linked in [the implementation plan](IMPLEMENTATION_PLAN.md).
- An increment is complete only when its UI, real API, persistence, authorization, and relevant failure handling work together. An agent's implementation report is an input to verification.

## Milestones and dependencies

The scope below is the full-product dependency map, not eight consecutive day-one commitments or a priority order stated in the source document. The main plan selects its reduced P0 subset. All six product modules remain in the backlog. Shared patient, staff, and admission references can initially be populated by synthetic seeds; this does not create an additional patient-management product module.

| Milestone | Deliverable and outcome | Depends on | Exit evidence |
| --- | --- | --- | --- |
| M0 — source and contract baseline | Requirement/screen mapping, unresolved-rule register, shared data model, permission policy, initial API contract. | Canonical sources. | Every source module has a planned owner, route group, persistence boundary, and acceptance scenarios; behavior-changing gaps are identified. |
| M1 — runnable foundation | Repository structure, PostgreSQL migrations/seeds, Rust API, SvelteKit SSR, real login/session, role-aware shell, error/request-ID conventions, CI smoke checks. | M0's access and identity decisions. | One command starts a reproducible local environment; the UI loads data from the API; unauthorized direct requests fail; logout revokes the session. |
| M2 — room and placement foundation | Room workflows, shared patient/admission references, occupancy operations, rescheduling and calendar queries. | M1; agreed occupancy/capacity rules. | A supported placement is persisted and visible in room/calendar views; conflicting operations and schedule changes are tested against the database; invalid times and unavailable capacity are rejected. |
| M3 — nursing-task vertical slice | Coordinator create/delegate, scoped board/detail, PIC update, reassignment, cancellation/deletion where authorized, history and stale-version handling. | M2's active placement data; M0 task decisions. | Two independent sessions demonstrate coordinator/PIC boundaries, a successful update, an old-version conflict, old/new PIC reassignment visibility, and rollback on failed save. |
| M4 — medical records and equipment | Source-defined record/equipment workflows, scoped patient history, validation, and admission read-only context where specified. | M1–M2; agreed record lifecycle and field permissions. | Record/equipment changes persist with the authorized actor; prohibited changes and invalid references fail; history and cross-module patient links work. |
| M5 — complete inpatient cycle | Cycle dashboard, source-defined transitions, extend/release requests, doctor decisions, and resulting placement consequences. | M2 and the relevant M4 medical context. | Request → decision → resulting cycle state is consistent across dashboard, patient context, rooms, and calendar; repeated/stale decisions cannot corrupt state. |
| M6 — billing | Admission-role invoice workflows, source-defined items/totals/statuses, supporting patient/record/equipment reads. | M2 patient/admission references, M4 equipment/record context, and agreed billing rules. | Real persisted invoice CRUD follows permissions; server totals are reproducible; validation and deletion semantics match the resolved source rules. |
| M7 — integrated release candidate | Navigation across all modules, remaining source states, justified live-update behavior, visual/responsive QA, workload tests, deployment and restore rehearsal. | M3–M6. | End-to-end scenarios pass on a release build; performance report has its workload and environment attached; staging migration/backup/restore and application rollback are demonstrated. |

For the one-day timebox, use the three bounded full-stack tracks in the main plan after the foundation is stable. Keep shared schema/contracts/authentication under one writer. Reduce parallel assignments if review/integration falls behind; the reserved defect hour and final verification window take priority over starting additional scope.

## Working with AI agents

The developer retains ownership of source interpretation, shared schema/API changes, integration, and accepting evidence. Assign agents bounded implementation tasks within a milestone.

Each brief should include:

1. Canonical requirement IDs/sections and exact Figma file/page/frame links.
2. The outcome and the files the agent owns; shared files it must coordinate before changing.
3. The agreed request/response and permission contract, including error/conflict behavior.
4. Acceptance scenarios and the checks expected for that change.
5. A handback containing the diff, checks actually run, unresolved issues, and source deviations.

For day one, Agent A owns rooms/calendar, Agent B tasks/medical records, and Agent C cycle/billing/notifications, with each owning its module's frontend and backend files. You coordinate the shared foundation and integrate small batches. Give schema migrations, shared authentication, common DTOs, and the app shell one writer at a time. Review the combined workflow and connected code before reporting the corresponding P0 behavior complete.

Do not run several agents against the same Figma page, authenticated browser tab, or overlapping files concurrently. Keep source inspection read-only unless a separate edit is requested.

## Validation strategy

Use the cheapest meaningful check for each change; run the whole release suite at milestone/release boundaries rather than after every copy or style edit.

| Layer | Check | What it must establish |
| --- | --- | --- |
| Rust domain logic | Focused unit tests where a business rule is independent of storage. | Resolved transitions, allowed changes, reason requirements, and exact decimal calculations. |
| PostgreSQL + Rust API | Integration tests against an actual temporary PostgreSQL database with production migrations. | Constraints, transactions, filtering, access scope, version checks, and rollback behavior. |
| Concurrency | Two real transactions/sessions attempt the same protected operation. | No lost update, double allocation, duplicate action, inconsistent invoice total, or unrecorded successful change. |
| API contract | Validate requests/responses and the generated TypeScript client against the agreed OpenAPI schema. | Frontend and backend agree on IDs, dates, money, nullability, errors, pagination, and conflict versions. |
| Frontend | Type checking and focused tests for consequential interaction logic. | Forms preserve input after errors, stale edits are recoverable, permission changes invalidate stale UI state. |
| Full workflow | Playwright with real backend and seeded synthetic data. | Login, supported CRUD, doctor decisions, role boundaries, audit history, and cross-module persistence after reload. |
| Visual/responsive | Compare representative application states to the exact Final frames. | Layout, typography, labels, controls, modal states and access-specific navigation match; smaller layouts remain usable. |
| Runtime | Production-build console/network checks and failure scenarios. | Useful errors on expired sessions, failed requests, empty results, timeouts, and unavailable resources. |

Priority end-to-end scenarios:

- Successful and rejected login for each source role; logout followed by a denied authenticated request.
- Direct API access to a record/action outside the user's permitted scope, even if a URL/ID is known.
- Placement/capacity contention, room/calendar consistency, and boundary dates after rules are resolved.
- Coordinator creates a task; PIC sees and updates it; audit history matches the committed version.
- Two users edit the same task; the stale write fails without discarding the first saved update.
- Reassignment removes the old PIC's access as specified and gives the new PIC the correct scoped view; fresh authorization is enforced server-side.
- Cancellation and logical deletion preserve the specified history and reject missing reasons.
- Medical record/equipment changes reflect the allowed actor and remain available to permitted downstream reads.
- Extend/release requests and approval/rejection paths have coherent resulting cycle/occupancy states.
- Billing create/edit/delete/error flows reproduce approved totals and source-defined status behavior.

## Performance plan

Day one uses a small deterministic fixture, a release build, query/bundle checks and a short smoke workload within the 06:30–07:30 verification window. Use 10–20 synthetic patients, five rooms, about 200 tasks and sufficient records/invoices for role and error scenarios. Capture the environment and actual measurements; this small run does not establish production capacity. The larger fixture, sustained scenario and budgets below are the follow-up performance plan.

The numerical budgets below are engineering proposals for the user's performance goal. They are not measurements, capacity promises, or NFRs extracted from the Google Doc. Any explicit source NFR remains separately traceable. Revisit these budgets once the actual hosting and workload are known.

### Reproducible starting workload

- Record the machine/VM CPU, memory, storage, OS, browser/device, network shaping, package versions, commit and release-build configuration.
- Suggested synthetic fixture: 10,000 patients, 25,000 historical admissions, 100 room records, 100,000 tasks, 25,000 medical-record entries and 25,000 invoices. Adjust active occupancy to the resolved capacity model. Use deterministic seeds.
- Exercise bounded views: 25 rows initially, a hard maximum page size of 100, and explicit calendar date ranges. These limits are proposals, not source requirements.
- Start with smoke traffic, then a 50-active-user scenario for 10 minutes. The suggested mixture is 80% authorized reads, 15% routine writes, and 5% state-change/conflict scenarios. Tag intentional 4xx/conflicts separately from unexpected failures.
- Use realistic think time and report the achieved request rate. A closed-user test alone does not prove overload resistance; add an arrival-rate step test after the baseline and report saturation, timeouts, and dropped iterations.

### Proposed acceptance budgets

| Measurement | Initial target | Measurement boundary |
| --- | --- | --- |
| Core list/detail API | p95 ≤ 200 ms | Load generator near the application; includes HTTP, middleware, pool wait and SQL; excludes public-internet last-mile latency. |
| Routine mutation API | p95 ≤ 300 ms | Includes authorization, validation, write transaction and required audit history. |
| Unexpected request failures | < 1% | Excludes deliberately tested rejection cases, which must return their specified responses. |
| LCP / INP / CLS | ≤ 2.5 s / ≤ 200 ms / ≤ 0.1 | Proposed UX goals on agreed target profiles; record lab results first and assess real-user p75 only when field data exists. |
| Initial JavaScript | ≤ 150 KiB gzip, excluding deferred module code | Initial login/dashboard entry; a proposed bundle budget to review against the first measured build. |

Track p50/p95/p99, throughput, CPU, memory, database query time, pool waits and payload bytes. Preserve raw test results; compare release builds on the same fixture and environment. Performance acceptance also requires correct authorization and transactions under load.

Optimize measured bottlenecks in this order: query shape/indexes and N+1 requests; payloads/date bounds and frontend rendering; network waterfalls and deployment locality; then profiled CPU allocations/serialization. Use bounded pools and concurrency. Consider caching, additional replicas or a broker only after a measured need and an invalidation/recovery design exist.

Implementation references: [SvelteKit performance](https://svelte.dev/docs/kit/performance), [Web Vitals](https://web.dev/articles/vitals), [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/). Web Vitals field guidance uses the 75th percentile; a lab run or Lighthouse score alone is not a field pass.

## Deployment and operation

Day-end default: a reproducible local release setup, environment example, synthetic seeds and a repeatable demo script. A hosted demo is conditional on an already prepared host/configuration fitting the final packaging window. Provisioning new infrastructure and proving full backup/restore/rollback are follow-up work.

Proposed first hosted topology: one origin through Caddy, a SvelteKit Node SSR service, a Rust API service, and PostgreSQL on a private network. Keep application services and the database in the same region; keep the target users' network latency visible in end-to-end tests. Host, domain, region and budget remain undecided.

- Use Docker Compose for a reproducible local environment and, if suitable for the chosen host, the initial hosted deployment. This is a proposed deployment method, not an already provisioned service.
- Keep development, test and hosted data/secrets separate. Pin lockfiles and image versions when scaffolding. Seed example accounts only in explicitly designated development/test environments.
- CI checks relevant formatting/types/lints, compiles release artifacts, applies migrations to a fresh test database, runs API/integration checks and critical workflows. Source contracts and migrations change together.
- Deploy migrations in a controlled step. Prefer backward-compatible additive changes; tie each application release to compatible migration versions.
- Run liveness/readiness checks and capture structured logs with request IDs, operation, actor identifier where appropriate, duration and error code. Exclude credentials and clinical content from operational logs.
- Back up the database, encrypt backup storage where supported, keep copies outside the application host, and rehearse restore into an isolated environment. Choose recovery-point and recovery-time targets after the real operating context is known.
- Keep the preceding application image/config available for rollback. Database rollback is a separate migration/restore decision; reverting a binary does not reverse schema or data changes.
- Before a real-data release, resolve operating ownership, access lifecycle, data retention, recovery targets and the relevant institutional requirements. This plan does not establish that a prototype is ready for clinical operation.

Deployment references: [SvelteKit Node adapter](https://svelte.dev/docs/kit/adapter-node), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Docker Compose](https://docs.docker.com/compose/), [Playwright assertions](https://playwright.dev/docs/test-assertions).

## Day-one acceptance

Use the P0 table and checkpoints in the main plan. Critical acceptance is real sessions and PostgreSQL persistence, correct authorization, the task/audit/conflict path, and truthful committed outcomes for every other flow reported complete. Preserve actual verification results and label each source feature completed, partial or deferred. A page shell or mock response is not a completed functional module.

## Full-product release candidate — follow-up

Every confirmed requirement is mapped to an implemented scenario or an explicitly documented unresolved/deferred decision. All module data persists across reload and authorized sessions; prohibited direct API operations fail. The required histories, version checks and cross-module effects are verified against PostgreSQL. Representative Final states and responsive behavior have evidence. Performance results identify the exact workload and environment. A hosted rehearsal proves migration, health checks, backup restoration and application rollback before a release is accepted.
