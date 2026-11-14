import { TaskChanges, TaskStatus } from "../../domain/tasks/tugas-perawatan";
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
  picId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
export interface CreateTaskInput {
  patientId: string;
  placementId: string;
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
