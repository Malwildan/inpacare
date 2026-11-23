import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { createTasks } from '$lib/app/composition/tasks';
import { parseTaskSearch } from '$lib/features/tasks';
export const load: PageServerLoad = async ({ fetch, parent, url }) => {
 const { user, reference } = await parent();
 const { filters } = parseTaskSearch(url.searchParams);
 return { board: await loadPage('Papan tugas', () => createTasks(fetch).loadBoard(filters)), filters, user, reference };
};
