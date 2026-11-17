import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpPlacements } from './http-placements';
it('preserves inclusive date strings and exposes capacity conflicts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: 'P1' })).mockResolvedValueOnce(Response.json({ error: { code: 'CAPACITY', message: 'Penuh' } }, { status: 409 }));
    const placements = createHttpPlacements(createHttpClient(fetcher));
    await placements.create({ patientId: 'P1', roomId: 'R1', startsOn: '2026-11-01', endsOn: '2026-11-01' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).endsOn).toBe('2026-11-01');
    await expect(placements.update('P1', { patientId: 'P1', roomId: 'R1', startsOn: '2026-11-01', endsOn: '2026-11-02', expectedVersion: 2, reason: 'Ubah jadwal' })).rejects.toMatchObject({ status: 409 });
});
it('sends reasons and versions for coordinator changes and loads persisted history', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: 'P1' })).mockResolvedValueOnce(Response.json({ id: 'P1', status: 'cancelled' })).mockResolvedValueOnce(Response.json({ items: [], total: 0 }));
    const placements = createHttpPlacements(createHttpClient(fetcher));
    await placements.update('P/1', { patientId: 'PT1', roomId: 'R2', startsOn: '2030-01-01', endsOn: '2030-01-05', expectedVersion: 3, reason: 'Move room' });
    await placements.cancel('P/1', { expectedVersion: 4, reason: 'Cancel admission' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ roomId: 'R2', expectedVersion: 3, reason: 'Move room' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ expectedVersion: 4, reason: 'Cancel admission' });
    expect(await placements.history('P/1')).toEqual([]);
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/placements/P%2F1/history');
});
it('includes cancelled placements only when the coordinator calendar requests them', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ items: [] }));
    const placements = createHttpPlacements(createHttpClient(fetcher));
    await placements.occupancy('2030-01-01', '2030-01-07');
    await placements.occupancy('2030-01-01', '2030-01-07', true);
    expect(String(fetcher.mock.calls[0][0])).not.toContain('includeCancelled');
    expect(String(fetcher.mock.calls[1][0])).toContain('includeCancelled=true');
});
