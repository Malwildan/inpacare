import { DomainError } from "../../domain/shared/domain-error";
import { Actor } from "../../domain/auth/actor";
import {
  validateRoomCost,
  validateRoomItem,
  validateRoomText,
} from "../../domain/rooms/room-cost";
import { id } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { RoomStore } from "./room-store.port";
export interface CreateRoomInput {
  name: string;
  roomClass: string;
  capacity: number;
  status?: string;
  picId?: string | null;
  dailyRate?: string;
}
export interface UpdateRoomInput {
  name: string;
  roomClass: string;
  capacity: number;
  picId?: string | null;
  expectedVersion: number;
  dailyRate: string;
  status: string;
}
export interface RoomItemInput {
  name: string;
  category: string;
  quantity: number;
  unitPrice: string;
}
export class RuangInapUseCases {
  constructor(
    private readonly store: RoomStore,
    private readonly uow: UnitOfWork,
  ) {}
  async list() {
    return { items: await this.store.list() };
  }
  detail(roomId: string) {
    return this.store.detail(roomId);
  }
  async create(_actor: Actor, dto: CreateRoomInput) {
    const name = dto.name.trim(),
      roomClass = dto.roomClass.trim();
    validateRoomText(name, roomClass);
    validateRoomCost(dto.dailyRate ?? "0");
    await this.store.validatePic(dto.picId);
    const roomId = id();
    await this.uow.run((tx) =>
      tx.rooms.create({
        id: roomId,
        name,
        roomClass,
        capacity: dto.capacity,
        status: dto.status ?? "available",
        picId: dto.picId ?? null,
        dailyRate: dto.dailyRate ?? "0",
      }),
    );
    return this.detail(roomId);
  }
  async update(roomId: string, dto: UpdateRoomInput) {
    validateRoomText(dto.name, dto.roomClass);
    validateRoomCost(dto.dailyRate);
    await this.store.validatePic(dto.picId);
    return this.uow.run(async (tx) => {
      const version = await tx.rooms.lockVersion(roomId);
      if (version === undefined) throw DomainError.notFound();
      if (version !== dto.expectedVersion)
        throw DomainError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        );
      if (await tx.rooms.capacityExceeded(roomId, dto.capacity))
        throw DomainError.conflict(
          "Kapasitas tidak boleh kurang dari penempatan yang sudah tersimpan.",
        );
      await tx.rooms.update(roomId, {
        name: dto.name.trim(),
        roomClass: dto.roomClass.trim(),
        capacity: dto.capacity,
        status: dto.status,
        picId: dto.picId ?? null,
        dailyRate: dto.dailyRate,
      });
      return tx.rooms.detail(roomId);
    });
  }
  async addItem(roomId: string, dto: RoomItemInput) {
    validateRoomItem(dto.name, dto.category);
    validateRoomCost(dto.unitPrice);
    const itemId = id();
    const exists = await this.uow.run((tx) =>
      tx.rooms.addItem(roomId, itemId, {
        ...dto,
        name: dto.name.trim(),
        category: dto.category.trim(),
      }),
    );
    if (!exists) throw DomainError.notFound();
    return this.detail(roomId);
  }
  async updateItem(
    roomId: string,
    itemId: string,
    dto: RoomItemInput & {
      expectedVersion: number;
    },
  ) {
    validateRoomItem(dto.name, dto.category);
    validateRoomCost(dto.unitPrice);
    return this.uow.run(async (tx) => {
      const version = await tx.rooms.lockVersion(roomId);
      if (version === undefined) throw DomainError.notFound();
      if (version !== dto.expectedVersion)
        throw DomainError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        );
      const updated = await tx.rooms.updateItem(roomId, itemId, {
        name: dto.name.trim(),
        category: dto.category.trim(),
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
      });
      if (!updated) throw DomainError.notFound();
      await tx.rooms.bumpVersion(roomId);
      return tx.rooms.detail(roomId);
    });
  }
  async deleteItem(
    roomId: string,
    itemId: string,
    dto: {
      expectedVersion: number;
    },
  ) {
    return this.uow.run(async (tx) => {
      const version = await tx.rooms.lockVersion(roomId);
      if (version === undefined) throw DomainError.notFound();
      if (version !== dto.expectedVersion)
        throw DomainError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        );
      if (!(await tx.rooms.deleteItem(roomId, itemId)))
        throw DomainError.notFound();
      await tx.rooms.bumpVersion(roomId);
      return tx.rooms.detail(roomId);
    });
  }
  async deleteRoom(
    roomId: string,
    dto: {
      expectedVersion: number;
    },
  ) {
    return this.uow.run(async (tx) => {
      const version = await tx.rooms.lockVersion(roomId);
      if (version === undefined) throw DomainError.notFound();
      if (version !== dto.expectedVersion)
        throw DomainError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menghapus.",
        );
      if (await tx.rooms.hasActiveLinks(roomId))
        throw DomainError.conflict(
          "Selesaikan atau batalkan penempatan dan tugas aktif sebelum mengarsipkan ruangan.",
        );
      await tx.rooms.archive(roomId);
      return { deleted: true };
    });
  }
}
