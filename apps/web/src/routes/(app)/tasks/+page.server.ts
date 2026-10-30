import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

type Task = { id:string; title:string; description:string; notes:string; patientId:string; patientName:string; medicalRecordNo:string; roomId:string; roomName:string; picId:string; picName:string; priority:string; status:string; startsAt:string; endsAt:string; version:number };
export const load:PageServerLoad=async({fetch,parent,url})=>{
 const layout=await parent();
 const filters={search:url.searchParams.get('search')??'',status:url.searchParams.get('status')??'',priority:url.searchParams.get('priority')??''};
 const page=Math.max(0,Math.min(2000,Number(url.searchParams.get('page'))||0));
 const query=new URLSearchParams({limit:'50',offset:String(page*50)});
 for(const [key,value] of Object.entries(filters)) if(value)query.set(key,value);
 const result=await loadApi<{items:Task[];total:number;counts:Record<string,number>}>(fetch,`/tasks?${query}`);
 return {tasks:result.items,total:result.total,counts:result.counts,page,filters,reference:layout.reference,user:layout.user};
};
