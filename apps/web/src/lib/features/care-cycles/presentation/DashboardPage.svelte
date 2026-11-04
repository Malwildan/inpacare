<script lang="ts">
import { goto, invalidateAll } from '$app/navigation';
import type { CareCycles, DashboardData, Cycle as CycleDetail, ChangeCycle, NewRequest, Decision } from '$lib/features/care-cycles';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import Modal from '$lib/shared/ui/Modal.svelte';
const statusLabels: Record<string, string> = { pending: 'Pending', assigned: 'Assigned', in_care: 'In Care', extend: 'Extend', released: 'Pelepasan' };
const requestLabels: Record<string, string> = { pending: 'Menunggu keputusan', approved: 'Disetujui', rejected: 'Ditolak' };
import Badge from '$lib/shared/ui/Badge.svelte';
let { data, careCycles, markNotificationRead }: {
    data: DashboardData;
    careCycles: CareCycles;
    markNotificationRead: (id: string) => Promise<void>;
} = $props();
let search = $state('');
let roomFilter = $state('');
let patientFilter = $state('');
let statusFilter = $state('');
$effect(() => { search = data.filters.search; roomFilter = data.filters.roomId; patientFilter = data.filters.patientId; statusFilter = data.filters.status; });
let busy = $state(false);
let error = $state('');
let success = $state('');
let createOpen = $state(false);
let createPatientId = $state('');
let createPlacementId = $state('');
let createError = $state('');
let matchingPlacements = $derived(data.reference.placements.filter(p => p.patientId === createPatientId && p.status === 'active'));
function choosePatient() {
    const placements = data.reference.placements.filter(p => p.patientId === createPatientId && p.status === 'active');
    createPlacementId = placements.length === 1 ? placements[0].id : '';
    createError = '';
}
function openCreate() { createPatientId = ''; createPlacementId = ''; createError = ''; error = ''; success = ''; createOpen = true; }
let selectedCycleId = $state<string | null>(null);
let selectedCycle = $state<CycleDetail | null>(null);
let detailLoading = $state(false);
let requestKind = $state('release');
let cycles = $derived(data.cycles);
let rooms = $derived(data.reference.rooms);
let counts = $derived(['pending', 'assigned', 'in_care', 'extend', 'released'].map((status) => ({ status, count: data.cycles.filter((c) => c.status === status).length })));
async function openDetail(id: string) {
    selectedCycleId = id;
    selectedCycle = null;
    detailLoading = true;
    error = '';
    success = '';
    requestKind = 'release';
    try {
        const detail = await careCycles.detail(id);
        if (selectedCycleId === id)
            selectedCycle = detail;
    }
    catch (cause) {
        if (selectedCycleId === id)
            error = sessionFailure(cause);
    }
    finally {
        if (selectedCycleId === id)
            detailLoading = false;
    }
}
async function filterCycles(event: SubmitEvent) { event.preventDefault(); const query = new URLSearchParams(); for (const [key, value] of Object.entries({ search: search.trim(), roomId: roomFilter, patientId: patientFilter, status: statusFilter }))
    if (value)
        query.set(key, value); await goto(`/dashboard${query.size ? '?' + query : ''}`, { keepFocus: true, noScroll: true }); }
function closeDetail() { selectedCycleId = null; selectedCycle = null; error = ''; }
async function send(operation: () => Promise<unknown>): Promise<boolean> {
    busy = true;
    error = '';
    success = '';
    try {
        await operation();
        await invalidateAll();
        success = 'Perubahan berhasil disimpan.';
        return true;
    }
    catch (cause) {
        error = sessionFailure(cause);
        return false;
    }
    finally {
        busy = false;
    }
}
async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    busy = true;
    createError = '';
    try {
        await careCycles.create({ patientId: createPatientId, doctorId: formText(form, 'doctorId'), placementId: createPlacementId || null });
        createOpen = false;
        success = 'Rekap berhasil dibuat dengan status Pending. Buka Lihat detail untuk melanjutkan siklus.';
        await goto('/dashboard', { invalidateAll: true });
    } catch (cause) {
        if (createOpen) createError = sessionFailure(cause);
        else error = 'Rekap tersimpan, tetapi daftar gagal dimuat. Muat ulang halaman.';
    }
    finally { busy = false; }
}
async function transition(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    if (await send(() => careCycles.change(cycle.id, { status: formText(form, 'status') as ChangeCycle['status'], expectedVersion: cycle.version })))
        closeDetail();
}
async function request(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const kind = String(formText(form, 'kind'));
    if (await send(() => careCycles.request(cycle.id, { kind: kind as NewRequest['kind'], requestedEnd: kind === 'extend' ? formText(form, 'requestedEnd') : null, reason: formText(form, 'reason') })))
        closeDetail();
}
async function decide(event: SubmitEvent, cycle: CycleDetail, requestId: string, decision: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    if (await send(() => careCycles.decide(cycle.id, requestId, { decision: decision as Decision['decision'], note: formText(form, 'note'), expectedVersion: cycle.version })))
        closeDetail();
}
async function assignPlacement(event: SubmitEvent, cycle: CycleDetail) { event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement); if (await send(() => careCycles.change(cycle.id, { expectedVersion: cycle.version, placementId: formText(form, 'placementId') || null })))
    closeDetail(); }
async function deleteCycle(cycle: CycleDetail) { if (cycle.status !== 'pending')
    return; const reason = prompt('Alasan menghapus rekap pending:'); if (!reason?.trim())
    return; if (confirm('Hapus rekap pending ini?') && await send(() => careCycles.remove(cycle.id, { expectedVersion: cycle.version, reason })))
    closeDetail(); }
</script>

<svelte:head><title>Dashboard Siklus | InpaCare</title></svelte:head>
<section class="page-heading">
	<div><h1 class="page-title">Dashboard Siklus Inpatient Care</h1><p class="page-subtitle">Pantau setiap pasien dan kelanjutan proses rawat inap sesuai kondisi terkini.</p></div>
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p class="success" role="status">{success}</p>{/if}

<section class="stats" aria-label="Ringkasan siklus">
	{#each counts as item}<div class="stat"><strong>{item.count}</strong><span>{({pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan'} as Record<string,string>)[item.status]}</span></div>{/each}
</section>

{#if data.user.role === 'PERAWAT'}
    <div class="create-panel"><button class="button primary" onclick={openCreate}>Tambah rekap pasien</button></div>
{/if}
{#if createOpen}
    <Modal title="Tambah rekap pasien" onclose={() => { if (!busy) createOpen = false; }}>
        <p class="create-help">Buat siklus rawat inap untuk pasien yang sudah terdaftar. Status awal rekap adalah Pending.</p>
        {#if createError}<p class="error" role="alert">{createError}</p>{/if}
        {#if data.creationCandidates.length === 0}
            <p class="empty">Belum ada pasien terdaftar tanpa rekap aktif. Periksa rekap yang ada atau minta data pasien didaftarkan terlebih dahulu.</p>
            <button class="button secondary" onclick={() => createOpen = false}>Tutup</button>
        {:else}
            <form class="create-form" onsubmit={create}>
                <label class="field">Pasien terdaftar<select name="patientId" required bind:value={createPatientId} onchange={choosePatient} disabled={busy}><option value="">Pilih pasien</option>{#each data.creationCandidates as patient}<option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>{/each}</select></label>
                <p class="muted">Hanya pasien yang belum memiliki rekap aktif yang dapat dipilih.</p>
                <label class="field">Dokter penanggung jawab<select name="doctorId" required disabled={busy}><option value="">Pilih dokter aktif</option>{#each data.reference.staff.filter(s => s.role === 'DOKTER' && s.active) as doctor}<option value={doctor.id}>{doctor.name}</option>{/each}</select></label>
                <label class="field">Penempatan pasien<select name="placementId" bind:value={createPlacementId} disabled={busy || !createPatientId || matchingPlacements.length === 0}><option value="">Belum ditempatkan</option>{#each matchingPlacements as placement}<option value={placement.id}>{placement.roomName} · {placement.startsOn}–{placement.endsOn}</option>{/each}</select></label>
                {#if createPatientId && matchingPlacements.length === 0}<p class="muted">Pasien belum memiliki penempatan aktif. Rekap tetap dapat disimpan sebagai Pending.</p>{/if}
                <p class="create-note"><strong>Status awal: Pending.</strong> Setelah disimpan, buka Lihat detail. Kaitkan penempatan aktif sebelum mengubah status menjadi Assigned, lalu In Care.</p>
                <div class="form-actions"><button type="button" class="button secondary" disabled={busy} onclick={() => createOpen = false}>Batalkan</button><button class="button primary" disabled={busy || !createPatientId}>{busy ? 'Menyimpan…' : 'Simpan rekap'}</button></div>
            </form>
        {/if}
    </Modal>
{/if}

<details class="notification-inbox">
	<summary>Notifikasi <span class="muted">{data.notifications.filter((item) => !item.readAt).length} belum dibaca</span></summary>
	{#if data.notifications.length === 0}<p class="empty">Belum ada notifikasi.</p>{:else}<ul>{#each data.notifications as item (item.id)}<li><span>{item.message}</span>{#if !item.readAt}<button class="button secondary small" disabled={busy} onclick={() => void send(()=>markNotificationRead(item.id))}>Tandai dibaca</button>{/if}</li>{/each}</ul>{/if}
</details>

<section class="panel">
	<div class="panel-header"><div><h2>Daftar rekap pasien</h2><span class="muted">{cycles.length} dari {data.cycles.length} pasien</span></div></div>
	<form class="filters" onsubmit={filterCycles}><label class="field search-field">Cari nama atau nomor rekam medis<input type="search" bind:value={search} placeholder="Cari nama pasien..." /></label><label class="field">Pasien<select bind:value={patientFilter}><option value="">Semua pasien</option>{#each data.reference.patients as patient}<option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>{/each}</select></label><label class="field">Ruangan<select bind:value={roomFilter}><option value="">Semua ruangan</option>{#each rooms as room}<option value={room.id}>{room.name}</option>{/each}</select></label><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option>{#each counts as item}<option value={item.status}>{({pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan'} as Record<string,string>)[item.status]}</option>{/each}<option value="pending_approval">Menunggu keputusan</option></select></label><button class="button primary" type="submit">Terapkan filter</button></form>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>Pasien</th><th>Ruangan</th><th>Dokter</th><th>Perawat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
		{#each cycles as cycle (cycle.id)}<tr>
			<td><strong>{cycle.patientName}</strong><span class="cell-meta">{cycle.id} · {cycle.medicalRecordNo}</span></td>
			<td>{cycle.room ?? 'Belum ditempatkan'}</td><td>{cycle.doctorName}</td><td>{cycle.nurseName}</td>
			<td><Badge value={cycle.status}/></td>
			<td><button class="button secondary small" onclick={() => void openDetail(cycle.id)}>{data.user.role === 'DOKTER' && cycle.requests.some((item) => item.status === 'pending') ? 'Tinjau permintaan' : 'Lihat detail'}</button></td>
		</tr>
		{:else}<tr><td colspan="6" class="empty">Tidak ada rekap yang cocok.</td></tr>{/each}
	</tbody></table></div>
</section>

{#if selectedCycleId}
	<Modal title="Detail siklus inpatient care" onclose={closeDetail}>
		{#if detailLoading}<p class="muted" role="status">Memuat detail pasien...</p>
		{:else if selectedCycle}
			<div class="detail-grid cycle-summary">
				<div class="detail-item"><span>Pasien</span><strong>{selectedCycle.patientName}</strong><small>{selectedCycle.medicalRecordNo}</small></div>
				<div class="detail-item"><span>Ruangan</span><strong>{selectedCycle.room ?? 'Belum ditempatkan'}</strong></div>
				<div class="detail-item"><span>Dokter</span><strong>{selectedCycle.doctorName}</strong></div>
				<div class="detail-item"><span>Perawat</span><strong>{selectedCycle.nurseName}</strong></div>
				<div class="detail-item"><span>Status saat ini</span><strong><Badge value={selectedCycle.status}/></strong></div>
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if data.user.role==='PERAWAT'&&selectedCycle.status==='pending'}<section class="detail-section"><h3>Penempatan pasien</h3><p class="muted">Rekap pending dapat dihubungkan ke penempatan aktif atau dikembalikan menjadi belum ditempatkan.</p><form onsubmit={(event)=>assignPlacement(event,selectedCycle!)}><label class="field">Penempatan<select name="placementId" value={selectedCycle.placementId??''}><option value="">Belum ditempatkan</option>{#each data.reference.placements.filter((p)=>p.status==='active'&&p.patientId===selectedCycle!.patientId) as placement}<option value={placement.id}>{placement.roomName} · {placement.startsOn}–{placement.endsOn}</option>{/each}</select></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan penempatan</button><button type="button" class="button danger" disabled={busy} onclick={()=>void deleteCycle(selectedCycle!)}>Hapus rekap</button></div></form></section>{/if}
			{#if data.user.role === 'PERAWAT' && ['pending', 'assigned'].includes(selectedCycle.status)}
				<section class="detail-section"><h3>Perbarui status</h3><p class="muted">Lanjutkan ke tahap berikutnya dalam siklus perawatan.</p>
					<form onsubmit={(event) => transition(event, selectedCycle!)}><label class="field">Tahap berikutnya<select name="status" required><option value={selectedCycle.status === 'pending' ? 'assigned' : 'in_care'}>{selectedCycle.status === 'pending' ? 'Assigned' : 'In Care'}</option></select></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan status</button></div></form>
				</section>
			{/if}
			{#if data.user.role === 'PERAWAT' && ['in_care', 'extend'].includes(selectedCycle.status) && !selectedCycle.requests.some((item) => item.status === 'pending')}
				<section class="detail-section"><h3>Ajukan perpanjangan atau pelepasan</h3><p class="muted">Permintaan akan ditinjau oleh dokter penanggung jawab.</p>
					<form onsubmit={(event) => request(event, selectedCycle!)}><div class="form-grid"><label class="field">Jenis permintaan<select name="kind" bind:value={requestKind}><option value="release">Pelepasan</option><option value="extend">Perpanjangan</option></select></label>{#if requestKind === 'extend'}<label class="field">Perpanjang sampai tanggal<input name="requestedEnd" type="date" required /></label>{/if}<label class="field full">Alasan<textarea name="reason" maxlength="500" required></textarea></label></div><div class="form-actions"><button class="button primary" disabled={busy}>Ajukan ke dokter</button></div></form>
				</section>
			{/if}
			<section class="detail-section"><h3>Riwayat permintaan</h3>
				{#if selectedCycle.requests.length === 0}<p class="muted">Belum ada permintaan.</p>
				{:else}{#each selectedCycle.requests as item (item.id)}<div class="request-item"><div class="request-heading"><strong>{item.kind === 'extend' ? `Perpanjangan sampai ${item.requestedEnd}` : 'Pelepasan'}</strong><span class="badge {item.status}">{requestLabels[item.status] ?? item.status}</span></div><p>Alasan: {item.reason}</p><small>Diajukan oleh {item.requestedBy}{item.decidedBy ? ` · Diputuskan oleh ${item.decidedBy}` : ''}</small>{#if item.note}<p>Catatan dokter: {item.note}</p>{/if}
					{#if data.user.role === 'DOKTER' && item.status === 'pending'}<form onsubmit={(event) => decide(event, selectedCycle!, item.id, String((event.submitter as HTMLButtonElement)?.value))}><label class="field">Catatan keputusan<input name="note" maxlength="500" required /></label><div class="form-actions"><button class="button secondary" name="decision" value="reject" disabled={busy}>Tolak</button><button class="button primary" name="decision" value="approve" disabled={busy}>Setujui</button></div></form>{/if}
				</div>{/each}{/if}
			</section>
		{:else}{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="button secondary" onclick={() => void openDetail(selectedCycleId!)}>Coba lagi</button>{/if}
	</Modal>
{/if}

<p class="muted workflow-note">Alur: Pending → Assigned → In Care → Extend / Pelepasan. Perpanjangan dan pelepasan berlaku setelah keputusan dokter.</p>

<style>
	.create-panel{margin-bottom:24px}
	.create-note{padding:16px;background:var(--surface-subtle, #f3f4f6);border-radius:8px;font-size:13px;line-height:1.6}
	.form-actions{display:flex;justify-content:flex-end;gap:12px}
	.create-help{margin:12px 0 18px;font-size:13px}
	.create-form{display:grid;gap:16px}
	.notification-inbox{margin-bottom:24px;border-bottom:1px solid var(--border);padding:0 4px 16px}
	.notification-inbox summary{cursor:pointer;font-weight:600}
	.notification-inbox summary span{font-size:12px;font-weight:400;margin-left:12px}
	.notification-inbox ul{list-style:none;padding:0;margin:12px 0 0}
	.notification-inbox li{padding:12px 0;display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid var(--border);font-size:13px}
	.notification-inbox .empty{text-align:left;padding:16px 0 0}
	.search-field{flex:2;min-width:220px}
	.cell-meta{display:block;color:var(--muted);font-size:12px;margin-top:4px}
	.request-item{border-top:1px solid var(--border);padding-top:12px;margin-top:12px;font-size:13px}
	.request-item small{display:block;color:var(--muted);margin-top:4px}
	.cycle-summary{padding-bottom:24px}
	.detail-section{border-top:1px solid var(--border);padding:24px 0}
	.detail-section:last-child{padding-bottom:0}
	.detail-section h3{margin-bottom:8px}
	.detail-section>p{font-size:13px;margin-bottom:16px}
	.detail-section form{margin-top:16px}
	.request-item p{margin-top:8px;color:var(--text)}
	.request-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
	.workflow-note{margin-top:20px;font-size:12px;max-width:80ch}
	@media(max-width:600px){.notification-inbox li{align-items:flex-start;flex-direction:column}}
</style>
