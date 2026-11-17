import { expect, it } from 'vitest';
import { draftRoomLines } from './billing';
import type { PatientInvoiceContext } from '../domain/models';

const placement: PatientInvoiceContext['placements'][number] = {
    id: 'PL-1', roomId: 'R-1', room: 'Melati',
    startsOn: '2026-11-17', endsOn: '2026-11-19', status: 'active'
};
const room = {
    id: 'R-1', name: 'Melati', dailyRate: '125000.50',
    items: [{ id: 'ITEM-1', name: 'Inventaris', quantity: 99, unitPrice: '900000' }]
};

it('drafts only the room charge for the inclusive placement period with exact decimal prices', () => {
    expect(draftRoomLines(placement, [room])).toEqual([{
        roomItemId: null, kind: 'room', description: 'Kamar Melati (hari)',
        quantity: 3, unitPrice: '125000.50'
    }]);
    expect(draftRoomLines(placement, [{ ...room, dailyRate: '9999999999999.99' }])[0].unitPrice).toBe('9999999999999.99');
});

it.each([
    ['2026-11-17', '2026-11-17', 1],
    ['2026-12-31', '2027-01-01', 2],
    ['2028-02-28', '2028-03-01', 3]
])('counts calendar days from %s to %s', (startsOn, endsOn, days) => {
    expect(draftRoomLines({ ...placement, startsOn, endsOn }, [room])[0].quantity).toBe(days);
});

it('leaves room charges empty without a usable placement or available room', () => {
    expect(draftRoomLines(undefined, [room])).toEqual([]);
    expect(draftRoomLines({ ...placement, status: 'cancelled' }, [room])).toEqual([]);
    expect(draftRoomLines(placement, [])).toEqual([]);
    expect(draftRoomLines({ ...placement, endsOn: '2026-11-16' }, [room])).toEqual([]);
});
