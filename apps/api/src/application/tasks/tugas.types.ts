import { TaskChanges, TaskStatus, TaskType } from "../../domain/tasks/tugas-perawatan";
import { ObservationInput } from "../medical-records/observation-writes";
export interface CompleteMeasurementInput extends ObservationInput {
  expectedVersion: number;
}
export interface MoveTaskInput {
  expectedVersion: number;
  status: TaskStatus;
  beforeTaskId: string | null;
  reason?: string;
}
export interface TaskFilters {
  order?: "board";
  search?: string;
  status?: string;
  priority?: string;
  roomId?: string;
  patientId?: string;
  cycleId?: string;
  picId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
export interface CreateTaskInput {
  type?: TaskType;
  patientId: string;
  placementId: string;
  cycleContext?: { cycleId: string; placementVersion: number };
  picId: string;
  title: string;
  description?: string;
  notes?: string;
  priority: string;
  startsAt: string;
  endsAt: string;
}
export type UpdateTaskInput = TaskChanges;
export interface ReasonInput {
  expectedVersion: number;
  reason: string;
}
export interface ReassignTaskInput extends ReasonInput {
  picId: string;
}
