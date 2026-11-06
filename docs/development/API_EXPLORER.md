# Shared API explorer

Open `/api-docs` on the same origin as InpaCare, after signing in through `/login`.
The app sidebar includes an **API Explorer** link. The explorer header links back
to the app and to the native host's pgAdmin installation at `/db/`.

Swagger UI renders the existing `contracts/openapi.json`; there is no second API
definition to maintain. Both the page and `/api-docs/openapi.json` require a valid
InpaCare session and return private, non-cacheable responses. UI assets are bundled
locally from a pinned npm dependency, without a CDN or external spec validator.

Expand an operation, select **Try it out**, fill in its parameters, and select
**Execute**. Requests use the existing session cookie and attach the current
`csrf_token` cookie as `X-CSRF-TOKEN` for mutations. Server-side role checks,
patient scope, version checks and validation continue to apply. Requests to
another origin are rejected by the explorer. Signing out or expiry invalidates
further API requests; sign in again before continuing.

Writes execute against the running application's database. Prefer disposable
synthetic records for experiments. To add a patient identity before an inpatient
recap or medical record, use a permitted database editor account in pgAdmin;
the existing API does not register new patient identities.

The pgAdmin login is separate from the InpaCare account. See
`docs/deployment/SHARED_TOOLS.md` for provisioning individual database accounts
and assigning viewer or editor permissions on the native host.

## Local checks

```sh
npm run test --workspace @inpacare/web -- src/routes/api-docs
npm run check:web:architecture
npm run check --workspace @inpacare/web
npm run build --workspace @inpacare/web
```
