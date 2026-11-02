import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpCareCycles } from './http-care-cycles';
import { parseCycleSearch } from '../application/care-cycles';
it('preserves dashboard filters and versioned doctor decisions', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ items: [] }));
    const cycles = createHttpCareCycles(createHttpClient(fetcher));
    await cycles.dashboard(parseCycleSearch(new URLSearchParams('search=patient&roomId=R1&patientId=P1&status=pending_approval')));
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/cycles/dashboard?search=patient&status=pending_approval&roomId=R1&patientId=P1');
    await cycles.request('C1', { kind: 'extend', requestedEnd: '2026-11-10', reason: 'Care' });
    await cycles.decide('C1', 'Q1', { decision: 'approve', note: 'Approved', expectedVersion: 4 });
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/cycles/C1/requests/Q1/decision');
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ decision: 'approve', note: 'Approved', expectedVersion: 4 });
});
