# Task column drop targets

These captures document the original column-drop change. See [single-action task cards](../task-card-single-action/README.md) for the subsequent card layout and [drag feedback](../task-drag-feedback/README.md) for the current theme color and source-column Cancel behavior.

These captures use synthetic task, patient and staff data from `tests/ui/fixtures/TasksFixture.svelte`. They show the real `TasksPage` component, not the design mockup. Regenerate them with `npm run test:web:ux`; source captures are written to `.local/evidence/task-column-drop-*.png`.

- [Desktop: active blue destination and striped gray locks](active-and-locked-desktop.png). The glow follows the hovered allowed column. Locked columns explain the status or role restriction.
- [Mobile: locked destination](locked-mobile.png). The board scrolls horizontally within the page, and the lock message remains readable.

Current component checks cover the single card trigger, full-column overlay bounds, hover changes, role restrictions, cleanup, pending writes, rollback/retry, append ordering and cancellation confirmation. PostgreSQL-backed Playwright workflows cover native pointer drops over cards, margins and empty space, source-column cancellation without changing order, persisted explicit order after reload/a second session, and independent scrolling beneath the overlays. Same-column drops appended in the original change; they now cancel.
