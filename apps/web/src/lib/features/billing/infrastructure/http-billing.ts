import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { BillingRepository } from '../application/billing';
type Schemas = components['schemas'];
// The live API accepts null to clear legacy line kinds; OpenAPI currently omits null here.
type EditLineWire = Omit<Schemas['EditInvoiceLine'], 'kind'> & {
    kind?: string | null;
};
export function createHttpBilling(http: HttpClient): BillingRepository {
    const path = (id: string) => `/invoices/${encodeURIComponent(id)}`;
    const line = (id: string, lineId: string) => `${path(id)}/lines/${encodeURIComponent(lineId)}`;
    return {
        list: async () => (await http.request<Schemas['InvoicePage']>('/invoices')).items,
        detail: id => http.request<Schemas['InvoiceDetail']>(path(id)),
        patientContext: id => http.request<Schemas['InvoicePatientContext']>(`/invoices/patients/${encodeURIComponent(id)}/context`),
        create: input => http.request<Schemas['InvoiceCreated']>('/invoices', { method: 'POST', body: JSON.stringify(input satisfies Schemas['NewInvoice']) }),
        changePayment: (id, input) => http.request<Schemas['PaymentResult']>(path(id), { method: 'PATCH', body: JSON.stringify(input satisfies Schemas['ChangePayment']) }),
        editLine: (id, lineId, input) => http.request<Schemas['InvoiceLineMutation']>(line(id, lineId), { method: 'PATCH', body: JSON.stringify(input satisfies EditLineWire) }),
        deleteLine: (id, lineId, input) => http.request(line(id, lineId), { method: 'DELETE', body: JSON.stringify(input satisfies Schemas['DeleteInvoiceLine']) }),
        verifyClaim: (id, input) => http.request<Schemas['ClaimVerificationResult']>(`${path(id)}/claim-verification`, { method: 'POST', body: JSON.stringify(input satisfies Schemas['ClaimVerification']) }),
        remove: (id, input) => http.request(path(id), { method: 'DELETE', body: JSON.stringify(input) })
    };
}
