# Action buttons and duplicate controls

The action audit covers 123 application controls across all feature pages, the shell, error page, date picker and dialog footer. Each has a decorative Lucide icon beside its existing label. The default Button target is 44px high. Sibling actions share equal widths through the shared action layout or form/dialog footer rules; table actions and other action groups stack on narrow screens. Long dialog labels may wrap instead of overflowing.

Synthetic screenshots mount the real Svelte components with local fixture services. Mobile captures use a 390px viewport; desktop captures use 1440px. Wide tables are scrolled to their action columns in mobile medical-record and billing captures.

| Surface | Mobile | Desktop |
| --- | --- | --- |
| Rooms | [Room actions](rooms-390.png) | [Room actions](rooms-1440.png) |
| Billing | [Invoice actions](invoices-390.png) | [Invoice actions](invoices-1440.png) |
| Medical records | [Detail links](medical-records-390.png) | [Detail links](medical-records-1440.png) |
| Medical detail | [Record actions](medical-detail-390.png) | [Record actions](medical-detail-1440.png) |
| Cycle dashboard | [Dashboard](dashboard-390.png) | [Dashboard](dashboard-1440.png) |
| Tasks | [Task actions and filters](tasks-390.png) | [Task actions and filters](tasks-1440.png) |
| Calendar | [Placement actions](calendar-390.png) | [Placement actions](calendar-1440.png) |

[Room detail](room-detail-390.png) also shows inventory/dialog actions. [Expanded task filters](tasks-expanded-390.png) shows the disclosure icon, rotated chevron and retained selection.

The cycle dashboard no longer loads or displays a duplicate notification inbox; the navbar remains the notification entry point. The duplicate “+ Tambah tugas” below “Belum Dikerjakan” is removed; task creation remains in the header. Medical detail links use the shared outline Button while retaining navigation semantics.

Validation: `npm run check --workspace apps/web` (zero errors/warnings), `npm run check:web:architecture`, `npm run test:web` (88 unit tests and 9 architecture tests), the production web build and `npm run test:web:ux` passed. Synthetic component checks at 390px, 768px and 1440px also passed: equal widths within visible action groups (within 1px), no page overflow, room actions/permissions, occupied-room delete restriction, medical navigation links, navbar notification reads, and filter click/Enter/Space behavior, chevron rotation, retained values and submission. Dialog widths were checked through the portalled room-detail footer as well.

The PostgreSQL-backed end-to-end suite was not run locally. Its notification workflow now exercises the navbar instead of the removed dashboard inbox. No API contracts or database migrations change.
