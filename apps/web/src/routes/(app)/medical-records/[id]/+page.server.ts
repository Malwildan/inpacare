import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';
type MedicalRecord={id:string;patientId:string;patientName:string;medicalRecordNo:string;doctorId:string;doctorName:string;recordDate:string;complaint:string;diagnosis:string;treatment:string;notes:string;version:number;createdAt:string;updatedAt:string;observations:{id:string;nurseId:string;nurseName:string;symptoms:string;nursingNote:string;observedAt:string;temperature:number|null;bloodPressure:string|null;pulse:number|null;respiratoryRate:number|null;spo2:number|null}[]};
export const load:PageServerLoad=async({fetch,parent,params})=>{const [{user,reference},record]=await Promise.all([parent(),loadApi<MedicalRecord>(fetch,`/medical-records/${params.id}`)]);return {user,reference,record};};
