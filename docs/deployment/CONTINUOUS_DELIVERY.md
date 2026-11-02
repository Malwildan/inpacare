# CI and automatic native demo updates

Every pull request runs applicable frontend, contract, and API checks. Pushes to
`main`, including merged PRs, run all checks. Manual CI runs also run the full
suite; the daily scheduled run checks for regressions. The API gate includes
ESLint, TypeScript checks, unit/contract tests, and PostgreSQL integration tests.
A dependency audit blocks high and critical advisories before release packaging.

After the frontend, NestJS, and disposable PostgreSQL checks pass, CI packages
the compiled Node API and adapter-node frontend. It installs production
dependencies, explicitly migrates and seeds disposable PostgreSQL, checks both
web listeners, and runs the API workflows against that exact package. Changes to CI or its
scripts exercise this packaging job in PRs as well.

Successful `main` pushes and manual runs on `main` publish a release named
`native-<full commit SHA>` with `inpacare-linux-x86_64.tar.gz` and `SHA256SUMS`.
Scheduled runs and PRs never publish releases. The publication job alone has
`contents: write`; tests keep read-only permissions. Draft releases keep partial
uploads out of the update channel, and an obsolete commit is not published as
the latest release.

## Enable CD on the existing host

The public repository uses a pull-based updater: the native Linux host downloads
published releases over HTTPS. No GitHub token, inbound SSH, or self-hosted
Actions runner is needed on the demo host. GitHub documents anonymous access to
[public releases](https://docs.github.com/en/rest/releases/releases#get-the-latest-release).

The host must already have the runtime and services described in
[native hosting](NATIVE_HOSTING.md), Python **3.12+**, and an active systemd user
manager. From a checkout of this version, run as the same user that owns the demo:

```sh
bash scripts/install-native-cd.sh /absolute/path/to/existing/inpacare
```

The installer copies the updater into the existing app's `.deploy/` directory,
adds API/web service overrides pointing at `.deploy/current`, and enables the
`inpacare-update.timer` user timer. It leaves the running app in place. The first
published native release activates the new service paths. PostgreSQL, the tunnel,
private environment, and existing credentials stay in the original installation.

The timer checks two minutes after boot and five minutes after the previous
check finishes. An offline host catches up after it comes online. User timers
need an active user manager; see the native guide's lingering instructions.

```sh
systemctl --user list-timers inpacare-update.timer --no-pager
journalctl --user -u inpacare-update.service -n 50 --no-pager
python3 /absolute/path/to/inpacare/.deploy/deploy-native.py \
  --root /absolute/path/to/inpacare --check
systemctl --user start inpacare-update.service
```

`--check` only discovers the release and does not modify the installation.
The installed updater is a separate copy; rerun the installer to upgrade it.
Use the timer to update application files after CD is enabled.

Branch renaming does not upgrade the updater already installed on the host.
When switching from Rust, run the installer from the verified NestJS release
(it includes `scripts/install-native-cd.sh`, `scripts/deploy-native.py`, and the
timer units), then complete database adoption below before activating the release.
Do not reuse a Rust updater to install a NestJS archive.

After activation, check `https://YOUR_DOMAIN/__version`: its `revision` must match
the full `main` commit SHA and `backend` must be `nestjs`. This uncached endpoint
reports the packaged frontend revision; also verify the API service runs
`node apps/api/dist/main.js` from that same release and `/health` succeeds locally.

## Existing Rust database adoption

On the first update of a non-empty Rust database, the updater prepares the verified release package and checks for the NestJS baseline marker before it stops any service. If the marker is missing, it refuses the update and reports the prepared path under `.deploy/releases/`. Disable the timer, take a fresh database backup, and perform the one-time fingerprint-checked adoption in a maintenance window:

```sh
ROOT=/absolute/path/to/inpacare
RELEASE="$ROOT/.deploy/releases/FULL_COMMIT_SHA"
systemctl --user disable --now inpacare-update.timer
mkdir -p "$ROOT/.data/backups"
chmod 700 "$ROOT/.data/backups"
set -a
. "$ROOT/.data/native.env"
set +a
"$ROOT/.runtime/postgres/usr/lib/postgresql/16/bin/pg_dump" --format=custom \
  --file="$ROOT/.data/backups/pre-adoption.dump" "$DATABASE_URL"
systemctl --user stop inpacare-web inpacare-api
export PATH="$ROOT/.runtime/node/bin:$PATH"
cd "$RELEASE"
npm run migration:adopt --workspace @inpacare/api
systemctl --user start inpacare-api inpacare-web
systemctl --user enable --now inpacare-update.timer
```

If the schema fingerprint check fails, keep the release pointer unchanged and do not run the new API; restart the previous app and reconcile the schema separately. After successful adoption, the next updater run applies any pending migrations explicitly before starting the candidate API.

## Activation, backups, and recovery

The updater accepts only the latest native release matching the current `main`
commit. It verifies the archive checksum, commit marker, required files, and safe
archive paths before installing production dependencies into a new release
directory. A file lock prevents concurrent updates; preparation leaves the
running app available.

Before activation, it writes an owner-only PostgreSQL backup under
`.data/backups/pre-update-*.dump`, stops API/web writes, then runs the release
migration explicitly. A dependency-install failure leaves the running version
active; a migration failure restarts the previous version. After migration succeeds,
it atomically switches the current-release symlink, starts API/web, and
checks the API and HTTP/HTTPS-origin web listeners. The database and tunnel
services keep running; expect only the brief API/web restart interruption.

If activation fails, the previous application pointer is restored and its
services are started. **This does not reverse a completed database migration or
restore a database backup.** Keep migrations additive and compatible with the previous app version;
restoring a backup is a separate, deliberate recovery step that can discard
writes made after that backup. Check both service health and logs after a failure.

Pause automatic updates before any manual recovery:

```sh
systemctl --user disable --now inpacare-update.timer
```

Wait for any active `inpacare-update.service` run to finish. Select a known good
directory from `.deploy/releases/` (or the original installation for the first
rollback), then switch it while API/web are stopped:

```sh
cd /absolute/path/to/inpacare
systemctl --user stop inpacare-web inpacare-api
ln -s "$PWD/.deploy/releases/FULL_COMMIT_SHA" .deploy/current-recovery
mv -Tf .deploy/current-recovery .deploy/current
systemctl --user start inpacare-api inpacare-web
```

Release directories and database backups are retained for inspection and
recovery. Review disk use periodically; never remove the active release,
`.data`, `.runtime`, or the only usable backup. Re-enable the timer when ready:
`systemctl --user enable --now inpacare-update.timer`.
