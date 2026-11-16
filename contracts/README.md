# API contract

`openapi.json` describes the NestJS API and drives the frontend TypeScript declarations. Controllers, DTOs, transactional services and PostgreSQL constraints implement validation and behavior. Explicit response projections keep persistence fields off the wire.

Run `npm run types:api` after editing the specification. `openapi-typescript` writes `apps/web/src/lib/generated/api.d.ts`. `npm run test:api:contract` checks compiled routes, DTO properties, statuses and guards; `npm run test:api:http-contract` validates live JSON responses against the schemas using the disposable API URL in `INPACARE_TEST_URL`. Generation alone does not verify server behavior.

Authentication uses an opaque `session` cookie and a readable `csrf_token` cookie. Mutations need a matching `Origin`; authenticated mutations also need `X-CSRF-Token`. Session creation returns `user.csrfToken`. IDs are opaque strings, dates use ISO dates, timestamps use RFC 3339, and money uses decimal strings.

`POST /cycles` accepts either an existing `placementId` or `newPlacement: { roomId, startsOn, endsOn }`. They are mutually exclusive. A successful placement creates an `assigned` cycle; omitting both creates a `pending` cycle. Starting care remains a separate versioned change to `in_care`. Clients should use the returned status instead of assuming every new cycle is pending.

Send a client-generated UUID in `requestId` and retain it when retrying the same form. The same nurse, ID, and input replay the original creation response, even if the cycle has since advanced; read the detail endpoint for its current state. Reusing an ID with different input returns 409. Failed transactions retain no creation result. The field is optional for existing clients, which still receive a conflict for a second active cycle. Run migration `CycleCreationRequests1793577600005` before deploying the updated API and form.

This contract covers the synthetic local demo. It does not claim real hospital readiness, external payer or payment connectivity, or complete parity with each Figma state.
