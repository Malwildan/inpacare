import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

type RecordRow={id:string;patientId:string;patientName:string;medicalRecordNo:string;doctorId?:string;doctorName?:string;recordDate:string;diagnosis?:string;treatment?:string;notes?:string;observationCount?:number;version?:number;createdAt?:string};
type AdmissionRecordRow={id:string;patientId:string;doctorId:string;recordDate:string};

export const load:PageServerLoad=async({fetch,parent})=>{
 const layout=await parent();
 if(layout.user.role==='ADMISI'){
  const {items}=await loadApi<{items:AdmissionRecordRow[];total:number}>(fetch,'/medical-records');
  const records:RecordRow[]=items.map((record)=>{const patient=layout.reference.patients.find((item)=>item.id===record.patientId);return {...record,patientName:patient?.name??record.patientId,medicalRecordNo:patient?.medicalRecordNo??'—'};});
  return {records,reference:layout.reference,user:layout.user,admisiProjection:true};
 }
 const {items}=await loadApi<{items:RecordRow[]}>(fetch,'/medical-records');
 return {records:items,reference:layout.reference,user:layout.user,admisiProjection:false};
};
