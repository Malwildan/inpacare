# Task drag feedback

These captures use the real TasksPage component with synthetic task, patient and staff fixtures.

- [Source column](cancel-desktop.png): **Cancel**, with the InpaCare primary color and hover glow. Releasing here keeps the original status and order without a request.
- [Destination column](destination-desktop.png): **Move here**, using `--primary`, while locked columns retain gray stripes and their explanations.
- [Mobile source column](cancel-mobile.png): the Cancel message stays inside the horizontally scrolling board.

Run `npm run test:web:ux` to regenerate `.local/evidence/task-column-cancel.png`, `task-column-drop-active.png` and `task-column-drop-mobile.png`. The suite verifies pointer-press compression, theme-token changes, reduced motion, preview cleanup, source-column cancellation with and without filters, and failure/retry for moves into another column. PostgreSQL-backed browser tests also check native pointer dragging, unchanged source-column order and version, and persisted movement/explicit ordering across sessions.

Movable cards compress to 97% on press. Native dragging uses a slightly raised, tilted copy with a shadow while the source remains dimmed. Reduced motion removes scaling, tilt and animated transitions. Native drag images are composed by the browser and are not included in these page screenshots.
