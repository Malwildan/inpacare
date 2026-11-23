import { loadPage } from '$lib/app/composition/page-load';
import { createPatients } from '$lib/app/composition/patients';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ fetch, params, parent }) => {
 await parent();
 return { context: await loadPage('Ringkasan pasien', () => createPatients(fetch).context(params.id)) };
};
