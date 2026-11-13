import { Actor } from "../../domain/auth/actor";
export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  notes: string;
  createdById: string;
  createdByName: string;
  patientId: string;
  patientName: string;
  medicalRecordNo: string;
  roomId: string;
  roomName: string;
  picId: string;
  picName: string;
  priority: string;
  status: string;
  startsAt: Date | string;
  endsAt: Date | string;
  version: number;
}
export interface LockedTask {
  id: string;
  patient_id: string;
  room_id: string;
  placement_id: string;
  pic_id: string;
  created_by: string;
  title: string;
  description: string;
  notes: string;
  priority: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  version: number;
  deleted_at: Date | null;
}
export interface LockedPlacement {
  patient_id: string;
  room_id: string;
  starts_on: string;
  ends_on: string;
  status: string;
}
export interface TaskLock {
  task: LockedTask;
  placement: LockedPlacement;
}
export interface TaskStore {
  list(
    actor: Actor,
    filters: {
      order?: "board";
      search: string;
      status: string | null;
      priority: string | null;
      roomId: string | null;
      patientId: string | null;
      picId: string | null;
      from: string | null;
      to: string | null;
      limit: number;
      offset: number;
    },
  ): Promise<{
    items: TaskRecord[];
    total: number;
    counts: Record<string, number>;
  }>;
  detail(
    taskId: string,
    actor: Actor,
    includeDeleted?: boolean,
  ): Promise<TaskRecord>;
  lockTask(taskId: string): Promise<TaskLock>;
  lockBoard(): Promise<void>;
  movePosition(taskId: string, actor: Actor, status: string, beforeTaskId: string | null): Promise<boolean>;
  requireActivePic(picId: string): Promise<void>;
  patientExistsForUpdate(patientId: string): Promise<boolean>;
  placementRoom(placementId: string): Promise<string | undefined>;
  activePlacement(
    placementId: string,
    patientId: string,
    starts: Date,
    ends: Date,
  ): Promise<
    | {
        roomId: string;
      }
    | undefined
  >;
  lockRoom(roomId: string): Promise<void>;
  lockReleasedCycles(placementId: string): Promise<boolean>;
  createTask(input: {
    id: string;
    patientId: string;
    roomId: string;
    placementId: string;
    picId: string;
    actorId: string;
    title: string;
    description: string;
    notes: string;
    startsAt: Date;
    endsAt: Date;
    priority: string;
  }): Promise<void>;
  createSnapshot(
    taskId: string,
    historyId: string,
    actorId: string,
  ): Promise<void>;
  updateTask(
    taskId: string,
    values: {
      title: string;
      description: string;
      notes: string;
      priority: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
    },
  ): Promise<void>;
  historyChange(input: {
    id: string;
    taskId: string;
    actorId: string;
    action: string;
    reason: string | null;
    before: unknown;
    after: unknown;
  }): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  reassignTask(taskId: string, picId: string): Promise<void>;
  history(taskId: string, actor: Actor): Promise<unknown[]>;
}
