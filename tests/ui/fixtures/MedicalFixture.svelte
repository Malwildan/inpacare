<script>
import MedicalDetailPage from '$lib/features/medical-records/presentation/MedicalDetailPage.svelte';
import MedicalListPage from '$lib/features/medical-records/presentation/MedicalListPage.svelte';

const record = $state({ id: 'record', patientId: 'patient', patientName: 'Pasien Uji', medicalRecordNo: 'RM-TEST', doctorId: 'doctor', doctorName: 'Dokter Uji', recordDate: '2026-11-02', complaint: 'Keluhan awal', diagnosis: 'Diagnosis awal', treatment: 'Tindakan awal', notes: 'Catatan awal', version: 3, createdAt: '2026-11-02T01:00:00Z', updatedAt: '2026-11-02T01:00:00Z',
    observations: [{ id: 'observation', nurseId: 'nurse', nurseName: 'Perawat Uji', symptoms: 'Kondisi awal', nursingNote: 'Catatan perawat', observedAt: '2026-11-02T01:30:00Z', version: 7, temperature: 36.5, systolic: 120, diastolic: 80, bloodPressure: '120/80', pulse: 70, respiratoryRate: 18, spo2: 98 }] });
const data = $state({ user: { id: 'doctor', role: 'DOKTER', name: 'Dokter Uji' }, admisiProjection: false, record, records: [{ ...record, observationCount: 1 }], reference: { patients: [{ id: 'patient', name: 'Pasien Uji', medicalRecordNo: 'RM-TEST' }] } });
window.setMedicalRole = role => { data.user = { id: role === 'DOKTER' ? 'doctor' : 'nurse', role, name: 'Petugas Uji' }; };
const writes = [];
window.medicalWrites = writes;
let fail = true;
window.rejectMedical = () => { fail = true; };
window.acceptMedical = () => { fail = false; };
async function save(action, id, input) {
    writes.push({ action, id, ...input });
    if (fail) throw new Error('Versi catatan berubah.');
    if (action === 'update') Object.assign(record, input, { version: record.version + 1 });
    if (action === 'correct') Object.assign(record.observations[0], input, { version: 8 });
    return { id: 'record' };
}
const medical = { create: input => save('create', 'new', input), update: (id,input) => save('update',id,input), observe: (id,input) => save('observe',id,input), correctObservation: (id,observationId,input) => save('correct',observationId,input), archive: (id,input) => save('archive',id,input) };
const list = new URLSearchParams(location.search).get('surface') === 'medical-list';
</script>
<div class="min-w-0 p-4">
    {#if list}<MedicalListPage {data} {medical} />{:else}<MedicalDetailPage {data} {medical} />{/if}
</div>
