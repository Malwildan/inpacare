# InpaCare

[![CI](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml/badge.svg)](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An inpatient-care management application built with **SvelteKit, NestJS, and PostgreSQL**. InpaCare connects room placement, nursing tasks, clinical records, care-cycle decisions, and billing in one role-aware workflow.

Built as an educational project with an Indonesian-language interface and synthetic records. It is a working reference implementation, with remaining scope documented in [project status](docs/PROJECT_STATUS.md).

**[Try the demo](https://carbon-cactus-sputter.ngrok-free.dev)** · **[Documentation](docs/README.md)** · **[Contribute](CONTRIBUTING.md)** · **[Report a bug](https://github.com/Malwildan/inpacare/issues/new/choose)**

## Features

| Module | Capabilities |
| --- | --- |
| Rooms and equipment | Room inventory, equipment costs, capacity checks, and nurse assignments. |
| Placement calendar | Weekly occupancy and admission placement with overlap and concurrent-capacity checks. |
| Nursing tasks | Coordinator delegation, PIC progress, reassignment, cancellation, and change history. |
| Clinical records | Assigned-doctor records and nursing observations with role and patient access checks. |
| Care cycles | Patient recaps, extension/release requests, doctor decisions, and persisted notifications. |
| Billing | Decimal-accurate totals, recorded insurance coverage, payment status, and audit history. |

Authentication uses Argon2 password hashes, server-side sessions, same-origin/CSRF checks, and role permissions. Changes that require concurrency protection use version checks and database transactions.

New logins stay signed in on the same browser for up to 30 days, including after closing and reopening it. Sessions expire 30 days after login, or immediately when you sign out; clearing site cookies also requires signing in again. Use **Keluar** when leaving a shared device. Existing sessions keep their original expiry until the next login.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Svelte 5, SvelteKit, TypeScript, adapter-node |
| Backend | Node.js 24.18+, NestJS, TypeORM |
| Database | PostgreSQL 16+ |
| Validation | TypeScript checks and unit tests, Python API workflows, Playwright browser tests |
| Hosting | Native Linux user services or the alternative Docker Compose package |

Pages render on the server. Browser requests use SvelteKit's same-origin `/api/v1` proxy, which forwards to the NestJS API; PostgreSQL stores the application data. The API contract lives in [contracts/openapi.json](contracts/openapi.json).

## Quick start

Clone the repository and install **Node.js 24.18+**, **Python 3**, and PostgreSQL. On Windows, the helper keeps PostgreSQL data and credentials inside `.local/`; Rust is not required.

```sh
git clone https://github.com/Malwildan/inpacare.git
cd inpacare
```

### Windows

Run PowerShell from the repository root. Initialize the local PostgreSQL cluster, build the compiled API/frontend, then apply the migration explicitly before start:

```powershell
./scripts/setup-runtime.ps1
./scripts/database.ps1 -Action Start
npm ci
npm run build:api
npm run build
$env:DATABASE_URL = (Get-Content .local/database-url.txt -Raw).Trim()
npm run migration:run --workspace @inpacare/api
# Optional, synthetic demo data only:
$env:SEED_DEMO_PASSWORD = 'choose-a-demo-only-password'
npm run seed --workspace @inpacare/api
Remove-Item Env:SEED_DEMO_PASSWORD
./scripts/start.ps1 -SkipBuild
```

Open **http://127.0.0.1:3000**. App start never migrates or seeds. See [development setup](docs/development/GETTING_STARTED.md) for manual setup. Stop the app with `./scripts/stop.ps1`.

### Linux, macOS, or an existing toolchain

Follow the [development guide](docs/development/GETTING_STARTED.md) to run the NestJS API and SvelteKit development server. For self-hosting, see [native Linux hosting](docs/deployment/NATIVE_HOSTING.md) or [Docker Compose](docs/deployment/HOSTING.md).

## Demo accounts

| Username | Role |
| --- | --- |
| `rina` | Nursing coordinator |
| `dina`, `bima` | Nurse / assigned PIC |
| `hendra`, `maya` | Doctor |
| `admisi` | Admissions and billing |

Choose a password explicitly when seeding synthetic accounts. The seed command refuses a non-empty users table. The public demo may display ngrok's **Visit Site** screen on the first visit and is available while its host is online.

## Repository layout

```text
.github/             CI, issue forms, and pull request template
apps/
  api/               NestJS API, PostgreSQL migrations, domain modules
  web/               SvelteKit routes, shared components, static assets
contracts/           OpenAPI specification and generated-type instructions
docs/
  development/       Setup, testing, and implementation conventions
  deployment/        Docker and native Linux hosting guides
  reference/         Domain API notes
  planning/          Requirements, decisions, and design references
  validation/        Shareable synthetic performance evidence
ops/                 Container definitions and systemd service templates
scripts/             Development, build, hosting, and test entry points
tests/
  api/               Real PostgreSQL/API workflow tests
  e2e/               Playwright user workflows
  performance/       Synthetic read smoke test
```

Runtime directories, credentials, databases, local evidence, and compiled output are ignored by Git. Private source-document captures are omitted from the public repository.

## Development checks

```sh
npm ci
npm run check
npm run build
npm run types:api
npm run check:api
npm run build:api
npm run test:api:unit
npm run test:api:integration
```

The [CI workflow](.github/workflows/ci.yml) checks the frontend, generated API types, NestJS unit/integration tests, and API workflows against disposable PostgreSQL services. Successful main builds publish a verified Linux release for [automatic native demo updates](docs/deployment/CONTINUOUS_DELIVERY.md). Browser checks run separately against a local synthetic instance; see [API testing](docs/development/API_TESTS.md) and [browser testing](docs/development/BROWSER_TESTS.md).

## Contributing

Contributions to documentation, accessibility, tests, and application behavior are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for changes to permissions or domain rules, then submit a focused pull request from a fork. The [project status](docs/PROJECT_STATUS.md) lists implemented behavior and open areas.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/Malwildan/inpacare/security/advisories/new); see [SECURITY.md](SECURITY.md).

## Scope and license

This project uses synthetic data and has no live hospital, payment, or insurance integration. Production clinical deployment, full design parity, and operational certification are outside its current scope. Do not use the public demo for patient information.

Application code is licensed under [MIT](LICENSE). Bundled DM Sans font files retain their [SIL Open Font License](apps/web/static/fonts/OFL.txt). Third-party dependencies and referenced design materials retain their respective terms.
