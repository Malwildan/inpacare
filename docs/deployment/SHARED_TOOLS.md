# Shared PostgreSQL tools

InpaCare serves pgAdmin at <https://inpacare.hailmary.my.id/db/>. It runs as a
single-process Gunicorn user service, bound only to `127.0.0.1:5050`, behind the
existing Caddy HTTPS site. PostgreSQL remains private on its existing localhost
port. No DNS or firewall changes were made; Caddy adds only the `/db` gateway
route, with no application source route changes.

## Install and inspect

From the project root:

```sh
scripts/setup-pgadmin.sh
python3 scripts/pgadmin.py status
```

The pinned runtime is pgAdmin 4 `9.19` in `.data/pgadmin/venv`, with Gunicorn
`23.0.0`. If its wheel omits generated frontend files, the installer builds the
matching official 9.19 source with checksum-pinned inputs; this requires Node.js
and network access on that first repair. Complete existing bundles are reused.
SQLite settings, sessions, storage, logs, and credentials are under
`.data/pgadmin/`, outside release directories. The owner pgAdmin credential file
is `.data/pgadmin/owner-credentials.txt`; the owner database editor credential
is stored separately in `.data/pgadmin/owner-db-password.txt`. Both files are
owner-only. The owner DB server registration contains the dedicated editor
username and does not store a password. Each teammate uses their own PostgreSQL
login. pgAdmin server definitions are personal to each pgAdmin account. The
install command pre-registers the DB connection for the owner, and the teammate
command adds that connection to each new account with its dedicated SQL login;
pgAdmin prompts each user for their DB password because the server definition
does not store one.

## Add a teammate

```sh
python3 scripts/pgadmin.py add-user teammate@example.com viewer
python3 scripts/pgadmin.py add-user colleague@example.com editor
```

The command creates an individual pgAdmin `User` and a matching database login.
It prints only the private credential-file path. Deliver the credentials to the
teammate out of band. Never place these files in source control or paste their
contents into logs or chat. To change an individual's database access, retire
their existing pgAdmin and PostgreSQL login before provisioning that identity
with the new access class.

Viewer and editor roles can access only reviewed public app tables:
`cycle_requests`, `cycles`, `doctors`, `invoice_lines`, `invoices`,
`medical_records`, `notifications`, `nurses`, `observations`, `patients`, `placements`,
`room_items`, `rooms`, `tasks`, and `vital_signs`. Viewer has `SELECT` only.
Editor has `SELECT`, `INSERT`, `UPDATE`, and `DELETE` plus sequence use. Neither
class can access `users`, `sessions`, migrations, or history tables, create
persistent or temporary objects, truncate tables, or administer the cluster.
PostgreSQL's default `PUBLIC` temporary-object permission is revoked for this
database; the application login keeps its existing temporary permission. New
tables are excluded until reviewed and explicitly added by the permissions
synchronizer. Schema migrations remain application owned.

## Service and gateway

```sh
systemctl --user status inpacare-pgadmin.service
systemctl --user restart inpacare-pgadmin.service
```

The Caddy host config backup is `.data/pgadmin/backups/inpacare.caddy.before-pgadmin`.
The installed user unit is `~/.config/systemd/user/inpacare-pgadmin.service`.
The repository unit template is `ops/native/inpacare-pgadmin.service`.

The `/db` reverse proxy trusts only the published Cloudflare proxy ranges, so
pgAdmin's protected session sees the visitor's forwarded address consistently.
Cookie protection, authentication and CSRF remain enabled. Refresh
`CLOUDFLARE_PROXY_CIDRS` and the site template if Cloudflare changes those ranges;
keep the trust configuration scoped to the pgAdmin route.

## Self-check

Run `python3 scripts/check-pgadmin.py` to check viewer/editor restrictions,
including denied auth/session/history/migration table access, persistent and
temporary DDL, and TRUNCATE;
one synthetic `room_items` row is inserted and deleted to verify editor writes.
The HTTP check fetches the actual referenced scripts and stylesheets, requiring
nonempty HTTP 200 responses with the correct MIME types. It checks login and
session retention through both the local gateway and the public Cloudflare URL,
plus prefix handling and Secure/HttpOnly/SameSite cookie flags over HTTPS. Its
sanitized observations are saved in `.data/pgadmin/performance-verification.json`.
The checker creates two
disposable pgAdmin accounts and matching SQL logins, then removes them in a
`finally` cleanup. It intentionally fails if it cannot confirm all controls.

## Operational references

- [pgAdmin 4 9.19 Python package](https://www.pgadmin.org/download/pgadmin-4-python/)
- [pgAdmin 4 9.19 server deployment](https://www.pgadmin.org/docs/pgadmin4/9.19/server_deployment.html)
- [pgAdmin 4 9.19 user management](https://www.pgadmin.org/docs/pgadmin4/9.19/user_management.html)
