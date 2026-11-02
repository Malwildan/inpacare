import type { PageServerLoad } from './$types';
import { createTasks } from '$lib/app/composition/tasks';
import { parseTaskSearch } from '$lib/features/tasks';
export const load: PageServerLoad = async ({ fetch, parent, url }) => {
 const { user, reference } = await parent();
 const { filters, page } = parseTaskSearch(url.searchParams);
 return { ...await createTasks(fetch).loadPage(filters, page), user, reference };
};
