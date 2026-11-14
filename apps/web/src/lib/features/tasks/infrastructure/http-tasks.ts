import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { TasksRepository } from '../application/tasks';
type Schemas = components['schemas'];
export function createHttpTasks(http: HttpClient): TasksRepository {
    const path = (id: string) => `/tasks/${encodeURIComponent(id)}`;
    return {
        list: query => { const search = new URLSearchParams(); for (const [key, value] of Object.entries(query))
            if (value !== '')
                search.set(key, String(value)); return http.request<Schemas['TaskPage']>(`/tasks?${search}`); },
        get: id => http.request<Schemas['Task']>(path(id)),
        history: async (id) => (await http.request<Schemas['TaskHistoryPage']>(`${path(id)}/history`)).items,
        create: input => http.request<Schemas['Task']>('/tasks', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewTask']) }),
        update: (id, input) => http.request<Schemas['Task']>(path(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['UpdateTask']) }),
        move: (id, input) => http.request<Schemas['Task']>(`${path(id)}/move`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['MoveTask']) }),
        reassign: (id, input) => http.request<Schemas['Task']>(`${path(id)}/reassign`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['ReassignTask']) }),
        remove: (id, input) => http.request(path(id), { method: 'DELETE', body: JSON.stringify(input satisfies Schemas['ReasonBody']) })
    };
}
