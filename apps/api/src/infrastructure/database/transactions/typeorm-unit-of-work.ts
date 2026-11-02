import { DataSource, EntityManager } from "typeorm";
import { UnitOfWork } from "../../../application/shared/unit-of-work.port";
import { TransactionContext } from "../../../application/shared/transaction-context";
import { TypeOrmTaskStore } from "../repositories/tasks/typeorm-tugas.store";
import { TypeOrmRoomStore } from "../repositories/rooms/typeorm-room.store";
import { TypeOrmPlacementStore } from "../repositories/placements/typeorm-placement.store";
import { TypeOrmCycleStore } from "../repositories/cycles/typeorm-cycle.store";
import { TypeOrmMedicalRecordStore } from "../repositories/medical-records/typeorm-medical-record.store";
import { TypeOrmInvoiceStore } from "../repositories/billing/typeorm-invoice.store";
import { TypeOrmAuthStore } from "../repositories/auth/typeorm-auth.store";
import { TypeOrmPatientAccess } from "../repositories/patients/typeorm-patient-access";
export function createTransactionContext(
  manager: EntityManager,
): TransactionContext {
  return {
    tasks: new TypeOrmTaskStore(manager),
    rooms: new TypeOrmRoomStore(manager),
    placements: new TypeOrmPlacementStore(manager),
    cycles: new TypeOrmCycleStore(manager),
    medicalRecords: new TypeOrmMedicalRecordStore(manager),
    billing: new TypeOrmInvoiceStore(manager),
    auth: new TypeOrmAuthStore(manager),
    patients: new TypeOrmPatientAccess(manager),
  };
}
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly database: DataSource) {}
  run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.database.transaction((manager) =>
      work(createTransactionContext(manager)),
    );
  }
}
