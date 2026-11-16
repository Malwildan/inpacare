import { error } from '@sveltejs/kit';
import { createPatients } from '$lib/app/composition/patients';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
    const { user } = await parent();
    if (user.role !== 'ADMISI') error(403, 'Data pasien hanya tersedia untuk Admisi.');
    const search = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
    const requestedPage = Number(url.searchParams.get('page') ?? '1');
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1_000_000 ? requestedPage : 1;
    const offset = (page - 1) * 25;
    return { patients: await createPatients(fetch).list(search, offset), search, offset };
};
