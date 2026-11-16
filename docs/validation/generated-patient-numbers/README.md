# Generated patient record numbers and birth-date calendar

New registrations receive a server-generated `RM-` number with at least five digits when saved. The form shows `Dibuat otomatis saat disimpan`, then displays the assigned number in its success notice and patient list. Existing patient numbers remain unchanged.

The birth-date control reuses the committed shadcn Calendar/Popover component, with Indonesian month/year selectors, keyboard opening and dismissal, and future dates disabled using today's date in Asia/Jakarta.

## Verification

- `npm run check`: zero errors or warnings; API and production frontend builds passed.
- `npm run test:web`: 89 unit and 9 architecture tests passed; `npm run test:api:unit`: 36 passed.
- All 19 PostgreSQL integration tests passed against a local disposable cluster. New numbering tests cover fresh and populated databases, 16 concurrent registrations, growth beyond `RM-99999`, legacy-number preservation, and continuity after reconnecting. Seed verification checks that the next number follows the synthetic fixtures.
- All 7 patient-registration Playwright tests passed against the production web/API build and a fresh disposable database: persistence/reload, generated-number responses, rejected client-supplied numbers, role/session/CSRF validation, leap-day selection, future-date disabling, keyboard focus, mobile failure/draft preservation, and pagination.
- API lint, web architecture, traceability, and the Impeccable detector passed.

Screenshots contain synthetic data: [desktop registration](desktop.png) and [open mobile calendar](birth-date-mobile.png).

## Dependency audit follow-up (2026-11-17)

PR #55's audit failed on [GHSA-3r8g-jcqq-3p5j](https://github.com/sveltejs/kit/security/advisories/GHSA-3r8g-jcqq-3p5j). The first patched SvelteKit version is 3.1.1; the maintained 2.x release does not contain this fix. The web dependencies now use SvelteKit 3.1.1 with its required Vite 8, TypeScript 6, Svelte 5.57+ and Node adapter 6 peers.

The [v3 configuration changes](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) preserve existing `$lib` imports, runtime-private `API_ORIGIN` and navigation focus/scroll behavior. Patient numbering, migrations and the birth-date picker are unchanged by this follow-up.

Verified after a clean `npm ci`: `npm audit --audit-level=high` passes with zero high/critical findings (11 moderate and 4 low remain); API/frontend type checks, production builds, 89 web unit tests, 9 architecture tests, architecture/traceability gates and 15 production Playwright tests pass. The browser tests use a fresh disposable PostgreSQL cluster and cover registration, frontend navigation and API docs. The native handler also passes HTTP and HTTPS-origin session/cookie smoke checks.

## Deployment and API compatibility

Run the additive `PatientRecordNumber1793577600004` migration before starting the updated API. It initializes a PostgreSQL sequence above existing numeric `RM-` values without rewriting patients. Registration uses the sequence atomically and retains the unique constraint; failed inserts may leave gaps.

`POST /api/v1/patients` no longer accepts `medicalRecordNo` in its request. Clients must omit it and use the assigned number from the response. Deploy the API and frontend together. Direct SQL imports that assign their own numbers need to advance the sequence before registration resumes.
