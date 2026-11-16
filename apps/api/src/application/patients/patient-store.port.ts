import { PatientSummary } from "../reference/reference-store.port";

export interface CreatePatientInput {
  medicalRecordNo: string;
  name: string;
  birthDate: string;
  gender: "L" | "P";
  bpjs: boolean;
  bpjsNumber?: string | null;
  address?: string | null;
}

export interface PatientStore {
  create(patient: CreatePatientInput & { id: string }): Promise<PatientSummary>;
}
