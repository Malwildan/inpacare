import { createHash } from "node:crypto";
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
import { saveObservation, validateObservation } from "../medical-records/observation-writes";
import { TaskStore } from "./tugas-store.port";
import {
  TaskFilters,
  CreateTaskInput,
  CompleteMeasurementInput,
  UpdateTaskInput,
  ReasonInput,
  ReassignTaskInput,
  MoveTaskInput,
} from "./tugas.types";
export class TugasUseCases {
  constructor(
    private readonly store: TaskStore,
    private readonly uow: UnitOfWork,
  ) {}
  async list(actor: Actor, q: TaskFilters) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (q.from && q.to && q.to < q.from)
      throw DomainError.validation("Rentang tanggal terbalik. Pilih tanggal akhir yang sama dengan atau setelah tanggal awal.");
    return this.store.list(actor, {
      order: q.order,
      search: (q.search ?? "").trim(),
      status: q.status ?? null,
      priority: q.priority ?? null,
      roomId: q.roomId ?? null,
      patientId: q.patientId ?? null,
      cycleId: q.cycleId ?? null,
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
    if (!title) throw DomainError.validation("Isi Judul tugas.");
    const startsAt = parseTaskInstant(d.startsAt, "Waktu mulai"),
      endsAt = parseTaskInstant(d.endsAt, "Waktu selesai");
    TugasPerawatan.validateSpan(startsAt, endsAt);
    const taskId = id();
    await this.uow.run(async (tx) => {
      await tx.tasks.lockBoard();
      if (!(await tx.tasks.patientExistsForUpdate(d.patientId)))
        throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, d.patientId);
      const roomId = await tx.tasks.placementRoom(d.placementId);
      if (roomId) await tx.tasks.lockRoom(roomId);
      const placement = roomId ? await tx.tasks.activePlacement(d.placementId, d.patientId) : undefined;
      if (d.cycleContext) {
        const cycle = await tx.tasks.lockCycleForTask(d.cycleContext.cycleId, d.patientId);
        if (!cycle) throw DomainError.notFound();
        if (cycle.status === "released" || cycle.placementId !== d.placementId ||
            placement?.version !== d.cycleContext.placementVersion)
          throw DomainError.conflict();
      }
      if (!placement || !placementIncludesTask(placement.startsOn, placement.endsOn, startsAt, endsAt))
        throw DomainError.validation(
          "Pilih penempatan aktif yang mencakup seluruh waktu tugas.",
        );
      if (placement.roomId !== roomId)
        throw DomainError.conflict();
      if (await tx.tasks.lockReleasedCycles(d.placementId))
        throw DomainError.validation(
          "Pasien sudah dilepas dari penempatan ini. Pilih penempatan aktif untuk membuat tugas baru.",
        );
      if (d.cycleContext) await tx.tasks.requireActiveCoordinator(actor.id);
      await tx.tasks.requireActivePic(d.picId);
      const type = d.type ?? "regular";
      const cycleId = d.cycleContext?.cycleId ?? (type === "measurement"
        ? await tx.tasks.measurementCycle(d.patientId, d.placementId)
        : null);
      if (type === "measurement" && !cycleId)
        throw DomainError.validation("Pilih penempatan yang terhubung ke rekap rawat inap aktif untuk tugas pengukuran.");
      await tx.tasks.createTask({
        id: taskId,
        type,
        cycleId: cycleId ?? null,
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
      if (d.status !== undefined) await tx.tasks.lockBoard();
      const { task: t, placement } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at || (!isCoordinator(actor) && t.pic_id !== actor.id))
        throw DomainError.notFound();
      if (t.version !== d.expectedVersion)
        throw DomainError.conflict();
      if (t.type === "measurement" && d.status === "done")
        throw DomainError.validation("Simpan hasil observasi untuk menyelesaikan tugas pengukuran.");
      if (placement.status !== "active")
        throw DomainError.validation("Penempatan pasien sudah tidak aktif. Periksa penempatan sebelum melanjutkan tugas.");
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
          "Jadwal tugas di luar rentang penempatan. Sesuaikan waktu mulai dan selesai dengan tanggal penempatan.",
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
      if (next.status !== t.status)
        await tx.tasks.movePosition(taskId, actor, next.status, null);
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
  async move(actor: Actor, taskId: string, d: MoveTaskInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    return this.uow.run(async (tx) => {
      await tx.tasks.lockBoard();
      const { task: t, placement } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at || (!isCoordinator(actor) && t.pic_id !== actor.id)) throw DomainError.notFound();
      if (t.version !== d.expectedVersion) throw DomainError.conflict();
      if (d.status !== t.status) {
        if (t.type === "measurement" && d.status === "done")
          throw DomainError.validation("Simpan hasil observasi untuk menyelesaikan tugas pengukuran.");
        if (placement.status !== "active") throw DomainError.validation("Penempatan pasien sudah tidak aktif. Periksa penempatan sebelum melanjutkan tugas.");
        TugasPerawatan.validateStatus(t.status as TaskStatus, d.status, isCoordinator(actor));
        if (d.status === "cancelled" && !d.reason?.trim()) throw DomainError.validation("Hanya koordinator yang dapat membatalkan tugas. Isi Alasan pembatalan untuk melanjutkan.");
        await tx.tasks.requireActivePic(t.pic_id);
      }
      const changed = await tx.tasks.movePosition(taskId, actor, d.status, d.beforeTaskId);
      if (!changed) return tx.tasks.detail(taskId, actor);
      await tx.tasks.updateTask(taskId, { title: t.title, description: t.description, notes: t.notes, priority: t.priority, startsAt: new Date(t.starts_at), endsAt: new Date(t.ends_at), status: d.status });
      await tx.tasks.historyChange({ id: id(), taskId, actorId: actor.id, action: d.status === t.status ? "reordered" : "updated", reason: d.reason?.trim() || null, before: { status: t.status, version: t.version }, after: { status: d.status, version: t.version + 1, beforeTaskId: d.beforeTaskId } });
      return tx.tasks.detail(taskId, actor);
    });
  }
  async completeMeasurement(actor: Actor, taskId: string, d: CompleteMeasurementInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    return this.uow.run(async (tx) => {
      await tx.tasks.lockBoard();
      const { task, placement } = await tx.tasks.lockTask(taskId);
      if (task.deleted_at || (!isCoordinator(actor) && task.pic_id !== actor.id))
        throw DomainError.notFound();
      if (task.pic_id !== actor.id) throw DomainError.forbidden();
      if (task.type !== "measurement" || !task.cycle_id)
        throw DomainError.validation("Tugas ini tidak memerlukan hasil observasi.");
      await tx.tasks.requireActivePic(task.pic_id);
      validateObservation(d);

      // The task is the idempotency scope. Keep the original submission fingerprint
      // so a retry still works if the observation is later corrected.
      const completionHash = createHash("sha256").update(JSON.stringify([
        d.expectedVersion, d.symptoms.trim(), d.nursingNote?.trim() ?? "",
        d.observedAt, d.temperature, d.systolic, d.diastolic, d.pulse, d.respiratoryRate, d.spo2,
      ])).digest("hex");
      if (task.status === "done") {
        const observationId = await tx.medicalRecords.completedTaskObservation(taskId, completionHash);
        if (!observationId) throw DomainError.conflict();
        return { task: await tx.tasks.detail(taskId, actor), observationId };
      }
      if (task.version !== d.expectedVersion) throw DomainError.conflict();
      TugasPerawatan.validateStatus(task.status as TaskStatus, "done", false);
      if (placement.status !== "active" ||
          await tx.tasks.measurementCycle(task.patient_id, task.placement_id) !== task.cycle_id)
        throw DomainError.conflict("Penempatan atau rekap rawat inap pada tugas pengukuran sudah tidak aktif.");

      const observationId = await saveObservation(
        tx.medicalRecords, actor, { patientId: task.patient_id, cycleId: task.cycle_id }, d,
        { taskId, completionHash },
      );
      await tx.tasks.movePosition(taskId, actor, "done", null);
      await tx.tasks.updateTask(taskId, {
        title: task.title, description: task.description, notes: task.notes, priority: task.priority,
        startsAt: new Date(task.starts_at), endsAt: new Date(task.ends_at), status: "done",
      });
      await tx.tasks.historyChange({
        id: id(), taskId, actorId: actor.id, action: "updated", reason: null,
        before: { status: task.status, version: task.version },
        after: { status: "done", version: task.version + 1, observationId },
      });
      return { task: await tx.tasks.detail(taskId, actor), observationId };
    });
  }
  async remove(actor: Actor, taskId: string, d: ReasonInput) {
    if (!isCoordinator(actor)) throw DomainError.forbidden();
    if (!d.reason.trim()) throw DomainError.validation("Isi Alasan penghapusan tugas.");
    return this.uow.run(async (tx) => {
      await tx.tasks.lockBoard();
      const { task: t } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at) throw DomainError.notFound();
      if (t.version !== d.expectedVersion)
        throw DomainError.conflict();
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
      throw DomainError.validation("Isi Alasan pengalihan sebelum mengganti penanggung jawab tugas.");
    if (d.picId === actor.id)
      throw DomainError.validation(
        "Koordinator tidak dapat ditetapkan sebagai penanggung jawab tugas.",
      );
    return this.uow.run(async (tx) => {
      await tx.tasks.lockBoard();
      const { task: t } = await tx.tasks.lockTask(taskId);
      if (t.deleted_at) throw DomainError.notFound();
      if (t.version !== d.expectedVersion)
        throw DomainError.conflict();
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
