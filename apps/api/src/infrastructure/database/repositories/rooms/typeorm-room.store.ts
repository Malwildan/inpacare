import { EntityManager } from "typeorm";
import { DomainError } from "../../../../domain/shared/domain-error";
import {
  RoomRecord,
  RoomStore,
} from "../../../../application/rooms/room-store.port";
const ROOM_SELECT = `SELECT jsonb_build_object('id',r.id,'name',r.name,'roomClass',r.room_class,'capacity',r.capacity,'status',r.status,'picId',r.pic_id,'picName',u.name,'dailyRate',r.daily_rate::text,'version',r.version,'items',COALESCE(i.items,'[]'::jsonb),'occupants',COALESCE(o.occupants,0)) AS value FROM rooms r LEFT JOIN users u ON u.id=r.pic_id LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',ri.id,'name',ri.name,'category',ri.category,'quantity',ri.quantity,'unitPrice',ri.unit_price::text) ORDER BY ri.name) items FROM room_items ri WHERE ri.room_id=r.id AND ri.deleted_at IS NULL) i ON true LEFT JOIN LATERAL (SELECT count(*) occupants FROM placements p WHERE p.room_id=r.id AND p.status='active' AND p.starts_on<=timezone('Asia/Jakarta',now())::date AND p.ends_on>=timezone('Asia/Jakarta',now())::date) o ON true`;
export class TypeOrmRoomStore implements RoomStore {
  constructor(private readonly manager: EntityManager) {}
  async list() {
    const rows = await this.manager.query(
      `${ROOM_SELECT} WHERE r.deleted_at IS NULL ORDER BY r.name LIMIT 100`,
    );
    return rows.map((r: { value: RoomRecord }) => r.value);
  }
  async detail(roomId: string): Promise<RoomRecord> {
    const rows = await this.manager.query(
      `${ROOM_SELECT} WHERE r.id=$1 AND r.deleted_at IS NULL`,
      [roomId],
    );
    if (!rows[0]) throw DomainError.notFound();
    return rows[0].value;
  }
  async validatePic(picId?: string | null) {
    if (!picId) return;
    const r = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM users u JOIN nurses n ON n.user_id=u.id WHERE u.id=$1 AND u.role='PERAWAT' AND u.active AND n.active) ok`,
      [picId],
    );
    if (!r[0]?.ok)
      throw DomainError.validation("PIC harus berupa perawat aktif.");
  }
  async create(d: {
    id: string;
    name: string;
    roomClass: string;
    capacity: number;
    status: string;
    picId: string | null;
    dailyRate: string;
  }) {
    try {
      await this.manager.query(
        `INSERT INTO rooms(id,name,room_class,capacity,status,pic_id,daily_rate) VALUES($1,$2,$3,$4,$5,$6,$7::numeric)`,
        [d.id, d.name, d.roomClass, d.capacity, d.status, d.picId, d.dailyRate],
      );
    } catch (error: unknown) {
      const code =
        (
          error as {
            driverError?: {
              code?: string;
            };
            code?: string;
          }
        )?.driverError?.code ??
        (
          error as {
            code?: string;
          }
        )?.code;
      if (code === "23505")
        throw DomainError.conflict("Nama ruangan sudah digunakan.");
      throw error;
    }
  }
  async lockVersion(roomId: string): Promise<number | undefined> {
    const rows = await this.manager.query(
      "SELECT version FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [roomId],
    );
    return rows[0]?.version;
  }
  async capacityExceeded(roomId: string, capacity: number) {
    const cap = await this.manager.query(
      `WITH e AS (SELECT starts_on AS day,1 change FROM placements WHERE room_id=$1 AND status='active' UNION ALL SELECT ends_on+1,-1 FROM placements WHERE room_id=$1 AND status='active'), d AS (SELECT day,sum(change) change FROM e GROUP BY day), o AS (SELECT sum(change) OVER(ORDER BY day) n FROM d) SELECT COALESCE(max(n),0)>$2 AS too_many FROM o`,
      [roomId, capacity],
    );
    return !!cap[0]?.too_many;
  }
  async update(
    roomId: string,
    d: {
      name: string;
      roomClass: string;
      capacity: number;
      status: string;
      picId: string | null;
      dailyRate: string;
    },
  ) {
    try {
      await this.manager.query(
        "UPDATE rooms SET name=$2,room_class=$3,capacity=$4,status=$5,pic_id=$6,daily_rate=$7::numeric,version=version+1 WHERE id=$1",
        [
          roomId,
          d.name,
          d.roomClass,
          d.capacity,
          d.status,
          d.picId,
          d.dailyRate,
        ],
      );
    } catch (error: unknown) {
      const code =
        (
          error as {
            driverError?: {
              code?: string;
            };
            code?: string;
          }
        )?.driverError?.code ??
        (
          error as {
            code?: string;
          }
        )?.code;
      if (code === "23505")
        throw DomainError.conflict("Nama ruangan sudah digunakan.");
      throw error;
    }
  }
  async addItem(
    roomId: string,
    itemId: string,
    d: {
      name: string;
      category: string;
      quantity: number;
      unitPrice: string;
    },
  ) {
    const room = await this.manager.query(
      "SELECT id FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [roomId],
    );
    if (!room[0]) return false;
    await this.manager.query(
      "INSERT INTO room_items(id,room_id,name,category,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6::numeric)",
      [itemId, roomId, d.name, d.category, d.quantity, d.unitPrice],
    );
    await this.manager.query("UPDATE rooms SET version=version+1 WHERE id=$1", [
      roomId,
    ]);
    return true;
  }
  async updateItem(
    roomId: string,
    itemId: string,
    d: {
      name: string;
      category: string;
      quantity: number;
      unitPrice: string;
    },
  ) {
    const r = await this.manager.query(
      "UPDATE room_items SET name=$3,category=$4,quantity=$5,unit_price=$6::numeric WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL RETURNING id",
      [itemId, roomId, d.name, d.category, d.quantity, d.unitPrice],
    );
    return !!r[0];
  }
  async deleteItem(roomId: string, itemId: string) {
    const r = await this.manager.query(
      "UPDATE room_items SET deleted_at=now() WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL RETURNING id",
      [itemId, roomId],
    );
    return !!r[0];
  }
  async bumpVersion(roomId: string) {
    await this.manager.query("UPDATE rooms SET version=version+1 WHERE id=$1", [
      roomId,
    ]);
  }
  async hasActiveLinks(roomId: string) {
    const links = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM placements WHERE room_id=$1 AND status='active' AND ends_on>=timezone('Asia/Jakarta',now())::date) OR EXISTS(SELECT 1 FROM tasks WHERE room_id=$1 AND deleted_at IS NULL AND status IN ('todo','in_progress')) AS linked`,
      [roomId],
    );
    return !!links[0].linked;
  }
  async archive(roomId: string) {
    await this.manager.query(
      "UPDATE rooms SET deleted_at=now(),version=version+1 WHERE id=$1",
      [roomId],
    );
  }
}
