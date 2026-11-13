<script>
import CalendarPage from '$lib/features/placements/presentation/CalendarPage.svelte';

const data = $state({
    user: { id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT', coordinator: false },
    from: '2026-11-02', to: '2026-11-08',
    patients: [{ id: 'patient', name: 'Pasien Uji', medicalRecordNo: 'RM-TEST' }],
    rooms: [{ id: 'room', name: 'Ruangan Uji', roomClass: 'Kelas I', capacity: 2, status: 'available' }],
    placements: [{ id: 'placement', patientId: 'patient', patientName: 'Pasien Uji', medicalRecordNo: 'RM-TEST', roomId: 'room', roomName: 'Ruangan Uji', startsOn: '2026-11-02', endsOn: '2026-11-04', status: 'active', version: 7 }]
});
const cancellations = [];
window.calendarCancellations = cancellations;
const placementService = {
    create: async input => { window.calendarCreate = input; throw new Error('Kapasitas telah berubah.'); },
    update: async () => {},
    cancel: async (id, input) => {
        cancellations.push({ id, ...input });
        if (cancellations.length === 1) {
            await new Promise((resolve, reject) => { window.rejectCancellation = () => reject(new Error('Versi penempatan telah berubah.')); });
        } else {
            data.placements = [];
        }
    }
};
</script>

<div class="min-w-0 p-4"><CalendarPage {data} {placementService} /></div>
