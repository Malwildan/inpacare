<script>
import RoomsPage from '$lib/features/rooms/presentation/RoomsPage.svelte';
const data = $state({ user: { id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT' }, reference: { staff: [{ id: 'nurse', name: 'Perawat Uji', role: 'PERAWAT' }] }, rooms: [{ id: 'room', name: 'Ruangan Uji', roomClass: 'Kelas I', capacity: 2, status: 'available', picId: 'nurse', picName: 'Perawat Uji', dailyRate: '100000.00', version: 4, totalCost: '25000.00', occupants: 0, items: [{ id: 'item', name: 'Perlengkapan Uji', category: 'Perlengkapan', quantity: 1, unitPrice: '25000.00' }] }] });
const writes = [];
window.roomWrites = writes;
let fail = true;
window.acceptRoomWrite = () => { fail = false; };
window.rejectRoomWrite = () => { fail = true; };
let hold = false;
window.holdRoomWrite = () => { hold = true; };
async function save(action, id, input, itemId) {
    writes.push({ action, id, itemId, ...input });
    if (hold) { hold = false; await new Promise(resolve => { window.releaseRoomWrite = resolve; }); }
    if (fail) throw new Error('Versi ruangan berubah.');
    const room = data.rooms.find(room => room.id === id);
    if (action === 'create') data.rooms.push({ ...data.rooms[0], ...input, id: 'new-room', items: [] });
    if (action === 'update') Object.assign(room, input);
    if (action === 'addItem') room.items.push({ ...input, id: 'new-item' });
    if (action === 'updateItem') Object.assign(room.items.find(item => item.id === itemId), input);
    if (action === 'removeItem') room.items = room.items.filter(item => item.id !== itemId);
    if (action === 'remove') data.rooms = data.rooms.filter(room => room.id !== id);
    if (room) room.version++;
}
const roomService = { create: input => save('create', null, input), update: (id,input) => save('update',id,input), addItem: (id,input) => save('addItem',id,input), updateItem: (id,itemId,input) => save('updateItem',id,input,itemId), removeItem: (id,itemId,input) => save('removeItem',id,input,itemId), remove: (id,input) => save('remove',id,input) };
</script>
<div class="min-w-0 p-4"><RoomsPage {data} {roomService} /></div>
