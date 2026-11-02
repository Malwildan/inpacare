import { Actor } from "../../domain/auth/actor";
import { requireClinical } from "../../domain/auth/permissions";
import { DomainError } from "../../domain/shared/domain-error";
import { hasCompleteBloodPressure } from "../../domain/medical-records/vital-signs";
import { id } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { PatientAccess, canReadPatient } from "../patients/patient-access";
import {
  MedicalRecordListFilters,
  MedicalRecordStore,
} from "./medical-record-store.port";
export interface CreateMedicalRecordInput {
  patientId: string;
  complaint: string;
  diagnosis: string;
  treatment: string;
  notes?: string;
  recordDate: string;
}
export interface UpdateMedicalRecordInput
  extends Omit<CreateMedicalRecordInput, "patientId"> {
  expectedVersion: number;
  reason: string;
}
export interface DeleteMedicalRecordInput {
  expectedVersion: number;
  reason: string;
}
export interface ObservationInput {
  symptoms: string;
  nursingNote?: string;
  observedAt: string;
  temperature?: number;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  respiratoryRate?: number;
  spo2?: number;
}
export interface UpdateObservationInput extends ObservationInput {
  expectedVersion: number;
  reason: string;
}
const validateObservation = (input: ObservationInput) => {
  if (!input.symptoms.trim())
    throw DomainError.validation("Gejala wajib diisi.");
  if (
    !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.observedAt)
  )
    throw DomainError.validation("Waktu pemeriksaan harus memakai zona waktu.");
  if (!hasCompleteBloodPressure(input.systolic, input.diastolic))
    throw DomainError.validation(
      "Tekanan darah harus diisi lengkap (sistolik dan diastolik).",
    );
};
export class RekamMedisUseCases {
  constructor(
    private readonly store: MedicalRecordStore,
    private readonly uow: UnitOfWork,
    private readonly patients: PatientAccess,
  ) {}
  async list(actor: Actor, search = "", limit = 50, patientId?: string) {
    if (patientId) await canReadPatient(this.patients, actor, patientId);
    if (actor.role !== "ADMISI") requireClinical(actor);
    return this.store.list(actor, { search: search.trim(), limit, patientId });
  }
  async detail(actor: Actor, recordId: string) {
    if (actor.role !== "ADMISI") requireClinical(actor);
    const record = await this.store.detail(actor, recordId);
    if (!record) throw DomainError.notFound();
    await canReadPatient(this.patients, actor, String(record.patientId));
    return record;
  }
  async create(actor: Actor, input: CreateMedicalRecordInput) {
    if (actor.role !== "DOKTER") throw DomainError.forbidden();
    for (const [value, label] of [
      [input.complaint, "Keluhan"],
      [input.diagnosis, "Diagnosis"],
      [input.treatment, "Tindakan"],
    ] as const)
      if (!value.trim()) throw DomainError.validation(`${label} wajib diisi.`);
    await canReadPatient(this.patients, actor, input.patientId);
    const recordId = id();
    await this.uow.run(async (tx) => {
      await tx.medicalRecords.createRecord({
        id: recordId,
        patientId: input.patientId,
        doctorId: actor.id,
        complaint: input.complaint.trim(),
        diagnosis: input.diagnosis.trim(),
        treatment: input.treatment.trim(),
        notes: input.notes?.trim() ?? "",
        recordDate: input.recordDate,
      });
      await tx.medicalRecords.createRecordHistory({
        id: id(),
        entityId: recordId,
        actorId: actor.id,
        action: "created",
        reason: "Rekam medis dibuat",
        after: { patientId: input.patientId, recordDate: input.recordDate },
      });
    });
    return this.detail(actor, recordId);
  }
  async update(
    actor: Actor,
    recordId: string,
    input: UpdateMedicalRecordInput,
  ) {
    if (actor.role !== "DOKTER") throw DomainError.forbidden();
    if (!input.reason.trim())
      throw DomainError.validation("Alasan koreksi wajib diisi.");
    for (const [value, label] of [
      [input.complaint, "Keluhan"],
      [input.diagnosis, "Diagnosis"],
      [input.treatment, "Tindakan"],
    ] as const)
      if (!value.trim()) throw DomainError.validation(`${label} wajib diisi.`);
    return this.uow.run(async (tx) => {
      const before = await tx.medicalRecords.lockRecord(recordId);
      if (!before) throw DomainError.notFound();
      if (before.doctor_id !== actor.id) throw DomainError.forbidden();
      if (Number(before.version) !== input.expectedVersion)
        throw DomainError.conflict(
          "Rekam medis berubah. Muat ulang sebelum menyimpan.",
        );
      await canReadPatient(tx.patients, actor, before.patient_id);
      const after = {
        complaint: input.complaint.trim(),
        diagnosis: input.diagnosis.trim(),
        treatment: input.treatment.trim(),
        notes: input.notes?.trim() ?? "",
        recordDate: input.recordDate,
        version: input.expectedVersion + 1,
      };
      await tx.medicalRecords.updateRecord(recordId, after);
      await tx.medicalRecords.createRecordHistory({
        id: id(),
        entityId: recordId,
        actorId: actor.id,
        action: "updated",
        reason: input.reason.trim(),
        before: {
          complaint: before.complaint,
          diagnosis: before.diagnosis,
          treatment: before.treatment,
          notes: before.notes,
          recordDate: before.record_date,
          version: before.version,
        },
        after,
      });
      const record = await tx.medicalRecords.detail(actor, recordId);
      if (!record) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, String(record.patientId));
      return record;
    });
  }
  async delete(
    actor: Actor,
    recordId: string,
    input: DeleteMedicalRecordInput,
  ) {
    if (actor.role !== "DOKTER") throw DomainError.forbidden();
    return this.uow.run(async (tx) => {
      const before = await tx.medicalRecords.lockRecord(recordId);
      if (!before) throw DomainError.notFound();
      if (before.doctor_id !== actor.id) throw DomainError.forbidden();
      if (Number(before.version) !== input.expectedVersion)
        throw DomainError.conflict(
          "Rekam medis berubah. Muat ulang sebelum menghapus.",
        );
      await tx.medicalRecords.deleteRecord(recordId);
      await tx.medicalRecords.createRecordHistory({
        id: id(),
        entityId: recordId,
        actorId: actor.id,
        action: "deleted",
        reason: input.reason,
        before: { version: before.version },
        after: { deleted: true },
      });
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
    input: ObservationInput,
  ) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    validateObservation(input);
    return this.uow.run(async (tx) => {
      const row = await tx.medicalRecords.lockRecordPatient(recordId);
      if (!row) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, row.patient_id);
      const observationId = id();
      await tx.medicalRecords.createObservation({
        id: observationId,
        recordId,
        nurseId: actor.id,
        symptoms: input.symptoms.trim(),
        nursingNote: input.nursingNote?.trim() ?? "",
        observedAt: input.observedAt,
      });
      if (
        [
          input.temperature,
          input.systolic,
          input.pulse,
          input.respiratoryRate,
          input.spo2,
        ].some((v) => v !== undefined)
      )
        await tx.medicalRecords.createVitals({
          id: id(),
          observationId,
          temperature: input.temperature ?? null,
          systolic: input.systolic ?? null,
          diastolic: input.diastolic ?? null,
          pulse: input.pulse ?? null,
          respiratoryRate: input.respiratoryRate ?? null,
          spo2: input.spo2 ?? null,
        });
      await tx.medicalRecords.createRecordHistory({
        id: id(),
        entityId: observationId,
        actorId: actor.id,
        action: "created",
        reason: "Observasi dicatat",
        after: { recordId },
        entityType: "observation",
      });
      const record = await tx.medicalRecords.detail(actor, recordId);
      if (!record) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, String(record.patientId));
      return record;
    });
  }
  async updateObservation(
    actor: Actor,
    recordId: string,
    observationId: string,
    input: UpdateObservationInput,
  ) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (!input.reason.trim())
      throw DomainError.validation("Alasan koreksi wajib diisi.");
    validateObservation(input);
    return this.uow.run(async (tx) => {
      const current = await tx.medicalRecords.lockObservation(
        recordId,
        observationId,
      );
      if (!current) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, current.patient_id);
      if (Number(current.version ?? 1) !== input.expectedVersion)
        throw DomainError.conflict(
          "Observasi berubah. Muat ulang sebelum menyimpan.",
        );
      const vital = await tx.medicalRecords.lockVital(observationId);
      const before = {
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
      await tx.medicalRecords.updateObservation(observationId, {
        symptoms: after.symptoms,
        nursingNote: after.nursingNote,
        observedAt: after.observedAt,
      });
      const anyVital = [
        input.temperature,
        input.systolic,
        input.pulse,
        input.respiratoryRate,
        input.spo2,
      ].some((v) => v !== undefined);
      if (vital) await tx.medicalRecords.updateVital(vital.id, after);
      else if (anyVital)
        await tx.medicalRecords.createVitals({
          id: id(),
          observationId,
          temperature: after.temperature,
          systolic: after.systolic,
          diastolic: after.diastolic,
          pulse: after.pulse,
          respiratoryRate: after.respiratoryRate,
          spo2: after.spo2,
        });
      await tx.medicalRecords.createRecordHistory({
        id: id(),
        entityId: observationId,
        actorId: actor.id,
        action: "corrected",
        reason: input.reason.trim(),
        before,
        after,
        entityType: "observation",
      });
      const record = await tx.medicalRecords.detail(actor, recordId);
      if (!record) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, String(record.patientId));
      return record;
    });
  }
}
