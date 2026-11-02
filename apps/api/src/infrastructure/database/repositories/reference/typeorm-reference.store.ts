import { EntityManager } from "typeorm";
import { Actor } from "../../../../domain/auth/actor";
import {
  PatientContext,
  PatientFilter,
  PatientSummary,
  ReferenceStore,
  RoomReference,
  StaffSummary,
  PlacementReference,
} from "../../../../application/reference/reference-store.port";
const patientProjection = `jsonb_build_object('id',p.id,'name',p.name,'medicalRecordNo',p.medical_record_no,'birthDate',p.birth_date,'gender',p.gender,'bpjs',p.bpjs,'bpjsNumber',p.bpjs_number)`;
const patientScope = `($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$2))`;
const patientWhere = `${patientScope} AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%')`;
export class TypeOrmReferenceStore implements ReferenceStore {
  constructor(private readonly manager: EntityManager) {}
  async patients(actor: Actor, filter: PatientFilter) {
    const args = [actor.role, actor.id, filter.search.trim()];
    const rows = await this.manager.query(
      `SELECT ${patientProjection} AS value FROM patients p WHERE ${patientWhere} ORDER BY p.name,p.id LIMIT $4 OFFSET $5`,
      [...args, filter.limit, filter.offset],
    );
    const [count] = await this.manager.query(
      `SELECT count(*)::int AS total FROM patients p WHERE ${patientWhere}`,
      args,
    );
    return {
      items: rows.map((row: { value: PatientSummary }) => row.value),
      total: count.total as number,
    };
  }
  async staff() {
    const items = (await this.manager.query(
      `SELECT u.id,u.name,u.role,u.coordinator,(u.active AND coalesce(n.active,true)) AS active FROM users u LEFT JOIN nurses n ON n.user_id=u.id WHERE u.active AND u.role IN ('DOKTER','PERAWAT') ORDER BY u.name,u.id LIMIT 100`,
    )) as StaffSummary[];
    return { items, total: items.length };
  }
  rooms() {
    return this.manager.query(
      `SELECT id,name,room_class AS "roomClass",capacity,status,pic_id AS "picId",daily_rate::text AS "dailyRate",version FROM rooms WHERE deleted_at IS NULL ORDER BY name,id LIMIT 100`,
    ) as Promise<RoomReference[]>;
  }
  activePlacements(actor: Actor) {
    return this.manager.query(
      `SELECT p.id,p.patient_id AS "patientId",pt.name AS "patientName",p.room_id AS "roomId",r.name AS "roomName",to_char(p.starts_on,'YYYY-MM-DD') AS "startsOn",to_char(p.ends_on,'YYYY-MM-DD') AS "endsOn",p.status,p.version FROM placements p JOIN patients pt ON pt.id=p.patient_id JOIN rooms r ON r.id=p.room_id WHERE p.status='active' AND NOT EXISTS(SELECT 1 FROM cycles c WHERE c.placement_id=p.id AND c.status='released') AND ($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.patient_id AND c.doctor_id=$2)) ORDER BY p.starts_on DESC,p.id LIMIT 100`,
      [actor.role, actor.id],
    ) as Promise<PlacementReference[]>;
  }
  async patientContext(patientId: string): Promise<PatientContext | undefined> {
    const [[patient], placements, cycles] = await Promise.all([
      this.manager.query(
        `SELECT ${patientProjection} AS value FROM patients p WHERE p.id=$1`,
        [patientId],
      ),
      this.manager.query(
        `SELECT p.id,p.room_id AS "roomId",r.name AS "roomName",to_char(p.starts_on,'YYYY-MM-DD') AS "startsOn",to_char(p.ends_on,'YYYY-MM-DD') AS "endsOn",p.status FROM placements p JOIN rooms r ON r.id=p.room_id WHERE p.patient_id=$1 ORDER BY p.starts_on DESC,p.id LIMIT 50`,
        [patientId],
      ),
      this.manager.query(
        `SELECT c.id,c.status,d.name AS "doctorName",n.name AS "nurseName",c.version FROM cycles c JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id WHERE c.patient_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at DESC,c.id LIMIT 30`,
        [patientId],
      ),
    ]);
    return patient
      ? { patient: patient.value as PatientSummary, placements, cycles }
      : undefined;
  }
}
