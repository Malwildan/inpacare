import { Actor } from "../../domain/auth/actor";
import { isCoordinator } from "../../domain/auth/permissions";
import { DomainError } from "../../domain/shared/domain-error";
import {
  parseTaskInstant,
  TaskStatus,
  TugasPerawatan,
} from "../../domain/tasks/tugas-perawatan";
import { placementIncludesTask } from "../../domain/placements/placement-period";
import { id } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { canReadPatient } from "../patients/patient-access";
import { TaskStore } from "./tugas-store.port";
import {
  TaskFilters,
  CreateTaskInput,
  UpdateTaskInput,
  ReasonInput,
  ReassignTaskInput,
} from "./tugas.types";
export class TugasUseCases {
  constructor(
    private readonly store: TaskStore,
    private readonly uow: UnitOfWork,
  ) {}
  async list(actor: Actor, q: TaskFilters) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (q.from && q.to && q.to < q.from)
      throw DomainError.validation("Rentang tanggal tidak valid.");
    return this.store.list(actor, {
      search: (q.search ?? "").trim(),
      status: q.status ?? null,
      priority: q.priority ?? null,
      roomId: q.roomId ?? null,
      patientId: q.patientId ?? null,
      picId: q.picId ?? null,
      from: q.from ?? null,
      to: q.to ?? null,
      limit: Math.min(q.limit ?? 50, 100),
      offset: Math.min(q.offset ?? 0, 100000),
    });
  }
  async create(actor: Actor, d: CreateTaskInput) {
    if (!isCoordinator(actor)) throw DomainError.forbidden();
    const title = d.title.trim();
    if (!title) throw DomainError.validation("Judul wajib diisi.");
    const startsAt = parseTaskInstant(d.startsAt, "Waktu mulai"),
      endsAt = parseTaskInstant(d.endsAt, "Waktu selesai");
    TugasPerawatan.validateSpan(startsAt, endsAt);
    const taskId = id();
    await this.uow.run(async (tx) => {
      if (!(await tx.tasks.patientExistsForUpdate(d.patientId)))
        throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, d.patientId);
      const roomId = await tx.tasks.placementRoom(d.placementId);
      if (!roomId)
        throw DomainError.validation(
          "Pilih penempatan aktif yang mencakup seluruh waktu tugas.",
        );
      await tx.tasks.lockRoom(roomId);
      const placement = await tx.tasks.activePlacement(
        d.placementId,
        d.patientId,
        startsAt,
        endsAt,
      );
      if (!placement)
        throw DomainError.validation(
          "Pilih penempatan aktif yang mencakup seluruh waktu tugas.",
        );
      if (placement.roomId !== roomId)
        throw DomainError.conflict(
          "Penempatan berubah; muat ulang sebelum membuat tugas.",
        );
      if (await tx.tasks.lockReleasedCycles(d.placementId))
        throw DomainError.validation(
          "Penempatan ini sudah dirilis dan tidak dapat menerima tugas baru.",
        );
      await tx.tasks.requireActivePic(d.picId);
      await tx.tasks.createTask({
        id: taskId,
        patientId: d.patientId,
        roomId: placement.roomId,
        placementId: d.placementId,
        picId: d.picId,
        actorId: actor.id,
        title,
        description: d.description?.trim() ?? "",
        notes: d.notes?.trim() ?? "",
        startsAt,
        endsAt,
        priority: d.priority,
      });
      await tx.tasks.createSnapshot(taskId, id(), actor.id);
    });
    return this.store.detail(taskId, actor);
  }
  async detail(actor: Actor, taskId: string) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    return this.store.detail(taskId, actor);
  }
  async update(actor: Actor, taskId: string, d: UpdateTaskInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    return this.uow.run(async (tx) => {
      const { task: t, placement } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at || (!isCoordinator(actor) && t.pic_id !== actor.id))
        throw DomainError.notFound();
      if (t.version !== d.expectedVersion)
        throw DomainError.conflict(
          "Tugas berubah. Muat ulang sebelum menyimpan.",
        );
      if (placement.status !== "active")
        throw DomainError.validation("Penempatan pasien tidak aktif.");
      await tx.tasks.requireActivePic(t.pic_id);
      const model = new TugasPerawatan({
        title: t.title,
        description: t.description,
        notes: t.notes,
        priority: t.priority,
        startsAt: new Date(t.starts_at),
        endsAt: new Date(t.ends_at),
        status: t.status as TaskStatus,
      });
      const next = model.revise(actor, d);
      if (
        !placementIncludesTask(
          placement.starts_on,
          placement.ends_on,
          next.startsAt,
          next.endsAt,
        )
      )
        throw DomainError.validation(
          "Jadwal tugas harus berada dalam rentang penempatan.",
        );
      const before = {
        title: t.title,
        description: t.description,
        notes: t.notes,
        priority: t.priority,
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        status: t.status,
        version: t.version,
      };
      await tx.tasks.updateTask(taskId, next);
      await tx.tasks.historyChange({
        id: id(),
        taskId,
        actorId: actor.id,
        action: "updated",
        reason: d.reason?.trim() || null,
        before,
        after: {
          title: next.title,
          description: next.description,
          notes: next.notes,
          priority: next.priority,
          starts_at: next.startsAt,
          ends_at: next.endsAt,
          status: next.status,
          version: t.version + 1,
        },
      });
      return tx.tasks.detail(taskId, actor);
    });
  }
  async remove(actor: Actor, taskId: string, d: ReasonInput) {
    if (!isCoordinator(actor)) throw DomainError.forbidden();
    if (!d.reason.trim()) throw DomainError.validation("Alasan wajib diisi.");
    return this.uow.run(async (tx) => {
      const { task: t } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at) throw DomainError.notFound();
      if (t.version !== d.expectedVersion)
        throw DomainError.conflict(
          "Tugas berubah. Muat ulang sebelum menghapus.",
        );
      await tx.tasks.removeTask(taskId);
      await tx.tasks.historyChange({
        id: id(),
        taskId,
        actorId: actor.id,
        action: "deleted",
        reason: d.reason.trim(),
        before: { title: t.title, status: t.status, version: t.version },
        after: { deleted: true, version: t.version + 1 },
      });
      return { deleted: true };
    });
  }
  async reassign(actor: Actor, taskId: string, d: ReassignTaskInput) {
    if (!isCoordinator(actor)) throw DomainError.forbidden();
    if (!d.reason.trim())
      throw DomainError.validation("Alasan pengalihan wajib diisi.");
    if (d.picId === actor.id)
      throw DomainError.validation(
        "Koordinator tidak dapat ditetapkan sebagai PIC.",
      );
    return this.uow.run(async (tx) => {
      const { task: t } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at) throw DomainError.notFound();
      if (t.version !== d.expectedVersion)
        throw DomainError.conflict(
          "Tugas berubah. Muat ulang sebelum mengalihkan.",
        );
      if (["done", "cancelled"].includes(t.status))
        throw DomainError.validation(
          "Tugas selesai atau dibatalkan tidak dapat dialihkan.",
        );
      await tx.tasks.requireActivePic(d.picId);
      await tx.tasks.reassignTask(taskId, d.picId);
      await tx.tasks.historyChange({
        id: id(),
        taskId,
        actorId: actor.id,
        action: "reassigned",
        reason: d.reason.trim(),
        before: { picId: t.pic_id, version: t.version },
        after: { picId: d.picId, version: t.version + 1 },
      });
      return tx.tasks.detail(taskId, actor);
    });
  }
  async history(actor: Actor, taskId: string) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    await this.store.detail(taskId, actor, true);
    const items = await this.store.history(taskId, actor);
    return { items, total: items.length };
  }
}
