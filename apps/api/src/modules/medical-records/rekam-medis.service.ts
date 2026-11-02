import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { canReadPatient, id, requireClinical } from "../../common/domain";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";
import {
  CreateMedicalRecordDto,
  CreateObservationDto,
  DeleteMedicalRecordDto,
  UpdateMedicalRecordDto,
  UpdateObservationDto,
} from "./dto/medical-record.dto";

export const hasCompleteBloodPressure = (
  systolic?: number,
  diastolic?: number,
) => (systolic === undefined) === (diastolic === undefined);

@Injectable()
export class RekamMedisService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async list(actor: Actor, search = "", limit = 50, patientId?: string) {
    if (patientId) await canReadPatient(this.db.manager, actor, patientId);
    if (actor.role === "ADMISI") {
      const rows = await this.db.query(
        `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'doctorId',m.doctor_id,'recordDate',m.record_date) AS item FROM medical_records m WHERE m.deleted_at IS NULL AND ($1::text IS NULL OR m.patient_id=$1) ORDER BY m.record_date DESC,m.id LIMIT $2`,
        [patientId ?? null, limit],
      );
      return {
        items: rows.map((r: { item: unknown }) => r.item),
        total: rows.length,
      };
    }
    requireClinical(actor);
    const rows = await this.db.query(
      `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorName',u.name,'recordDate',m.record_date,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,'observationCount',(SELECT count(*) FROM observations o WHERE o.record_id=m.id AND o.deleted_at IS NULL)) AS item FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id WHERE m.deleted_at IS NULL AND ($1='PERAWAT' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$2)) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%' OR m.diagnosis ILIKE '%'||$3||'%') AND ($4::text IS NULL OR m.patient_id=$4) ORDER BY m.record_date DESC,m.id LIMIT $5`,
      [actor.role, actor.id, search.trim(), patientId ?? null, limit],
    );
    return {
      items: rows.map((r: { item: unknown }) => r.item),
      total: rows.length,
    };
  }

  async detail(actor: Actor, recordId: string) {
    const manager = this.db.manager;
    const record = await this.findReadable(manager, actor, recordId);
    return record;
  }

  private async findReadable(
    manager: EntityManager,
    actor: Actor,
    recordId: string,
  ) {
    if (actor.role === "ADMISI") {
      const rows = await manager.query(
        `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'doctorId',m.doctor_id,'recordDate',m.record_date) AS item FROM medical_records m WHERE m.id=$1 AND m.deleted_at IS NULL`,
        [recordId],
      );
      if (!rows.length) throw AppError.notFound();
      await canReadPatient(manager, actor, rows[0].item.patientId);
      return rows[0].item;
    }
    requireClinical(actor);
    const rows = await manager.query(
      `SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorId',m.doctor_id,'doctorName',u.name,'recordDate',m.record_date,'complaint',m.complaint,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,'updatedAt',m.updated_at,'observations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'nurseId',o.nurse_id,'nurseName',nu.name,'symptoms',o.symptoms,'nursingNote',o.nursing_note,'observedAt',o.observed_at,'version',o.version,'temperature',v.temperature,'systolic',v.systolic,'diastolic',v.diastolic,'bloodPressure',CASE WHEN v.systolic IS NULL THEN NULL ELSE v.systolic::text||'/'||v.diastolic::text END,'pulse',v.pulse,'respiratoryRate',v.respiratory_rate,'spo2',v.spo2) ORDER BY o.observed_at DESC) FROM observations o JOIN users nu ON nu.id=o.nurse_id LEFT JOIN vital_signs v ON v.observation_id=o.id AND v.deleted_at IS NULL WHERE o.record_id=m.id AND o.deleted_at IS NULL),'[]'::jsonb)) AS item FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id WHERE m.id=$1 AND m.deleted_at IS NULL`,
      [recordId],
    );
    if (!rows.length) throw AppError.notFound();
    await canReadPatient(manager, actor, rows[0].item.patientId);
    return rows[0].item;
  }

  async create(actor: Actor, input: CreateMedicalRecordDto) {
    if (actor.role !== "DOKTER") throw AppError.forbidden();
    for (const [value, label] of [
      [input.complaint, "Keluhan"],
      [input.diagnosis, "Diagnosis"],
      [input.treatment, "Tindakan"],
    ] as const)
      if (!value.trim()) throw AppError.validation(`${label} wajib diisi.`);
    await canReadPatient(this.db.manager, actor, input.patientId);
    const recordId = id();
    await this.db.transaction(async (m) => {
      await m.query(
        `INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment,notes,record_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          recordId,
          input.patientId,
          actor.id,
          input.complaint.trim(),
          input.diagnosis.trim(),
          input.treatment.trim(),
          input.notes?.trim() ?? "",
          input.recordDate,
        ],
      );
      await m.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,after_data) VALUES($1,'medical_record',$2,$3,'created','Rekam medis dibuat',$4::jsonb)`,
        [
          id(),
          recordId,
          actor.id,
          JSON.stringify({
            patientId: input.patientId,
            recordDate: input.recordDate,
          }),
        ],
      );
    });
    return this.detail(actor, recordId);
  }

  async update(actor: Actor, recordId: string, input: UpdateMedicalRecordDto) {
    if (actor.role !== "DOKTER") throw AppError.forbidden();
    for (const [value, label] of [
      [input.complaint, "Keluhan"],
      [input.diagnosis, "Diagnosis"],
      [input.treatment, "Tindakan"],
    ] as const)
      if (!value.trim()) throw AppError.validation(`${label} wajib diisi.`);
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT * FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [recordId],
      );
      if (!rows.length) throw AppError.notFound();
      const before = rows[0];
      if (before.doctor_id !== actor.id) throw AppError.forbidden();
      if (Number(before.version) !== input.expectedVersion)
        throw AppError.conflict(
          "Rekam medis berubah. Muat ulang sebelum menyimpan.",
        );
      await canReadPatient(m, actor, before.patient_id);
      const after = {
        complaint: input.complaint.trim(),
        diagnosis: input.diagnosis.trim(),
        treatment: input.treatment.trim(),
        notes: input.notes?.trim() ?? "",
        recordDate: input.recordDate,
        version: input.expectedVersion + 1,
      };
      await m.query(
        `UPDATE medical_records SET complaint=$2,diagnosis=$3,treatment=$4,notes=$5,record_date=$6,version=version+1,updated_at=now() WHERE id=$1`,
        [
          recordId,
          after.complaint,
          after.diagnosis,
          after.treatment,
          after.notes,
          after.recordDate,
        ],
      );
      await m.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,before_data,after_data) VALUES($1,'medical_record',$2,$3,'updated','Rekam medis dikoreksi',$4::jsonb,$5::jsonb)`,
        [
          id(),
          recordId,
          actor.id,
          JSON.stringify({
            complaint: before.complaint,
            diagnosis: before.diagnosis,
            treatment: before.treatment,
            notes: before.notes,
            recordDate: before.record_date,
            version: before.version,
          }),
          JSON.stringify(after),
        ],
      );
      return this.findReadable(m, actor, recordId);
    });
  }

  async delete(actor: Actor, recordId: string, input: DeleteMedicalRecordDto) {
    if (actor.role !== "DOKTER") throw AppError.forbidden();
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT * FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [recordId],
      );
      if (!rows.length) throw AppError.notFound();
      const before = rows[0];
      if (before.doctor_id !== actor.id) throw AppError.forbidden();
      if (Number(before.version) !== input.expectedVersion)
        throw AppError.conflict(
          "Rekam medis berubah. Muat ulang sebelum menghapus.",
        );
      await m.query(
        `UPDATE medical_records SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1`,
        [recordId],
      );
      await m.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,before_data,after_data) VALUES($1,'medical_record',$2,$3,'deleted',$4,$5::jsonb,$6::jsonb)`,
        [
          id(),
          recordId,
          actor.id,
          input.reason.trim(),
          JSON.stringify({ version: before.version }),
          JSON.stringify({ deleted: true }),
        ],
      );
      return {
        id: recordId,
        deleted: true,
        version: input.expectedVersion + 1,
      };
    });
  }

  async addObservation(
    actor: Actor,
    recordId: string,
    input: CreateObservationDto,
  ) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    if (!input.symptoms.trim())
      throw AppError.validation("Gejala wajib diisi.");
    if (
      !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        input.observedAt,
      )
    )
      throw AppError.validation("Waktu pemeriksaan harus memakai zona waktu.");
    if (!hasCompleteBloodPressure(input.systolic, input.diastolic))
      throw AppError.validation(
        "Tekanan darah harus diisi lengkap (sistolik dan diastolik).",
      );
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT patient_id FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [recordId],
      );
      if (!rows.length) throw AppError.notFound();
      await canReadPatient(m, actor, rows[0].patient_id);
      const observationId = id();
      await m.query(
        `INSERT INTO observations(id,record_id,nurse_id,symptoms,nursing_note,observed_at) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          observationId,
          recordId,
          actor.id,
          input.symptoms.trim(),
          input.nursingNote?.trim() ?? "",
          input.observedAt,
        ],
      );
      if (
        [
          input.temperature,
          input.systolic,
          input.pulse,
          input.respiratoryRate,
          input.spo2,
        ].some((v) => v !== undefined)
      )
        await m.query(
          `INSERT INTO vital_signs(id,observation_id,temperature,systolic,diastolic,pulse,respiratory_rate,spo2) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id(),
            observationId,
            input.temperature ?? null,
            input.systolic ?? null,
            input.diastolic ?? null,
            input.pulse ?? null,
            input.respiratoryRate ?? null,
            input.spo2 ?? null,
          ],
        );
      await m.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,after_data) VALUES($1,'observation',$2,$3,'created','Observasi dicatat',$4::jsonb)`,
        [id(), observationId, actor.id, JSON.stringify({ recordId })],
      );
      return this.findReadable(m, actor, recordId);
    });
  }

  async updateObservation(
    actor: Actor,
    recordId: string,
    observationId: string,
    input: UpdateObservationDto,
  ) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    if (!input.reason.trim())
      throw AppError.validation("Alasan koreksi wajib diisi.");
    if (!input.symptoms.trim())
      throw AppError.validation("Gejala wajib diisi.");
    if (
      !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        input.observedAt,
      )
    )
      throw AppError.validation("Waktu pemeriksaan harus memakai zona waktu.");
    if (!hasCompleteBloodPressure(input.systolic, input.diastolic))
      throw AppError.validation(
        "Tekanan darah harus diisi lengkap (sistolik dan diastolik).",
      );
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT o.*,m.patient_id FROM observations o JOIN medical_records m ON m.id=o.record_id WHERE o.id=$1 AND o.record_id=$2 AND m.deleted_at IS NULL AND o.deleted_at IS NULL FOR UPDATE OF o`,
        [observationId, recordId],
      );
      if (!rows.length) throw AppError.notFound();
      const current = rows[0];
      await canReadPatient(m, actor, current.patient_id);
      if (Number(current.version ?? 1) !== input.expectedVersion)
        throw AppError.conflict(
          "Observasi berubah. Muat ulang sebelum menyimpan.",
        );
      const [vital] = await m.query(
        `SELECT * FROM vital_signs WHERE observation_id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [observationId],
      );
      const beforeData = {
        symptoms: current.symptoms,
        nursingNote: current.nursing_note,
        observedAt: current.observed_at,
        temperature: vital?.temperature ?? null,
        systolic: vital?.systolic ?? null,
        diastolic: vital?.diastolic ?? null,
        pulse: vital?.pulse ?? null,
        respiratoryRate: vital?.respiratory_rate ?? null,
        spo2: vital?.spo2 ?? null,
        version: Number(current.version ?? 1),
      };
      const after = {
        symptoms: input.symptoms.trim(),
        nursingNote: input.nursingNote?.trim() ?? "",
        observedAt: input.observedAt,
        temperature: input.temperature ?? vital?.temperature ?? null,
        systolic: input.systolic ?? vital?.systolic ?? null,
        diastolic: input.diastolic ?? vital?.diastolic ?? null,
        pulse: input.pulse ?? vital?.pulse ?? null,
        respiratoryRate:
          input.respiratoryRate ?? vital?.respiratory_rate ?? null,
        spo2: input.spo2 ?? vital?.spo2 ?? null,
        version: input.expectedVersion + 1,
      };
      await m.query(
        `UPDATE observations SET symptoms=$2,nursing_note=$3,observed_at=$4,version=version+1,updated_at=now() WHERE id=$1`,
        [observationId, after.symptoms, after.nursingNote, after.observedAt],
      );
      const anyVital = [
        input.temperature,
        input.systolic,
        input.pulse,
        input.respiratoryRate,
        input.spo2,
      ].some((v) => v !== undefined);
      if (vital)
        await m.query(
          `UPDATE vital_signs SET temperature=$2,systolic=$3,diastolic=$4,pulse=$5,respiratory_rate=$6,spo2=$7,version=version+1 WHERE id=$1`,
          [
            vital.id,
            after.temperature,
            after.systolic,
            after.diastolic,
            after.pulse,
            after.respiratoryRate,
            after.spo2,
          ],
        );
      else if (anyVital)
        await m.query(
          `INSERT INTO vital_signs(id,observation_id,temperature,systolic,diastolic,pulse,respiratory_rate,spo2) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id(),
            observationId,
            after.temperature,
            after.systolic,
            after.diastolic,
            after.pulse,
            after.respiratoryRate,
            after.spo2,
          ],
        );
      await m.query(
        `INSERT INTO medical_history(id,entity_type,entity_id,actor_id,action,reason,before_data,after_data) VALUES($1,'observation',$2,$3,'corrected',$4,$5::jsonb,$6::jsonb)`,
        [
          id(),
          observationId,
          actor.id,
          input.reason.trim(),
          JSON.stringify(beforeData),
          JSON.stringify(after),
        ],
      );
      return this.findReadable(m, actor, recordId);
    });
  }
}
