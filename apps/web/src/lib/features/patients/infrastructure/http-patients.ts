import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Patients } from '../application/patients';
export function createHttpPatients(http: HttpClient): Patients {
    return { context: id => http.request<components['schemas']['PatientContext']>(`/patients/${encodeURIComponent(id)}/context`) };
}
