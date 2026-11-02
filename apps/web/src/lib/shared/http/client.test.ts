import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './client';
import { ApiError } from '../errors';
describe('request-scoped transport', () => {
    it('keeps credentials, JSON and CSRF on the same-origin proxy', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'T-1' }));
        await createHttpClient(fetcher, { csrfToken: () => 'csrf-one' }).request('/tasks', { method: 'POST', body: '{}' });
        const [path, init] = fetcher.mock.calls[0];
        expect(path).toBe('/api/v1/tasks');
        expect(init?.credentials).toBe('same-origin');
        expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf-one');
        expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    });
    it('does not share fetch or credentials between concurrent SSR requests', async () => {
        const make = (id: string) => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id }));
        const first = createHttpClient(make('first'));
        const second = createHttpClient(make('second'));
        expect(await Promise.all([first.request('/session'), second.request('/session')])).toEqual([{ id: 'first' }, { id: 'second' }]);
    });
    it('accepts an empty 204 response', async () => {
        const client = createHttpClient(async () => new Response(null, { status: 204 }));
        expect(await client.request('/session', { method: 'DELETE' })).toBeUndefined();
    });
    it.each([401, 403, 404, 409, 422, 503])('preserves status and error code for %i', async (status) => {
        const client = createHttpClient(async () => Response.json({ error: { code: 'TEST', message: 'Pesan API' } }, { status }));
        await expect(client.request('/tasks')).rejects.toMatchObject({ status, code: 'TEST', message: 'Pesan API' });
    });
    it('retains a useful fallback for non-JSON errors and network failures', async () => {
        const client = createHttpClient(async () => new Response('upstream down', { status: 503 }));
        await expect(client.request('/tasks')).rejects.toBeInstanceOf(ApiError);
        const network = createHttpClient(async () => { throw new TypeError('offline'); });
        await expect(network.request('/tasks')).rejects.toThrow('offline');
    });
});
