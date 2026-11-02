import type { PageServerLoad } from './$types';
import { createMedicalRecords } from '$lib/app/composition/medical-records';
export const load: PageServerLoad = async ({fetch,parent,params}) => {
 const {user,reference}=await parent();
 return createMedicalRecords(fetch).loadDetail(params.id,user,reference);
};
