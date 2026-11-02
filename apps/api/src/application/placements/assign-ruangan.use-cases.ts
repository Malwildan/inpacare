import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
import {
  placementIncludesTask,
  validatePlacementSpan,
} from "../../domain/placements/placement-period";
import { canReadPatient } from "../patients/patient-access";
import { id } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { PlacementStore } from "./placement-store.port";
export interface PlacementDateRange {
  from: string;
  to: string;
  roomId?: string;
}
export interface CreatePlacementInput {
  patientId: string;
  roomId: string;
  startsOn: string;
  endsOn: string;
}
export interface UpdatePlacementInput extends CreatePlacementInput {
  expectedVersion: number;
}
export class AssignRuanganUseCases {
  constructor(
    private readonly store: PlacementStore,
    private readonly uow: UnitOfWork,
  ) {}
  async occupancy(actor: Actor, q: PlacementDateRange) {
    const days = validatePlacementSpan(q.from, q.to);
    if (days > 30)
      throw DomainError.validation("Rentang kalender maksimal 31 hari.");
    return {
      items: await this.store.occupancy(actor, q),
      from: q.from,
      to: q.to,
    };
  }
  async create(actor: Actor, d: CreatePlacementInput) {
    validatePlacementSpan(d.startsOn, d.endsOn);
    const placementId = id();
    await this.uow.run(async (tx) => {
      await canReadPatient(tx.patients, actor, d.patientId);
      if (!(await tx.placements.patientExistsForUpdate(d.patientId)))
        throw DomainError.notFound();
      const room = await tx.placements.roomForCreate(d.roomId);
      if (!room) throw DomainError.notFound();
      if (room.status !== "available")
        throw DomainError.conflict("Ruangan tidak tersedia untuk penempatan.");
      if (await tx.placements.patientOverlap(d.patientId, d.startsOn, d.endsOn))
        throw DomainError.conflict(
          "Pasien sudah memiliki penempatan pada rentang tanggal tersebut.",
        );
      if (
        (await tx.placements.peakOccupancy(d.roomId, d.startsOn, d.endsOn)) >=
        room.capacity
      )
        throw DomainError.conflict(
          "Kapasitas ruangan tidak mencukupi pada sebagian rentang tanggal.",
        );
      await tx.placements.create({
        id: placementId,
        patientId: d.patientId,
        roomId: d.roomId,
        startsOn: d.startsOn,
        endsOn: d.endsOn,
        actorId: actor.id,
      });
    });
    return this.store.byId(placementId);
  }
  async update(actor: Actor, placementId: string, d: UpdatePlacementInput) {
    validatePlacementSpan(d.startsOn, d.endsOn);
    return this.uow.run(async (tx) => {
      const linked = await tx.placements.linked(placementId);
      if (!linked) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, linked.patientId);
      if (!(await tx.placements.patientExistsForUpdate(linked.patientId)))
        throw DomainError.notFound();
      const roomIds = [...new Set([linked.roomId, d.roomId])].sort();
      const rooms = await tx.placements.lockRooms(roomIds);
      if (rooms.length !== roomIds.length) throw DomainError.notFound();
      const current = await tx.placements.currentForUpdate(placementId);
      if (!current) throw DomainError.notFound();
      if (current.version !== d.expectedVersion)
        throw DomainError.conflict(
          "Penempatan berubah; muat ulang sebelum menyimpan.",
        );
      if (current.status !== "active")
        throw DomainError.conflict(
          "Penempatan yang dibatalkan tidak dapat diubah.",
        );
      if (current.patient_id !== d.patientId)
        throw DomainError.validation(
          "Pasien pada penempatan tidak dapat diganti; buat penempatan baru.",
        );
      const cycles = await tx.placements.lockCyclesForUpdate(placementId);
      const tasks = await tx.placements.lockTasksForUpdate(placementId, true);
      const room = rooms.find((r) => r.id === d.roomId)!;
      if (room.status !== "available")
        throw DomainError.conflict("Ruangan tidak tersedia untuk penempatan.");
      if (
        await tx.placements.patientOverlap(
          current.patient_id,
          d.startsOn,
          d.endsOn,
          placementId,
        )
      )
        throw DomainError.conflict(
          "Pasien sudah memiliki penempatan pada rentang tanggal tersebut.",
        );
      if (
        (await tx.placements.peakOccupancy(
          d.roomId,
          d.startsOn,
          d.endsOn,
          placementId,
        )) >= room.capacity
      )
        throw DomainError.conflict(
          "Kapasitas ruangan tidak mencukupi pada sebagian rentang tanggal.",
        );
      if (
        cycles.some((c) => c.status !== "released") ||
        (d.roomId !== current.room_id && tasks.length > 0) ||
        tasks.some(
          (t) =>
            !t.deleted_at &&
            !placementIncludesTask(
              d.startsOn,
              d.endsOn,
              new Date(t.starts_at),
              new Date(t.ends_at),
            ),
        )
      )
        throw DomainError.conflict(
          "Rentang baru tidak boleh memutus siklus atau jadwal tugas yang tersimpan.",
        );
      await tx.placements.update(placementId, d.roomId, d.startsOn, d.endsOn);
      return {
        id: placementId,
        patientId: current.patient_id,
        roomId: d.roomId,
        startsOn: d.startsOn,
        endsOn: d.endsOn,
        status: "active",
        version: d.expectedVersion + 1,
      };
    });
  }
  async cancel(
    actor: Actor,
    placementId: string,
    d: {
      expectedVersion: number;
    },
  ) {
    return this.uow.run(async (tx) => {
      const rel = await tx.placements.linked(placementId);
      if (!rel) throw DomainError.notFound();
      await canReadPatient(tx.patients, actor, rel.patientId);
      if (!(await tx.placements.patientExistsForUpdate(rel.patientId)))
        throw DomainError.notFound();
      await tx.placements.roomForCancel(rel.roomId);
      const p = await tx.placements.currentForUpdate(placementId);
      if (!p) throw DomainError.notFound();
      if (p.version !== d.expectedVersion)
        throw DomainError.conflict(
          "Penempatan berubah; muat ulang sebelum membatalkan.",
        );
      if (p.status !== "active")
        throw DomainError.conflict("Penempatan sudah dibatalkan.");
      await tx.placements.lockCyclesForUpdate(placementId, true);
      await tx.placements.lockTasksForUpdate(placementId);
      if (await tx.placements.cancellationBlocked(placementId))
        throw DomainError.conflict(
          "Penempatan dengan siklus atau tugas aktif tidak dapat dibatalkan.",
        );
      await tx.placements.cancel(placementId);
      return {
        id: placementId,
        status: "cancelled",
        version: d.expectedVersion + 1,
      };
    });
  }
}
