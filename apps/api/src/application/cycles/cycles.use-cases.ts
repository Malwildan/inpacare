import { Actor } from "../../domain/auth/actor";
import { isCoordinator, requireCoordinator } from "../../domain/auth/permissions";
import { DomainError } from "../../domain/shared/domain-error";
import { cycleTransitionAllowed } from "../../domain/cycles/cycle-transition";
import { id, today } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { CycleStore, CycleListFilters, CreatedCycle } from "./cycle-store.port";
import { createPlacement, CreatePlacementInput } from "../placements/assign-ruangan.use-cases";
export interface CreateCycleInput {
  patientId: string;
  doctorId: string;
  nurseId?: string;
  placementId?: string | null;
  newPlacement?: Omit<CreatePlacementInput, "patientId"> | null;
  requestId?: string;
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
export interface ReassignCycleInput {
  nurseId: string;
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
      throw DomainError.validation("Pilih status rekap rawat inap dari daftar.");
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
  async assignmentCandidates(actor: Actor) {
    requireCoordinator(actor);
    return { items: await this.store.assignmentCandidates() };
  }
  async create(actor: Actor, input: CreateCycleInput) {
    if (actor.role !== "PERAWAT") throw DomainError.forbidden();
    const coordinator = isCoordinator(actor);
    if (coordinator && !input.nurseId?.trim())
      throw DomainError.validation("Pilih perawat penanggung jawab.");
    if (!coordinator && input.nurseId !== undefined && input.nurseId !== actor.id)
      throw DomainError.forbidden();
    const nurseId = input.nurseId ?? actor.id;
    if (input.placementId && input.newPlacement)
      throw DomainError.validation("Pilih penempatan yang ada atau buat penempatan baru.");
    const payload = JSON.stringify({
      patientId: input.patientId,
      doctorId: input.doctorId,
      ...(nurseId === actor.id ? {} : { nurseId }),
      placementId: input.placementId || null,
      newPlacement: input.newPlacement ? {
        roomId: input.newPlacement.roomId,
        startsOn: input.newPlacement.startsOn,
        endsOn: input.newPlacement.endsOn,
      } : null,
    });
    return this.uow.run(async (tx) => {
      if (input.requestId) {
        const previous = await tx.cycles.creationForRequest(actor.id, input.requestId);
        if (previous) {
          if (previous.payload !== payload)
            throw DomainError.conflict("Permintaan ini sudah dipakai untuk data lain. Buka formulir baru.");
          return previous.result;
        }
      }
      if (!(await tx.cycles.canReadPatient(actor, input.patientId)))
        throw DomainError.notFound();
      if (!(await tx.cycles.activeDoctor(input.doctorId)))
        throw DomainError.validation("Pilih dokter penanggung jawab yang masih aktif.");
      if (!(await tx.cycles.lockPatient(input.patientId)))
        throw DomainError.notFound();
      if (await tx.cycles.hasActiveCycle(input.patientId))
        throw DomainError.conflict("Pasien sudah memiliki rekap aktif. Buka rekap yang ada atau pilih pasien lain.");
      if (coordinator && !(await tx.cycles.lockActiveNurse(nurseId)))
        throw DomainError.validation("Pilih perawat penanggung jawab yang masih aktif.");
      let placementId = input.placementId || null;
      if (input.newPlacement)
        placementId = await createPlacement(tx, actor, { ...input.newPlacement, patientId: input.patientId });
      else if (placementId) {
        const roomId = await tx.cycles.placementRoom(
          placementId,
          input.patientId,
        );
        if (!roomId) throw DomainError.validation("Penempatan ini tidak sesuai dengan pasien yang dipilih. Periksa pilihan penempatan.");
        await tx.cycles.lockRoom(roomId);
        if (!(await tx.cycles.activePlacement(placementId, input.patientId)))
          throw DomainError.conflict("Penempatan sudah tidak aktif. Periksa kembali penempatan pasien.");
      }
      const cycleId = await tx.cycles.nextId();
      const result: CreatedCycle = {
        id: cycleId,
        patientId: input.patientId,
        placementId,
        doctorId: input.doctorId,
        nurseId,
        status: placementId ? "assigned" : "pending",
        version: 1,
      };
      await tx.cycles.createCycle(result);
      if (input.requestId)
        await tx.cycles.saveCreationRequest(actor.id, input.requestId, payload, result);
      return result;
    });
  }
  async reassign(actor: Actor, cycleId: string, input: ReassignCycleInput) {
    requireCoordinator(actor);
    const reason = input.reason.trim();
    if (!reason || reason.length > 500)
      throw DomainError.validation("Isi alasan pengalihan dengan maksimal 500 karakter.");
    return this.uow.run(async (tx) => {
      const cycle = await tx.cycles.lockCycle(cycleId);
      if (!cycle) throw DomainError.notFound();
      if (Number(cycle.version) !== input.expectedVersion)
        throw DomainError.conflict();
      if (cycle.nurse_id === input.nurseId)
        throw DomainError.validation("Pilih perawat yang berbeda dari penanggung jawab saat ini.");
      if (!(await tx.cycles.lockActiveNurse(input.nurseId)))
        throw DomainError.validation("Pilih perawat penanggung jawab yang masih aktif.");
      const version = input.expectedVersion + 1;
      await tx.cycles.setCycleNurse(cycleId, input.nurseId);
      await tx.cycles.addCycleHistory({
        id: id(),
        cycleId,
        actorId: actor.id,
        action: "nurse_reassigned",
        reason,
        before: { nurseId: cycle.nurse_id, version: input.expectedVersion },
        after: { nurseId: input.nurseId, version },
      });
      return { id: cycleId, nurseId: input.nurseId, version };
    });
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
          throw DomainError.validation("Penempatan ini milik pasien lain. Pilih penempatan untuk pasien yang dipilih.");
        await tx.cycles.lockRoom(roomId);
        if (
          !(await tx.cycles.activePlacement(targetPlacement, seed.patient_id))
        )
          throw DomainError.conflict("Penempatan sudah tidak aktif. Periksa kembali penempatan pasien.");
      }
      const current = await tx.cycles.lockCycleForChange(cycleId, actor.id);
      if (!current) throw DomainError.notFound();
      if (Number(current.version) !== input.expectedVersion)
        throw DomainError.conflict();
      let status = current.status;
      if (input.placementId && current.status !== "pending")
        throw DomainError.conflict(
          "Penempatan hanya dapat dikaitkan pada rekap berstatus Menunggu.",
        );
      if (input.status) {
        if (!cycleTransitionAllowed(status, input.status))
          throw DomainError.conflict("Perubahan status rekap ditolak. Periksa status terbaru dan pilih tindakan yang tersedia.");
        if (!targetPlacement)
          throw DomainError.conflict("Rekap belum memiliki penempatan. Pilih penempatan sebelum memulai perawatan.");
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
      throw DomainError.validation("Isi Alasan penghapusan rekap rawat inap.");
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
        throw DomainError.conflict("Hanya rekap berstatus Menunggu yang dapat dihapus.");
      if (await tx.cycles.hasPendingRequests(cycleId))
        throw DomainError.conflict(
          "Tutup permintaan yang masih menunggu sebelum menghapus rekap.",
        );
      if (await tx.medicalRecords.hasEpisodeClinicalData(cycleId))
        throw DomainError.conflict("Rekap memiliki observasi atau rekam medis. Pertahankan rekap untuk menyimpan riwayat pasien.");
      const after = await tx.cycles.softDeleteCycle(cycleId);
      if (!after) throw DomainError.notFound();
      await tx.cycles.addCycleHistory({
        id: id(),
        cycleId,
        actorId: actor.id,
        action: "deleted",
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
      throw DomainError.validation("Isi Alasan pengajuan perpanjangan atau pelepasan.");
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
        throw DomainError.conflict("Rekap belum memiliki penempatan. Periksa detail rekap sebelum melanjutkan permintaan.");
      if (!["in_care", "extend"].includes(cycle.status))
        throw DomainError.conflict(
          "Permintaan hanya dapat diajukan untuk rekap yang sedang Dalam perawatan. Periksa status rekap.",
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
      throw DomainError.validation("Isi Catatan keputusan sebelum menyimpan persetujuan atau penolakan.");
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
        throw DomainError.conflict();
      const beforeStatus = cycle.status;
      if (input.decision === "approve") {
        if (!seed.placement_id)
          throw DomainError.conflict("Rekap belum memiliki penempatan. Periksa detail rekap sebelum melanjutkan permintaan.");
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
          throw DomainError.conflict("Penempatan sudah tidak aktif. Periksa kembali penempatan pasien.");
        if (seed.kind === "extend") {
          const dates = await tx.cycles.extensionDateCheck(
            seed.requested_end!,
            placement.ends_on,
            placement.starts_on,
          );
          if (dates.invalid)
            throw DomainError.validation(
              "Tanggal selesai baru harus setelah tanggal selesai saat ini. Pilih tanggal yang lebih akhir.",
            );
          if (dates.too_long)
            throw DomainError.validation(
              "Rentang penempatan melebihi 366 hari. Pilih tanggal selesai yang lebih dekat.",
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
              "Ruang penuh pada tanggal perpanjangan. Periksa kapasitas sebelum memutuskan permintaan.",
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
              "Penempatan belum dimulai sehingga pelepasan otomatis tidak tersedia. Periksa tanggal masuk sebelum memutuskan permintaan.",
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
        nurseId: cycle.nurse_id,
        cycleId,
        requestId,
        message: `Permintaan ${seed.kind === "extend" ? "perpanjangan" : "pelepasan"} ${input.decision === "approve" ? "disetujui" : "ditolak"}.`,
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
