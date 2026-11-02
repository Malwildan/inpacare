# API workflow tests

`tests/api/test_workflows.py` exercises the NestJS API and PostgreSQL over HTTP. It signs in through Argon2-backed accounts, keeps cookies, sends CSRF/origin headers, and verifies stored behavior with follow-up reads.

The workflows cover sessions and role permissions, persistent cookie lifetime/restoration and logout revocation, coordinator/PIC task progression and reassignment, stale-version writes and audit atomicity, task cancellation/logical deletion, pagination counts, clinical access, equipment costs, concurrent room capacity, doctor decisions/notifications, decimal invoice totals, and placed/unplaced care-cycle transitions.

Tests mutate records and complete a cycle. Always use a fresh disposable synthetic database. Never run this suite against the shared public demo, a development dataset with needed data, or patient information.

`npm run test:api:integration` runs the Node/PostgreSQL repository tests and requires `INPACARE_TEST_DATABASE_ADMIN_URL` pointing to a local PostgreSQL administrative connection that can create and drop disposable test databases. CI uses a fresh `nest_test` PostgreSQL service. Never point this URL at a shared or production server.

## Windows helper

After the [local runtime](RUNTIME_SETUP.md) is installed, run:

```powershell
./scripts/test-api.ps1
```

The helper builds the API, creates a unique test database, explicitly migrates and seeds that disposable database, starts NestJS on port 8081 with only that test origin trusted, waits for health, runs the Python suite, stops its owned process, and removes the database in cleanup. API logs remain in ignored `.local/` files. Port 8081 must be available. The optional `SEED_DEMO_PASSWORD` environment variable overrides the synthetic test-only default.

## Native Linux host

With the native runtime and built Node app installed:

```sh
python3 scripts/test-native-host.py
```

This runner uses the host's private configuration in memory, creates a unique test database, explicitly migrates and seeds it, launches the API on port 8081, and removes the database afterward. It does not run tests against the persistent demo database.

## Manual toolchain or CI

Prepare a separate PostgreSQL database owned by the app role. Build and migrate it explicitly, then optionally seed synthetic fixtures with a dedicated password:

```sh
npm run build:api
npm run migration:run --workspace @inpacare/api
SEED_DEMO_PASSWORD='test-only-password' npm run seed --workspace @inpacare/api
```

Launch the API with `DATABASE_URL`, `API_BIND=127.0.0.1:8081`, and `TRUSTED_ORIGINS=http://127.0.0.1:8081`. Wait for `/health` before running:

```sh
INPACARE_TEST_URL=http://127.0.0.1:8081/api/v1 \
  python3 -m unittest discover -s tests/api -v
```

The [CI workflow](../../.github/workflows/ci.yml) is a complete example using a fresh PostgreSQL service for every job. No production credentials are needed. API startup itself never runs migrations or seeds.
