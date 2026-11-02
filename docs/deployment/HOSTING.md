# Private Mac/Linux Docker host

The linked MacBook currently uses the verified [native deployment](NATIVE_HOSTING.md). This document describes the alternative Docker package; container image builds have not been exercised in this session.

This package runs the coursework demo on Docker Desktop for Mac or Docker Engine on Linux, including Apple Silicon as a native multi-architecture build. It creates PostgreSQL, the NestJS API, the SvelteKit Node server, and Caddy on one private LAN or tailnet origin. It does not configure Tailscale, open firewall rules, or publish a public tunnel.

## Start the demo

Install and start Docker Desktop/Engine with Docker Compose v2 and OpenSSL available. From the project root, run:

```sh
sh ./scripts/host.sh migrate
# Optional synthetic demo fixtures, only on an empty database:
SEED_DEMO_PASSWORD='choose-a-demo-only-password' sh ./scripts/host.sh seed-demo
# Add exact LAN/tailnet browser origins to TRUSTED_ORIGINS in .env.local, then:
sh ./scripts/host.sh start
```

The migration command creates a random database password in `.env.local` with owner-only permissions, starts PostgreSQL, and applies the compiled NestJS migration explicitly. App startup never migrates or seeds. The optional seed requires `SEED_DEMO_PASSWORD` and refuses a non-empty users table. `start` validates Compose, builds the NestJS and Node images for the host architecture, and waits for PostgreSQL, API, and web health checks. Services use an `unless-stopped` restart policy. The URL on the host is `http://127.0.0.1:8088`.

For an existing database from the Rust API, take a backup and use `sh ./scripts/host.sh adopt` instead of `migrate`. The adoption command stops API/web writes, verifies the known schema fingerprint, applies the additive NestJS delta, and restarts the previous services. A fingerprint mismatch stops adoption without switching the app.

Caddy binds port 8088 on all IPv4 interfaces. On another device already on the same private network, open `http://<host-LAN-IP>:8088`; on the private Tailscale network, use `http://<host-Tailscale-IP>:8088`. Do not enable Funnel, port forwarding, a public reverse proxy, or firewall changes for this coursework demo. Tailscale access remains private to your tailnet; no Tailscale preferences are altered here.

## Service boundaries and persistence

Only Caddy publishes a host port. PostgreSQL, NestJS, and the SvelteKit server have no host port mapping; service traffic uses private Docker networks. The SvelteKit proxy reads the browser request host/protocol from Caddy's forwarded headers and sends the API request to `http://api:8080`, preserving the browser `Origin` and CSRF checks. SvelteKit trusts these forwarded values because Caddy is the only container on the web-facing network; the app containers use a private core network. The API binds on the container network and waits for a healthy database. App startup never migrates or seeds. Run `sh ./scripts/host.sh migrate` before app startup; optional demo seed is a separate command on an empty database. Node SSR starts after the API health check succeeds. Compose health-gated startup follows [Docker Compose's dependency health checks](https://docs.docker.com/compose/how-tos/startup-order/), and the proxy headers follow [SvelteKit's adapter-node guidance](https://svelte.dev/docs/kit/adapter-node) and [Caddy's reverse_proxy defaults](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

PostgreSQL data lives in the named Docker volume `inpacare_postgres_data`. Ordinary `docker compose stop`, `start`, and `up -d` preserve it. The `scripts/host.sh` command never removes or initializes a pre-existing volume. Do not use `docker compose down -v` unless you intend to erase the demo database.

## Back up and restore

Run these commands from the project root so Compose uses the existing `.env.local` and project name. Create a private backup before any restore:

```sh
mkdir -p backups
umask 077
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml exec -T db pg_dump -U inpacare -d inpacare -Fc > "backups/inpacare-$(date +%Y%m%d-%H%M%S).dump"
```

To restore an existing archive, stop API/web writes first, restore to the existing demo database, then restart them. `--clean` replaces matching database objects, so make a fresh backup immediately before running it:

```sh
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml stop web api
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml exec -T db pg_restore --clean --if-exists --no-owner -U inpacare -d inpacare < backups/your-backup.dump
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml start api web
```

Keep `.env.local` and database backups private. Add exact browser origins to `TRUSTED_ORIGINS` in `.env.local`; mutating requests including login require an allowed origin. Optional demo seeding requires `SEED_DEMO_PASSWORD` and refuses a non-empty users table. This stack is for coursework review, not hospital deployment. Do not load real patient data or reuse its local demo identity for real operations.

## Stop and inspect

```sh
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml ps
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml logs --tail=100
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml stop
```

Stopping leaves the named database volume intact. `sh ./scripts/host.sh` rebuilds and restarts the stack when code changes. The ignored local environment file supplies Compose substitutions as described in [Docker Compose's interpolation reference](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
