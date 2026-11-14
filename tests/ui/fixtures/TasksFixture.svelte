<script>
import TasksPage from '$lib/features/tasks/presentation/TasksPage.svelte';

const task = { id: 'task', title: 'Tugas Uji', description: 'Deskripsi tugas sintetis yang cukup panjang untuk pemeriksaan tampilan kartu.', notes: 'Catatan awal', patientId: 'patient', patientName: 'Pasien Uji', medicalRecordNo: 'RM-TEST', roomId: 'room', roomName: 'Ruangan Uji', picId: 'nurse', picName: 'Perawat Uji', priority: 'high', status: 'todo', startsAt: '2026-11-02T01:30:00Z', endsAt: '2026-11-02T02:30:00Z', version: 17, createdById: 'nurse', createdByName: 'Perawat Uji' };
let serverTasks = [task, { ...task, id: 'other', title: 'Tugas Perawat Lain', picId: 'other-nurse' }, { ...task, id: 'more', title: 'Tugas Tambahan' }];
const clone = value => JSON.parse(JSON.stringify(value));
const data = $state({ user: { id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT', coordinator: true },
    filters: { search: '', status: '', priority: '', roomId: '', patientId: '', picId: '', from: '', to: '' },
    board: { todo: { items: clone(serverTasks.slice(0, 2)), total: 3, error: false, filtered: false }, in_progress: { items: [], total: 0, error: false, filtered: false }, done: { items: [], total: 0, error: false, filtered: false }, cancelled: { items: [], total: 0, error: false, filtered: false } },
    reference: { patients: [{ id: 'patient', name: 'Pasien Uji' }], rooms: [{ id: 'room', name: 'Ruangan Uji' }], staff: [{ id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT', active: true }], placements: [{ id: 'placement', patientId: 'patient', patientName: 'Pasien Uji', roomName: 'Ruangan Uji', status: 'active', startsOn: '2026-11-02', endsOn: '2026-11-08' }] }
});
window.setTaskCoordinator = coordinator => { data.user.coordinator = coordinator; };
const writes = [];
window.taskWrites = writes;
window.taskReads = [];
const tasks = {
    list: async query => {
        window.taskReads.push(query);
        const items = serverTasks.filter(item => item.status === query.status);
        return { items: clone(items.slice(query.offset, query.offset + query.limit)), total: items.length, counts: {} };
    },
    get: async id => clone(serverTasks.find(item => item.id === id)),
    history: async () => [],
    create: async input => { window.taskCreate = input; throw new Error('Tugas gagal tersimpan.'); },
    update: async () => {}, reassign: async () => {},
    move: async (id, input) => {
        writes.push({ action: 'move', id, ...input });
        if (writes.filter(write => write.action === 'move').length === 1) {
            await new Promise((resolve, reject) => { window.rejectTaskMove = () => reject(new Error('Tugas berubah. Muat ulang daftar.')); });
        }
        const saved = { ...serverTasks.find(item => item.id === id), status: input.status, version: 18 };
        serverTasks = serverTasks.map(item => item.id === id ? saved : item);
        return clone(saved);
    },
    remove: async (id, input) => { writes.push({ action: 'remove', id, ...input }); throw new Error('Penghapusan gagal tersimpan.'); }
};
</script>

<div class="min-w-0 p-4"><TasksPage {data} {tasks} /></div>
