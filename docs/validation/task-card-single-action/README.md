# Single-action task cards

These captures show the real TasksPage component using synthetic task, patient and staff fixtures. Each card is one full-surface detail button, with no separate Detail or Pindahkan action row. Pindahkan remains in the detail dialog.

- [Desktop](desktop.png): compact cards and the keyboard focus ring around the selected card.
- [Mobile](mobile.png): full-width card content inside the horizontally scrolling board.

Run `npm run test:web:ux` to regenerate `.local/evidence/task-card-simple-{desktop,mobile}.png`. Checks cover the full clickable area, one Tab stop per card, Enter/Space, click on card padding, focus restoration and movement through details. Existing checks also cover pending dismissal, conflicts, draft retention and whole-column drag overlays. PostgreSQL-backed Playwright workflows verify the keyboard/touch path through details, role and terminal restrictions, native drag and saved ordering.
