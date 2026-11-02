import type { PageServerLoad } from './$types';
import { loadCalendar } from '$lib/app/composition/calendar';
export const load: PageServerLoad = ({ fetch, url }) => loadCalendar(fetch, url.searchParams.get('from'));
