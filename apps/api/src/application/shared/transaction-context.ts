import { TaskStore } from "../tasks/tugas-store.port";
import { RoomStore } from "../rooms/room-store.port";
import { PlacementStore } from "../placements/placement-store.port";
import { CycleStore } from "../cycles/cycle-store.port";
import { MedicalRecordStore } from "../medical-records/medical-record-store.port";
import { InvoiceStore } from "../billing/invoice-store.port";
import { AuthStore } from "../auth/auth-store.port";
import { PatientAccess } from "../patients/patient-access";
export interface TransactionContext {
  tasks: TaskStore;
  rooms: RoomStore;
  placements: PlacementStore;
  cycles: CycleStore;
  medicalRecords: MedicalRecordStore;
  billing: InvoiceStore;
  auth: AuthStore;
  patients: PatientAccess;
}
