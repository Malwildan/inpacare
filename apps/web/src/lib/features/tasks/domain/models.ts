import type { NewObservation } from '$lib/features/medical-records';

export type TaskType = 'regular' | 'measurement';
export type Task = {
    type: TaskType;
    cycleId: string | null;
    id: string;
    title: string;
    description: string;
    notes: string;
    patientId: string;
    patientName: string;
    medicalRecordNo: string;
    roomId: string;
    roomName: string;
    picId: string;
    picName: string;
    priority: string;
    status: string;
    startsAt: string;
    endsAt: string;
    version: number;
    createdById: string;
    createdByName: string;
};
export type TaskHistory = {
    id: string;
    actorId: string;
    actorName: string;
    action: string;
    reason: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    createdAt: string;
};
export type NewTask = {
    type?: TaskType;
    patientId: string;
    placementId: string;
    picId: string;
    title: string;
    description?: string;
    notes?: string;
    priority: "low" | "normal" | "high";
    startsAt: string;
    endsAt: string;
};
export type CompleteMeasurement = NewObservation & { expectedVersion: number };
export type UpdateTask = {
    expectedVersion: number;
    title?: string;
    description?: string;
    notes?: string;
    priority?: "low" | "normal" | "high";
    startsAt?: string;
    endsAt?: string;
    status?: "todo" | "in_progress" | "done" | "cancelled";
    reason?: string;
};
export type ReassignTask = {
    expectedVersion: number;
    picId: string;
    reason: string;
};
export type DeleteTask = {
    expectedVersion: number;
    reason: string;
};
export type MoveTask = { expectedVersion: number; status: 'todo' | 'in_progress' | 'done' | 'cancelled'; beforeTaskId: string | null; reason?: string };
