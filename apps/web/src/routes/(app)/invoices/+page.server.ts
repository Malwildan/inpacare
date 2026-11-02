import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

export const load: PageServerLoad = async ({ fetch, parent }) => {
	const [{ items }, rooms, { user }] = await Promise.all([
		loadApi<{ items: any[] }>(fetch, '/invoices'),
		loadApi<{ items: { id:string; name:string; items:{id:string;name:string;category:string;unitPrice:string}[] }[] }>(fetch, '/rooms'), parent()
	]);
	return { invoices: items, rooms: rooms.items, user };
};
