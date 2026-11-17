# Editable room-charge autofill

The desktop and mobile screenshots use synthetic patients in an isolated rendering of `BillingPage`, with the real Select, dialog, and rupiah input components. The billing service is mocked: these captures and `component-smoke.json` verify component behavior and submitted payloads, not database persistence or the discharge handoff in issue #68.

The draft uses the current room rate and the scheduled placement period, including arrival and departure dates. Admisi can edit quantity and price, add/remove charges, or enter a manual invoice without placement data. Room inventory is excluded.

## Automated checks

```powershell
npm run check
npm run test --workspace apps/web -- src/lib/features/billing/application/billing.test.ts src/lib/features/billing/infrastructure/http-billing.test.ts
node scripts/check-web-architecture.mjs billing
```

The targeted suite passes 7 tests. API TypeScript and Svelte checks pass with no errors or warnings. The isolated component smoke test covers the 15 scenarios recorded in `component-smoke.json`, including cancelled context switches, delayed responses for the same patient, missing rooms, failed context loading, and exact create payloads. Source SHA-256 values in that receipt identify the component version exercised.

## Synthetic captures

- [Desktop dialog](desktop.png)
- [Mobile line editor](mobile.png)
