import type { Notification } from '../domain/models';
export type Notifications = {
    list(): Promise<Notification[]>;
    markRead(id: string): Promise<void>;
};
