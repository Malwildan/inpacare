import { Actor } from "../../domain/auth/actor";
export interface CurrentPlacement {
  id: string;
  patient_id: string;
  room_id: string;
  starts_on: string;
  ends_on: string;
  status: string;
  version: number;
}
export interface PlacementStore {
  occupancy(
    actor: Actor,
    q: {
      from: string;
      to: string;
      roomId?: string;
    },
  ): Promise<unknown[]>;
  patientExistsForUpdate(patientId: string): Promise<boolean>;
  linked(placementId: string): Promise<
    | {
        patientId: string;
        roomId: string;
      }
    | undefined
  >;
  roomForCreate(roomId: string): Promise<
    | {
        id: string;
        capacity: number;
        status: string;
      }
    | undefined
  >;
  roomForCancel(roomId: string): Promise<void>;
  lockRooms(roomIds: string[]): Promise<
    Array<{
      id: string;
      capacity: number;
      status: string;
    }>
  >;
  currentForUpdate(placementId: string): Promise<CurrentPlacement | undefined>;
  lockCyclesForUpdate(
    placementId: string,
    includeDeleted?: boolean,
  ): Promise<
    Array<{
      status: string;
    }>
  >;
  lockTasksForUpdate(
    placementId: string,
    includeDeleted?: boolean,
  ): Promise<
    Array<{
      starts_at: Date | string;
      ends_at: Date | string;
      deleted_at: Date | null;
    }>
  >;
  patientOverlap(
    patientId: string,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<boolean>;
  peakOccupancy(
    roomId: string,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<number>;
  create(input: {
    id: string;
    patientId: string;
    roomId: string;
    startsOn: string;
    endsOn: string;
    actorId: string;
  }): Promise<void>;
  byId(placementId: string): Promise<unknown>;
  update(
    placementId: string,
    roomId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<void>;
  cancellationBlocked(placementId: string): Promise<boolean>;
  cancel(placementId: string): Promise<void>;
}
