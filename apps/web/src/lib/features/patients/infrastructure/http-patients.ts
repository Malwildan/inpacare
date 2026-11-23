import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Patients } from '../application/patients';
export function createHttpPatients(http: HttpClient): Patients {
    return {
        context: id => http.request<components['schemas']['PatientContext']>(`/patients/${encodeURIComponent(id)}/context`),
        list: (search, offset) => http.request<components['schemas']['PatientPage']>(`/patients?${new URLSearchParams({ q: search, limit: '25', offset: String(offset) })}`, {}, value => Array.isArray(value.items) && Number.isFinite(value.total)),
        create: input => http.request<components['schemas']['Patient']>('/patients', { method: 'POST', body: JSON.stringify(input) }, value =>
            typeof value.id === 'string' && typeof value.medicalRecordNo === 'string' && typeof value.name === 'string'),
    };
}
