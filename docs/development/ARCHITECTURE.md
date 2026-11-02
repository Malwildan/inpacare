# Backend architecture

The NestJS backend uses a layer-first layout. Each layer groups its files by business module. Public routes, payloads, database tables and migration identities remain the same as the NestJS rebuild baseline.

```text
apps/api/src/
  domain/             business rules and task behavior model; plain TypeScript
  application/        use cases, input types and persistence ports
  infrastructure/     TypeORM entities, SQL stores, transactions, migrations and security
  presentation/http/  controllers, request DTOs, guards, middleware and error filter
  composition/        NestJS modules and factory providers
  database/cli.ts     stable operational CLI entry point
  main.ts             HTTP bootstrap
  app.module.ts       application composition root
```

## Follow one operation

For a task update, start with `presentation/http/tasks/tugas.controller.ts`, then `application/tasks/tugas.use-cases.ts`. The use case obtains the locked task and placement through a transaction-scoped store, checks version and active PIC, delegates field/status changes to `domain/tasks/tugas-perawatan.ts`, and stores both the change and its history before returning the authoritative result.

`infrastructure/database/repositories/tasks/typeorm-tugas.store.ts` owns its SQL. `application/tasks/tugas-store.port.ts` describes the operations the use case needs without exposing `EntityManager`, SQL strings or HTTP DTOs. No repository starts a transaction.

The task model is a behavior model with a private state snapshot and public revision methods. Its ORM counterpart is `infrastructure/database/entities/tasks/tugas-perawatan.orm-entity.ts`. Other domain files hold focused rules such as invoice arithmetic or inclusive placement dates. Reference and audit tables do not receive duplicate domain classes without behavior to justify them.

## Domain models and ORM entities

Paths below are relative to `src/domain/` and `src/infrastructure/database/entities/` respectively. ORM entities preserve the existing columns and relationships; the domain files express behavior independently of those mappings.

| Business concern | Domain model or rule | Persistence entities |
| --- | --- | --- |
| Actor and permissions | `auth/actor.ts`, `auth/permissions.ts` | `auth/pengguna.orm-entity.ts`, `dokter`, `perawat`, `sesi` |
| Care tasks | `tasks/tugas-perawatan.ts`, `tasks/tugas.policy.ts` | `tasks/tugas-perawatan.orm-entity.ts`, `riwayat-tugas` |
| Room costs | `rooms/room-cost.ts` | `rooms/ruang-inap.orm-entity.ts`, `item-ruangan` |
| Placement dates | `placements/placement-period.ts` | `placements/penempatan-pasien.orm-entity.ts` |
| Care-cycle transitions | `cycles/cycle-transition.ts` | `cycles/rekap-pasien.orm-entity.ts`, `permintaan-siklus`, `audit-siklus` |
| Vital signs | `medical-records/vital-signs.ts` | `medical-records/rekam-medis.orm-entity.ts`, `kondisi-pasien`, `tanda-vital`, `audit-medis` |
| Invoice arithmetic | `billing/invoice-total.ts` | `billing/tagihan.orm-entity.ts`, `detail-tagihan`, `riwayat-tagihan` |
| Patient/reference projections | Application types and patient-access port | `patients/pasien.orm-entity.ts` and reference projections over the entities above |
| Notifications | Application types and notification-store port | `notifications/notifikasi.orm-entity.ts` |

Short persistence names in the table share their row's directory and `.orm-entity.ts` suffix. Reference projections are queries, not additional tables or domain entities.

## Dependency direction

- Domain imports domain code and its existing arithmetic dependency; it imports no NestJS, TypeORM or HTTP code.
- Application imports domain and application contracts. Inputs and outputs are plain TypeScript data. Standard-library helpers generate opaque IDs and facility dates.
- Infrastructure implements application ports using TypeORM, PostgreSQL, Argon2 and opaque sessions. It imports no presentation code.
- Presentation imports application/domain code and HTTP libraries. It performs transport validation and adaptation, with no database access or SQL.
- Composition imports the concrete adapters and use cases, constructs them with factory providers, and binds controllers/guards to the appropriate instances. Application classes have no Nest decorators.

Architecture tests inspect imports, dynamic imports, legacy implementation directories and misplaced SQL. They run with the API unit suite.

## Transactions and errors

`TypeOrmUnitOfWork.run()` creates a transaction context whose stores all receive the same transactional EntityManager. Mutation, audit and mandatory notification writes therefore commit or roll back together. The established patient → sorted rooms → placement → cycle → request → task lock ordering remains in the purpose-named locking operations. Expected versions are compared after acquiring locks.

Domain failures carry an error code and message. The HTTP exception filter translates these into the existing status codes and `{error:{code,message}}` response. PostgreSQL error interpretation stays outside domain/application. Session, origin, CSRF and role checks remain enforced on the server.

## Operations and verification

The supported entry points remain `dist/main.js` and `dist/database/cli.js`. Migration implementations, seed and SQL assets live under `infrastructure/database`; the build copies SQL to the matching compiled directory. Builds clear only the API's generated `dist` directory so removed implementations cannot survive in release artifacts. Startup does not run migrations or seed.

Tests are grouped under `test/architecture`, `test/domain`, `test/application`, `test/contract` and `test/integration`. Domain/application tests need no database or Nest container; locking, rollback and schema/adoption checks use real disposable PostgreSQL. HTTP workflows and Playwright remain the external behavior gates.

`NESTJS_TRACEABILITY.json` records ORM persistence targets separately from business-rule targets. Its counts remain 17 source entities, 122 attributes, 53 controller methods and 30 relationships. A complete mapping is not a claim that every source row has independent behavior coverage.
