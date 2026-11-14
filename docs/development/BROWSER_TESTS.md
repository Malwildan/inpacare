# InpaCare browser checks

`npm run test:e2e` runs the focused Playwright checks against a locally running demo on `http://127.0.0.1:3000`. The checked-in setup keeps Chromium local to the ignored project directory:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/ms-playwright'
npx playwright install chromium
npm run test:e2e
```

Set `INPACARE_TEST_URL` to change the origin. These checks deliberately use the demo account and synthetic database. Do not point them at a live hospital deployment.

`npm run test:web:ux` mounts the real shell, login and modal components with synthetic services in an isolated local Vite fixture. It needs the same local Chromium installation, but no running application or database. It checks notification loading/error/retry, rapid toggling, keyboard focus, dialog dismissal, password target size and reduced motion. It closes its browser and server on completion. These component checks do not verify authentication, SSR or real API integration.

The suite checks invalid and valid login, persistent sessions across reloads and restored browser contexts (nurse and admission roles), logout/session revocation, all six core module routes, the coordinator-to-PIC nursing-task workflow through a committed status and note, invoice creation/payment-status/history, role-specific navigation, and a 390px layout. Failures retain screenshots and traces under `test-results/`.

The root `package.json` provides the `test:e2e` script. When testing the Vite development server, set `INPACARE_TEST_URL` to the origin Vite prints (normally `http://127.0.0.1:5173`). The browser suites focus on representative workflows. They do not establish pixel-perfect parity with all 107 Figma screens or prove real-hospital readiness. API role, database-concurrency, medical-observation, invoice-total, and cycle-request cases live in [API_TESTS.md](API_TESTS.md).
