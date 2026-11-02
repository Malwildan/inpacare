import { EntityManager } from "typeorm";
import { Actor } from "../../../../domain/auth/actor";
import { PatientAccess } from "../../../../application/patients/patient-access";
export class TypeOrmPatientAccess implements PatientAccess {
  constructor(private readonly manager: EntityManager) {}
  async canRead(actor: Actor, patientId: string): Promise<boolean> {
    const [row] = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM patients p WHERE p.id=$1 AND ($2<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$3))) AS allowed`,
      [patientId, actor.role, actor.id],
    );
    return Boolean(row?.allowed);
  }
}
