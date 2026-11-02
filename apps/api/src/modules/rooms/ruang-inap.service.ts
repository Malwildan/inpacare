import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";
import { id } from "../../common/domain";
import {
  CreateRoomDto,
  CreateRoomItemDto,
  DeleteRoomItemDto,
  RoomVersionDto,
  UpdateRoomDto,
  UpdateRoomItemDto,
} from "./dto/room.dto";

@Injectable()
export class RuangInapService {
  constructor(private readonly dataSource: DataSource) {}

  private async room(manager: EntityManager, roomId: string) {
    const rows = await manager.query(
      `SELECT jsonb_build_object('id',r.id,'name',r.name,'roomClass',r.room_class,'capacity',r.capacity,'status',r.status,'picId',r.pic_id,'picName',u.name,'dailyRate',r.daily_rate::text,'version',r.version,'items',COALESCE(i.items,'[]'::jsonb),'totalCost',COALESCE(i.total_cost,0)::text,'occupants',COALESCE(o.occupants,0)) AS value FROM rooms r LEFT JOIN users u ON u.id=r.pic_id LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',ri.id,'name',ri.name,'category',ri.category,'quantity',ri.quantity,'unitPrice',ri.unit_price::text) ORDER BY ri.name) items,sum(ri.quantity*ri.unit_price) total_cost FROM room_items ri WHERE ri.room_id=r.id AND ri.deleted_at IS NULL) i ON true LEFT JOIN LATERAL (SELECT count(*) occupants FROM placements p WHERE p.room_id=r.id AND p.status='active' AND p.starts_on<=timezone('Asia/Jakarta',now())::date AND p.ends_on>=timezone('Asia/Jakarta',now())::date) o ON true WHERE r.id=$1 AND r.deleted_at IS NULL`,
      [roomId],
    );
    if (!rows[0]) throw AppError.notFound();
    return rows[0].value;
  }
  async list() {
    const rows = await this.dataSource.query(
      `SELECT jsonb_build_object('id',r.id,'name',r.name,'roomClass',r.room_class,'capacity',r.capacity,'status',r.status,'picId',r.pic_id,'picName',u.name,'dailyRate',r.daily_rate::text,'version',r.version,'items',COALESCE(i.items,'[]'::jsonb),'totalCost',COALESCE(i.total_cost,0)::text,'occupants',COALESCE(o.occupants,0)) AS value FROM rooms r LEFT JOIN users u ON u.id=r.pic_id LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',ri.id,'name',ri.name,'category',ri.category,'quantity',ri.quantity,'unitPrice',ri.unit_price::text) ORDER BY ri.name) items,sum(ri.quantity*ri.unit_price) total_cost FROM room_items ri WHERE ri.room_id=r.id AND ri.deleted_at IS NULL) i ON true LEFT JOIN LATERAL (SELECT count(*) occupants FROM placements p WHERE p.room_id=r.id AND p.status='active' AND p.starts_on<=timezone('Asia/Jakarta',now())::date AND p.ends_on>=timezone('Asia/Jakarta',now())::date) o ON true WHERE r.deleted_at IS NULL ORDER BY r.name LIMIT 100`,
    );
    return { items: rows.map((r: { value: unknown }) => r.value) };
  }
  detail(roomId: string) {
    return this.room(this.dataSource.manager, roomId);
  }
  async create(actor: Actor, dto: CreateRoomDto) {
    const name = dto.name.trim(),
      roomClass = dto.roomClass.trim();
    if (!name || !roomClass)
      throw AppError.validation("Nama dan tipe ruangan wajib diisi.");
    await this.validatePic(this.dataSource.manager, dto.picId);
    const roomId = id();
    try {
      await this.dataSource.query(
        `INSERT INTO rooms(id,name,room_class,capacity,status,pic_id,daily_rate) VALUES($1,$2,$3,$4,$5,$6,$7::numeric)`,
        [
          roomId,
          name,
          roomClass,
          dto.capacity,
          dto.status ?? "available",
          dto.picId ?? null,
          dto.dailyRate ?? "0",
        ],
      );
    } catch (e: any) {
      if (e?.driverError?.code === "23505" || e?.code === "23505")
        throw AppError.conflict("Nama ruangan sudah digunakan.");
      throw e;
    }
    return this.detail(roomId);
  }
  async update(roomId: string, dto: UpdateRoomDto) {
    if (!dto.name.trim() || !dto.roomClass.trim())
      throw AppError.validation("Nama dan tipe ruangan wajib diisi.");
    await this.validatePic(this.dataSource.manager, dto.picId);
    try {
      return await this.dataSource.transaction(async (m) => {
        const rows = await m.query(
          "SELECT version FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [roomId],
        );
        if (!rows[0]) throw AppError.notFound();
        if (rows[0].version !== dto.expectedVersion)
          throw AppError.conflict(
            "Ruangan telah berubah; muat ulang sebelum menyimpan.",
          );
        const cap = await m.query(
          `WITH e AS (SELECT starts_on day,1 change FROM placements WHERE room_id=$1 AND status='active' UNION ALL SELECT ends_on+1,-1 FROM placements WHERE room_id=$1 AND status='active'), d AS (SELECT day,sum(change) change FROM e GROUP BY day), o AS (SELECT sum(change) OVER(ORDER BY day) n FROM d) SELECT COALESCE(max(n),0)>$2 AS too_many FROM o`,
          [roomId, dto.capacity],
        );
        if (cap[0]?.too_many)
          throw AppError.conflict(
            "Kapasitas tidak boleh kurang dari penempatan yang sudah tersimpan.",
          );
        await m.query(
          "UPDATE rooms SET name=$2,room_class=$3,capacity=$4,status=$5,pic_id=$6,daily_rate=$7::numeric,version=version+1 WHERE id=$1",
          [
            roomId,
            dto.name.trim(),
            dto.roomClass.trim(),
            dto.capacity,
            dto.status,
            dto.picId ?? null,
            dto.dailyRate,
          ],
        );
        return this.room(m, roomId);
      });
    } catch (e: any) {
      if (e?.driverError?.code === "23505" || e?.code === "23505")
        throw AppError.conflict("Nama ruangan sudah digunakan.");
      throw e;
    }
  }
  private async validatePic(m: EntityManager, picId?: string | null) {
    if (!picId) return;
    const r = await m.query(
      `SELECT EXISTS(SELECT 1 FROM users u JOIN nurses n ON n.user_id=u.id WHERE u.id=$1 AND u.role='PERAWAT' AND u.active AND n.active) ok`,
      [picId],
    );
    if (!r[0]?.ok) throw AppError.validation("PIC harus berupa perawat aktif.");
  }
  async addItem(roomId: string, dto: CreateRoomItemDto) {
    this.validItem(dto);
    const itemId = id();
    const exists = await this.dataSource.transaction(async (m) => {
      const room = await m.query(
        "SELECT id FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [roomId],
      );
      if (!room[0]) return false;
      await m.query(
        "INSERT INTO room_items(id,room_id,name,category,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6::numeric)",
        [
          itemId,
          roomId,
          dto.name.trim(),
          dto.category.trim(),
          dto.quantity,
          dto.unitPrice,
        ],
      );
      await m.query("UPDATE rooms SET version=version+1 WHERE id=$1", [roomId]);
      return true;
    });
    if (!exists) throw AppError.notFound();
    return this.detail(roomId);
  }
  async updateItem(roomId: string, itemId: string, dto: UpdateRoomItemDto) {
    this.validItem(dto);
    return this.dataSource.transaction(async (m) => {
      const room = await m.query(
        "SELECT version FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [roomId],
      );
      if (!room[0]) throw AppError.notFound();
      if (room[0].version !== dto.expectedVersion)
        throw AppError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        );
      const r = await m.query(
        "UPDATE room_items SET name=$3,category=$4,quantity=$5,unit_price=$6::numeric WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL RETURNING id",
        [
          itemId,
          roomId,
          dto.name.trim(),
          dto.category.trim(),
          dto.quantity,
          dto.unitPrice,
        ],
      );
      if (!r[0]) throw AppError.notFound();
      await m.query("UPDATE rooms SET version=version+1 WHERE id=$1", [roomId]);
      return this.room(m, roomId);
    });
  }
  async deleteItem(roomId: string, itemId: string, dto: DeleteRoomItemDto) {
    return this.dataSource.transaction(async (m) => {
      const room = await m.query(
        "SELECT version FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [roomId],
      );
      if (!room[0]) throw AppError.notFound();
      if (room[0].version !== dto.expectedVersion)
        throw AppError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        );
      const r = await m.query(
        "UPDATE room_items SET deleted_at=now() WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL RETURNING id",
        [itemId, roomId],
      );
      if (!r[0]) throw AppError.notFound();
      await m.query("UPDATE rooms SET version=version+1 WHERE id=$1", [roomId]);
      return this.room(m, roomId);
    });
  }
  async deleteRoom(roomId: string, dto: RoomVersionDto) {
    return this.dataSource.transaction(async (m) => {
      const r = await m.query(
        "SELECT version FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [roomId],
      );
      if (!r[0]) throw AppError.notFound();
      if (r[0].version !== dto.expectedVersion)
        throw AppError.conflict(
          "Ruangan telah berubah; muat ulang sebelum menghapus.",
        );
      const links = await m.query(
        `SELECT EXISTS(SELECT 1 FROM placements WHERE room_id=$1 AND status='active' AND ends_on>=timezone('Asia/Jakarta',now())::date) OR EXISTS(SELECT 1 FROM tasks WHERE room_id=$1 AND deleted_at IS NULL AND status IN ('todo','in_progress')) AS linked`,
        [roomId],
      );
      if (links[0].linked)
        throw AppError.conflict(
          "Selesaikan atau batalkan penempatan dan tugas aktif sebelum mengarsipkan ruangan.",
        );
      await m.query(
        "UPDATE rooms SET deleted_at=now(),version=version+1 WHERE id=$1",
        [roomId],
      );
      return { deleted: true };
    });
  }
  private validItem(d: CreateRoomItemDto) {
    if (!d.name.trim() || !d.category.trim())
      throw AppError.validation("Nama dan kategori item wajib diisi.");
  }
}
