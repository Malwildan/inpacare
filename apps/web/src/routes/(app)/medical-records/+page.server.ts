import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';
type RecordRow={id:string;patientId:string;patientName:string;medicalRecordNo:string;doctorName:string;recordDate:string;diagnosis:string;treatment:string;notes:string;observationCount:number;version:number;createdAt:string};
export const load:PageServerLoad=async({fetch,parent})=>{
 const [{items},layout]=await Promise.all([loadApi<{items:RecordRow[]}>(fetch,'/medical-records'),parent()]);
 return {records:items,reference:layout.reference,user:layout.user};
};
