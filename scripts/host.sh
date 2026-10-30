#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$ROOT/.env.local"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
	printf '%s\n' 'Docker is required. Install Docker Desktop or Docker Engine and start it first.' >&2
	exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
	printf '%s\n' 'Docker Compose v2 is required (`docker compose`).' >&2
	exit 1
fi
if ! docker info >/dev/null 2>&1; then
	printf '%s\n' 'The Docker daemon is not reachable. Start Docker and run this script again.' >&2
	exit 1
fi

if [ -L "$ENV_FILE" ]; then
	printf '%s\n' '.env.local must be a regular private file, not a symbolic link.' >&2
	exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
	if docker volume inspect inpacare_postgres_data >/dev/null 2>&1; then
		printf '%s\n' 'An InpaCare database volume already exists but .env.local is missing. Restore its original .env.local; this script will not replace database credentials.' >&2
		exit 1
	fi
	if ! command -v openssl >/dev/null 2>&1; then
		printf '%s\n' 'OpenSSL is needed to create a local database password.' >&2
		exit 1
	fi
	umask 077
	tmp_file="$ENV_FILE.tmp.$$"
	trap 'rm -f "$tmp_file"' 0 HUP INT TERM
	{
		printf 'POSTGRES_PASSWORD='
		openssl rand -hex 32
	} > "$tmp_file"
	mv "$tmp_file" "$ENV_FILE"
	trap - 0 HUP INT TERM
fi
chmod 600 "$ENV_FILE"

compose() {
	docker compose \
		--project-name inpacare \
		--project-directory "$ROOT" \
		--env-file "$ENV_FILE" \
		--file "$ROOT/ops/compose.yaml" \
		"$@"
}

compose config --quiet
compose up --detach --build

attempt=0
while [ "$attempt" -lt 180 ]; do
	ready=true
	for service in db api web; do
		container_id=$(compose ps --all --quiet "$service")
		if [ -z "$container_id" ]; then
			ready=false
			break
		fi
		health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)
		if [ "$health" != healthy ]; then
			ready=false
			break
		fi
	done
	if [ "$ready" = true ]; then
		caddy_id=$(compose ps --all --quiet caddy)
		caddy_state=$(docker inspect --format '{{.State.Status}}' "$caddy_id" 2>/dev/null || true)
		if [ "$caddy_state" = running ]; then
			break
		fi
	fi
	attempt=$((attempt + 1))
	sleep 1
done

if [ "$attempt" -ge 180 ]; then
	compose ps
	printf '%s\n' 'The stack did not become healthy within 180 seconds. Inspect service logs with docker compose logs.' >&2
	exit 1
fi

printf '%s\n' 'InpaCare demo is ready at http://127.0.0.1:8088'
printf '%s\n' 'For access from another device, use this Mac/Linux host’s LAN or private Tailscale IP with port 8088.'
printf '%s\n' 'Only Caddy is published on all interfaces; PostgreSQL, the API, and the web server have no host-published ports.'
