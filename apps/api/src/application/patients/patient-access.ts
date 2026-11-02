import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
export interface PatientAccess {
  canRead(actor: Actor, patientId: string): Promise<boolean>;
}
export async function canReadPatient(
  access: PatientAccess,
  actor: Actor,
  patientId: string,
) {
  if (!(await access.canRead(actor, patientId))) throw DomainError.notFound();
}
