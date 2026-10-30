# API workflow tests

`tests/api/test_workflows.py` uses Python's standard library to exercise the real Axum API and PostgreSQL. It signs in through Argon2-backed accounts, keeps cookies, sends CSRF/origin headers, and verifies stored behavior with follow-up reads.

The 11 workflows cover sessions and role permissions, coordinator/PIC task progression and reassignment, stale-version writes and audit atomicity, task cancellation/logical deletion, pagination counts, clinical access, equipment costs, concurrent room capacity, doctor decisions/notifications, decimal invoice totals, and placed/unplaced care-cycle transitions.

Tests mutate records and complete a cycle. Always use a fresh disposable synthetic database. Do not run this suite against the shared public demo, your development dataset, or patient information.

## Windows helper

After the [local runtime](RUNTIME_SETUP.md) is installed, run from the repository root:

```powershell
./scripts/test-api.ps1
```

The helper builds the API, creates a unique test database, starts the API on port 8081, waits for health, runs the Python suite, stops its process, and removes the test database in cleanup. API logs remain in ignored `.local/` files. Port 8081 must be available.

To reuse an existing release build:

```powershell
./scripts/test-api.ps1 -SkipBuild -Configuration Release
```

## Native Linux host

If you installed the project's native runtime and release binary:

```sh
python3 scripts/test-native-host.py
```

This runner uses the host's private configuration in memory, creates a unique test database, launches the API on port 8081, and removes the database afterward. It does not run tests against the persistent demo database.

## Manual toolchain or CI

Prepare a separate database owned by the application role, then launch an API process with its `DATABASE_URL`, `API_BIND=127.0.0.1:8081`, and `SEED_DEMO=1`. Wait for `/health` before running:

```sh
INPACARE_TEST_URL=http://127.0.0.1:8081/api/v1 \
  python3 -m unittest discover -s tests/api -v
```

Stop the test API and recreate the disposable database before running the suite again. The [CI workflow](../../.github/workflows/ci.yml) is a complete example using a fresh PostgreSQL service for every job; no production credentials are needed.

Rust unit tests are separate and do not need a running database:

```sh
cargo test --locked --manifest-path apps/api/Cargo.toml
```
