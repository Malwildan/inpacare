import { error } from '@sveltejs/kit';
import { loadPage } from '$lib/app/composition/page-load';
import type { PageServerLoad } from './$types';
import { createCareCycles } from '$lib/app/composition/care-cycles';
import { createMedicalRecords } from '$lib/app/composition/medical-records';
import type { MedicalRecordCycle } from '$lib/features/medical-records';

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
    const { user, reference } = await parent();
    const cycleId = url.searchParams.get('cycleId');
    let cycle: MedicalRecordCycle | undefined;
    if (cycleId) {
        if (user.role !== 'DOKTER') error(403, { message: 'Akses terbatas' });
        const { id, patientId, patientName, medicalRecordNo } = await loadPage('Rekap rawat inap',
            () => createCareCycles(fetch).detail(cycleId));
        cycle = { id, patientId, patientName, medicalRecordNo };
    }
    const list = await loadPage('Daftar rekam medis', () => createMedicalRecords(fetch).loadList(user, reference));
    return { ...list, cycle };
};
