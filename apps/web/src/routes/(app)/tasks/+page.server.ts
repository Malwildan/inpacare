import type { PageServerLoad } from './$types';
import { createTasks } from '$lib/app/composition/tasks';
import { parseTaskSearch } from '$lib/features/tasks';
import { ApiError } from '$lib/shared/errors';
import { redirect } from '@sveltejs/kit';
export const load: PageServerLoad = async ({ fetch, parent, url }) => {
 const { user, reference } = await parent();
 const { filters } = parseTaskSearch(url.searchParams);
 try { return { board: await createTasks(fetch).loadBoard(filters), filters, user, reference }; }
 catch (failure) { if (failure instanceof ApiError && failure.status === 401) redirect(303, '/login'); throw failure; }
};
