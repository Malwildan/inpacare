# Native Linux hosting

Run the production frontend, Rust API, and PostgreSQL as user services on an **x86_64 Linux host with systemd**. The provided runtime installer targets Ubuntu 24.04-compatible distributions, including Linux Mint 22. This path is not a macOS launchd installer; for other hosts, adapt the runtime or use the [Docker package](HOSTING.md).

## Prepare a release

The release folder needs:

- A Linux executable at `bin/inpacare-api`. See [cross-building from Windows](LINUX_BUILD.md), or build with a Linux Rust toolchain and copy the release executable there.
- The adapter-node production frontend at `apps/web/build`, created with `npm ci && npm run build`.
- The repository's `scripts/` and `ops/native/` directories.

Run from the release root:

```sh
bash scripts/setup-native-linux.sh
bash scripts/native-host.sh install
```

The scripts extract Node/PostgreSQL into `.runtime`, create private credentials and a new database under `.data`, then enable `inpacare-db`, `inpacare-api`, and `inpacare-web` user services. They do not require sudo or install global packages. Existing database files and credentials are preserved.

Open **http://127.0.0.1:8088** on the host, or its reachable LAN address on port 8088. The API binds `127.0.0.1:8080`, PostgreSQL binds `127.0.0.1:55432`, and the frontend binds `0.0.0.0:8088`. The native runtime uses PostgreSQL 16; do not copy a data directory from a different PostgreSQL major version.

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
