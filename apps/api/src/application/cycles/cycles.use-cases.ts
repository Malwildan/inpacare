import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
import { cycleTransitionAllowed } from "../../domain/cycles/cycle-transition";
import { id, today } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { CycleStore, CycleListFilters } from "./cycle-store.port";
export interface CreateCycleInput {
  patientId: string;
  doctorId: string;
  placementId?: string | null;
}
export interface ChangeCycleInput {
  status?: string;
  placementId?: string | null;
  expectedVersion: number;
}
export interface DeleteCycleInput {
  expectedVersion: number;
  reason: string;
}
export interface CycleRequestInput {
  kind: "extend" | "release";
  requestedEnd?: string | null;
  reason: string;
}
export interface DecideCycleRequestInput {
  decision: "approve" | "reject";
  note: string;
  expectedVersion: number;
}
export class CyclesUseCases {
  constructor(
    private readonly store: CycleStore,
    private readonly uow: UnitOfWork,
  ) {}
  private scope(actor: Actor) {
    if (!["DOKTER", "PERAWAT"].includes(actor.role))
      throw DomainError.forbidden();
  }
  async list(actor: Actor, filters: CycleListFilters = {}) {
    this.scope(actor);
    if (
      filters.status &&
      ![
        "pending",
        "assigned",
        "in_care",
        "extend",
        "released",
        "pending_approval",
      ].includes(filters.status)
    )
      throw DomainError.validation("Status siklus tidak valid.");
    return this.store.list(actor, {
      ...filters,
      search: filters.search?.trim() ?? "",
    });
  }
  async detail(actor: Actor, cycleId: string) {
    this.scope(actor);
    const item = await this.store.detail(actor, cycleId);
    if (!item) throw DomainError.notFound();
    return item;
  }
  async requestDetail(actor: Actor, cycleId: string, requestId: string) {
    await this.detail(actor, cycleId);
    const item = await this.store.requestDetail(cycleId, requestId);
    if (!item) throw DomainError.notFound();
    return item;
  }
  async creationCandidates(actor: Actor) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    return { items: await this.store.creationCandidates() };
  }
  async create(actor: Actor, input: CreateCycleInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (!(await this.store.canReadPatient(actor, input.patientId)))
      throw DomainError.notFound();
    if (!(await this.store.activeDoctor(input.doctorId)))
      throw DomainError.validation("Pilih dokter aktif.");
    const cycleId = await this.uow.run(async (tx) => {
      if (!(await tx.cycles.lockPatient(input.patientId)))
        throw DomainError.notFound();
      if (await tx.cycles.hasActiveCycle(input.patientId))
        throw DomainError.conflict("Pasien sudah memiliki rekap aktif. Buka rekap yang ada atau pilih pasien lain.");
      const placementId = input.placementId || null;
      if (placementId) {
        const roomId = await tx.cycles.placementRoom(
          placementId,
          input.patientId,
        );
        if (!roomId) throw DomainError.validation("Penempatan tidak sesuai dengan pasien yang dipilih.");
        await tx.cycles.lockRoom(roomId);
        if (!(await tx.cycles.activePlacement(placementId, input.patientId)))
          throw DomainError.conflict("Penempatan tidak lagi aktif.");
      }
      const cycleId = await tx.cycles.nextId();
      await tx.cycles.createCycle({
        id: cycleId,
        patientId: input.patientId,
        placementId,
        doctorId: input.doctorId,
        nurseId: actor.id,
      });
      return cycleId;
    });
    return {
      id: cycleId,
      patientId: input.patientId,
      placementId: input.placementId ?? null,
      doctorId: input.doctorId,
      nurseId: actor.id,
      status: "pending",
      version: 1,
    };
  }
  async change(actor: Actor, cycleId: string, input: ChangeCycleInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    return this.uow.run(async (tx) => {
      const seed = await tx.cycles.changeSeed(cycleId, actor.id);
      if (!seed) throw DomainError.notFound();
      if (!(await tx.cycles.lockPatient(seed.patient_id)))
        throw DomainError.notFound();
      const targetPlacement =
        input.placementId === undefined
          ? seed.placement_id
          : input.placementId || null;
      if (targetPlacement) {
        const roomId = await tx.cycles.placementRoom(
          targetPlacement,
          seed.patient_id,
        );
        if (!roomId)
          throw DomainError.validation("Penempatan pasien tidak cocok.");
        await tx.cycles.lockRoom(roomId);
        if (
          !(await tx.cycles.activePlacement(targetPlacement, seed.patient_id))
        )
          throw DomainError.conflict("Penempatan tidak lagi aktif.");
      }
      const current = await tx.cycles.lockCycleForChange(cycleId, actor.id);
      if (!current) throw DomainError.notFound();
      if (Number(current.version) !== input.expectedVersion)
        throw DomainError.conflict(
          "Siklus telah berubah. Muat ulang lalu coba lagi.",
        );
      let status = current.status;
      if (input.placementId && current.status !== "pending")
        throw DomainError.conflict(
          "Penempatan hanya dapat dikaitkan pada rekap pending.",
        );
      if (input.status) {
        if (!cycleTransitionAllowed(status, input.status))
          throw DomainError.conflict("Transisi siklus tidak diizinkan.");
        if (!targetPlacement)
          throw DomainError.conflict("Rekap belum memiliki penempatan.");
        status = input.status;
      }
      await tx.cycles.updateCyclePlacementStatus(
        cycleId,
        targetPlacement,
        status,
      );
      return {
        ok: true,
        status,
        placementId: targetPlacement,
        version: input.expectedVersion + 1,
      };
    });
  }
  async remove(actor: Actor, cycleId: string, input: DeleteCycleInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (!input.reason.trim())
      throw DomainError.validation("Alasan penghapusan wajib diisi.");
    return this.uow.run(async (tx) => {
      const seed = await tx.cycles.deleteSeed(cycleId, actor.id);
      if (!seed) throw DomainError.notFound();
      if (!(await tx.cycles.lockPatient(seed.patient_id)))
        throw DomainError.notFound();
      const cycle = await tx.cycles.lockCycleForDelete(cycleId, actor.id);
      if (!cycle) throw DomainError.notFound();
      if (Number(cycle.version) !== input.expectedVersion)
        throw DomainError.conflict();
      if (cycle.status !== "pending")
        throw DomainError.conflict("Hanya rekap pending yang dapat dihapus.");
      if (await tx.cycles.hasPendingRequests(cycleId))
        throw DomainError.conflict(
          "Tutup permintaan yang masih menunggu sebelum menghapus rekap.",
        );
      const after = await tx.cycles.softDeleteCycle(cycleId);
      if (!after) throw DomainError.notFound();
      await tx.cycles.addCycleHistory({
        id: id(),
        cycleId,
        actorId: actor.id,
        reason: input.reason.trim(),
        before: cycle,
        after,
      });
      return { id: cycleId, deleted: true, version: input.expectedVersion + 1 };
    });
  }
  async request(actor: Actor, cycleId: string, input: CycleRequestInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    if (!input.reason.trim())
      throw DomainError.validation("Alasan wajib diisi.");
    if ((input.kind === "extend") !== !!input.requestedEnd)
      throw DomainError.validation(
        "Isi tanggal baru hanya untuk permintaan perpanjangan.",
      );
    const requestId = id();
    await this.uow.run(async (tx) => {
      const seed = await tx.cycles.requestSeed(cycleId, actor.id);
      if (!seed) throw DomainError.notFound();
      if (!(await tx.cycles.lockPatient(seed.patient_id)))
        throw DomainError.notFound();
      if (seed.placement_id) {
        const roomId = await tx.cycles.roomForPlacement(seed.placement_id);
        if (roomId) await tx.cycles.lockRoom(roomId);
        await tx.cycles.lockPlacement(seed.placement_id);
      }
      const cycle = await tx.cycles.lockCycleForRequest(cycleId, actor.id);
      if (!cycle) throw DomainError.notFound();
      if (!cycle.placement_id)
        throw DomainError.conflict("Siklus belum memiliki penempatan.");
      if (!["in_care", "extend"].includes(cycle.status))
        throw DomainError.conflict(
          "Permintaan hanya tersedia pada siklus dalam perawatan.",
        );
      await tx.cycles.addRequest({
        id: requestId,
        cycleId,
        kind: input.kind,
        requestedEnd: input.requestedEnd ?? null,
        reason: input.reason.trim(),
        requestedBy: actor.id,
        previousStatus: cycle.status,
      });
    });
    return {
      id: requestId,
      cycleId,
      kind: input.kind,
      requestedEnd: input.requestedEnd ?? null,
      status: "pending",
    };
  }
  async decide(
    actor: Actor,
    cycleId: string,
    requestId: string,
    input: DecideCycleRequestInput,
  ) {
    if (actor.role !== "DOKTER") throw DomainError.forbidden();
    if (!input.note.trim())
      throw DomainError.validation("Catatan keputusan wajib diisi.");
    return this.uow.run(async (tx) => {
      const seed = await tx.cycles.decisionSeed(cycleId, requestId);
      if (
        !seed ||
        seed.doctor_id !== actor.id ||
        seed.request_status !== "pending"
      )
        throw DomainError.notFound();
      if (!(await tx.cycles.lockPatient(seed.patient_id)))
        throw DomainError.notFound();
      let roomId: string | null = null;
      if (seed.placement_id) {
        roomId = (await tx.cycles.roomForPlacement(seed.placement_id)) ?? null;
        if (roomId) await tx.cycles.lockRoom(roomId);
      }
      if (seed.placement_id) await tx.cycles.lockPlacement(seed.placement_id);
      const cycle = await tx.cycles.lockCycle(cycleId);
      if (!cycle) throw DomainError.notFound();
      const req = await tx.cycles.lockRequest(cycleId, requestId);
      if (!req || req.status !== "pending") throw DomainError.notFound();
      if (Number(cycle.version) !== input.expectedVersion)
        throw DomainError.conflict(
          "Siklus telah berubah. Muat ulang lalu coba lagi.",
        );
      const beforeStatus = cycle.status;
      if (input.decision === "approve") {
        if (!seed.placement_id)
          throw DomainError.conflict("Siklus belum memiliki penempatan.");
        if (!roomId)
          throw DomainError.conflict("Penempatan tidak lagi tersedia.");
        const room = await tx.cycles.roomStatusCapacity(roomId);
        if (!room) throw DomainError.conflict("Ruang tidak lagi tersedia.");
        if (room.status !== "available")
          throw DomainError.conflict(
            "Ruang tidak menerima perubahan penempatan.",
          );
        const placement = await tx.cycles.placementDates(seed.placement_id);
        if (!placement || placement.status !== "active")
          throw DomainError.conflict("Penempatan tidak lagi aktif.");
        if (seed.kind === "extend") {
          const dates = await tx.cycles.extensionDateCheck(
            seed.requested_end!,
            placement.ends_on,
            placement.starts_on,
          );
          if (dates.invalid)
            throw DomainError.validation(
              "Tanggal akhir harus melewati jadwal yang berlaku.",
            );
          if (dates.too_long)
            throw DomainError.validation(
              "Rentang penempatan maksimal 366 hari.",
            );
          if (
            await tx.cycles.extensionOverlap(
              seed.patient_id,
              seed.placement_id,
              seed.requested_end!,
              placement.ends_on,
            )
          )
            throw DomainError.conflict(
              "Pasien memiliki penempatan lain pada tanggal perpanjangan.",
            );
          if (
            (await tx.cycles.extensionOccupancy(
              roomId,
              placement.ends_on,
              seed.requested_end!,
              seed.placement_id,
            )) >= Number(room.capacity)
          )
            throw DomainError.conflict(
              "Ruang sudah penuh pada tanggal perpanjangan.",
            );
          await tx.cycles.extendPlacement(
            seed.placement_id,
            seed.requested_end!,
          );
          await tx.cycles.setCycleStatus(cycleId, "extend");
        } else {
          if (
            await tx.cycles.releaseDateNotStarted(placement.starts_on, today())
          )
            throw DomainError.conflict(
              "Penempatan belum dimulai; pelepasan otomatis tidak tersedia.",
            );
          if (await tx.cycles.hasFutureTasks(seed.placement_id))
            throw DomainError.conflict(
              "Selesaikan atau batalkan tugas mendatang sebelum pelepasan.",
            );
          await tx.cycles.releasePlacement(seed.placement_id, today());
          await tx.cycles.setCycleStatus(cycleId, "released");
        }
      } else await tx.cycles.incrementCycleVersion(cycleId);
      const status = input.decision === "approve" ? "approved" : "rejected";
      await tx.cycles.decideRequest(
        requestId,
        status,
        actor.id,
        input.note.trim(),
      );
      await tx.cycles.notifyNurse({
        id: id(),
        nurseId: seed.nurse_id,
        cycleId,
        message: `Permintaan ${seed.kind} ${input.decision === "approve" ? "disetujui" : "ditolak"}.`,
      });
      return {
        ok: true,
        status,
        cycleStatus:
          input.decision === "approve"
            ? seed.kind === "release"
              ? "released"
              : "extend"
            : beforeStatus,
        version: Number(input.expectedVersion) + 1,
      };
    });
  }
}
