import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpTasks } from './http-tasks';
it('requests the chosen status in board order with an independent offset', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [], total: 0, counts: {} }));
    await createHttpTasks(createHttpClient(fetcher)).list({ search: '', status: 'done', priority: '', roomId: '', patientId: '', picId: '', from: '', to: '', order: 'board', limit: 50, offset: 50 });
    expect(String(fetcher.mock.calls[0][0])).toBe('/api/v1/tasks?status=done&order=board&limit=50&offset=50');
});
it('persists a move with the requested destination and anchor', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'T/1', version: 4 }));
    const result = await createHttpTasks(createHttpClient(fetcher)).move('T/1', { expectedVersion: 3, status: 'in_progress', beforeTaskId: 'T2' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/tasks/T%2F1/move');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ expectedVersion: 3, status: 'in_progress', beforeTaskId: 'T2' });
    expect(result.version).toBe(4);
});
it('sends explicit version/reason payloads and refreshes detail independently', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: 'T/1', version: 4 }));
    const tasks = createHttpTasks(createHttpClient(fetcher));
    await tasks.update('T/1', { expectedVersion: 3, status: 'done' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/tasks/T%2F1');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ expectedVersion: 3, status: 'done' });
    await tasks.reassign('T/1', { expectedVersion: 4, picId: 'N2', reason: 'Shift' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ expectedVersion: 4, picId: 'N2', reason: 'Shift' });
    await tasks.remove('T/1', { expectedVersion: 4, reason: 'Duplicate' });
    expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE');
});
it('propagates conflicts and former-PIC access loss without retrying a write', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ error: { code: 'CONFLICT', message: 'Muat ulang' } }, { status: 409 }));
    await expect(createHttpTasks(createHttpClient(fetcher)).update('T1', { expectedVersion: 1, status: 'done' })).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const hidden = createHttpTasks(createHttpClient(async () => Response.json({ error: { code: 'NOT_FOUND', message: 'Tidak tersedia' } }, { status: 404 })));
    await expect(hidden.get('T1')).rejects.toMatchObject({ status: 404 });
});
