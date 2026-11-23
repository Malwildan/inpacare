import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { loadCalendar } from '$lib/app/composition/calendar';
export const load: PageServerLoad = async ({ fetch, url, parent }) => {
    const { user } = await parent();
    return loadPage('Kalender penempatan', () => loadCalendar(fetch, url.searchParams.get('from'), user.role === 'PERAWAT' && user.coordinator));
};
