# Frontend architecture

InpaCare uses feature-first Clean Architecture inside `apps/web/src/lib`. SvelteKit routes adapt framework inputs; business-facing operations live with their feature. The Rust-era design documents are historical: the current API application is NestJS, and this frontend refactor changes neither backend rules nor wire contracts.

## Ownership and dependencies

| Location | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `features/<name>/domain` | Framework-independent models and pure rules | Own domain and pure shared code |
| `features/<name>/application` | Operation ports, queries and orchestration | Own domain/application, public feature types, pure shared code |
| `features/<name>/infrastructure` | HTTP paths, DTOs and serialization | Own application/domain, shared HTTP, generated OpenAPI types |
| `features/<name>/presentation` | Svelte pages, forms, transient state, navigation and invalidation | Own public interface, shared UI/format/presentation helpers |
| `app/composition` | Per-request/per-page adapter construction and cross-feature integration | Feature ports/use cases and concrete adapters |
| `app/shell` | Application navigation, shell and framework error presentation | Public feature interfaces and shared code |
| `shared` | Transport, errors, formatters, generic UI | No app or feature imports |

Features are auth, reference-data, notifications, tasks, rooms, placements, patients, medical-records, care-cycles and billing. Dashboard belongs to care-cycles; calendar belongs to placements; invoice routes belong to billing. `index.ts` exposes each feature's public operations and models. Presentation entry components are imported directly by route adapters; infrastructure is constructed only inside composition.

The dependency checker resolves relative imports and `$lib` aliases, parses TypeScript imports/reexports/import types/literal dynamic imports and Svelte scripts, rejects forbidden layer/private imports and direct fetch calls, and detects import cycles. It checks source-level dependencies; it is not a network sandbox or a runtime authorization mechanism.

## Data flow and state

1. A server load reads URL/params, creates operations with SvelteKit's request-scoped `event.fetch`, and returns serializable page data. Redirects and framework errors remain at the route edge.
2. A route component creates browser operations per component instance and passes them with page data into feature presentation. Services are never serialized or kept in process-global user state.
3. Presentation reads form values and calls named operations. HTTP adapters own endpoint paths and request serialization. Client transport sends same-origin credentials and obtains the current CSRF cookie for every operation.
4. Failed operations throw their API status/code/message. Presentation owns session-expiry navigation and error/loading/success feedback. Forms close only after a successful operation. Existing `invalidateAll()` refreshes remain intact.

The `/api/v1` proxy is unchanged: private API origin stays server-only, response cookies pass through, and responses remain `no-store`. The API remains authoritative for roles, record scope, transactions, optimistic versions and totals. UI visibility is not authorization.

The domain models deliberately do not import generated DTOs. Infrastructure types response shapes with `generated/api.d.ts` and checks compatible command inputs. List, detail and mutation results remain distinct. Read `version` is sent as `expectedVersion`; canonical money remains decimal strings. Existing display-only previews are retained; the API computes committed invoice/inventory totals. Calendar dates remain date-only strings; task instants retain timezone-bearing ISO values and browser-local form conversion. Facility calendar defaults use Asia/Jakarta.

Medical page data is a discriminated union using `admisiProjection`. Admission views explicitly pick only administrative fields and patient display identifiers; clinical text is never added to those views. Current OpenAPI already describes the restricted projection. One existing discrepancy remains: invoice line edits accept `kind: null` to clear a legacy kind, but OpenAPI describes only optional strings. A narrow `EditLineWire` documents that compatibility exception in the billing adapter; no API/schema change is introduced.

## Adding or changing a feature

General controls use the editable shadcn-svelte registry source in `shared/ui`. [UI components](UI_COMPONENTS.md) documents ownership, local variants, composition and upstream updates. Shared typography and layout styles remain in `app.css`; competing handwritten primitives and the temporary compatibility stylesheet have been removed.

Start with the public operation and input/output types in application and the necessary pure model/rule in domain. Implement the port in infrastructure, wire it in `app/composition`, then inject it into presentation. Add no layer directory until it has real behavior, and no generic repository or dependency-injection container.

For example, a tasks UI calls `tasks.update(id, { expectedVersion, notes })`; only its HTTP adapter knows that this is a PATCH request. A fake repository can exercise `createTasksUseCases(repository).loadPage(filters, page)` without Svelte, a browser, or a database. Cross-feature operations such as dashboard notifications and invoice room lookups are assembled by app composition, not by private imports between features.

After a backend contract change, regenerate `generated/api.d.ts` using the existing `npm run types:api`, then update any affected domain model and adapter. Never edit generated types manually. Keep UI labels, accessibility, route/query behavior and failure feedback covered by focused tests.

## Validation and migration baseline

```sh
npm run check --workspace apps/web
npm run check:web:architecture
npm run test:web
npm run build --workspace apps/web
npm run test:e2e -- --workers=1
```

For a staged feature gate, `node scripts/check-web-architecture.mjs --feature tasks` checks the selected feature plus app/shared; the default command checks the whole frontend. Vitest exercises ports/adapters/pure rules. Node fixture tests exercise the dependency checker, including relative-import bypasses and cycles. Playwright covers the production frontend against an isolated synthetic API/database, including simulated 409 responses for form preservation. Never use the shared demo database for mutation tests.

The CI frontend gate requires typechecks, architecture checks, unit tests, production builds, generated-type drift checks when applicable, and the full browser suite against disposable PostgreSQL. Existing API gates stay intact.

Baseline source: commit `f6463539d1fbf4bf9d17061e92e78cc22a2cdccd`. OpenAPI SHA-256: `c8ce146488d3ed27b0d1ea7a3bf7905fd717cd5aa9eb5c84444a50b31fb31dca`. The local backend was independently being refactored, so local browser validation uses an isolated compiled API snapshot rather than rebuilding/changing that work. CI validates against its own checked-out backend source.

Preserved routes include login, dashboard, rooms, calendar, tasks, patient context, medical list/detail and invoices. Tasks retain search/status/priority/roomId/patientId/picId/from/to filters. The Kanban board loads each status list independently; legacy task links carrying `page` remain accepted but start at the initial batch in each list, preserving all other filters (issue #23). Dashboard retains search/status/roomId/patientId; calendar retains from. Nurse/coordinator/doctor/admission access and the restricted admission medical projection follow current behavior.


Local validation on 2026-11-03 passed frontend typechecking (zero errors/warnings), production builds, all 29 Vitest cases, 9 dependency-checker cases, 11 existing CI-selection/hook cases, all 17 Playwright cases, generated-type comparison against the unchanged OpenAPI, and CSS/static-copy preservation for all 11 moved views. The isolated API snapshot main.js SHA-256 was `743acfcef01b9a4d9a5a76ddc201d0a39f3708a64ad77abcfbc6aaa36d8fa8c9`. These are local results; the new GitHub Actions job has not been run remotely by this task. Full pixel parity is not asserted by the CSS/copy comparison.
