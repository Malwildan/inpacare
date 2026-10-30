import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

export const load: PageServerLoad = async ({ fetch, parent }) => {
	const [{ items }, { user }] = await Promise.all([
		loadApi<{ items: any[] }>(fetch, '/invoices'), parent()
	]);
	return { invoices: items, user };
};
