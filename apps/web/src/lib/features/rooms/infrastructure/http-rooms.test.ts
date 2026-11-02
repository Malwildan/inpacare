import { expect, it, vi } from 'vitest';
import { createHttpClient } from '$lib/shared/http/client';
import { createHttpRooms } from './http-rooms';
it('keeps inventory money strings and optimistic versions', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: 'room', items: [] }));
    const rooms = createHttpRooms(createHttpClient(fetcher));
    await rooms.addItem('R1', { name: 'Item', category: 'Fasilitas', quantity: 3, unitPrice: '0.10' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).unitPrice).toBe('0.10');
    await rooms.updateItem('R1', 'I1', { name: 'Changed', category: 'Fasilitas', quantity: 2, unitPrice: '1.25', expectedVersion: 3 });
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/rooms/R1/items/I1');
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).expectedVersion).toBe(3);
    await rooms.remove('R1', { expectedVersion: 4 });
    expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE');
});
