# UI action consistency

Synthetic screenshots of the real Svelte components, mounted with local fixture services. No live application data is used. Mobile captures use a 390px viewport; desktop captures use 1440px. The medical-records mobile table is scrolled to its action column.

- [Room actions, mobile](rooms-390.png) and [desktop](rooms-1440.png): view, edit, add-item and delete icons; the room-name header can wrap so the action column fits on mobile.
- [Room detail, mobile](room-detail-390.png): inventory and dialog actions also include icons.
- [Medical records, mobile](medical-records-390.png) and [desktop](medical-records-1440.png): “Lihat detail” uses the shared outline button while retaining its navigation link.
- [Cycle dashboard, mobile](dashboard-390.png) and [desktop](dashboard-1440.png): notifications are accessed through the navbar; the duplicate inbox and its dashboard fetch are removed.
- [Tasks, mobile](tasks-390.png) and [desktop](tasks-1440.png): advanced filters use the shared outline-button appearance, a filter icon and a rotating chevron. Task creation is available in the page header; the duplicate button below “Belum Dikerjakan” is removed.
- [Expanded task filters, mobile](tasks-expanded-390.png): the disclosure retains the existing filter fields and selected values.

Validation: `npm run check`, `npm run check:web:architecture`, `npm run test:web` (88 unit tests and 9 architecture tests), `npm run build`, and `npm run test:web:ux` passed. Additional synthetic component checks passed at 390px, 768px and 1440px: room-action dialogs and permission visibility, the occupied-room delete restriction, medical navigation buttons for nursing and admission views, navbar notification reads, and filter opening/closing with pointer, Enter and Space, chevron rotation, retained selections and submission. The header create-task button remains available after removing its duplicate.

The PostgreSQL-backed end-to-end suite was not run locally. Its existing notification workflow now exercises the navbar instead of the removed dashboard inbox. No API contracts or database migrations change.
