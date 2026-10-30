# API contract

`openapi.json` describes the current demo API from the Axum handlers and module contract notes. It drives TypeScript declarations; the Rust handlers remain the runtime source of validation and behavior. The handlers currently build several responses as SQLx JSON, so check the schema when changing a handler.

Run `npm run types:api` from the repository root after editing the specification. `openapi-typescript` writes `apps/web/src/lib/generated/api.d.ts`. The generator produces TypeScript declarations only; it does not generate or verify Rust server code.

Authentication uses an opaque `session` cookie and a readable `csrf_token` cookie. Mutations need a matching `Origin`; authenticated mutations also need `X-CSRF-Token`. Session creation returns `user.csrfToken`. IDs are opaque strings, dates use ISO dates, timestamps use RFC 3339, and money uses decimal strings.

This contract covers the synthetic local demo. It does not claim real hospital readiness, external payer or payment connectivity, or complete parity with each Figma state.
