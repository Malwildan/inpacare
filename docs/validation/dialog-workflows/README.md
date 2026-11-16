# Focused feature dialogs

Creation and correction forms use shared, responsive dialogs across Billing, Calendar, Tasks and Medical Records. Invoice details have separate summary, line and history views. Detail actions in Billing, Rooms, Tasks and Care Cycles replace the contents of one dialog and return to their originating action; room inventory actions no longer stack dialogs.

Dashboard advanced filters apply explicitly and discard selections on Cancel; search remains on the page. Full notifications open from the Dashboard or the navbar's quick preview using the same notifications service and dialog. Task history comparisons use a read-only view within the task dialog.

All screenshots use synthetic fixture data:

| Surface | Mobile (390px) | Desktop (1440px) |
| --- | --- | --- |
| Dashboard filters | [Filter dialog](dashboard-filter-mobile.png) | [Filter dialog](dashboard-filter-desktop.png) |
| Room item correction | [Item dialog](room-item-mobile.png) | [Item dialog](room-item-desktop.png) |
| Invoice creation | [Invoice dialog](billing-create-mobile.png) | — |
| Notifications | — | [Full notification dialog](notifications-desktop.png) |
| Task history | — | [Before/after comparison](task-history-desktop.png) |

Validation: `npm run check` (API plus Svelte, zero errors/warnings), `npm run check:web:architecture`, `npm run test:web` (88 unit tests and 9 architecture tests), `npm run test:web:ux`, and `npm run build --workspace apps/web`. The UX suite covers versioned payloads, required fields, draft retention after failed writes, retry, pending dismissal protection, unsaved-change confirmation, filter cancellation/application, notification reads, focus restoration, one active room dialog, equal-width placement actions, and mobile/tablet/desktop overflow. A separate synthetic capture checks the room item dialog at 390px and 1440px without toast overlays.

The 38 database-backed E2E scenarios load with `npm run test:e2e -- --list`; they were updated for the new dialog navigation but were not executed against an API/database locally. These component checks do not establish authentication, SSR or database integration. No API contracts, domain permissions or database migrations change.
