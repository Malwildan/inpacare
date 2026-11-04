import { Actor } from "../../domain/auth/actor";
export interface CycleListFilters {
  patientId?: string;
  roomId?: string;
  status?: string;
  search?: string;
}
export interface CycleSeed {
  patient_id: string;
  placement_id: string | null;
}
export interface LockedCycle {
  status: string;
  version: number | string;
  placement_id: string | null;
  patient_id?: string;
  deleted_at?: Date | null;
}
export interface CycleDecisionSeed extends CycleSeed {
  doctor_id: string;
  nurse_id: string;
  kind: string;
  requested_end: string | null;
  request_status: string;
}
export interface LockedCycleRequest {
  id: string;
  kind: string;
  requested_end: string | null;
  reason: string;
  requested_by: string;
  previous_status: string;
  status: string;
  decided_by: string | null;
  decision_note: string | null;
}
export interface CycleCandidate {
  id: string;
  name: string;
  medicalRecordNo: string;
}
export interface CycleStore {
  creationCandidates(): Promise<CycleCandidate[]>;
  hasActiveCycle(patientId: string): Promise<boolean>;
  list(
    actor: Actor,
    filters: CycleListFilters,
  ): Promise<{
    items: Record<string, unknown>[];
    total: number;
  }>;
  detail(
    actor: Actor,
    cycleId: string,
  ): Promise<Record<string, unknown> | undefined>;
  requestDetail(
    cycleId: string,
    requestId: string,
  ): Promise<Record<string, unknown> | undefined>;
  activeDoctor(doctorId: string): Promise<boolean>;
  canReadPatient(actor: Actor, patientId: string): Promise<boolean>;
  lockPatient(patientId: string): Promise<boolean>;
  placementRoom(
    placementId: string,
    patientId: string,
  ): Promise<string | undefined>;
  roomForPlacement(placementId: string): Promise<string | undefined>;
  lockRoom(roomId: string): Promise<void>;
  activePlacement(placementId: string, patientId: string): Promise<boolean>;
  createCycle(input: {
    id: string;
    patientId: string;
    placementId: string | null;
    doctorId: string;
    nurseId: string;
  }): Promise<void>;
  changeSeed(cycleId: string, nurseId: string): Promise<CycleSeed | undefined>;
  lockCycleForChange(
    cycleId: string,
    nurseId: string,
  ): Promise<LockedCycle | undefined>;
  updateCyclePlacementStatus(
    cycleId: string,
    placementId: string | null,
    status: string,
  ): Promise<void>;
  deleteSeed(
    cycleId: string,
    nurseId: string,
  ): Promise<
    | {
        patient_id: string;
      }
    | undefined
  >;
  lockCycleForDelete(
    cycleId: string,
    nurseId: string,
  ): Promise<(LockedCycle & Record<string, unknown>) | undefined>;
  hasPendingRequests(cycleId: string): Promise<boolean>;
  softDeleteCycle(
    cycleId: string,
  ): Promise<Record<string, unknown> | undefined>;
  addCycleHistory(input: {
    id: string;
    cycleId: string;
    actorId: string;
    reason: string;
    before: unknown;
    after: unknown;
  }): Promise<void>;
  requestSeed(cycleId: string, nurseId: string): Promise<CycleSeed | undefined>;
  lockPlacement(placementId: string): Promise<void>;
  lockCycleForRequest(
    cycleId: string,
    nurseId: string,
  ): Promise<
    | {
        patient_id: string;
        placement_id: string | null;
        status: string;
      }
    | undefined
  >;
  addRequest(input: {
    id: string;
    cycleId: string;
    kind: string;
    requestedEnd: string | null;
    reason: string;
    requestedBy: string;
    previousStatus: string;
  }): Promise<void>;
  decisionSeed(
    cycleId: string,
    requestId: string,
  ): Promise<CycleDecisionSeed | undefined>;
  lockCycle(cycleId: string): Promise<
    | {
        version: number | string;
        status: string;
      }
    | undefined
  >;
  lockRequest(
    cycleId: string,
    requestId: string,
  ): Promise<LockedCycleRequest | undefined>;
  roomStatusCapacity(roomId: string): Promise<
    | {
        capacity: number | string;
        status: string;
      }
    | undefined
  >;
  placementDates(placementId: string): Promise<
    | {
        starts_on: string;
        ends_on: string;
        status: string;
      }
    | undefined
  >;
  extensionDateCheck(
    requestedEnd: string,
    endsOn: string,
    startsOn: string,
  ): Promise<{
    invalid: boolean;
    too_long: boolean;
  }>;
  extensionOverlap(
    patientId: string,
    placementId: string,
    requestedEnd: string,
    endsOn: string,
  ): Promise<boolean>;
  extensionOccupancy(
    roomId: string,
    endsOn: string,
    requestedEnd: string,
    placementId: string,
  ): Promise<number>;
  extendPlacement(placementId: string, requestedEnd: string): Promise<void>;
  releaseDateNotStarted(startsOn: string, today: string): Promise<boolean>;
  hasFutureTasks(placementId: string): Promise<boolean>;
  releasePlacement(placementId: string, today: string): Promise<void>;
  setCycleStatus(cycleId: string, status: string): Promise<void>;
  incrementCycleVersion(cycleId: string): Promise<void>;
  decideRequest(
    requestId: string,
    status: string,
    doctorId: string,
    note: string,
  ): Promise<void>;
  notifyNurse(input: {
    id: string;
    nurseId: string;
    cycleId: string;
    message: string;
  }): Promise<void>;
}
