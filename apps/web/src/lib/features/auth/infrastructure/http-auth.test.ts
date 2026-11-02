import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpAuth } from './http-auth';
it('uses isolated sessions and preserves login/logout payloads', async () => {
    const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ user: { id: 'one', role: 'PERAWAT' } }))
        .mockResolvedValueOnce(Response.json({ user: { id: 'one', role: 'PERAWAT' } }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const auth = createHttpAuth(createHttpClient(fetcher));
    expect((await auth.current()).id).toBe('one');
    expect((await auth.login({ username: 'rina', password: 'synthetic' })).id).toBe('one');
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ username: 'rina', password: 'synthetic' });
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE');
});
it('keeps invalid credentials visible to the login presenter', async () => {
    const auth = createHttpAuth(createHttpClient(async () => Response.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Tidak sesuai' } }, { status: 401 })));
    await expect(auth.login({ username: 'rina', password: 'bad' })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
});
