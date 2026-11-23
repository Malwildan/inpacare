import { createBilling } from './billing';
import { createRooms } from './rooms';
export async function loadInvoices(fetcher: typeof fetch, releaseOffset: number) {
    const billing = createBilling(fetcher);
    const [invoices, rooms, handoffs] = await Promise.all([
        billing.list(),
        createRooms(fetcher).list(),
        billing.releaseHandoffs(releaseOffset).catch(() => null),
    ]);
    return { invoices, rooms, handoffs, releaseOffset };
}
