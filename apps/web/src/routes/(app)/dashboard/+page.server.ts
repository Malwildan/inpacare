import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { createCareCycles } from '$lib/app/composition/care-cycles';
import { loadDashboard } from '$lib/app/composition/dashboard';
import { parseCycleSearch } from '$lib/features/care-cycles';
import { ApiError } from '$lib/shared/errors';

const validId = /^[A-Za-z0-9_-]{1,36}$/;

function unavailable() {
    error(404, {
        message: 'Data tidak tersedia',
        publicMessage: 'Tujuan ini tidak tersedia untuk akun Anda. Kembali untuk melihat data yang dapat Anda buka.'
    });
}

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
    const { user } = await parent();
    const cycleId = url.searchParams.get('cycleId');
    const requestId = url.searchParams.get('requestId');
    const filters = parseCycleSearch(url.searchParams);
    const cycleDestination = await loadPage('Detail rekap rawat inap', async () => {
        if (cycleId === null && requestId === null) return null;
        if (!cycleId || !validId.test(cycleId) || (requestId !== null && !validId.test(requestId))) return null;
        try {
            const cycle = await createCareCycles(fetch).detail(cycleId);
            if (cycle.id !== cycleId || (requestId && !cycle.requests.some(request => request.id === requestId))) return null;
            return { cycle, requestId };
        } catch (cause) {
            if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return null;
            throw cause;
        }
    });
    if ((cycleId !== null || requestId !== null) && !cycleDestination) unavailable();
    if (user.role === 'ADMISI') redirect(303, '/invoices');
    return {
        ...await loadPage('Daftar rekap rawat inap', () => loadDashboard(fetch, filters, user.role === 'PERAWAT')),
        cycleDestination,
        user
    };
};
