import { Actor } from "../../domain/auth/actor";
export interface MedicalRecordListFilters {
  search?: string;
  limit?: number;
  patientId?: string;
}
export interface RecordRow extends Record<string, unknown> {
  id: string;
  patient_id: string;
  doctor_id: string;
  cycle_id: string | null;
  version: number | string;
  deleted_at?: Date | null;
}
export interface ObservationRow extends Record<string, unknown> {
  id: string;
  record_id: string | null;
  cycle_id: string | null;
  nurse_id: string;
  patient_id: string;
  symptoms: string;
  nursing_note: string;
  observed_at: Date | string;
  version: number | string;
}
export interface VitalRow extends Record<string, unknown> {
  id: string;
  temperature: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
}
export type ObservationScope =
  | { cycleId: string; patientId: string }
  | { recordId: string; patientId: string; doctorId: string };

export interface MedicalRecordStore {
  list(
    actor: Actor,
    filters: MedicalRecordListFilters,
  ): Promise<{
    items: Record<string, unknown>[];
    total: number;
  }>;
  detail(
    actor: Actor,
    recordId: string,
  ): Promise<Record<string, unknown> | undefined>;
  createRecord(input: {
    id: string;
    patientId: string;
    cycleId: string | null;
    doctorId: string;
    complaint: string;
    diagnosis: string;
    treatment: string;
    notes: string;
    recordDate: string;
  }): Promise<void>;
  createRecordHistory(input: {
    id: string;
    entityId: string;
    actorId: string;
    action: string;
    reason: string;
    before?: unknown;
    after: unknown;
    entityType?: "medical_record" | "observation";
  }): Promise<void>;
  lockRecord(recordId: string): Promise<RecordRow | undefined>;
  updateRecord(
    recordId: string,
    input: {
      complaint: string;
      diagnosis: string;
      treatment: string;
      notes: string;
      recordDate: string;
    },
  ): Promise<void>;
  deleteRecord(recordId: string): Promise<void>;
  hasEpisodeClinicalData(cycleId: string): Promise<boolean>;
  episodeForRecordDate(patientId: string, recordDate: string): Promise<string | undefined>;
  listObservations(actor: Actor, scope: ObservationScope, limit?: number): Promise<Record<string, unknown>[]>;
  completedTaskObservation(taskId: string, completionHash: string): Promise<string | undefined>;
  createObservation(input: {
    taskId?: string;
    completionHash?: string;
    id: string;
    patientId: string;
    cycleId: string;
    nurseId: string;
    symptoms: string;
    nursingNote: string;
    observedAt: string;
  }): Promise<void>;
  createVitals(input: {
    id: string;
    observationId: string;
    temperature: number | null;
    systolic: number | null;
    diastolic: number | null;
    pulse: number | null;
    respiratoryRate: number | null;
    spo2: number | null;
  }): Promise<void>;
  lockObservation(
    scope: ObservationScope,
    observationId: string,
  ): Promise<ObservationRow | undefined>;
  lockVital(observationId: string): Promise<VitalRow | undefined>;
  updateObservation(
    observationId: string,
    input: {
      symptoms: string;
      nursingNote: string;
      observedAt: string;
    },
  ): Promise<void>;
  updateVital(
    vitalId: string,
    input: {
      temperature: number | null;
      systolic: number | null;
      diastolic: number | null;
      pulse: number | null;
      respiratoryRate: number | null;
      spo2: number | null;
    },
  ): Promise<void>;
}
