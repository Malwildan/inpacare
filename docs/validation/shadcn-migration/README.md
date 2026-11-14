# shadcn-svelte visual evidence

Captured on 2026-11-14 by `npm run test:web:ux` with Chromium. These fixtures mount the actual feature components and application styles with synthetic service props, without the application shell. They verify component behavior and responsive layout; they do not establish API integration, authentication or SSR correctness. The application source matches `cd8cde9`.

| Capture | Viewport | State |
| --- | --- | --- |
| [Task board](tasks-390.png) | 390px | Non-coordinator board after a completed cancellation; horizontal scrolling stays inside the board |
| [Invoice creation](billing-create-1440.png) | 1440px | Synthetic line items and coverage preview with the invoice list below |

The same run checks 768px and other feature states. Additional generated captures remain under `.local/evidence/`; rerun the harness to reproduce them. The [PR](https://github.com/Malwildan/inpacare/pull/36) and its Actions runs record the separate production frontend/API/disposable-PostgreSQL validation.

The UI foundation, customization points and upstream review process are documented in [UI components](../../development/UI_COMPONENTS.md).
