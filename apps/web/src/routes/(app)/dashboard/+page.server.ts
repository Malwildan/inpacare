import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadDashboard } from '$lib/app/composition/dashboard';
import { parseCycleSearch } from '$lib/features/care-cycles';
export const load: PageServerLoad = async ({fetch,parent,url}) => {
 const {user}=await parent();
 if(user.role==='ADMISI') redirect(303,'/invoices');
 return {...await loadDashboard(fetch,parseCycleSearch(url.searchParams)),user};
};
