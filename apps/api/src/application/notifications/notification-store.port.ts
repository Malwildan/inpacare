export interface NotificationItem {
  id: string;
  cycleId: string | null;
  message: string;
  readAt: Date | string | null;
  createdAt: Date | string;
}
export interface NotificationStore {
  listForUser(userId: string): Promise<NotificationItem[]>;
  markRead(notificationId: string, userId: string): Promise<boolean>;
}
