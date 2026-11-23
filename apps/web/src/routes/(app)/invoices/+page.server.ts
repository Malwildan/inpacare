import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { loadInvoices } from '$lib/app/composition/invoices';
export const load: PageServerLoad = async ({fetch,parent}) => {
 const [data,{user}]=await Promise.all([loadPage('Daftar tagihan', () => loadInvoices(fetch)),parent()]);
 return {...data,user};
};
