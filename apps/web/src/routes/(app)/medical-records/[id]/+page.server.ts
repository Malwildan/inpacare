import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

type MedicalRecord={id:string;patientId:string;patientName:string;medicalRecordNo:string;doctorId:string;doctorName?:string;recordDate:string;complaint?:string;diagnosis?:string;treatment?:string;notes?:string;version?:number;createdAt?:string;updatedAt?:string;observations?:{id:string;nurseId:string;nurseName:string;symptoms:string;nursingNote:string;observedAt:string;temperature:number|null;systolic:number|null;diastolic:number|null;bloodPressure:string|null;pulse:number|null;respiratoryRate:number|null;spo2:number|null;version:number}[]};
export const load:PageServerLoad=async({fetch,parent,params})=>{
 const {user,reference}=await parent();
 if(user.role==='ADMISI'){
  const record=await loadApi<{id:string;patientId:string;doctorId:string;recordDate:string}>(fetch,`/medical-records/${params.id}`);
  const patient=reference.patients.find((item)=>item.id===record.patientId);
  const projection:MedicalRecord={...record,patientName:patient?.name??record.patientId,medicalRecordNo:patient?.medicalRecordNo??'—'};
  return {user,record:projection,admisiProjection:true};
 }
 const record=await loadApi<MedicalRecord>(fetch,`/medical-records/${params.id}`);
 return {user,record,admisiProjection:false};
};
