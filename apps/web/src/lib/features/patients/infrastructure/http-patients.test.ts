import { expect, it } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpPatients } from './http-patients';
it('keeps a patient context isolated and does not swallow unavailable patient errors', async () => {
    const patients = createHttpPatients(createHttpClient(async (input) => { expect(input).toBe('/api/v1/patients/PT%2F1/context'); return Response.json({ error: { code: 'NOT_FOUND', message: 'Pasien tidak tersedia' } }, { status: 404 }); }));
    await expect(patients.context('PT/1')).rejects.toMatchObject({ status: 404 });
});

it('searches the requested page and registers through the shared CSRF client', async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const patients = createHttpPatients(createHttpClient(async (url, init) => {
        requests.push({ url: String(url), init });
        return Response.json(init?.method === 'POST' ? { id: 'patient-new' } : { items: [], total: 0 });
    }, { csrfToken: () => 'synthetic-csrf' }));
    await patients.list('RM / 001', 25);
    expect(requests[0].url).toBe('/api/v1/patients?q=RM+%2F+001&limit=25&offset=25');
    const input = { medicalRecordNo: 'RM-NEW', name: 'Pasien Uji', birthDate: '2000-01-01', gender: 'L' as const, bpjs: false };
    await patients.create(input);
    expect(requests[1].url).toBe('/api/v1/patients');
    expect(requests[1].init?.method).toBe('POST');
    expect(new Headers(requests[1].init?.headers).get('x-csrf-token')).toBe('synthetic-csrf');
    expect(JSON.parse(String(requests[1].init?.body))).toEqual(input);
});
