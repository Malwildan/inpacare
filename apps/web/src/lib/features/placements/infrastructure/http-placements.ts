import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { PlacementsRepository } from '../application/placements';
type Schemas = components['schemas'];
export function createHttpPlacements(http: HttpClient): PlacementsRepository {
    const path = (id: string) => `/placements/${encodeURIComponent(id)}`;
    return {
        occupancy: async (from, to) => (await http.request<Schemas['PlacementPage']>(`/occupancy?${new URLSearchParams({ from, to })}`)).items,
        create: input => http.request('/placements', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewPlacement']) }),
        update: (id, input) => http.request(path(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['UpdatePlacement']) }),
        cancel: (id, input) => http.request(path(id), { method: 'DELETE', body: JSON.stringify(input) })
    };
}
