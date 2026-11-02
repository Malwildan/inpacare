import { expect, it } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpPatients } from './http-patients';
it('keeps a patient context isolated and does not swallow unavailable patient errors', async () => {
    const patients = createHttpPatients(createHttpClient(async (input) => { expect(input).toBe('/api/v1/patients/PT%2F1/context'); return Response.json({ error: { code: 'NOT_FOUND', message: 'Pasien tidak tersedia' } }, { status: 404 }); }));
    await expect(patients.context('PT/1')).rejects.toMatchObject({ status: 404 });
});
