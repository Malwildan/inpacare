import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadDashboard } from '$lib/app/composition/dashboard';
import { parseCycleSearch } from '$lib/features/care-cycles';
export const load: PageServerLoad = async ({fetch,parent,url}) => {
 const {user}=await parent();
 if(user.role==='ADMISI') redirect(303,'/invoices');
 return {...await loadPage('Daftar rekap rawat inap', () => loadDashboard(fetch,parseCycleSearch(url.searchParams),user.role==='PERAWAT')),user};
};
