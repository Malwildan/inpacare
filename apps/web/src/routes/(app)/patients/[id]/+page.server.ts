import { error } from '@sveltejs/kit';
import { createPatients } from '$lib/app/composition/patients';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ fetch, params, parent }) => {
 await parent();
 try { return { context: await createPatients(fetch).context(params.id) }; }
 catch { error(404, 'Pasien tidak ditemukan atau tidak tersedia untuk akun Anda.'); }
};
