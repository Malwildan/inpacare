import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { CareCycles } from '../application/care-cycles';
type Schemas = components['schemas'];
export function createHttpCareCycles(http: HttpClient): CareCycles {
    const path = (id: string) => `/cycles/${encodeURIComponent(id)}`;
    return {
        creationCandidates: async () => (await http.request<Schemas['CycleCandidatePage']>('/cycles/creation-candidates')).items,
        dashboard: async (filters) => { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)); return (await http.request<Schemas['CyclePage']>(`/cycles/dashboard${query.size ? '?' + query : ''}`)).items; },
        detail: id => http.request<Schemas['Cycle']>(path(id)),
        create: input => http.request('/cycles', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewCycle']) }),
        change: (id, input) => http.request(path(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['ChangeCycleStatus']) }),
        remove: (id, input) => http.request(path(id), { method: 'DELETE', body: JSON.stringify(input satisfies Schemas['DeleteCycle']) }),
        request: (id, input) => http.request(`${path(id)}/requests`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewCycleRequest']) }),
        decide: (id, requestId, input) => http.request(`${path(id)}/requests/${encodeURIComponent(requestId)}/decision`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['DecideCycleRequest']) })
    };
}
