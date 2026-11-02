# NestJS implementation and contract status

## Scope

This status records the implementation branch after the Rust-to-NestJS route work. `contracts/openapi.json` is the HTTP contract for the NestJS API. The generated web declaration is produced with `npm run types:api`. The traceability inventory now has concrete mappings; behavior evidence is recorded by real test suites and remains explicitly group-level where an individual assertion is not available.

## Contract changes

- The contract now inventories every compiled Nest route, including session deletion, room and item mutations, placement edit/cancel, full task updates and filters, observation correction, cycle dashboard/request detail/delete, invoice patient context/line mutations/claim verification, and `/health`.
- Session creation and deletion document `Set-Cookie`; mutation operations carry Origin and CSRF requirements, and authenticated route role metadata is exposed as `x-controller-roles`.
- DTO body properties and required fields are checked against compiled class-validator metadata, including chained `$ref` schemas. The route check also compares registered controller routes, HTTP methods, success status codes, roles, and the global session guard.
- The OpenAPI success status codes preserve Nest behavior and the legacy contract. In particular, room/task create and selected observation/session operations return 200; placement, cycle, and invoice creation use 201 where configured/defaulted.

## Traceability status

`NESTJS_TRACEABILITY.json` maps all 17 source entities, 122 attributes, 53 controller methods, and 30 relationships. Attribute target tables, columns, PostgreSQL types, nullability, TypeScript property types, and visibility are resolved from compiled TypeORM metadata and entity declarations. Method rows include target TypeScript signatures and visibility, current route operations, roles, web components and named handlers. Relationship rows name the owning FK and referenced key; cycle-to-room is explicitly a placement hop. `mappingComplete` means the source row has a concrete, validated mapping, not that behavior equivalence has been proven.

Persistence uses TypeORM repositories, `DataSource`/`EntityManager` transactions, and explicit SQL for aggregate or lock-sensitive projections. This is an intentional adaptation from Rust query/repository structure. The source UML marks attributes private while most TypeORM persistence members are public; this visibility difference is recorded per attribute. `Pengguna.passwordHash` maps to a private ORM field through public accessors. The source `VARCHAR` widths are generally represented by PostgreSQL `text`, so maximum widths are documented as storage deviations with DTO/domain validation where present. `TINYINT(1)` maps to `boolean`, unsigned integers to signed PostgreSQL integers with domain bounds, and JSON payloads use `jsonb` where applicable.

Profile references retain legacy user-facing columns while adding `rooms.pic_nurse_id`, `cycles.doctor_profile_id`, `cycles.nurse_profile_id`, `tasks.pic_nurse_id`, `observations.nurse_profile_id`, and `medical_records.doctor_profile_id`. `invoice_lines.room_item_id` replaces the prior item reference. Profile adapter columns are nullable to preserve legacy/unmapped rows; triggers reject unmapped new required clinical references. `doctors.user_id` and `nurses.user_id` are unique FKs to `users.id`. `vital_signs.observation_id` is unique, enforcing at most one vital-sign row per observation. These deviations are explicit in the relationship rows.

Verified checks: 10 unit/compiled-contract checks, 5 PostgreSQL integration checks, 16 HTTP workflows, 1 live JSON-schema check, and 10 E2E checks on fresh fixtures. Session persistence across a process restart and a real PostgreSQL backup/restore rehearsal also passed. See [verification evidence](../validation/nestjs-rebuild.json) and [frozen decisions](NESTJS_DECISIONS.md). Traceability rows cite actual suite/test names and state their coverage limits; the counts do not certify every attribute or relationship individually.

## Validation

Run `node scripts/check-nestjs-traceability.mjs` to validate the 17/122/53/30 inventory; resolve every mapped column/type/nullability against compiled TypeORM metadata; check TypeScript declarations/signatures and UI references; confirm relationship direction, FKs, uniqueness, nullability, and multi-hop links against migrations; and reject remaining placeholder fields. It does not assert behavioral completeness.

Run `npm run types:api` to regenerate `apps/web/src/lib/generated/api.d.ts` from the contract. Run `npm run test:api:contract` to compare the generated Nest route metadata and DTO validation metadata against the contract.

Behavior parity remains open at the individual source-row level. Grouped suite results are recorded as evidence without claiming each field or method was directly exercised.

## Audit follow-up

The review of `3f7d58c` found seven concrete gaps despite passing mapping checks. Their fixes and fresh regression evidence are recorded in [Modul 2 audit follow-up](../validation/NESTJS_AUDIT_FOLLOWUP.md). Current verification: 12 unit/contract tests, 10 PostgreSQL integration tests, 16 HTTP workflows, 1 live JSON-schema check and 11 E2E workflows. Historical verification counts above describe the original rebuild acceptance.
