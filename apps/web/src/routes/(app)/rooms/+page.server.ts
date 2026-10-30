import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

type Room = {
	id: string; name: string; roomClass: string; capacity: number;
	status: 'available' | 'maintenance'; picId: string | null; picName: string | null;
	dailyRate: string; totalCost: string; occupants: number; version: number;
	items: { id: string; name: string; category: string; quantity: number; unitPrice: string }[];
};

export const load: PageServerLoad = async ({ fetch }) => {
	const result = await loadApi<{ items: Room[] }>(fetch, '/rooms');
	return { rooms: result.items };
};
