# Development setup

Run commands from the repository root. Use your own local instance and synthetic records; the shared demo is for review, not automated mutation tests.

## Prerequisites

- Node.js 24 LTS and npm. `.nvmrc` records the recommended major version.
- Rust stable and Cargo for manual development.
- PostgreSQL 16 or newer, either installed locally or running in Docker.
- Python 3 for API workflows; Playwright's Chromium for browser workflows.

On Windows, `./scripts/start.ps1` handles the isolated runtime, build, migration, seed, and production frontend. See [Windows runtime details](RUNTIME_SETUP.md).

## Manual API and frontend setup

Install frontend dependencies:

```sh
npm ci
cp .env.example .env
```

The `.env` file is ignored. Its values are examples for a synthetic local environment; change the connection URL to match your database. Cargo does not load `.env` automatically.

If you want a disposable development PostgreSQL container and port 55432 is available:

```sh
docker run --name inpacare-dev-db \
  -e POSTGRES_USER=inpacare \
  -e POSTGRES_PASSWORD=inpacare \
  -e POSTGRES_DB=inpacare \
  -p 127.0.0.1:55432:5432 \
  -d postgres:17-alpine
```

This example creates a container with synthetic development credentials. If the container already exists, start it with `docker start inpacare-dev-db` instead. Use a separate database if you already have PostgreSQL; do not replace an existing cluster.

In terminal one, load your environment and start the API (POSIX shell):

```sh
set -a
. ./.env
set +a
cargo run --locked --manifest-path apps/api/Cargo.toml
```

The API listens on **http://127.0.0.1:8080**, applies versioned migrations, and seeds an empty database when `SEED_DEMO=1`. `/health` checks the database connection. In PowerShell, set the variables directly (`$env:DATABASE_URL`, `$env:API_BIND`, `$env:SEED_DEMO`) or use the Windows helper.

In terminal two:

```sh
npm run dev
```

Open the URL Vite prints, normally **http://127.0.0.1:5173**. The server-side proxy defaults to the local API on port 8080. The root `.env` is not automatically a frontend workspace environment file; if the API runs elsewhere, set `API_ORIGIN` when launching the frontend.

## Environment variables

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API | PostgreSQL connection URL; required. |
| `API_BIND` | API | Listener, default `127.0.0.1:8080`. |
| `SEED_DEMO` | API | Set to `1` to seed synthetic accounts/data into an empty database. |
| `API_ORIGIN` | Web server | API upstream, default `http://127.0.0.1:8080`. |
| `HOST`, `PORT` | Production web server | Listener address and port. Vite prints its own development URL. |
| `HTTPS_PROXY_PORT` | Native web server | Optional loopback listener for a trusted HTTPS tunnel. |
| `INPACARE_TEST_URL` | Tests | API base URL for Python; frontend origin for Playwright. See the test guides. |

The demo accounts are listed in [README](../../README.md#demo-accounts). Role checks run in the API and depend on record assignment.

## Checks and generated code

```sh
npm run check
npm run build
npm run types:api
cargo test --locked --manifest-path apps/api/Cargo.toml
```

`contracts/openapi.json` is the API contract. Regenerate TypeScript with `npm run types:api` after changing it. Database migrations live in `apps/api/migrations/`; add a new migration for schema changes.

For real API behavior, use the [API workflows](API_TESTS.md) with a fresh disposable database. For frontend changes, use the [browser workflows](BROWSER_TESTS.md), setting `INPACARE_TEST_URL=http://127.0.0.1:5173` if testing the Vite server. Test suites create data and should not target the shared demo.

## Production-style local hosting

`npm run build` produces `apps/web/build`. The native Linux scripts run this output with `scripts/native-web.mjs`, which sets HTTP/HTTPS origin handling for its separate listeners. For a complete host setup, use the [native guide](../deployment/NATIVE_HOSTING.md). The [Docker guide](../deployment/HOSTING.md) documents the alternative Compose package.
