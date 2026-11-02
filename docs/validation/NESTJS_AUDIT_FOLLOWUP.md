# Modul 2 audit follow-up

This closes the seven findings from the review of `3f7d58c`. The original Modul 2 capture remains the requirement baseline (SHA-256 `9a1023bbe4c391d5baf20aa865da0923fe5fb2462c9c7d01ebd8656a963716ad`); live document export was unavailable during review. These targeted regressions do not certify every source row.

## Changes and evidence

- Clinical correction now requires a submitted, nonblank reason in its DTO, UI and contract; the exact trimmed explanation is stored with before/after values. Covered by `audit-validation.test.cjs`, the clinical correction PostgreSQL test and the doctor E2E workflow.
- Pending-cycle archival records actor, reason, time and full before/after snapshots in `cycle_history` in the same transaction. A failing audit insert rolls back archival. Whitespace-only explanations are rejected.
- Task updates recheck the locked placement's active status and complete interval even when only notes change. The assigned user's and nurse profile's active flags are rechecked under shared row locks. Regression tests deactivate each flag and cancel/shorten the placement, then verify no mutation or history entry was committed.
- Claim results are stored in nullable `invoices.claim_result varchar(120)` and returned separately from the existing `claimVerified` flag. New invoices have no result. An explicit negative result preserves its actor/time and audit trail; the UI edits the result instead of toggling a flag. PostgreSQL and reload E2E tests cover this distinction.
- Task detail includes the creator and displays the history API's before/after values. The task E2E workflow checks both.
- CREATE task history records the complete inserted row, including its initial title, notes, schedule, priority, patient/room, creator and database defaults. The real PostgreSQL regression asserts the snapshot contents.
- Room list/detail share one projection and aggregate query prefix. Existing HTTP and E2E room workflows pass.

## Schema and compatibility

Run the new explicit `AuditAlignment1793577600002` migration before starting the updated API. Existing migrations were not edited. Adoption of both a Rust baseline and the earlier two-migration Nest schema is tested. Already-true legacy verification flags receive `Terverifikasi (data lama)`; false flags keep a NULL result because their historical outcome cannot be inferred. Existing financial totals and history remain intact. Historical incomplete task snapshots are retained rather than reconstructed from current values.

Medical PATCH bodies now require `reason`; claim-verification bodies additionally require `result` (maximum 120 characters). The web callers, OpenAPI contract and generated declaration were updated together. Upgrade the API and web release together. Database downgrade must not discard new results or audit entries; use a forward fix or the documented backup boundary.

## Verification

- API typecheck/build and frontend typecheck/production build pass; Svelte reports zero errors and warnings.
- 12 unit/compiled-contract tests pass, including new HTTP-boundary DTO regressions.
- 10 real PostgreSQL integration tests pass, including archival rollback and upgrade from the earlier Nest schema.
- 16 HTTP workflows and live response JSON-schema validation pass.
- 11 Playwright workflows pass on fresh synthetic fixtures, using Edge locally.
- Session restart and real PostgreSQL backup/restore rehearsal pass.
- The 17-entity, 122-attribute, 53-controller-method and 30-relationship traceability check passes. Claim-result mapping now resolves to its actual text column.

No shared database or live deployment was changed. Linux packaging and remote CI are separate gates reported by the PR checks.
