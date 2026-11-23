import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Notifications } from '../application/notifications';
export function createHttpNotifications(http: HttpClient): Notifications {
    return {
        list: async () => (await http.request<components['schemas']['NotificationPage']>('/notifications', {}, value => Array.isArray(value.items))).items,
        markRead: async (id) => { await http.request<components['schemas']['NotificationRead']>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }, value => value.ok === true); }
    };
}
