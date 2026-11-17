import type { PageServerLoad } from './$types';
import { loadCalendar } from '$lib/app/composition/calendar';
export const load: PageServerLoad = async ({ fetch, url, parent }) => {
    const { user } = await parent();
    return loadCalendar(fetch, url.searchParams.get('from'), user.role === 'PERAWAT' && user.coordinator);
};
