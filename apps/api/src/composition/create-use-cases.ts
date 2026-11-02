import { DataSource } from "typeorm";
import { AuthUseCases } from "../application/auth/auth.use-cases";
import { Argon2PasswordHasher } from "../infrastructure/security/password-hasher";
import { OpaqueSessionTokens } from "../infrastructure/security/session-store";
import { LoginAttempts } from "../infrastructure/security/login-attempts";
import { TugasUseCases } from "../application/tasks/tugas.use-cases";
import { RuangInapUseCases } from "../application/rooms/ruang-inap.use-cases";
import { AssignRuanganUseCases } from "../application/placements/assign-ruangan.use-cases";
import { CyclesUseCases } from "../application/cycles/cycles.use-cases";
import { RekamMedisUseCases } from "../application/medical-records/rekam-medis.use-cases";
import { TagihanUseCases } from "../application/billing/tagihan.use-cases";
import { ReferenceUseCases } from "../application/reference/reference.use-cases";
import { NotificationsUseCases } from "../application/notifications/notifications.use-cases";
import { TypeOrmReferenceStore } from "../infrastructure/database/repositories/reference/typeorm-reference.store";
import { TypeOrmNotificationStore } from "../infrastructure/database/repositories/notifications/typeorm-notification.store";
import {
  createTransactionContext,
  TypeOrmUnitOfWork,
} from "../infrastructure/database/transactions/typeorm-unit-of-work";
// Runtime and PostgreSQL integration tests use the same wiring.
export function createUseCases(database: DataSource) {
  const stores = createTransactionContext(database.manager);
  const unitOfWork = new TypeOrmUnitOfWork(database);
  return {
    auth: new AuthUseCases(
      stores.auth,
      unitOfWork,
      new Argon2PasswordHasher(),
      new OpaqueSessionTokens(),
      new LoginAttempts(),
    ),
    tasks: new TugasUseCases(stores.tasks, unitOfWork),
    rooms: new RuangInapUseCases(stores.rooms, unitOfWork),
    placements: new AssignRuanganUseCases(stores.placements, unitOfWork),
    cycles: new CyclesUseCases(stores.cycles, unitOfWork),
    medicalRecords: new RekamMedisUseCases(
      stores.medicalRecords,
      unitOfWork,
      stores.patients,
    ),
    billing: new TagihanUseCases(stores.billing, unitOfWork),
    reference: new ReferenceUseCases(
      new TypeOrmReferenceStore(database.manager),
      stores.patients,
    ),
    notifications: new NotificationsUseCases(
      new TypeOrmNotificationStore(database.manager),
    ),
  };
}
