import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { ReferenceData } from '../application/reference';
export function createHttpReference(http: HttpClient): ReferenceData {
    return {
        load: () => http.request<components['schemas']['Reference']>('/reference'),
        patients: async () => (await http.request<components['schemas']['PatientPage']>('/patients')).items,
        staff: async () => (await http.request<components['schemas']['StaffPage']>('/staff')).items
    };
}
