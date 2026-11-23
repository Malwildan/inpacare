import { Actor } from "../../domain/auth/actor";
import { requireClinical } from "../../domain/auth/permissions";
import { DomainError } from "../../domain/shared/domain-error";
import { ObservationInput, saveObservation, validateObservation } from "./observation-writes";
import { id } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { PatientAccess, canReadPatient } from "../patients/patient-access";
import { CycleStore } from "../cycles/cycle-store.port";
import { TransactionContext } from "../shared/transaction-context";
import { MedicalRecordStore, ObservationScope, RecordRow } from "./medical-record-store.port";
export interface CreateMedicalRecordInput {
  patientId: string;
  cycleId?: string;
  complaint: string;
  diagnosis: string;
  treatment: string;
  notes?: string;
  recordDate: string;
}
export interface UpdateMedicalRecordInput
  extends Omit<CreateMedicalRecordInput, "patientId" | "cycleId"> {
  expectedVersion: number;
  reason: string;
}
export interface DeleteMedicalRecordInput {
  expectedVersion: number;
  reason: string;
}
export interface UpdateObservationInput extends ObservationInput {
  expectedVersion: number;
  reason: string;
}
export class RekamMedisUseCases {
  constructor(
    private readonly store: MedicalRecordStore,
    private readonly uow: UnitOfWork,
    private readonly patients: PatientAccess,
    private readonly cycles: CycleStore,
  ) {}
  async list(actor: Actor, search = "", limit = 50, patientId?: string) {
    if (patientId) await canReadPatient(this.patients, actor, patientId);
    if (actor.role !== "ADMISI") requireClinical(actor);
    return this.store.list(actor, { search: search.trim(), limit, patientId });
  }
  async detail(actor: Actor, recordId: string) {
    return this.readRecord(this.store, this.patients, this.cycles, actor, recordId);
  }
  private async readRecord(
    store: MedicalRecordStore,
    patients: PatientAccess,
    cycles: CycleStore,
    actor: Actor,
    recordId: string,
  ) {
    const record = await store.detail(actor, recordId);
    if (!record) throw DomainError.notFound();
    const patientId = String(record.patientId);
    if (actor.role === "ADMISI") {
      await canReadPatient(patients, actor, patientId);
      return record;
    }
    requireClinical(actor);
    if (typeof record.cycleId === "string") {
      const observations = await store.listObservations(actor, { cycleId: record.cycleId, patientId });
      const cycle = await cycles.detail(actor, record.cycleId);
      if (!cycle || cycle.patientId !== patientId) throw DomainError.notFound();
      return { ...record, observations, canRecordObservations: actor.role === "PERAWAT" && cycle.nurseId === actor.id };
    }
    await canReadPatient(patients, actor, patientId);
    const observations = await store.listObservations(actor, { recordId, patientId, doctorId: String(record.doctorId) });
    return { ...record, observations, canRecordObservations: false };
  }
  async cycleObservations(actor: Actor, cycleId: string) {
    requireClinical(actor);
    const cycle = await this.cycles.detail(actor, cycleId);
    if (!cycle) throw DomainError.notFound();
    const items = await this.store.listObservations(actor, { cycleId, patientId: String(cycle.patientId) });
    // Recheck before disclosure so a transfer during the read cannot expose the new team's data.
    if (!(await this.cycles.detail(actor, cycleId))) throw DomainError.notFound();
    return { items };
  }
  async addCycleObservation(actor: Actor, cycleId: string, input: ObservationInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    validateObservation(input);
    return this.uow.run(async (tx) => {
      const cycle = await tx.cycles.lockCycleForChange(cycleId, actor.id);
      if (!cycle) throw DomainError.notFound();
      const detail = await tx.cycles.detail(actor, cycleId);
      if (!detail) throw DomainError.notFound();
      const scope = { cycleId, patientId: String(detail.patientId) };
      await saveObservation(tx.medicalRecords, actor, scope, input);
      return { items: await tx.medicalRecords.listObservations(actor, scope) };
    });
  }
  private async recordCycle(tx: TransactionContext, actor: Actor, input: CreateMedicalRecordInput) {
    const cycleId = input.cycleId ?? await tx.medicalRecords.episodeForRecordDate(input.patientId, input.recordDate);
    if (cycleId) {
      await tx.cycles.lockCycle(cycleId);
      const cycle = await tx.cycles.detail(actor, cycleId);
      if (cycle?.patientId === input.patientId) return cycleId;
    }
    if (input.cycleId) throw DomainError.notFound();
    return null;
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
    return this.uow.run(async (tx) => {
      if (!(await tx.cycles.lockPatient(input.patientId))) throw DomainError.notFound();
      const cycleId = await this.recordCycle(tx, actor, input);
      await tx.medicalRecords.createRecord({
        id: recordId,
        patientId: input.patientId,
        cycleId,
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
        after: { patientId: input.patientId, recordDate: input.recordDate, cycleId },
      });
      return this.readRecord(tx.medicalRecords, tx.patients, tx.cycles, actor, recordId);
    });
  }
  async update(
    actor: Actor,
    recordId: string,
    input: UpdateMedicalRecordInput,
  ) {
    if (actor.role !== "DOKTER") throw DomainError.forbidden();
    if (!input.reason.trim())
      throw DomainError.validation("Isi Alasan koreksi sebelum menyimpan perubahan.");
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
        throw DomainError.conflict();
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
      return this.readRecord(tx.medicalRecords, tx.patients, tx.cycles, actor, recordId);
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
        throw DomainError.conflict();
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
      const scope = await this.lockRecordObservationScope(tx, actor, recordId);
      if (!("cycleId" in scope))
        throw DomainError.conflict("Buka rekap rawat inap pasien untuk menambah observasi.");
      await saveObservation(tx.medicalRecords, actor, scope, input, { recordId });
      return this.readRecord(tx.medicalRecords, tx.patients, tx.cycles, actor, recordId);
    });
  }
  private async lockRecordObservationScope(tx: TransactionContext, actor: Actor, recordId: string): Promise<ObservationScope> {
    const record: RecordRow | undefined = await tx.medicalRecords.lockRecord(recordId);
    if (!record) throw DomainError.notFound();
    if (record.cycle_id) {
      if (!(await tx.cycles.lockCycleForChange(record.cycle_id, actor.id))) throw DomainError.notFound();
      return { cycleId: record.cycle_id, patientId: record.patient_id };
    }
    await canReadPatient(tx.patients, actor, record.patient_id);
    return { recordId, patientId: record.patient_id, doctorId: record.doctor_id };
  }
  async updateObservation(
    actor: Actor,
    recordId: string,
    observationId: string,
    input: UpdateObservationInput,
  ) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (!input.reason.trim())
      throw DomainError.validation("Isi Alasan koreksi sebelum menyimpan perubahan.");
    validateObservation(input);
    return this.uow.run(async (tx) => {
      const scope = await this.lockRecordObservationScope(tx, actor, recordId);
      const current = await tx.medicalRecords.lockObservation(scope, observationId);
      if (!current || current.nurse_id !== actor.id) throw DomainError.notFound();
      if (Number(current.version ?? 1) !== input.expectedVersion)
        throw DomainError.conflict();
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
      return this.readRecord(tx.medicalRecords, tx.patients, tx.cycles, actor, recordId);
    });
  }
}
