# InpaCare: shadcn-svelte migration and UI refresh

Status: implemented on `feat/shadcn-ui-migration` in [PR #36](https://github.com/Malwildan/inpacare/pull/36). The original planning baseline and acceptance criteria are retained below. The PR and its Actions runs record final integration acceptance.

Prepared: 2026-11-13. Source inspected at HEAD `6ac3a87bbff5`, including the working tree. Active, uncommitted task-board work was present and changed during inspection; its behavior must be baselined again before implementation.

## Outcome and selected direction

Replace handwritten general UI controls with established shadcn-svelte components, then customize and compose those components for InpaCare. The user selected **"Refresh layouts using shadcn patterns"**, rather than preserving the existing layouts.

Use the registry's actual component implementations as the foundation. Customization belongs in theme tokens, component variants, and feature compositions. A locally stored `.svelte` file is expected: shadcn distributes editable source. Recreating a button or modal from native HTML and naming it after shadcn does not meet this goal. See the [shadcn-svelte introduction](https://www.shadcn-svelte.com/docs).

The proposed visual direction is a practical application interface:

- A consistent sidebar and header, clear page titles, and a predictable primary action on each screen.
- Compact filter toolbars, readable tables, and row actions built from shadcn patterns.
- Cards for task-board items and meaningful summaries; longer clinical documents retain a readable page layout.
- Focused create/edit dialogs where appropriate, with longer forms remaining on pages when that makes them easier to complete.
- Responsive navigation, forms, tables, and dialogs, with deliberate scrolling for boards and room schedules.
- Retain the InpaCare name, Indonesian labels, existing blue identity, DM Sans, and clinical status meanings as the starting branding assumptions. Layout, spacing, density, and component presentation can change.

Success means a visibly refreshed interface whose standard controls have a maintained component foundation and whose existing workflows still work.

## Verified starting point

- The frontend declares SvelteKit 2, Svelte 5, Vite 7, and the Node adapter in `apps/web/package.json`; the repository uses npm workspaces.
- There is no Tailwind or shadcn-svelte configuration in the inspected frontend. Lucide supplies icons; Swagger UI supplies the separate API explorer.
- Shared handwritten UI consists of `Modal.svelte` and `Badge.svelte`. Buttons, fields, panels, and tables are otherwise mostly written directly in the nine feature presentation pages and styled by `apps/web/src/app.css`.
- The application shell owns navigation, breadcrumbs, notifications, mobile navigation, and logout.
- The current working-tree task page already contains board movement, per-column loading, optimistic updates, rollback, and alternate move controls. Their presence in source is not evidence that this unfinished work has passed runtime validation.
- Existing validation includes frontend typechecking, an architecture guard, unit tests, a production build, and Playwright workflows against synthetic data.

## Scope and architecture

Implementation covers the frontend, its dependency/lockfile changes, relevant frontend tests, and design/development documentation. Preserve the current feature-first architecture described in `docs/development/FRONTEND_ARCHITECTURE.md`.

Proposed ownership:

```text
apps/web/
  components.json                     # Registry configuration for this workspace
  vite.config.ts                      # Tailwind integration beside SvelteKit
  src/
    app.css                           # Tailwind entry, theme, fonts, application base
    legacy.css                        # Temporary compatibility styles, then removed
    lib/
      shared/
        ui/<component>/               # Actual shadcn-svelte component source
        utils.ts                      # Registry utility, only as required
        hooks/                        # Registry hooks, only as required
      app/shell/                      # Shell composed from shared components
      features/*/presentation/        # Feature-specific UI compositions
```

Configure the registry aliases to `$lib/shared/ui`, `$lib/shared/utils`, `$lib/shared/hooks`, and `$lib/shared` as appropriate. The CLI supports configuring these destinations through [components.json](https://www.shadcn-svelte.com/docs/components-json).

Shared components stay generic and never import application or feature modules. Domain/application rules, HTTP adapters, route loads, authentication, OpenAPI, database behavior, and deployment are outside the UI migration. Existing independent changes to those files must be preserved.

Keep feature-specific columns, actions, labels, and layouts in feature presentation. Add a shared composition only when real reuse justifies it; avoid a second design-system wrapper around every registry component.

## Component replacement map

| Existing UI | Foundation | InpaCare customization |
| --- | --- | --- |
| Text and icon buttons | Button | Primary, secondary, destructive, size, and pending variants |
| Text, numeric, password, and date inputs | Input, Textarea, Label/Field | Existing labels, validation, values, and submit behavior |
| Simple form selects | Native Select | Existing options, names, required/disabled states, and FormData behavior |
| Enhanced pickers where justified | Select or Combobox | Existing patient, room, or PIC selection behavior; explicit form-value integration |
| Panels, summaries, and board cards | Card, Separator | Information hierarchy and feature content |
| Status and priority labels | Badge | Existing Indonesian labels, semantic colors, and readable text |
| Handwritten Modal | Dialog | Controlled open state, draft preservation, and focus restoration |
| Browser confirm/prompt flows | Alert Dialog; Dialog with a reason field | Existing confirmation requirements, cancellation reasons, and mutation rules |
| Sidebar and mobile navigation | Sidebar and its responsive pattern | Role-filtered links, active state, user identity, and logout |
| Breadcrumbs, notification panel | Breadcrumb, Popover, Button; Sheet when appropriate | Existing navigation and notification operations |
| Existing data tables | Table, Dropdown Menu, Pagination where already needed | Feature columns, existing URL filters/paging, and permitted actions |
| Inline failure, empty, and pending feedback | Alert, Empty, Spinner/Skeleton as needed | Existing messages, retry behavior, and accessible announcements |

[Native Select](https://www.shadcn-svelte.com/docs/components/native-select) is itself an established shadcn component, so retaining native form semantics does not require rebuilding that control. Introduce enhanced selection only where it earns its extra behavior.

The [Data Table guide](https://www.shadcn-svelte.com/docs/components/data-table) composes Table with TanStack Table. Start with the registry Table and existing server-driven behavior. Add a table engine only for a concrete requirement; client-side filtering or sorting of one fetched page must not pretend to cover the full dataset.

Two specialized compositions remain necessary:

- **Room schedule:** the [Calendar component](https://www.shadcn-svelte.com/docs/components/calendar) selects dates or ranges; it does not replace InpaCare's room-by-day occupancy schedule. Compose that schedule from established table/card/badge/button components and retain its placement logic. Date inputs can use Input; adopt a richer date picker only if justified.
- **Task board:** compose cards, labels, controls, and dialogs from shadcn. Preserve the current board movement, ordering, loading, and permission behavior after the active work has settled. This migration does not introduce a second drag engine or redesign its API.

## Implementation sequence

### 1. Establish the baseline and visual rules

1. Recheck the current branch and working tree; record the exact source used for implementation. Preserve unrelated work. Coordinate the Tasks phase with the active task-board changes before touching that file.
2. Capture representative screens using synthetic data: desktop, 390px mobile, and important empty/error/form states. These establish workflow and content coverage, rather than pixel-parity targets.
3. Inventory every route and shared control, including native confirmation prompts and the framework error page.
4. Record the selected shadcn layout patterns, brand tokens, typography, status variants, and responsive behavior in frontend design documentation before propagating them across screens.
5. Establish the existing check/build/test baseline and distinguish pre-existing failures from migration regressions.

Gate: an implementation baseline, screen inventory, and concrete visual rules exist; active task-board work has a clearly separate ownership boundary.

### 2. Install the foundation and make CSS coexist safely

1. Add Tailwind CSS v4 and its Vite integration in the web workspace, following the [official Vite setup](https://tailwindcss.com/docs/installation/using-vite).
2. Initialize shadcn-svelte inside `apps/web`, with the aliases above. Use the [existing-project setup](https://www.shadcn-svelte.com/docs/installation/manual) and inspect generated changes; initialization must not overwrite the existing stylesheet wholesale.
3. Add only the components needed by the pilot, and let their registry definitions establish required dependencies. Verify the existing Lucide package alias against generated imports instead of installing duplicate icon packages blindly.
4. Make `app.css` the single global entry and move temporary old rules to `legacy.css`. Give legacy rules explicit cascade ordering below component utilities and scope broad selectors to the remaining legacy surfaces. Account separately for unlayered styles inside existing Svelte components and for portaled dialog/popover content.
5. Map existing tokens to shadcn semantics. In particular, current `--muted` is a text color, while shadcn uses it as a background; legacy text uses must become `--muted-foreground` or an explicit compatibility token. Map text/surface/focus/destructive/status values deliberately.
6. Check Tailwind's base reset against both migrated and untouched screens, including the Swagger API explorer. [Preflight can change base element styling](https://tailwindcss.com/docs/preflight); do not treat adding Tailwind as visually inert.
7. Record the selected CLI/component provenance and resolved dependency versions in the repository/lockfile so later updates can be reviewed.

Gate: registry components render with the intended tokens, SSR/build succeeds, the architecture guard accepts the destinations, and untouched screens remain usable during migration.

### 3. Migrate Rooms as the first complete screen

Rooms is the initial pilot because the Tasks file has active concurrent work. Rooms exercises tables, forms, status presentation, inventory actions, confirmations, and request feedback without starting with the billing or clinical-record interfaces.

1. Refresh the page into a clear header, compact filters, a Table-based listing, and predictable row actions.
2. Replace the create/edit controls and room/item confirmations with registry components. Use focused dialogs where the form length permits.
3. Preserve all current actions and validation, including room maintenance/status changes and inventory operations.
4. Establish the reusable visual treatment for form fields, errors, pending actions, status badges, and dialogs on this actual screen.
5. Exercise keyboard operation, focus return, mobile sizing, successful writes, and failed writes before using the pattern elsewhere.

Gate: the first whole screen uses the component foundation and its existing workflows pass. Do not propagate unresolved CSS or dialog behavior across the application.

### 4. Refresh the shared shell, login, and error presentation

1. Compose the shell using the [Sidebar pattern](https://www.shadcn-svelte.com/docs/components/sidebar), breadcrumbs, buttons, and an appropriate notification overlay.
2. Preserve role-specific links, active route indications, skip navigation, logout state, notification read actions, and mobile access to every permitted route.
3. Refresh login using the same fields, buttons, spacing, and error treatment; preserve password visibility, session behavior, and redirects.
4. Align the framework error page with the shared visual system and keep recovery/navigation actions working.
5. Check every route under the refreshed shell before the next rollout batch.

Gate: all roles retain navigation and authentication behavior at desktop and mobile widths.

### 5. Roll out the remaining feature screens in batches

| Batch | Screens | Main behavior to protect |
| --- | --- | --- |
| A | Patient summary; medical list and detail | Patient context, clinical forms, administrative-only projection, observation/history content |
| B | Care-cycle dashboard; placement calendar | Care-cycle transitions, notifications, inclusive date ranges, placement capacity/conflicts and rescheduling |
| C | Tasks, after active board work settles | Board order/moves, per-column totals/loading/retry, filters/history, PIC/coordinator permissions, reason fields, rollback, alternate move controls and focus/scroll return |
| D | Billing | Invoice creation, line editing, coverage, payment changes/history, decimal-string values and server-authoritative totals |

For each batch, replace standard controls and refresh the layout using the pilot conventions. Keep query parameters, data-loading behavior, domain operation calls, and role restrictions intact. Use the current task-board source and `TUGAS_PERAWATAN_TRELLO_SPEC.md` as reconciliation inputs rather than assuming the earlier board implementation is still current.

Convert remaining browser prompt/confirm interactions to explicit dialogs without weakening their required reasons or confirmations. Preserve drafts and keep edit dialogs open when writes fail. Keep loading, validation failure, conflict, empty, and success states visible and consistent.

Gate per batch: relevant workflows pass before proceeding. Billing remains last so it inherits proven field, dialog, and feedback patterns.

### 6. Remove the old control implementations and complete validation

1. Retire handwritten Modal after its call sites use Dialog. Replace the old Badge rendering with registry Badge plus the existing label/tone mapping where needed.
2. Remove unused `.button`, `.panel`, `.badge`, dialog, and broad form-control styling after all consumers migrate. Remove `legacy.css` when it has no remaining consumers. Keep necessary brand, accessibility, typography, and feature-layout styles.
3. Review registry customizations and eliminate duplicate primitives and unnecessary pass-through wrappers. Keep app-specific compositions built on the established components.
4. Update tests that relied on obsolete CSS selectors to semantic roles/labels or stable hooks while preserving their behavioral assertions. Add focused coverage for new dialog/reason-field interactions and any genuine regression gaps; do not retest upstream button internals.
5. Complete the validation below and document component ownership, customization points, and the process for reviewing upstream updates.

Gate: every application screen follows the selected system; standard primitives are traceable to shadcn-svelte; temporary legacy UI is retired; existing behavior remains covered.

## Validation and acceptance

During implementation, use the cheapest checks relevant to each milestone. At final integration run the existing frontend gates:

```sh
npm run check --workspace apps/web
npm run check:web:architecture
npm run test:web
npm run build --workspace apps/web
npm run test:e2e -- --workers=1
```

Playwright requires a running frontend/API backed by disposable PostgreSQL with synthetic fixtures; it does not provision that stack by itself. Use the existing CI setup in `.github/workflows/ci.yml` and the browser-test guidance. Never run mutation suites against the shared demo or real clinical data. Existing backend and contract CI gates remain applicable to independent changes in those areas.

Acceptance checks:

- Login, logout, restored sessions, and session-expiry navigation remain functional.
- Role-restricted navigation and the administrative medical-record projection remain intact.
- Submitted values preserve names, required/disabled behavior, checkbox/select values, and expected form payloads.
- Mutations preserve optimistic `expectedVersion`, required reasons, a single pending write, and draft values after rejected or conflicting writes.
- Existing URL filters and history, task movement/order/loading, calendar date-only semantics, task timezone semantics, and billing money semantics remain intact.
- Dialogs and overlays have appropriate names/descriptions, keyboard operation, visible focus, intentional dismissal, and focus return. Check forms that open over other overlays and content rendered through portals.
- At 390px, tablet width, and desktop, the shell and forms fit; tables/boards/schedules scroll intentionally without accidental whole-page overflow. Exercise long Indonesian labels and realistic dense data.
- Errors remain associated with their fields/actions. Status and priority meanings are conveyed in text as well as color.
- The API explorer still renders correctly under the new CSS foundation.
- No unexpected hydration errors, uncaught frontend errors, or duplicate mutation requests appear in exercised workflows.

Each milestone should be a separate reviewable change, with behavior tests and screenshots attached where relevant. Roll back or correct a failed milestone before propagating it; avoid carrying competing old/new primitive implementations indefinitely.

## Planning provenance and implementation

The original planning request produced this document without dependency installation or application changes. The user subsequently approved tickets #24–#35 and requested implementation with refreshed shadcn layouts.

The integration branch now contains the registry foundation, all feature migrations, controlled reason dialogs, and removal of the old Modal/Badge and compatibility stylesheet. Task presentation was reconciled against the committed #23 baseline through `9514608`; its movement, ordering, loading and rollback rules remain intact. That dependency includes the additive task-ordering database migration, which requires a forward fix or verified backup to reverse.

[UI components](../development/UI_COMPONENTS.md) records ownership and upstream-update guidance. [Visual evidence](../validation/shadcn-migration/README.md) contains synthetic component-fixture screenshots and their verification limits. Local checks passed frontend typecheck, architecture/traceability guards, 37 Vitest and 9 Node frontend tests, the production web build, and focused Chromium workflows at 390px, 768px and 1440px. Production frontend/API/disposable-PostgreSQL results are recorded separately in the PR's CI runs. No deployment is part of this migration.
