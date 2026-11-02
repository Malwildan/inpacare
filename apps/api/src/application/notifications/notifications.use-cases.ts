import { DomainError } from "../../domain/shared/domain-error";
import { Actor } from "../../domain/auth/actor";
import { NotificationStore } from "./notification-store.port";
export class NotificationsUseCases {
  constructor(private readonly store: NotificationStore) {}
  async list(actor: Actor) {
    const items = await this.store.listForUser(actor.id);
    return { items, total: items.length };
  }
  async markRead(actor: Actor, notificationId: string) {
    if (!(await this.store.markRead(notificationId, actor.id)))
      throw DomainError.notFound();
    return { ok: true };
  }
}
