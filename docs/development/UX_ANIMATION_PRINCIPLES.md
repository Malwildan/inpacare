# UX and animation principles coverage

This record describes the scoped frontend pass, not a claim that every screen or assistive technology was tested. Motion is subordinate to real state; optional effects are omitted where they do not clarify healthcare workflows.

| # | Principle | Choice and source | Rationale |
|---|---|---|---|
| 1 | Squash and stretch | Omitted: `apps/web/src/app.css` button styles | Deforming routine controls adds no useful information. |
| 2 | Anticipation | Preserved: `apps/web/src/app.css` button hover/focus styles | Interaction cues appear during input without delaying the action. |
| 3 | Staging | Preserved: `apps/web/src/lib/app/shell/AppShell.svelte` notification panel and `apps/web/src/lib/shared/ui/Modal.svelte` | Headings and distinct panels identify the current change without competing motion. |
| 4 | Pose to pose | Preserved: `AppShell.svelte` mobile sidebar `.open` and closed states | Endpoints are defined by state; CSS interpolates the transform and supports reversal. |
| 5 | Follow through | Omitted: `AppShell.svelte` sidebar | No trailing decoration is needed for navigation. |
| 6 | Slow in and slow out | Preserved: `AppShell.svelte` mobile sidebar transition | The 160 ms ease-out gives the panel a clear arrival; reduced motion removes it. |
| 7 | Arcs | Omitted: `AppShell.svelte` sidebar | A direct lateral movement better expresses a side panel. |
| 8 | Secondary action | Applied: `AppShell.svelte` notification loading text | Text supports the panel and reports actual request state. |
| 9 | Snappy timing | Preserved: `app.css` button 140 ms color transition and `AppShell.svelte` sidebar 160 ms | Routine feedback is brief; state is not delayed by transitions. |
| 10 | Exaggerated feedback | Preserved: `AppShell.svelte` notification error with `role=alert` | Readable error text provides emphasis without shaking or false success. |
| 11 | Solid drawing in 3D | Omitted: `AppShell.svelte` sidebar | Flat motion preserves legibility; depth adds no useful task information. |
| 12 | Overall appeal | Preserved: `app.css` shared controls and `AppShell.svelte` panel styles | Existing tokens and visual language keep controls coherent. |
| 13 | Fitts's law | Applied: `app.css` `.button.small` and `.icon-button`; `LoginPage.svelte` password toggle | Larger real controls make common actions easier to reach. |
| 14 | Bigger hit areas | Applied: `app.css` `button.text-link`, `.button.small`, `.icon-button`; `BillingPage.svelte`, `TasksPage.svelte`, `LoginPage.svelte` local styles | Controls have at least 44 px minimum dimensions where changed; layout and focus still require runtime verification. |
| 15 | Hick's law | Preserved: `AppShell.svelte` role-filtered navigation; `CalendarPage.svelte` placement disclosure | Relevant options are grouped or revealed as needed; authorization remains server-side. |
| 16 | Miller's law | Preserved: `AppShell.svelte` navigation and `CalendarPage.svelte` placement form | Related options and fields are grouped by task, without an arbitrary item limit. |
| 17 | Doherty threshold | Applied: `AppShell.svelte` notification loading/error and `CalendarPage.svelte` saving label | Pending feedback starts with the request and does not imply completion. No latency measurement was made. |
| 18 | Postel's law | Preserved: `TasksPage.svelte` and `DashboardPage.svelte` search `.trim()`; `LoginPage.svelte` password input | Benign search whitespace is normalized; passwords and domain validation are not altered. |
| 19 | Jakob's law | Applied: `Modal.svelte` native dialog cancellation and focus restoration; `AppShell.svelte` Escape/focus handling | Native dialog behavior and keyboard dismissal follow familiar conventions. |
| 20 | Frequency of use | Preserved: `TasksPage.svelte` filters and `AppShell.svelte` navigation state | Frequent actions update state directly without queued decorative animation. |

## Verification

The final Svelte/TypeScript check passed with zero errors and five existing unused-selector warnings. Playwright discovered both tests in `tests/e2e/ux-interactions.spec.ts`. `npm run test:web:ux` passed using local Chromium and the retained fixture in `tests/ui/`. It mounts the real shell, login and modal components with synthetic services and checks notification pending, close/reopen, error and retry; notification Escape focus; mobile menu focus and reduced motion; modal single Escape and focus restoration; and password toggle target, keyboard operation and reduced motion. Use the local Chromium installation described in [BROWSER_TESTS.md](BROWSER_TESTS.md). This component fixture does not test SSR, authentication, real services, every viewport, or all screens.

The previous implementation run reported 33 Vitest tests and nine Node architecture tests passing, plus the architecture check passing. Its reduced-motion Playwright run timed out during Vite/login loading, and the authenticated workflow was not verified. The frontend production build failed during chunk rendering with JavaScript heap exhaustion; it was not retried under the same resource constraints. Final scoped diff and whitespace review completed. No latency, assistive-technology, real touch-device, or full responsive layout measurement was performed.
