<script>
import DashboardPage from '$lib/features/care-cycles/presentation/DashboardPage.svelte';

const cycle = { id: '00000000-0000-4000-8000-000000000001', patientId: 'patient', patientName: 'Pasien Uji', medicalRecordNo: 'RM-TEST', placementId: null, room: null, doctorId: 'doctor', doctorName: 'Dokter Uji', nurseId: 'nurse', nurseName: 'Perawat Uji', status: 'pending', version: 11, createdAt: '2026-11-02T00:00:00Z', requests: [] };
const readableCycle = { ...cycle, id: 'CY-009', patientId: 'other-patient', patientName: 'Pasien Berikutnya', medicalRecordNo: 'RM-NEXT' };
const candidate = { id: 'new-patient', name: 'Pasien Baru', medicalRecordNo: 'RM-NEW' };
const data = $state({
    user: { id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT', coordinator: false },
    filters: { search: '', status: '', roomId: '', patientId: '' },
    cycles: [cycle, readableCycle], creationCandidates: [candidate], assignmentCandidates: [],
    reference: { patients: [candidate], rooms: [], placements: [{ id: 'cycle-placement', patientId: 'patient', roomName: 'Ruang uji', startsOn: '2026-11-02', endsOn: '2026-11-10', status: 'active' }], staff: [{ id: 'doctor', name: 'Dokter Uji', role: 'DOKTER', active: true }] }
});
window.cycleActions = [];
window.setCycleState = (status, role = 'PERAWAT') => { data.cycles[0].status = status; data.user.role = role; data.user.id = role === 'DOKTER' ? 'doctor' : 'nurse'; };
window.addEventListener('fixture-navigation', event => { const url = new URL(event.detail, location.origin); if (url.pathname === '/dashboard') for (const key of Object.keys(data.filters)) data.filters[key] = url.searchParams.get(key) ?? ''; });
const notices = [{ id: 'notice', cycleId: null, message: 'Notifikasi Uji', readAt: null, createdAt: '2026-11-02T01:00:00Z' }];
let notificationCalls = 0;
window.notificationReads = [];
const notificationService = { list: async () => { if (++notificationCalls === 1) throw new Error('Notifikasi gagal dimuat.'); return notices; }, markRead: async id => { window.notificationReads.push(id); notices[0].readAt = '2026-11-02T02:00:00Z'; } };
const removals = [];
window.cycleRemovals = removals;
const careCycles = {
    detail: async id => data.cycles.find(item => item.id === id),
    create: async input => { window.cycleCreate = input; throw new Error('Rekap gagal tersimpan.'); },
    change: async (id,input) => { window.cycleActions.push({action:'change',id,...input}); Object.assign(data.cycles.find(item => item.id === id), input); },
    request: async (id,input) => { window.cycleActions.push({action:'request',id,...input}); data.cycles[0].requests.push({id:'request',...input,status:'pending',requestedBy:'Perawat Uji',decidedBy:null,note:null,createdAt:'2026-11-02T02:00:00Z'}); },
    review: async (cycleId, requestId) => {
        const cycle = data.cycles.find(item => item.id === cycleId);
        const request = cycle.requests.find(item => item.id === requestId);
        return { cycle, request: { ...request, cycleId }, placement: null, records: [], observations: [], approvalBlocker: null, blockingTasks: [], reviewDate: '2026-11-02' };
    },
    decide: async (id,requestId,input) => { window.cycleActions.push({action:'decide',id,requestId,...input}); Object.assign(data.cycles[0].requests[0], {status:input.decision === 'approve' ? 'approved' : 'rejected',note:input.note,decidedBy:'Dokter Uji'}); },
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

<div class="min-w-0 p-4"><DashboardPage {data} {careCycles} {notificationService} /></div>
