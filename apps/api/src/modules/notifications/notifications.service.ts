import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";

@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async list(actor: Actor) {
    const rows = await this.db.query(
      `SELECT jsonb_build_object('id',id,'cycleId',cycle_id,'message',message,'readAt',read_at,'createdAt',created_at) AS item FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 50`,
      [actor.id],
    );
    const items = rows.map((r: { item: unknown }) => r.item);
    return { items, total: items.length };
  }
  async markRead(actor: Actor, notificationId: string) {
    const result = await this.db.query(
      `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id`,
      [notificationId, actor.id],
    );
    if (!result.length) throw AppError.notFound();
    return { ok: true };
  }
}
