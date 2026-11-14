<script>
import DashboardPage from '$lib/features/care-cycles/presentation/DashboardPage.svelte';

const cycle = { id: 'cycle', patientId: 'patient', patientName: 'Pasien Uji', medicalRecordNo: 'RM-TEST', placementId: null, room: null, doctorId: 'doctor', doctorName: 'Dokter Uji', nurseId: 'nurse', nurseName: 'Perawat Uji', status: 'pending', version: 11, createdAt: '2026-11-02T00:00:00Z', requests: [] };
const candidate = { id: 'new-patient', name: 'Pasien Baru', medicalRecordNo: 'RM-NEW' };
const data = $state({
    user: { id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT', coordinator: false },
    filters: { search: '', status: '', roomId: '', patientId: '' },
    cycles: [cycle], notifications: [], creationCandidates: [candidate],
    reference: { patients: [candidate], rooms: [], placements: [], staff: [{ id: 'doctor', name: 'Dokter Uji', role: 'DOKTER', active: true }] }
});
const removals = [];
window.cycleRemovals = removals;
const careCycles = {
    detail: async () => cycle,
    create: async input => { window.cycleCreate = input; throw new Error('Rekap gagal tersimpan.'); },
    change: async () => {}, request: async () => {}, decide: async () => {},
    remove: async (id, input) => {
        removals.push({ id, ...input });
        if (removals.length === 1) {
            await new Promise((resolve, reject) => { window.rejectCycleRemoval = () => reject(new Error('Versi rekap berubah.')); });
        } else {
            data.cycles = [];
        }
    }
};
</script>

<div class="min-w-0 p-4"><DashboardPage {data} {careCycles} markNotificationRead={async () => {}} /></div>
