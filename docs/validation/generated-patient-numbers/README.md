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

## Deployment and API compatibility

Run the additive `PatientRecordNumber1793577600004` migration before starting the updated API. It initializes a PostgreSQL sequence above existing numeric `RM-` values without rewriting patients. Registration uses the sequence atomically and retains the unique constraint; failed inserts may leave gaps.

`POST /api/v1/patients` no longer accepts `medicalRecordNo` in its request. Clients must omit it and use the assigned number from the response. Deploy the API and frontend together. Direct SQL imports that assign their own numbers need to advance the sequence before registration resumes.
