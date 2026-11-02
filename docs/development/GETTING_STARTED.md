# Development setup

Run commands from the repository root. Use your own local PostgreSQL database and synthetic records; never run mutation tests against the shared demo or real patient data.

## Prerequisites

- Node.js 24.18+ and npm. `.nvmrc` records the recommended major version.
- PostgreSQL 16 or newer, either installed locally or running in Docker.
- Python 3 for API workflows; Playwright's Chromium for browser workflows.

On Windows, `scripts/start.ps1` starts only the application and local PostgreSQL processes it owns. See [Windows runtime details](RUNTIME_SETUP.md).

## Manual API and frontend setup

Install dependencies and copy the ignored local environment template:

```sh
npm ci
cp .env.example .env
```

The root `.env` is not automatically loaded. Set its values in your shell and use a disposable development database. The example below creates a synthetic PostgreSQL container if port 55432 is available:

```sh
docker run --name inpacare-dev-db \
  -e POSTGRES_USER=inpacare \
  -e POSTGRES_PASSWORD=inpacare \
  -e POSTGRES_DB=inpacare \
  -p 127.0.0.1:55432:5432 \
  -d postgres:17-alpine
```

Load the environment, build the API, and run the migration as a separate explicit step before starting the app:

```sh
set -a
. ./.env
set +a
npm run build:api
npm run migration:run --workspace @inpacare/api
```

To create synthetic demo accounts in an empty database, explicitly set a demo-only password and run the seed command. The seed refuses a database with any users:

```sh
export SEED_DEMO_PASSWORD='choose-a-demo-only-password'
SEED_DEMO_PASSWORD="$SEED_DEMO_PASSWORD" npm run seed --workspace @inpacare/api
unset SEED_DEMO_PASSWORD
```

Start the API in terminal one:

```sh
npm run dev:api
```

The API listens on **http://127.0.0.1:8080**. It never runs migrations or seeds while starting. `/health` checks the database connection. Set `TRUSTED_ORIGINS` to the exact browser origin used for mutating requests, including login.

In terminal two:

```sh
npm run dev
```

Open the URL Vite prints, normally **http://127.0.0.1:5173**. The server-side proxy defaults to the local API on port 8080. Set `API_ORIGIN` if the API runs elsewhere.

## Environment variables

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API and migration CLI | PostgreSQL connection URL; required. |
| `API_BIND` | API | Listener, default `127.0.0.1:8080`. |
| `TRUSTED_ORIGINS` | API | Comma-separated exact HTTP(S) origins allowed for mutating requests. |
| `SEED_DEMO_PASSWORD` | Explicit seed CLI | Password used only by the explicit seed command; seed refuses a non-empty users table. |
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
npm run test:api:unit
```

`contracts/openapi.json` is the API contract. Regenerate TypeScript with `npm run types:api` after changing it. SQL migrations and the explicit CLI are under `apps/api/src/database/`.

For real API behavior, use the [API workflows](API_TESTS.md) with a fresh disposable database. For frontend changes, use the [browser workflows](BROWSER_TESTS.md), setting `INPACARE_TEST_URL=http://127.0.0.1:5173` if testing the Vite server. Test suites create data and should not target the shared demo.

## Production-style local hosting

`npm run build` builds both the API into `apps/api/dist` and the frontend into `apps/web/build`. Native Linux services run those Node outputs. For a complete host setup, use the [native guide](../deployment/NATIVE_HOSTING.md). The [Docker guide](../deployment/HOSTING.md) documents the Compose package.
