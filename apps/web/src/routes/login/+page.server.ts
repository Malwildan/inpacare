import { redirect } from '@sveltejs/kit';
import { createAuth } from '$lib/app/composition/auth';
import { landingPage } from '$lib/app/navigation';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ fetch }) => {
 const user = await createAuth(fetch).current().catch(() => null);
 if (user) redirect(303, landingPage(user));
 return {};
};
