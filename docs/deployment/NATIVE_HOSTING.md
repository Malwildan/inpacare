# Native Linux hosting

Run the production frontend, NestJS API, and PostgreSQL as user services on an **x86_64 Linux host with systemd**. The installer targets Ubuntu 24.04-compatible distributions, including Linux Mint 22. This is not a macOS launchd installer; for other hosts, adapt the runtime or use the [Docker package](HOSTING.md).

## Prepare the application

The release needs Node.js 24.18+ and the compiled API/frontend output. The setup script installs a project-local Node/PostgreSQL runtime. From the repository root:

```sh
bash scripts/setup-native-linux.sh
.runtime/node/bin/npm ci --no-audit --no-fund
.runtime/node/bin/npm run build:api
.runtime/node/bin/npm run build
bash scripts/native-host.sh prepare
bash scripts/native-host.sh migrate
```

For a new empty database, `migrate` is a separate explicit operation before app start. It is safe to re-run because the migration runner tracks applied versions. For a database created by the prior Rust API, do not run `migrate`: back it up, stop API/web writes, and run `bash scripts/native-host.sh adopt`. Adoption checks the known schema fingerprint before marking the baseline and applying the additive delta. Restart the previous app only after adoption succeeds. Automatic updates refuse an unadopted non-empty database before stopping services; see [continuous delivery](CONTINUOUS_DELIVERY.md#existing-rust-database-adoption).

To create synthetic demo accounts, seed only when the database is empty and provide a demo-only password explicitly:

```sh
SEED_DEMO_PASSWORD='choose-a-demo-only-password' bash scripts/native-host.sh seed-demo
```

All mutating requests, including login, require an Origin that matches the request's external scheme, host and port, or an exact entry in `TRUSTED_ORIGINS` in `.data/native.env`. The same-origin native frontend and public tunnel work without adding their addresses to that list. Set `TRUSTED_ORIGINS` for any separately hosted frontend. The API trusts forwarded host and protocol only from `TRUST_PROXY` (loopback by default); keep it behind the frontend proxy, which overwrites those headers. Then install services:

```sh
bash scripts/native-host.sh install
```

The project-local runtime is under `.runtime`; private credentials and PostgreSQL data are under `.data`. The setup does not require sudo or install global packages. Existing database files and credentials are preserved. The API binds to `127.0.0.1:8080`, PostgreSQL to `127.0.0.1:55432`, and the frontend to `0.0.0.0:8088`; the host page is **http://127.0.0.1:8088**. PostgreSQL uses major version 16; do not copy a data directory across major versions.
## Service lifecycle and persistence

```sh
bash scripts/native-host.sh status
bash scripts/native-host.sh stop
bash scripts/native-host.sh start
journalctl --user -u inpacare-api -u inpacare-web -n 50 --no-pager
```

Stop/start preserves records. User services start at boot without an interactive login only if the host's user manager has lingering enabled. Inspect your own account with `loginctl show-user "$USER" -p Linger`; the application installer does not enable lingering or change system services.

Preserve `.data/postgres`, `.data/native.env`, and `.data/admin-password` before moving/updating the host. `.data` has owner-only directory permissions and credential files use mode 0600. Use the bundled `pg_dump` with the existing private environment for backups; rehearse restoration separately. Do not delete the data directory or replace credential files to repair startup.

## Optional stable public HTTPS URL

The native frontend has two listeners: port 8088 fixes the external protocol to HTTP, while `HTTPS_PROXY_PORT=8089` enables a loopback-only listener whose external protocol is HTTPS. Both overwrite client protocol headers. A tunnel should forward to `http://127.0.0.1:8089`, preserving the public hostname, so public sessions receive `Secure` cookies.

To use your own ngrok account, create a private `.data/ngrok.yml` with this structure in a local editor. Replace the placeholder using your own account's authtoken; never commit the resulting file:

```yaml
version: '3'
agent:
  authtoken: YOUR_NGROK_AUTHTOKEN
  web_addr: 127.0.0.1:4049
  console_ui: false
  log: stdout
  log_format: json
  update_check: false
```

Then run:

```sh
chmod 600 .data/ngrok.yml
bash scripts/public-tunnel.sh install
bash scripts/public-tunnel.sh url
bash scripts/public-tunnel.sh status
```

The installer extracts ngrok from its signed official APT repository if necessary, enables `inpacare-ngrok`, and forwards to the HTTPS-origin loopback listener. Its agent API stays on `127.0.0.1:4049`, and request inspection is disabled. The project uses a separate private config, preserving account-wide ngrok files.

`bash scripts/public-tunnel.sh stop` stops public access; `start` restores it. The assigned ngrok account domain remains the same across agent restarts. The free plan has quotas and a first-visit browser interstitial; see [ngrok's current limits](https://ngrok.com/docs/pricing-limits/free-plan-limits). Keep the host awake and online. The project demo address is listed in [README](../../README.md); contributors should use their own accounts and instances.

## Validation

Use `python3 scripts/test-native-host.py` to run API workflows against a separate disposable database. Public HTTPS access, LAN access, data persistence, and full machine reboot behavior are separate checks; service enablement alone does not establish each of them. Historical implementation results are summarized in [project status](../PROJECT_STATUS.md).
