import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load:PageServerLoad=async({fetch})=>{const response=await fetch('/api/v1/session');if(response.ok){const {user}=await response.json();redirect(303,user.role==='ADMISI'?'/invoices':'/dashboard');}return {};};
