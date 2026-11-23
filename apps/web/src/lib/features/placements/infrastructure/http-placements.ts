import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { PlacementsRepository } from '../application/placements';
type Schemas = components['schemas'];
export function createHttpPlacements(http: HttpClient): PlacementsRepository {
    const path = (id: string) => `/placements/${encodeURIComponent(id)}`;
    return {
        occupancy: async (from, to, includeCancelled = false) => (await http.request<Schemas['PlacementPage']>(`/occupancy?${new URLSearchParams({ from, to, ...(includeCancelled ? { includeCancelled: 'true' } : {}) })}`)).items,
        create: input => http.request<Schemas['PlacementResult']>('/placements', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewPlacement']) }, value => typeof value.id === 'string'),
        update: (id, input) => http.request<Schemas['PlacementMutationResult']>(path(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['UpdatePlacement']) }, value => typeof value.id === 'string'),
        cancel: (id, input) => http.request<Schemas['PlacementCancelledResult']>(path(id), { method: 'DELETE', body: JSON.stringify(input satisfies Schemas['CancelPlacement']) }, value => typeof value.id === 'string'),
        history: async id => (await http.request<Schemas['PlacementHistoryPage']>(`${path(id)}/history`)).items
    };
}
