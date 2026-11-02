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
  version: number | string;
  deleted_at?: Date | null;
}
export interface ObservationRow extends Record<string, unknown> {
  id: string;
  record_id: string;
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
  lockRecordPatient(recordId: string): Promise<
    | {
        patient_id: string;
      }
    | undefined
  >;
  createObservation(input: {
    id: string;
    recordId: string;
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
    recordId: string,
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
