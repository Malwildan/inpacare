import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { MedicalRepository } from '../application/medical-records';
type Schemas = components['schemas'];
export function createHttpMedicalRecords(http: HttpClient): MedicalRepository {
    const path = (id: string) => `/medical-records/${encodeURIComponent(id)}`;
    return {
        clinicalList: async () => (await http.request<Schemas['MedicalSummaryPage']>('/medical-records')).items,
        admissionList: async () => (await http.request<Schemas['AdmissionMedicalPage']>('/medical-records')).items,
        clinicalDetail: id => http.request<Schemas['MedicalRecord']>(path(id)),
        admissionDetail: id => http.request<Schemas['AdmissionMedicalRecord']>(path(id)),
        create: input => http.request<{
            id: string;
        }>('/medical-records', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewMedicalRecord']) }),
        update: (id, input) => http.request(path(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['UpdateMedicalRecord']) }),
        archive: (id, input) => http.request(path(id), { method: 'DELETE', body: JSON.stringify(input) }),
        observe: (id, input) => http.request(`${path(id)}/observations`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewObservation']) }),
        correctObservation: (id, observationId, input) => http.request(`${path(id)}/observations/${encodeURIComponent(observationId)}`, { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['UpdateObservation']) })
    };
}
