import { createBilling } from './billing';
import { createRooms } from './rooms';
export async function loadInvoices(fetcher: typeof fetch) {
    const [invoices, rooms] = await Promise.all([createBilling(fetcher).list(), createRooms(fetcher).list()]);
    return { invoices, rooms };
}
