# Documentation

Start with the [project README](../README.md), then choose the guide for your task.

## Development

- [Getting started](development/GETTING_STARTED.md): prerequisites, local API/frontend setup, and environment variables.
- [Windows runtime](development/RUNTIME_SETUP.md): isolated Rust and PostgreSQL tools.
- [API workflow tests](development/API_TESTS.md): disposable PostgreSQL tests.
- [Browser tests](development/BROWSER_TESTS.md): Playwright setup and scope.
- [Implementation rules](development/BUILD_CONTRACT.md): current domain and interface decisions, with historical implementation ownership noted separately.
- [Contributing](../CONTRIBUTING.md): changes, validation, and pull requests.
- [OpenAPI contract](../contracts/README.md): specification and generated TypeScript.

## Deployment

- [Docker Compose](deployment/HOSTING.md): alternative container stack and data backup commands.
- [Native Linux](deployment/NATIVE_HOSTING.md): project-local runtimes and user services.
- [Linux API cross-build](deployment/LINUX_BUILD.md): build a static Linux executable from Windows.

## Reference

- [Clinical records and nursing tasks](reference/clinical.md).
- [Care cycles, notifications, and billing](reference/cycles-and-billing.md).
- [Rooms and placements](reference/rooms-and-placements.md).
- [Current project status](PROJECT_STATUS.md): implemented scope, historical validation, and follow-up areas.

## Planning and design provenance

- [Implementation plan](planning/IMPLEMENTATION_PLAN.md).
- [Requirements and unresolved decisions](planning/REQUIREMENTS_AND_DECISIONS.md).
- [Technical design](planning/TECHNICAL_DESIGN.md).
- [Delivery and validation plan](planning/DELIVERY_AND_VALIDATION.md).
- [Captured design evidence](planning/sources/figma-final-evidence.md).
- [Requirements evidence](planning/sources/requirements-evidence.md).

Planning captures describe the source and decisions at the time of implementation. The original requirements export, student IDs, machine-specific deployment records, and authentication diagnostics are excluded from this public repository. Referenced third-party source material retains its original authorship and access settings.
