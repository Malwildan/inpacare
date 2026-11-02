import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpPlacements } from './http-placements';
it('preserves inclusive date strings and exposes capacity conflicts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: 'P1' })).mockResolvedValueOnce(Response.json({ error: { code: 'CAPACITY', message: 'Penuh' } }, { status: 409 }));
    const placements = createHttpPlacements(createHttpClient(fetcher));
    await placements.create({ patientId: 'P1', roomId: 'R1', startsOn: '2026-11-01', endsOn: '2026-11-01' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).endsOn).toBe('2026-11-01');
    await expect(placements.update('P1', { patientId: 'P1', roomId: 'R1', startsOn: '2026-11-01', endsOn: '2026-11-02', expectedVersion: 2 })).rejects.toMatchObject({ status: 409 });
});
