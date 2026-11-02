import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Notifications } from '../application/notifications';
export function createHttpNotifications(http: HttpClient): Notifications {
    return {
        list: async () => (await http.request<components['schemas']['NotificationPage']>('/notifications')).items,
        markRead: async (id) => { await http.request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }); }
    };
}
