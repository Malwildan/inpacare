import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { createRooms } from '$lib/app/composition/rooms';
export const load: PageServerLoad = async ({ fetch }) => ({ rooms: await loadPage('Daftar ruang', () => createRooms(fetch).list()) });
