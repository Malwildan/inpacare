import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpBilling } from './http-billing';
import { createBillingUseCases } from '../application/billing';
it('preserves decimal-string inputs, versions and reasons without recomputing server totals', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: 'I1', totalAmount: '0.30', payableAmount: '0.20' }));
    const billing = createHttpBilling(createHttpClient(fetcher));
    const result = await billing.create({ patientId: 'P1', coveredAmount: '0.10', lines: [{ description: 'Care', quantity: 3, unitPrice: '0.10' }] });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ patientId: 'P1', coveredAmount: '0.10', lines: [{ description: 'Care', quantity: 3, unitPrice: '0.10' }] });
    expect(result.totalAmount).toBe('0.30');
    await billing.changePayment('I1', { status: 'paid', reason: 'Recorded', expectedVersion: 2 });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ status: 'paid', reason: 'Recorded', expectedVersion: 2 });
});
it('loads detail and its matching patient context, keeping list and detail separate', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: 'I1', patientId: 'P1', lines: [], history: [], totalAmount: '0.30' })).mockResolvedValueOnce(Response.json({ patient: { id: 'P1' }, placements: [], invoices: [] }));
    const detail = await createBillingUseCases(createHttpBilling(createHttpClient(fetcher))).openInvoice('I1');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/v1/invoices/I1', '/api/v1/invoices/patients/P1/context']);
    expect(detail.patientContext.patient.id).toBe('P1');
    expect(detail.totalAmount).toBe('0.30');
});
