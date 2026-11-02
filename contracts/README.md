# API contract

`openapi.json` describes the NestJS API and drives the frontend TypeScript declarations. Controllers, DTOs, transactional services and PostgreSQL constraints implement validation and behavior. Explicit response projections keep persistence fields off the wire.

Run `npm run types:api` after editing the specification. `openapi-typescript` writes `apps/web/src/lib/generated/api.d.ts`. `npm run test:api:contract` checks compiled routes, DTO properties, statuses and guards; `npm run test:api:http-contract` validates live JSON responses against the schemas using the disposable API URL in `INPACARE_TEST_URL`. Generation alone does not verify server behavior.

Authentication uses an opaque `session` cookie and a readable `csrf_token` cookie. Mutations need a matching `Origin`; authenticated mutations also need `X-CSRF-Token`. Session creation returns `user.csrfToken`. IDs are opaque strings, dates use ISO dates, timestamps use RFC 3339, and money uses decimal strings.

This contract covers the synthetic local demo. It does not claim real hospital readiness, external payer or payment connectivity, or complete parity with each Figma state.
