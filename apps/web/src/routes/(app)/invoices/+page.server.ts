import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { loadInvoices } from '$lib/app/composition/invoices';
export const load: PageServerLoad = async ({fetch,parent,url}) => {
 const offset = Number(url.searchParams.get('releaseOffset') ?? '0');
 const releaseOffset = Number.isSafeInteger(offset) && offset >= 0 && offset <= 2147483647 && offset % 20 === 0 ? offset : 0;
 const [data,{user}]=await Promise.all([loadPage('Daftar tagihan', () => loadInvoices(fetch, releaseOffset)),parent()]);
 return {...data,user};
};
