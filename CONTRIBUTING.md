# Contributing to InpaCare

Thank you for helping improve InpaCare. Small, focused changes are easiest to review. Documentation, accessibility, tests, and bug fixes are good starting points.

## Start here

1. Search existing [issues](https://github.com/Malwildan/inpacare/issues) and pull requests.
2. Open an issue for a new feature or a change to permissions, database schema, billing, placement, or care-cycle rules. Explain the user-visible behavior and its tradeoffs.
3. Fork the repository and create a branch from `main`:

   ```sh
   git clone https://github.com/YOUR_USERNAME/inpacare.git
   cd inpacare
   git switch -c fix/short-description
   ```

4. Use the [development setup](docs/development/GETTING_STARTED.md), or the Windows helper in [README](README.md).

## Where changes belong

| Change | Location |
| --- | --- |
| API handlers and domain permissions | `apps/api/src/` |
| Schema changes | A new versioned SQL file in `apps/api/migrations/` |
| Pages and shared UI | `apps/web/src/routes/` and `apps/web/src/lib/` |
| API contract | `contracts/openapi.json` |
| API and browser workflows | `tests/api/` and `tests/e2e/` |
| Setup and operating instructions | `docs/development/` and `docs/deployment/` |

Keep existing startup-script paths stable unless the change also updates every caller and operating guide. The backend and frontend remain separate applications; avoid moving domain modules merely to rename folders.

## Implementation expectations

- Follow the patterns in the files you touch. Keep changes scoped to the problem.
- Enforce authorization in the API, including patient/record scope. Hiding a UI control is not an access check.
- Preserve optimistic-version checks, transaction boundaries, and audit history.
- Represent money as decimal strings in API payloads. Derive totals on the server.
- Keep user-facing labels in Indonesian and provide labels, keyboard access, loading states, and useful error messages.
- Add a migration rather than editing one that has already been applied.
- Change the OpenAPI contract alongside API payloads, then run `npm run types:api`. Commit the regenerated `apps/web/src/lib/generated/api.d.ts`; do not edit it by hand.
- Use synthetic data only. Keep credentials, database dumps, local host details, and private source documents out of commits and screenshots.

The [demo rules](docs/development/BUILD_CONTRACT.md) and [domain reference](docs/README.md#reference) explain the current behavior. Historical planning documents provide context; they do not grant clinical or operational approval.

## Validate your change

From the repository root:

```sh
npm ci
npm run check
npm run build
npm run types:api
git diff --exit-code -- apps/web/src/lib/generated/api.d.ts
cargo test --locked --manifest-path apps/api/Cargo.toml
```

Run checks appropriate to your change. For API behavior, run the [PostgreSQL workflow tests](docs/development/API_TESTS.md) against a fresh disposable database. For frontend behavior, run the [Playwright workflows](docs/development/BROWSER_TESTS.md) against a local synthetic instance. Documentation-only changes need working links and accurate commands; they do not require a full application rebuild.

CI runs frontend checks, builds, generated-type drift detection, Rust unit tests, and the API workflow suite. Browser tests are a separate local check. Never run mutation tests against the shared public demo or a real-data database.

## Submit a pull request

- Explain the problem, resulting behavior, and how you checked it.
- Link the relevant issue and include screenshots for visible UI changes using synthetic data.
- Note any migration, deployment, or compatibility impact.
- Keep unrelated refactors and generated runtime files out of the diff.

Maintainers review pull requests before merging. Be respectful, assume good intent, and focus feedback on the work. For vulnerabilities, use the private reporting route in [SECURITY.md](SECURITY.md), rather than a public issue.

By submitting a contribution, you agree to license your original contribution under the project's [MIT license](LICENSE). Do not include material you do not have permission to share. Font and other third-party licenses remain in effect.
