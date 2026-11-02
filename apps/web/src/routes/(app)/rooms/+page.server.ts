import type { PageServerLoad } from './$types';
import { createRooms } from '$lib/app/composition/rooms';
export const load: PageServerLoad = async ({ fetch }) => ({ rooms: await createRooms(fetch).list() });
