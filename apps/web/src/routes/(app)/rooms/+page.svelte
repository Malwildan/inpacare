<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';

	let { data } = $props();
	let query = $state('');
	let classFilter = $state('');
	let statusFilter = $state('');
	let creating = $state(false);
	let editing = $state<string | null>(null);
	let viewing = $state<string | null>(null);
	let addingTo = $state<string | null>(null);
	let busy = $state(false);
	let error = $state('');
	let success = $state('');

	let rooms = $derived(data.rooms.filter((room: any) =>
		(!query || (room.name + ' ' + room.id).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
		(!classFilter || room.roomClass === classFilter) && (!statusFilter ||
			(statusFilter === 'occupied' ? room.status === 'available' && room.occupants > 0 :
			 statusFilter === 'available' ? room.status === 'available' && room.occupants === 0 : room.status === statusFilter))
	));
	let classes = $derived([...new Set(data.rooms.map((room: any) => room.roomClass))]);
	let available = $derived(data.rooms.filter((room: any) => room.status === 'available' && room.occupants === 0).length);
	let occupied = $derived(data.rooms.filter((room: any) => room.status === 'available' && room.occupants > 0).length);

	async function submit(path: string, method: string, payload: object) {
		busy = true; error = ''; success = '';
		try {
			await api(path, { method, body: JSON.stringify(payload) });
			await invalidateAll();
			creating = false; editing = null; addingTo = null;
			success = 'Perubahan berhasil disimpan.';
		} catch (e) { error = e instanceof Error ? e.message : 'Perubahan gagal disimpan.'; }
		finally { busy = false; }
	}
</script>

<svelte:head><title>Manajemen Ruangan | InpaCare</title></svelte:head>
<section class="page-heading">
	<div><h1 class="page-title">Manajemen Ruangan</h1><p class="page-subtitle">Kelola data, inventaris, dan ketersediaan ruangan rawat inap.</p></div>
	{#if data.user.role === 'PERAWAT'}<button class="button primary" onclick={() => { creating = !creating; editing = null; error = ''; }}>＋ Tambah ruangan</button>{/if}
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p class="success" role="status">{success}</p>{/if}
<section class="stats" aria-label="Ringkasan ruangan">
	<div class="stat"><strong>{data.rooms.length}</strong><span>Total ruangan</span></div>
	<div class="stat"><strong>{available}</strong><span>Available</span></div>
	<div class="stat"><strong>{occupied}</strong><span>Occupied</span></div>
	<div class="stat"><strong>{data.rooms.filter((room: any) => room.status === 'maintenance').length}</strong><span>Maintenance</span></div>
</section>
{#if creating}
	<section class="panel form-panel"><h2>Tambah ruangan</h2>
		<form class="form-grid" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit('/rooms','POST',{name:f.get('name'),roomClass:f.get('roomClass'),capacity:Number(f.get('capacity')),picId:f.get('picId') || null,dailyRate:f.get('dailyRate') || '0'}); }}>
			<label class="field">Nama ruangan<input name="name" maxlength="80" required placeholder="Contoh: Melati 01" /></label>
			<label class="field">Tipe<input name="roomClass" maxlength="40" required placeholder="Kelas I" /></label>
			<label class="field">Kapasitas<input name="capacity" type="number" min="1" max="20" value="1" required /></label>
			<label class="field">PIC<select name="picId"><option value="">Pilih perawat</option>{#each data.reference.staff.filter((s: any) => s.role === 'PERAWAT') as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label>
			<label class="field">Tarif harian (Rp)<input name="dailyRate" type="number" min="0" step="0.01" value="0" /></label>
			<div class="form-actions"><button class="button primary" disabled={busy}>Simpan ruangan</button><button class="button secondary" type="button" onclick={() => creating = false}>Batal</button></div>
		</form>
	</section>
{/if}
<section class="panel">
	<div class="panel-header"><div><h2>Daftar ruangan</h2><span class="muted">{rooms.length} dari {data.rooms.length} ruangan</span></div></div>
	<div class="filters">
		<label class="field search-field">Cari ID atau nama ruangan<input bind:value={query} placeholder="Cari ruangan..." /></label>
		<label class="field">Tipe<select bind:value={classFilter}><option value="">Semua tipe</option>{#each classes as type}<option value={type}>{type}</option>{/each}</select></label>
		<label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option><option value="available">Available</option><option value="occupied">Occupied</option><option value="maintenance">Maintenance</option></select></label>
	</div>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>ID / nama ruangan</th><th>Tipe</th><th>PIC</th><th>Biaya inventaris</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
		{#each rooms as room (room.id)}
			<tr>
				<td><strong>{room.name}</strong><span class="cell-meta">{room.id} · {room.occupants}/{room.capacity} tempat terisi</span></td>
				<td>{room.roomClass}</td><td>{room.picName ?? 'Belum ditentukan'}</td><td>Rp {Number(room.totalCost).toLocaleString('id-ID')}</td>
				<td><span class="badge {room.status === 'maintenance' ? 'warning' : room.occupants > 0 ? 'info' : 'good'}">{room.status === 'maintenance' ? 'Maintenance' : room.occupants > 0 ? 'Occupied' : 'Available'}</span></td>
				<td class="actions"><button class="button secondary small" aria-expanded={viewing===room.id} onclick={() => { viewing=viewing===room.id?null:room.id; editing=null; addingTo=null; creating=false; }}>Lihat</button>
				{#if data.user.role === 'PERAWAT'}<button class="button secondary small" aria-expanded={editing === room.id} onclick={() => { editing=editing===room.id?null:room.id; viewing=null; creating=false; addingTo=null; error=''; }}>Ubah</button><button class="button secondary small" aria-expanded={addingTo === room.id} onclick={() => { addingTo=addingTo===room.id?null:room.id; viewing=null; editing=null; creating=false; error=''; }}>＋ Item</button>{/if}</td>
			</tr>
			{#if viewing===room.id}<tr><td colspan="6"><div class="room-detail">
				<div class="detail-grid"><div class="detail-item"><span>Tipe</span><strong>{room.roomClass}</strong></div><div class="detail-item"><span>Kapasitas</span><strong>{room.capacity} pasien</strong></div><div class="detail-item"><span>Tarif harian</span><strong>Rp {Number(room.dailyRate).toLocaleString('id-ID')}</strong></div><div class="detail-item"><span>Total biaya inventaris</span><strong>Rp {Number(room.totalCost).toLocaleString('id-ID')}</strong></div></div>
				<h3>Perlengkapan dan fasilitas</h3>{#if room.items.length}<div class="item-list">{#each room.items as item}<span>{item.name} · {item.category} · {item.quantity} × Rp {Number(item.unitPrice).toLocaleString('id-ID')}</span>{/each}</div>{:else}<p class="muted">Belum ada item yang dicatat.</p>{/if}
			</div></td></tr>{/if}
			{#if editing === room.id}<tr><td colspan="6"><form class="inline-edit" onsubmit={(event) => { event.preventDefault(); const f=new FormData(event.currentTarget); void submit('/rooms/'+room.id,'PATCH',{name:f.get('name'),roomClass:f.get('roomClass'),capacity:Number(f.get('capacity')),status:f.get('status'),picId:f.get('picId') || null,dailyRate:f.get('dailyRate'),expectedVersion:room.version}); }}>
				<label class="field">Nama<input name="name" required value={room.name} /></label><label class="field">Tipe<input name="roomClass" required value={room.roomClass} /></label>
				<label class="field">Kapasitas<input name="capacity" type="number" min="1" max="20" required value={room.capacity} /></label>
				<label class="field">Status<select name="status" value={room.status}><option value="available">Available</option><option value="maintenance">Maintenance</option></select></label>
				<label class="field">PIC<select name="picId"><option value="">Tidak ditentukan</option>{#each data.reference.staff.filter((s: any) => s.role === 'PERAWAT') as nurse}<option value={nurse.id} selected={nurse.id===room.picId}>{nurse.name}</option>{/each}</select></label>
				<label class="field">Tarif harian<input name="dailyRate" type="number" min="0" step="0.01" required value={room.dailyRate} /></label>
				<div class="form-actions"><button class="button primary" disabled={busy}>Simpan</button><button class="button secondary" type="button" onclick={() => editing=null}>Batal</button></div>
			</form></td></tr>{/if}
			{#if addingTo === room.id}<tr><td colspan="6"><form class="inline-edit" onsubmit={(event) => { event.preventDefault(); const f=new FormData(event.currentTarget); void submit('/rooms/'+room.id+'/items','POST',{name:f.get('name'),category:f.get('category'),quantity:Number(f.get('quantity')),unitPrice:f.get('unitPrice')}); }}>
				<label class="field">Nama item<input name="name" required /></label><label class="field">Kategori<input name="category" required placeholder="Perlengkapan / alat" /></label>
				<label class="field">Jumlah<input name="quantity" type="number" min="1" value="1" required /></label><label class="field">Harga satuan<input name="unitPrice" type="number" min="0" step="0.01" value="0" required /></label>
				<div class="form-actions"><button class="button primary" disabled={busy}>Tambah item</button><button class="button secondary" type="button" onclick={() => addingTo=null}>Batal</button></div>
				<div class="item-list">{#each room.items as item}<span>{item.name} · {item.quantity} × Rp {Number(item.unitPrice).toLocaleString('id-ID')}</span>{/each}</div>
			</form></td></tr>{/if}
		{:else}<tr><td colspan="6" class="empty">Tidak ada ruangan yang cocok dengan filter.</td></tr>{/each}
	</tbody></table></div>
</section>
<style>
	.form-panel,.panel{margin-bottom:18px}.form-panel{padding:20px}.form-panel h2{margin:0 0 14px;font-size:16px}.form-grid,.inline-edit{display:grid;grid-template-columns:repeat(3,minmax(140px,1fr));gap:14px}.inline-edit{padding:14px;background:#f7f8fc}.cell-meta{display:block;font-size:11px;color:#858b9b;margin-top:4px}.actions{display:flex;gap:6px;flex-wrap:wrap}.item-list{grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;color:#626879;font-size:12px}.room-detail{padding:12px;background:#f7f8fc}.room-detail h3{font-size:13px;margin:14px 0 8px}.form-actions{display:flex;gap:8px;align-items:end}.search-field{min-width:200px;flex:1}
	@media(max-width:900px){.form-grid,.inline-edit{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.form-grid,.inline-edit{grid-template-columns:1fr}.page-heading{align-items:flex-start}.actions{flex-direction:column}}
</style>
