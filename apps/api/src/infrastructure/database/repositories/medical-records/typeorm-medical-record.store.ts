import { EntityManager } from "typeorm";
import { Actor } from "../../../../domain/auth/actor";
import {
  MedicalRecordListFilters,
  MedicalRecordStore,
} from "../../../../application/medical-records/medical-record-store.port";
export class TypeOrmMedicalRecordStore implements MedicalRecordStore {
  constructor(private readonly manager: EntityManager) {}
  async list(actor: Actor, q: MedicalRecordListFilters) {
    if (actor.role === "ADMISI") {
      const rows = await this.manager.query(
        `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'doctorId',m.doctor_id,'recordDate',m.record_date) AS item FROM medical_records m WHERE m.deleted_at IS NULL AND ($1::text IS NULL OR m.patient_id=$1) ORDER BY m.record_date DESC,m.id LIMIT $2`,
        [q.patientId ?? null, q.limit ?? 50],
      );
      return {
        items: rows.map((r: { item: Record<string, unknown> }) => r.item),
        total: rows.length,
      };
    }
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorName',u.name,'recordDate',m.record_date,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,'observationCount',(SELECT count(*) FROM observations o WHERE o.record_id=m.id AND o.deleted_at IS NULL)) AS item FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id WHERE m.deleted_at IS NULL AND ($1='PERAWAT' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$2)) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%' OR m.diagnosis ILIKE '%'||$3||'%') AND ($4::text IS NULL OR m.patient_id=$4) ORDER BY m.record_date DESC,m.id LIMIT $5`,
      [
        actor.role,
        actor.id,
        q.search ?? "",
        q.patientId ?? null,
        q.limit ?? 50,
      ],
    );
    return {
      items: rows.map((r: { item: Record<string, unknown> }) => r.item),
      total: rows.length,
    };
  }
  async detail(actor: Actor, recordId: string) {
    if (actor.role === "ADMISI") {
      const rows = await this.manager.query(
        `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'doctorId',m.doctor_id,'recordDate',m.record_date) AS item FROM medical_records m WHERE m.id=$1 AND m.deleted_at IS NULL`,
        [recordId],
      );
      return rows[0]?.item;
    }
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorId',m.doctor_id,'doctorName',u.name,'recordDate',m.record_date,'complaint',m.complaint,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,'updatedAt',m.updated_at,'observations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'nurseId',o.nurse_id,'nurseName',nu.name,'symptoms',o.symptoms,'nursingNote',o.nursing_note,'observedAt',o.observed_at,'version',o.version,'temperature',v.temperature,'systolic',v.systolic,'diastolic',v.diastolic,'bloodPressure',CASE WHEN v.systolic IS NULL THEN NULL ELSE v.systolic::text||'/'||v.diastolic::text END,'pulse',v.pulse,'respiratoryRate',v.respiratory_rate,'spo2',v.spo2) ORDER BY o.observed_at DESC) FROM observations o JOIN users nu ON nu.id=o.nurse_id LEFT JOIN vital_signs v ON v.observation_id=o.id AND v.deleted_at IS NULL WHERE o.record_id=m.id AND o.deleted_at IS NULL),'[]'::jsonb)) AS item FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id WHERE m.id=$1 AND m.deleted_at IS NULL`,
      [recordId],
    );
    return rows[0]?.item;
  }
  async createRecord(d: {
    id: string;
    patientId: string;
    doctorId: string;
    complaint: string;
    diagnosis: string;
    treatment: string;
    notes: string;
    recordDate: string;
  }) {
    await this.manager.query(
      `INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment,notes,record_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        d.id,
        d.patientId,
        d.doctorId,
        d.complaint,
        d.diagnosis,
        d.treatment,
        d.notes,
        d.recordDate,
      ],
    );
  }
  async createRecordHistory(d: {
    id: string;
    entityId: string;
    actorId: string;
    action: string;
    reason: string;
    before?: unknown;
    after: unknown;
    entityType?: "medical_record" | "observation";
  }) {
    if (d.entityType === "observation" && d.action === "created")
      await this.manager.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,after_data) VALUES($1,'observation',$2,$3,'created','Observasi dicatat',$4::jsonb)`,
        [d.id, d.entityId, d.actorId, JSON.stringify(d.after)],
      );
    else if (d.entityType === "observation")
      await this.manager.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,before_data,after_data) VALUES($1,'observation',$2,$3,'corrected',$4,$5::jsonb,$6::jsonb)`,
        [
          d.id,
          d.entityId,
          d.actorId,
          d.reason,
          JSON.stringify(d.before),
          JSON.stringify(d.after),
        ],
      );
    else if (d.action === "created")
      await this.manager.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,after_data) VALUES($1,'medical_record',$2,$3,'created','Rekam medis dibuat',$4::jsonb)`,
        [d.id, d.entityId, d.actorId, JSON.stringify(d.after)],
      );
    else if (d.action === "deleted")
      await this.manager.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,before_data,after_data) VALUES($1,'medical_record',$2,$3,'deleted',$4,$5::jsonb,$6::jsonb)`,
        [
          d.id,
          d.entityId,
          d.actorId,
          d.reason,
          JSON.stringify(d.before),
          JSON.stringify(d.after),
        ],
      );
    else
      await this.manager.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,before_data,after_data) VALUES($1,'medical_record',$2,$3,'updated',$6,$4::jsonb,$5::jsonb)`,
        [
          d.id,
          d.entityId,
          d.actorId,
          JSON.stringify(d.before),
          JSON.stringify(d.after),
          d.reason,
        ],
      );
  }
  async lockRecord(id: string) {
    const rows = await this.manager.query(
      `SELECT * FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return rows[0];
  }
  async updateRecord(
    id: string,
    d: {
      complaint: string;
      diagnosis: string;
      treatment: string;
      notes: string;
      recordDate: string;
    },
  ) {
    await this.manager.query(
      `UPDATE medical_records SET complaint=$2,diagnosis=$3,treatment=$4,notes=$5,record_date=$6,version=version+1,updated_at=now() WHERE id=$1`,
      [id, d.complaint, d.diagnosis, d.treatment, d.notes, d.recordDate],
    );
  }
  async deleteRecord(id: string) {
    await this.manager.query(
      `UPDATE medical_records SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1`,
      [id],
    );
  }
  async lockRecordPatient(id: string) {
    const rows = await this.manager.query(
      `SELECT patient_id FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return rows[0];
  }
  async createObservation(d: {
    id: string;
    recordId: string;
    nurseId: string;
    symptoms: string;
    nursingNote: string;
    observedAt: string;
  }) {
    await this.manager.query(
      `INSERT INTO observations(id,record_id,nurse_id,symptoms,nursing_note,observed_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [d.id, d.recordId, d.nurseId, d.symptoms, d.nursingNote, d.observedAt],
    );
  }
  async createVitals(d: {
    id: string;
    observationId: string;
    temperature: number | null;
    systolic: number | null;
    diastolic: number | null;
    pulse: number | null;
    respiratoryRate: number | null;
    spo2: number | null;
  }) {
    await this.manager.query(
      `INSERT INTO vital_signs(id,observation_id,temperature,systolic,diastolic,pulse,respiratory_rate,spo2) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        d.id,
        d.observationId,
        d.temperature,
        d.systolic,
        d.diastolic,
        d.pulse,
        d.respiratoryRate,
        d.spo2,
      ],
    );
  }
  async lockObservation(recordId: string, observationId: string) {
    const rows = await this.manager.query(
      `SELECT o.*,m.patient_id FROM observations o JOIN medical_records m ON m.id=o.record_id WHERE o.id=$1 AND o.record_id=$2 AND m.deleted_at IS NULL AND o.deleted_at IS NULL FOR UPDATE OF o`,
      [observationId, recordId],
    );
    return rows[0];
  }
  async lockVital(id: string) {
    const rows = await this.manager.query(
      `SELECT * FROM vital_signs WHERE observation_id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return rows[0];
  }
  async updateObservation(
    id: string,
    d: {
      symptoms: string;
      nursingNote: string;
      observedAt: string;
    },
  ) {
    await this.manager.query(
      `UPDATE observations SET symptoms=$2,nursing_note=$3,observed_at=$4,version=version+1,updated_at=now() WHERE id=$1`,
      [id, d.symptoms, d.nursingNote, d.observedAt],
    );
  }
  async updateVital(
    id: string,
    d: {
      temperature: number | null;
      systolic: number | null;
      diastolic: number | null;
      pulse: number | null;
      respiratoryRate: number | null;
      spo2: number | null;
    },
  ) {
    await this.manager.query(
      `UPDATE vital_signs SET temperature=$2,systolic=$3,diastolic=$4,pulse=$5,respiratory_rate=$6,spo2=$7,version=version+1 WHERE id=$1`,
      [
        id,
        d.temperature,
        d.systolic,
        d.diastolic,
        d.pulse,
        d.respiratoryRate,
        d.spo2,
      ],
    );
  }
}
