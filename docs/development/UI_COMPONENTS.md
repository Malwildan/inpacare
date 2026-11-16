# UI components

InpaCare uses the actual shadcn-svelte registry source as its general UI foundation. The editable `.svelte` files under `apps/web/src/lib/shared/ui/<component>/` are installed components, not a separate handwritten replacement library. Bits UI supplies interactive behavior; Tailwind supplies the theme and utility styles.

## Ownership

| Location | Responsibility |
| --- | --- |
| `apps/web/components.json` | Registry and aliases into `shared`, with Tailwind CSS at `src/app.css` |
| `apps/web/src/app.css` | InpaCare colors, DM Sans, semantic tokens, accessibility and application typography |
| `shared/ui/button`, `input`, `select`, `dropdown-menu`, `textarea`, `card`, `table`, `badge`, `dialog`, `alert-dialog`, `sheet`, `popover`, `breadcrumb`, `field`, `label`, `separator` | Registry component source and its local variants |
| `shared/ui/form-select.svelte` | Shared composition of registry Select for form fields and filters, with string/null values, required validation, FormData and callbacks |
| `shared/ui/calendar`, `shared/ui/form-date-picker.svelte` | Registry Calendar and its shared Popover composition for Indonesian date/date-time fields, required validation, FormData and date filters |
| `shared/ui/dialog-frame.svelte` | Shared composition of registry Dialog for callback-driven feature dialogs, pending-dismissal protection and focus return |
| `shared/ui/status-badge.svelte` | Shared composition of registry Badge with Indonesian clinical/task labels and semantic tones |
| `shared/ui/sonner` | App-wide toast host and feedback API using svelte-sonner |
| `app/shell` | Role-filtered navigation, mobile Sheet, breadcrumbs and notification Popover |
| `features/*/presentation` | Feature content, forms, field names, tables, board/schedule layouts and transient state |

Import components from their own `index.js`, for example `$lib/shared/ui/button/index.js`. Keep domain and feature imports out of shared UI. Avoid a wrapper for each registry component; compose them at the feature that needs them.

## Local customizations

- Theme tokens keep the InpaCare blue identity and readable clinical status colors. Use `muted-foreground` for secondary text; `muted` is a background color.
- Button defaults to `type="button"`. A form's submitting Button must explicitly specify `type="submit"`.
- Dropdown fields and filters use `FormSelect`, composed from registry Select. Both the trigger and the open menu use the shared theme, including keyboard navigation, focus return and portal positioning. Browser-rendered Native Select lists are no longer used by application features. Bits UI's form input preserves required/disabled and FormData behavior; empty filter values and nullable room-item values retain their existing meanings.
- Date fields and filters use `FormDatePicker`, composed from registry Calendar and Popover. Date-time fields include a time input inside the popover. Keep date-only `YYYY-MM-DD` values and local date-time strings unchanged until the existing submission handler converts them; optional filters can be cleared, and required fields retain native form validation with visible error feedback.
- The editable claim-result field uses Input with a registry Dropdown Menu for suggestions, preserving free typing alongside the suggested results. Swagger UI keeps its independent controls.
- Every application action has a Lucide icon marked `aria-hidden="true"` beside its visible label. Use a matching action icon for conditional labels (for example, Eye to view details and X to close them). The standard Button target is 44px high; compact icon controls keep their dedicated icon sizes.
- Group sibling actions with `.action-buttons`: equal-width columns on larger screens, stacked full-width buttons on mobile. Add `.action-buttons--table` for table action columns or `.action-buttons--full` for a full-width group. Existing `.form-actions`, `.card-actions`, DialogFooter and AlertDialogFooter also give sibling buttons equal widths and allow long labels to wrap. Keep navigation, date controls and icon-only toolbar triggers in their existing layouts. Tables and the room schedule scroll inside their containers on narrow screens.
- Badge variants carry status text as well as color. Never rely on color alone.
- Controlled reason dialogs keep drafts on rejection and dismissal. Busy dialogs prevent dismissal and duplicate writes. Successful writes refresh server data; errors must not present unsaved changes as saved.
- Report transient success, error, warning and progress feedback with `toast` from `$lib/shared/ui/sonner/index.js`. The root layout mounts one `Toaster` for login and authenticated routes, so messages survive client navigation and dialog closure. Update a loading toast by its ID when an operation settles. Keep retry controls available when data fails to load; error feedback belongs in the toast. Toasts use semantic icons/colors, live announcements, reduced-motion support and 44px dismiss targets. Toast interactions must not dismiss an open dialog.
- Creation and correction forms in Billing, Calendar, Tasks and Medical Records use `dialog-frame.svelte`. Use `protectChanges` for forms whose unsaved inputs would be lost, and use the child snippet's `close` callback for Cancel so it follows the same guard as Escape, Back and the close button. The discard prompt stays inside the same dialog and keeps the form mounted while the user chooses to continue.
- Detail actions in Billing, Rooms, Tasks and Care Cycles switch the content of one dialog. Set `formKey` to the current view so the draft baseline, scroll position and focus are reset when entering a form. Use `backLabel` to return to the detail. Successful edits refresh and return to that detail; failed writes retain the form. Confirmation/reason drafts keep their existing persistence rules.
- Shared feature dialogs fill the viewport below 640px, scroll their body, and keep `.form-actions` visible at the bottom of the scroll area. Use `wide` for invoice and medical forms. Keep footer actions outside multi-column form sections so they span the full dialog.
- Dashboard notifications and the navbar’s “Lihat semua notifikasi” action share `features/notifications/presentation/NotificationDialog.svelte`; the navbar retains its quick Popover. Load the full list only when opening the dialog, provide retry on load failure, and mark reads through the notifications service. Do not restore a second inline inbox or add notifications to the care-cycle data loader.
- Task audit comparisons switch to a read-only view within the task dialog, including empty and unknown audit fields; Back returns to the same history action.
- Dashboard and Task advanced filters use a separate dialog with explicit Apply/Cancel behavior. Cancel restores the applied filters; the board's search stays directly accessible.
- The task move dialog retains the settled board behavior: it can be dismissed while its request finishes. The board keeps the card pending and prevents another move of that card until the response arrives.
- Preserve decimal-string money, `expectedVersion`, roles and date/time serialization when changing markup. The API owns calculations, authorization and mutation rules.
- Card Title is a generic container. Use a real heading or give it `role="heading"` and the appropriate `aria-level` when it names a section.
- Registry overlays use portals. Scope layout CSS deliberately; a Svelte selector attached to a parent does not automatically style DOM created inside another component or portal.

## Reviewing upstream changes

1. Start from a clean branch and inspect the installed component, its callers and the local customizations above.
2. Compare the matching component from the [official shadcn-svelte registry](https://www.shadcn-svelte.com/docs). Generate or fetch an update in a disposable checkout first; do not blindly overwrite customized files.
3. Review the source diff and dependency/lockfile changes together. Keep feature behavior out of registry source and retain justified local variants.
4. Run `npm run check --workspace apps/web`, `npm run check:web:architecture`, `npm run test:web` and the production web build. Use `npm run test:web:ux` for focused keyboard, focus, pending, conflict and responsive checks at the service-prop seam.
5. Run the [synthetic browser workflows](BROWSER_TESTS.md) for affected features against a disposable API/database. A component fixture pass does not establish API integration. Check 390px, tablet and desktop rendering, reduced motion, nested overlays and hydration errors.

Swagger UI at `/api-docs` is an independently styled API explorer. Application theme changes should not override its controls.
