import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { createMedicalRecords } from '$lib/app/composition/medical-records';
export const load: PageServerLoad = async ({fetch,parent,params}) => {
 const {user,reference}=await parent();
 return loadPage('Rekam medis', () => createMedicalRecords(fetch).loadDetail(params.id,user,reference));
};
