import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpNotifications } from './http-notifications';
it('loads durable notices and marks only the requested notice read', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [{ id: 'N1', readAt: null }] })).mockResolvedValueOnce(Response.json({ id: 'N1' }));
    const notices = createHttpNotifications(createHttpClient(fetcher));
    expect(await notices.list()).toEqual([{ id: 'N1', readAt: null }]);
    await notices.markRead('N1');
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/notifications/N1/read');
    expect(fetcher.mock.calls[1][1]?.method).toBe('POST');
});
