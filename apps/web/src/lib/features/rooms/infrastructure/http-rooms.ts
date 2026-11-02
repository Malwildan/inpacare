import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Rooms } from '../application/rooms';
type Schemas = components['schemas'];
export function createHttpRooms(http: HttpClient): Rooms {
    const room = (id: string) => `/rooms/${encodeURIComponent(id)}`;
    const item = (id: string, itemId: string) => `${room(id)}/items/${encodeURIComponent(itemId)}`;
    return {
        list: async () => (await http.request<Schemas['RoomPage']>('/rooms')).items,
        create: input => http.request('/rooms', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewRoom']) }),
        update: (id, input) => http.request(room(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['EditRoom']) }),
        remove: (id, input) => http.request(room(id), { method: 'DELETE', body: JSON.stringify(input) }),
        addItem: (id, input) => http.request(`${room(id)}/items`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewRoomItem']) }),
        updateItem: (id, itemId, input) => http.request(item(id, itemId), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['UpdateRoomItem']) }),
        removeItem: (id, itemId, input) => http.request(item(id, itemId), { method: 'DELETE', body: JSON.stringify(input) })
    };
}
