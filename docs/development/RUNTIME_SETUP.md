# Local runtime setup

The Windows setup keeps PostgreSQL binaries, database files, connection details, logs, and credentials in the ignored `.local/` directory. It does not install a Windows service or bind PostgreSQL outside loopback. Node.js 24.18+ is installed separately and is the only application runtime.

## Install and start

Run PowerShell from the project root:

```powershell
./scripts/setup-runtime.ps1
./scripts/database.ps1 -Action Start
npm ci
npm run build:api
npm run build
$env:DATABASE_URL = (Get-Content .local/database-url.txt -Raw).Trim()
npm run migration:run --workspace @inpacare/api
```

The setup downloads [EDB's PostgreSQL 17 Windows binary archive](https://www.enterprisedb.com/download-postgresql-binaries) into `.local/downloads/` and extracts the required database tools under `.local/postgresql/`. `database.ps1` creates its own cluster, database, and role on first use; the API URL is `.local/database-url.txt`:

```text
postgres://inpacare:inpacare@127.0.0.1:55432/inpacare
```

This fixed password is for synthetic local development only. PostgreSQL listens on `127.0.0.1:55432`; the generated local superuser password is held in `.local/postgres-superuser-password.txt` and is not used by the app.

To create demo accounts and fixtures, seed explicitly after the migration. The seed only accepts an empty users table:

```powershell
$env:SEED_DEMO_PASSWORD = 'choose-a-demo-only-password'
npm run seed --workspace @inpacare/api
Remove-Item Env:SEED_DEMO_PASSWORD
```

Then run `./scripts/start.ps1 -SkipBuild`. Application start never migrates or seeds the database.

## Manage the local database

```powershell
./scripts/database.ps1 -Action Status
./scripts/database.ps1 -Action Stop
./scripts/database.ps1 -Action Start
```

`Stop` targets only the cluster in `.local/postgres-data`; it will not stop another PostgreSQL instance. Use `./scripts/test-api.ps1` to run API workflows against a separate disposable database that the helper removes afterward.

## Limits

The PostgreSQL runtime and synthetic data are for local development and coursework review, not hospital deployment. Never put real patient or production credentials in this local demo.
