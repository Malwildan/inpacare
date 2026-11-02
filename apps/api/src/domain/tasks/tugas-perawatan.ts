import { DomainError } from "../shared/domain-error";
import { Actor } from "../auth/actor";
import { isCoordinator } from "../auth/permissions";
import { assertEditableFields } from "./tugas.policy";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export interface TaskState {
  title: string;
  description: string;
  notes: string;
  priority: string;
  startsAt: Date;
  endsAt: Date;
  status: TaskStatus;
}
export interface TaskChanges {
  expectedVersion: number;
  title?: string;
  description?: string;
  notes?: string;
  priority?: string;
  startsAt?: string;
  endsAt?: string;
  status?: TaskStatus;
  reason?: string;
}
export function parseTaskInstant(value: string, label: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value))
    throw DomainError.validation(
      `${label} harus berformat waktu ISO 8601 dengan zona waktu.`,
    );
  return date;
}
export class TugasPerawatan {
  constructor(private readonly state: Readonly<TaskState>) {}
  revise(actor: Actor, changes: TaskChanges): TaskState {
    assertEditableFields(actor, changes);
    if (changes.title !== undefined && !changes.title.trim())
      throw DomainError.validation("Judul wajib diisi.");
    if (
      !Object.keys(changes).some(
        (key) => key !== "expectedVersion" && key !== "reason",
      )
    )
      throw DomainError.validation("Tidak ada perubahan tugas.");
    TugasPerawatan.validateStatus(
      this.state.status,
      changes.status,
      isCoordinator(actor),
    );
    if (
      changes.status === "cancelled" &&
      (!isCoordinator(actor) || !changes.reason?.trim())
    )
      throw DomainError.validation("Pembatalan memerlukan alasan koordinator.");
    const startsAt = changes.startsAt
      ? parseTaskInstant(changes.startsAt, "Waktu mulai")
      : this.state.startsAt;
    const endsAt = changes.endsAt
      ? parseTaskInstant(changes.endsAt, "Waktu selesai")
      : this.state.endsAt;
    TugasPerawatan.validateSpan(startsAt, endsAt);
    return {
      title: changes.title?.trim() ?? this.state.title,
      description: changes.description?.trim() ?? this.state.description,
      notes: changes.notes ?? this.state.notes,
      priority: changes.priority ?? this.state.priority,
      startsAt,
      endsAt,
      status: changes.status ?? this.state.status,
    };
  }
  static validateSpan(start: Date, end: Date) {
    if (end < start)
      throw DomainError.validation(
        "Waktu selesai tidak boleh sebelum waktu mulai.",
      );
  }
  static validateStatus(
    current: TaskStatus,
    next: TaskStatus | undefined,
    coordinator: boolean,
  ) {
    const allowed =
      next === undefined ||
      (current === "todo" && next === "in_progress") ||
      (current === "in_progress" && next === "done") ||
      (coordinator &&
        next === "cancelled" &&
        ["todo", "in_progress"].includes(current));
    if (!allowed)
      throw DomainError.validation("Perubahan status tugas tidak diizinkan.");
  }
}
