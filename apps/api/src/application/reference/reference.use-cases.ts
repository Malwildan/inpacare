import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
import { PatientAccess, canReadPatient } from "../patients/patient-access";
import { PatientFilter, ReferenceStore } from "./reference-store.port";
export class ReferenceUseCases {
  constructor(
    private readonly store: ReferenceStore,
    private readonly patientAccess: PatientAccess,
  ) {}
  patients(actor: Actor, filter: PatientFilter) {
    return this.store.patients(actor, filter);
  }
  staff() {
    return this.store.staff();
  }
  async reference(actor: Actor) {
    const [patients, staff, rooms, placements] = await Promise.all([
      this.store.patients(actor, { search: "", limit: 100, offset: 0 }),
      this.store.staff(),
      this.store.rooms(),
      this.store.activePlacements(actor),
    ]);
    return { patients: patients.items, staff: staff.items, rooms, placements };
  }
  async context(actor: Actor, patientId: string) {
    await canReadPatient(this.patientAccess, actor, patientId);
    const context = await this.store.patientContext(patientId);
    if (!context) throw DomainError.notFound();
    return context;
  }
}
