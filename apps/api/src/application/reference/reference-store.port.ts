import { Actor } from "../../domain/auth/actor";
export interface PatientFilter {
  search: string;
  limit: number;
  offset: number;
}
export interface PatientSummary {
  id: string;
  name: string;
  medicalRecordNo: string;
  birthDate: string;
  gender: string;
  bpjs: boolean;
  bpjsNumber: string | null;
}
export interface StaffSummary {
  id: string;
  name: string;
  role: string;
  coordinator: boolean;
  active: boolean;
}
export interface RoomReference {
  id: string;
  name: string;
  roomClass: string;
  capacity: number;
  status: string;
  picId: string | null;
  dailyRate: string;
  version: number;
}
export interface PlacementReference {
  id: string;
  patientId: string;
  patientName: string;
  roomId: string;
  roomName: string;
  startsOn: string;
  endsOn: string;
  status: string;
  version: number;
}
export interface PatientContext {
  patient: PatientSummary;
  placements: unknown[];
  cycles: unknown[];
}
export interface ReferenceStore {
  patients(
    actor: Actor,
    filter: PatientFilter,
  ): Promise<{
    items: PatientSummary[];
    total: number;
  }>;
  staff(): Promise<{
    items: StaffSummary[];
    total: number;
  }>;
  rooms(): Promise<RoomReference[]>;
  activePlacements(actor: Actor): Promise<PlacementReference[]>;
  patientContext(patientId: string): Promise<PatientContext | undefined>;
}
