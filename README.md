# InpaCare

[![CI](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml/badge.svg)](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An inpatient-care management application built with **SvelteKit, Rust, and PostgreSQL**. InpaCare connects room placement, nursing tasks, clinical records, care-cycle decisions, and billing in one role-aware workflow.

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

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Svelte 5, SvelteKit, TypeScript, adapter-node |
| Backend | Rust, Axum, Tokio, SQLx |
| Database | PostgreSQL 16+ |
| Validation | Rust unit tests, Python API workflows, Playwright browser tests |
| Hosting | Native Linux user services or the alternative Docker Compose package |

Pages render on the server. Browser requests use SvelteKit's same-origin `/api/v1` proxy, which forwards to the Rust API; PostgreSQL stores the application data. The API contract lives in [contracts/openapi.json](contracts/openapi.json).

## Quick start

Clone the repository and install **Node.js 24 LTS** and **Python 3**. The Windows helper downloads a project-local Rust/PostgreSQL runtime; manual development also requires Rust stable and PostgreSQL.

```sh
git clone https://github.com/Malwildan/inpacare.git
cd inpacare
```

### Windows

Run PowerShell from the repository root:

```powershell
./scripts/start.ps1
```

Open **http://127.0.0.1:3000**. The helper installs isolated tools, builds the API and frontend, runs migrations, and seeds an empty database. Stop the app with `./scripts/stop.ps1`; subsequent starts can use `./scripts/start.ps1 -SkipBuild`.

### Linux, macOS, or an existing toolchain

Follow the [development guide](docs/development/GETTING_STARTED.md) to run the Rust API and SvelteKit development server. For self-hosting, see [native Linux hosting](docs/deployment/NATIVE_HOSTING.md) or [Docker Compose](docs/deployment/HOSTING.md).

## Demo accounts

| Username | Role |
| --- | --- |
| `rina` | Nursing coordinator |
| `dina`, `bima` | Nurse / assigned PIC |
| `hendra`, `maya` | Doctor |
| `admisi` | Admissions and billing |

Password for all synthetic accounts: **`InpaCareDemo!2026`**. Seeding requires `SEED_DEMO=1`. The public demo may display ngrok's **Visit Site** screen on the first visit and is available while its host is online.

## Repository layout

```text
.github/             CI, issue forms, and pull request template
apps/
  api/               Axum API, PostgreSQL migrations, domain modules
  web/               SvelteKit routes, shared components, static assets
contracts/           OpenAPI specification and generated-type instructions
docs/
  development/       Setup, testing, and implementation conventions
  deployment/        Docker, native Linux hosting, and cross-build guides
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
cargo test --locked --manifest-path apps/api/Cargo.toml
```

The [CI workflow](.github/workflows/ci.yml) checks the frontend, generated API types, Rust unit tests, and API workflows against a disposable PostgreSQL service. Browser checks run separately against a local synthetic instance; see [API testing](docs/development/API_TESTS.md) and [browser testing](docs/development/BROWSER_TESTS.md).

## Contributing

Contributions to documentation, accessibility, tests, and application behavior are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for changes to permissions or domain rules, then submit a focused pull request from a fork. The [project status](docs/PROJECT_STATUS.md) lists implemented behavior and open areas.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/Malwildan/inpacare/security/advisories/new); see [SECURITY.md](SECURITY.md).

## Scope and license

This project uses synthetic data and has no live hospital, payment, or insurance integration. Production clinical deployment, full design parity, and operational certification are outside its current scope. Do not use the public demo for patient information.

Application code is licensed under [MIT](LICENSE). Bundled DM Sans font files retain their [SIL Open Font License](apps/web/static/fonts/OFL.txt). Third-party dependencies and referenced design materials retain their respective terms.
