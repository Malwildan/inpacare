import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Patients } from '../application/patients';
export function createHttpPatients(http: HttpClient): Patients {
    return {
        context: id => http.request<components['schemas']['PatientContext']>(`/patients/${encodeURIComponent(id)}/context`),
        list: (search, offset) => http.request<components['schemas']['PatientPage']>(`/patients?${new URLSearchParams({ q: search, limit: '25', offset: String(offset) })}`),
        create: input => http.request<components['schemas']['Patient']>('/patients', { method: 'POST', body: JSON.stringify(input) }),
    };
}
