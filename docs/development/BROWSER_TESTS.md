# InpaCare browser checks

`npm run test:e2e` runs the focused Playwright checks against a locally running demo on `http://127.0.0.1:3000`. The checked-in setup keeps Chromium local to the ignored project directory:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/ms-playwright'
npx playwright install chromium
npm run test:e2e
```

Set `INPACARE_TEST_URL` to change the origin. These checks deliberately use the demo account and synthetic database. Do not point them at a live hospital deployment.

The suite checks invalid and valid login, logout/session revocation, all six core module routes, the coordinator-to-PIC nursing-task workflow through a committed status and note, invoice creation/payment-status/history, role-specific navigation, and a 390px layout. Failures retain screenshots and traces under `test-results/`.

The root `package.json` provides the `test:e2e` script. When testing the Vite development server, set `INPACARE_TEST_URL` to the origin Vite prints (normally `http://127.0.0.1:5173`). The browser suites focus on representative workflows. They do not establish pixel-perfect parity with all 107 Figma screens or prove real-hospital readiness. API role, database-concurrency, medical-observation, invoice-total, and cycle-request cases live in [API_TESTS.md](API_TESTS.md).
