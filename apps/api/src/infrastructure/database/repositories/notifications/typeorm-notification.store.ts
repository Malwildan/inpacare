import { EntityManager } from "typeorm";
import {
  NotificationItem,
  NotificationStore,
} from "../../../../application/notifications/notification-store.port";
export class TypeOrmNotificationStore implements NotificationStore {
  constructor(private readonly manager: EntityManager) {}
  async listForUser(userId: string): Promise<NotificationItem[]> {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',id,'cycleId',cycle_id,'message',message,'readAt',read_at,'createdAt',created_at) AS item FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 50`,
      [userId],
    );
    return rows.map((row: { item: NotificationItem }) => row.item);
  }
  async markRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.manager.query(
      `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id`,
      [notificationId, userId],
    );
    return result.length > 0;
  }
}
