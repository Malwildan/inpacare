<script lang="ts">
import { invalidateAll } from '$app/navigation';
import type { Rooms, RoomsPageData, Room, RoomItem, EditRoom } from '$lib/features/rooms';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { Plus } from 'lucide-svelte';
import { dailyRateValue, displayDailyRate, parseDailyRate, updateDailyRateInput } from './daily-rate';
let { data, roomService }: {
    data: RoomsPageData;
    roomService: Rooms;
} = $props();
let query = $state('');
let classFilter = $state('');
let statusFilter = $state('');
let creating = $state(false);
let editing = $state<string | null>(null);
let viewing = $state<string | null>(null);
let addingTo = $state<string | null>(null);
let editingItem = $state<{
    roomId: string;
    item: RoomItem;
} | null>(null);
let busy = $state(false);
let error = $state('');
let success = $state('');
let rooms = $derived(data.rooms.filter((room: Room) => (!query || (room.name + ' ' + room.id).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
    (!classFilter || room.roomClass === classFilter) && (!statusFilter ||
    (statusFilter === 'occupied' ? room.status === 'available' && room.occupants > 0 :
        statusFilter === 'available' ? room.status === 'available' && room.occupants === 0 : room.status === statusFilter))));
let classes = $derived([...new Set(data.rooms.map((room: Room) => room.roomClass))]);
let available = $derived(data.rooms.filter((room: Room) => room.status === 'available' && room.occupants === 0).length);
let occupied = $derived(data.rooms.filter((room: Room) => room.status === 'available' && room.occupants > 0).length);
async function submit(operation: () => Promise<unknown>) {
    busy = true;
    error = '';
    success = '';
    try {
        await operation();
        await invalidateAll();
        creating = false;
        editing = null;
        addingTo = null;
        success = 'Perubahan berhasil disimpan.';
    }
    catch (e) {
        error = sessionFailure(e);
    }
    finally {
        busy = false;
    }
}
async function removeRoom(room: Room) {
    if (!confirm(`Hapus ruangan ${room.name}?`))
        return;
    await submit(() => roomService.remove(room.id, { expectedVersion: room.version }));
}
async function removeItem(room: Room, item: RoomItem) {
    if (!confirm(`Hapus item ${item.name} dari ruangan?`))
        return;
    await submit(() => roomService.removeItem(room.id, item.id, { expectedVersion: room.version }));
}
</script>

<svelte:head><title>Manajemen Ruangan | InpaCare</title></svelte:head>
<section class="page-heading">
	<div><h1 class="page-title">Manajemen Ruangan</h1><p class="page-subtitle">Kelola data, inventaris, dan ketersediaan ruangan rawat inap.</p></div>
	{#if data.user.role === 'PERAWAT'}<button class="button primary" aria-expanded={creating} onclick={() => { creating = !creating; editing = null; error = ''; }}><Plus size={16} aria-hidden="true"/> Tambah ruangan</button>{/if}
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p class="success" role="status">{success}</p>{/if}
<section class="stats" aria-label="Ringkasan ruangan">
	<div class="stat"><strong>{data.rooms.length}</strong><span>Total ruangan</span></div>
	<div class="stat"><strong>{available}</strong><span>Available</span></div>
	<div class="stat"><strong>{occupied}</strong><span>Occupied</span></div>
	<div class="stat"><strong>{data.rooms.filter((room: Room) => room.status === 'maintenance').length}</strong><span>Maintenance</span></div>
</section>
{#if creating}
	<section class="panel form-panel"><h2>Tambah ruangan</h2>
		<form class="form-grid" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); const dailyRate=parseDailyRate(formText(f,'dailyRate') || '0'); if(dailyRate===null){error='Masukkan tarif harian yang valid (maksimal 2 angka desimal).';return;} void submit(()=>roomService.create({name:formText(f,'name'),roomClass:formText(f,'roomClass'),capacity:Number(formText(f,'capacity')),picId:formText(f,'picId') || null,dailyRate})); }}>
			<label class="field">Nama ruangan<input name="name" maxlength="80" required placeholder="Contoh: Melati 01" /></label>
			<label class="field">Tipe<input name="roomClass" maxlength="40" required placeholder="Kelas I" /></label>
			<label class="field">Kapasitas<input name="capacity" type="number" min="1" max="20" value="1" required /></label>
			<label class="field">PIC<select name="picId"><option value="">Pilih perawat</option>{#each data.reference.staff.filter((s) => s.role === 'PERAWAT') as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label>
			<label class="field">Tarif harian<span class="rate-input"><span aria-hidden="true">Rp</span><input name="dailyRate" inputmode="decimal" value="0" placeholder="250.000" onfocus={(event) => { if (event.currentTarget.value === '0') event.currentTarget.select(); }} oninput={(event) => updateDailyRateInput(event.currentTarget, event instanceof InputEvent ? event.inputType : '')} aria-describedby="create-rate-hint" /></span><small class="muted" id="create-rate-hint">Rupiah. Contoh: 250.000 atau 250.000,50</small></label>
			<div class="form-actions"><button class="button primary" disabled={busy}>Simpan ruangan</button><button class="button secondary" type="button" onclick={() => creating = false}>Batal</button></div>
		</form>
	</section>
{/if}
<section class="panel">
	<div class="panel-header"><div><h2>Daftar ruangan</h2><span class="muted">{rooms.length} dari {data.rooms.length} ruangan</span></div></div>
	<div class="filters">
		<label class="field search-field">Cari ID atau nama ruangan<input type="search" bind:value={query} placeholder="Cari ruangan..." /></label>
		<label class="field">Tipe<select bind:value={classFilter}><option value="">Semua tipe</option>{#each classes as type}<option value={type}>{type}</option>{/each}</select></label>
		<label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option><option value="available">Available</option><option value="occupied">Occupied</option><option value="maintenance">Maintenance</option></select></label>
	</div>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>ID / nama ruangan</th><th>Tipe</th><th>PIC</th><th>Biaya inventaris</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
		{#each rooms as room (room.id)}
			<tr>
				<td><strong>{room.name}</strong><span class="cell-meta">{room.id} · {room.occupants}/{room.capacity} tempat terisi</span></td>
				<td>{room.roomClass}</td><td>{room.picName ?? 'Belum ditentukan'}</td><td>Rp {Number(room.totalCost).toLocaleString('id-ID')}</td>
				<td><span class="badge {room.status === 'maintenance' ? 'maintenance' : room.occupants > 0 ? 'occupied' : 'available'}">{room.status === 'maintenance' ? 'Maintenance' : room.occupants > 0 ? 'Occupied' : 'Available'}</span></td>
				<td><div class="actions"><button class="button secondary small" aria-expanded={viewing===room.id} onclick={() => { viewing=viewing===room.id?null:room.id; editing=null; addingTo=null; creating=false; }}>Lihat</button>
				{#if data.user.role === 'PERAWAT'}<button class="button secondary small" aria-expanded={editing === room.id} onclick={() => { editing=editing===room.id?null:room.id; viewing=null; creating=false; addingTo=null; error=''; }}>Ubah</button><button class="button secondary small" aria-expanded={addingTo === room.id} onclick={() => { addingTo=addingTo===room.id?null:room.id; viewing=null; editing=null; creating=false; error=''; }}><Plus size={14} aria-hidden="true"/> Item</button><button class="button danger small" disabled={busy || room.occupants>0} title={room.occupants>0?'Kosongkan penempatan aktif sebelum menghapus':''} onclick={() => void removeRoom(room)}>Hapus</button>{/if}</div></td>
			</tr>
			{#if viewing===room.id}<tr><td colspan="6"><div class="room-detail">
				<div class="detail-grid"><div class="detail-item"><span>Tipe</span><strong>{room.roomClass}</strong></div><div class="detail-item"><span>Kapasitas</span><strong>{room.capacity} pasien</strong></div><div class="detail-item"><span>Tarif harian</span><strong>{displayDailyRate(room.dailyRate)}</strong></div><div class="detail-item"><span>Total biaya inventaris</span><strong>Rp {Number(room.totalCost).toLocaleString('id-ID')}</strong></div></div>
				<h3>Perlengkapan dan fasilitas</h3>{#if room.items.length}<div class="item-list">{#each room.items as item}<div class="room-item"><span>{item.name} · {item.category} · {item.quantity} × Rp {Number(item.unitPrice).toLocaleString('id-ID')}</span>{#if data.user.role==='PERAWAT'}<button class="text-link" onclick={()=>editingItem={roomId:room.id,item}}>Ubah</button><button class="text-link danger-link" onclick={()=>void removeItem(room,item)}>Hapus</button>{/if}</div>{/each}</div>{:else}<p class="muted">Belum ada item yang dicatat.</p>{/if}
				{#if editingItem?.roomId===room.id}<form class="inline-edit" onsubmit={(event)=>{event.preventDefault();const f=new FormData(event.currentTarget);void submit(()=>roomService.updateItem(room.id,editingItem!.item.id,{name:formText(f,'name'),category:formText(f,'category'),quantity:Number(formText(f,'quantity')),unitPrice:String(formText(f,'unitPrice')),expectedVersion:room.version}));}}><label class="field">Nama<input name="name" required value={editingItem.item.name}/></label><label class="field">Kategori<input name="category" required value={editingItem.item.category}/></label><label class="field">Jumlah<input name="quantity" type="number" min="1" required value={editingItem.item.quantity}/></label><label class="field">Harga satuan<input name="unitPrice" type="number" min="0" step="0.01" required value={editingItem.item.unitPrice}/></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan item</button><button type="button" class="button secondary" onclick={()=>editingItem=null}>Batal</button></div></form>{/if}
			</div></td></tr>{/if}
			{#if editing === room.id}<tr><td colspan="6"><form class="inline-edit" onsubmit={(event) => { event.preventDefault(); const f=new FormData(event.currentTarget); const dailyRate=parseDailyRate(formText(f,'dailyRate')); if(dailyRate===null){error='Masukkan tarif harian yang valid (maksimal 2 angka desimal).';return;} void submit(()=>roomService.update(room.id,{name:formText(f,'name'),roomClass:formText(f,'roomClass'),capacity:Number(formText(f,'capacity')),status:formText(f,'status') as EditRoom['status'],picId:formText(f,'picId') || null,dailyRate,expectedVersion:room.version})); }}>
				<label class="field">Nama<input name="name" required value={room.name} /></label><label class="field">Tipe<input name="roomClass" required value={room.roomClass} /></label>
				<label class="field">Kapasitas<input name="capacity" type="number" min="1" max="20" required value={room.capacity} /></label>
				<label class="field">Status<select name="status" value={room.status}><option value="available">Available</option><option value="maintenance">Maintenance</option></select></label>
				<label class="field">PIC<select name="picId"><option value="">Tidak ditentukan</option>{#each data.reference.staff.filter((s) => s.role === 'PERAWAT') as nurse}<option value={nurse.id} selected={nurse.id===room.picId}>{nurse.name}</option>{/each}</select></label>
				<label class="field">Tarif harian<span class="rate-input"><span aria-hidden="true">Rp</span><input name="dailyRate" inputmode="decimal" required value={dailyRateValue(room.dailyRate)} onfocus={(event) => { if (event.currentTarget.value === '0') event.currentTarget.select(); }} oninput={(event) => updateDailyRateInput(event.currentTarget, event instanceof InputEvent ? event.inputType : '')} aria-describedby="edit-rate-hint" /></span><small class="muted" id="edit-rate-hint">Rupiah. Contoh: 250.000 atau 250.000,50</small></label>
				<div class="form-actions"><button class="button primary" disabled={busy}>Simpan</button><button class="button secondary" type="button" onclick={() => editing=null}>Batal</button></div>
			</form></td></tr>{/if}
			{#if addingTo === room.id}<tr><td colspan="6"><form class="inline-edit" onsubmit={(event) => { event.preventDefault(); const f=new FormData(event.currentTarget); void submit(()=>roomService.addItem(room.id,{name:formText(f,'name'),category:formText(f,'category'),quantity:Number(formText(f,'quantity')),unitPrice:formText(f,'unitPrice')})); }}>
				<label class="field">Nama item<input name="name" required /></label><label class="field">Kategori<input name="category" required placeholder="Perlengkapan / alat" /></label>
				<label class="field">Jumlah<input name="quantity" type="number" min="1" value="1" required /></label><label class="field">Harga satuan<input name="unitPrice" type="number" min="0" step="0.01" value="0" required /></label>
				<div class="form-actions"><button class="button primary" disabled={busy}>Tambah item</button><button class="button secondary" type="button" onclick={() => addingTo=null}>Batal</button></div>
				<div class="item-list">{#each room.items as item}<span>{item.name} · {item.quantity} × Rp {Number(item.unitPrice).toLocaleString('id-ID')}</span>{/each}</div>
			</form></td></tr>{/if}
		{:else}<tr><td colspan="6" class="empty">Tidak ada ruangan yang cocok dengan filter.</td></tr>{/each}
	</tbody></table></div>
</section>
<style>
	.rate-input{position:relative;display:block}.rate-input>span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.rate-input input{padding-left:42px;font-variant-numeric:tabular-nums}
	.form-panel h2{margin-bottom:20px}.form-grid,.inline-edit{display:grid;grid-template-columns:repeat(3,minmax(140px,1fr));gap:18px}.inline-edit{padding:16px 0}.cell-meta{display:block;font-size:12px;color:var(--muted);margin-top:4px}.actions{display:flex;gap:8px;flex-wrap:wrap}.item-list{grid-column:1/-1;display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:13px}.room-detail{padding:16px 0}.room-detail h3{font-size:15px;margin:24px 0 12px}.form-actions{grid-column:1/-1}.search-field{min-width:200px;flex:2}
	@media(max-width:900px){.form-grid,.inline-edit{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.form-grid,.inline-edit{grid-template-columns:1fr}.page-heading{align-items:flex-start}.actions{flex-direction:column}}
</style>
