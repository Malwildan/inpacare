<script lang="ts">
import { date } from '$lib/shared/format';
import { Bell, Check, Eye, Filter, Pencil, Plus, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-svelte';
import { toast } from '$lib/shared/ui/sonner/index.js';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
import { goto, invalidateAll } from '$app/navigation';
import { tick } from 'svelte';
import { isVersionConflict } from '$lib/shared/errors';
import type { CareCycles, DashboardData, Cycle as CycleDetail, ChangeCycle, NewCycle, NewRequest, Decision } from '$lib/features/care-cycles';
import { isUnconfirmedSave, sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { NotificationDialog, type Notifications } from '$lib/features/notifications';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
const statusLabels: Record<string, string> = { pending: 'Menunggu', assigned: 'Sudah ditempatkan', in_care: 'Dalam perawatan', extend: 'Diperpanjang', released: 'Pelepasan' };
const requestLabels: Record<string, string> = { pending: 'Menunggu keputusan', approved: 'Disetujui', rejected: 'Ditolak' };
import Badge from '$lib/shared/ui/status-badge.svelte';
let { data, careCycles, notificationService }: {
    data: DashboardData;
    careCycles: CareCycles;
    notificationService: Notifications;
} = $props();
let search = $state('');
let roomFilter = $state('');
let patientFilter = $state('');
let statusFilter = $state('');
let filterOpen = $state(false);
let notificationsOpen = $state(false);
let filterBusy = $state(false);
let filterDraft = $state({ patientId: '', roomId: '', status: '' });
$effect(() => { search = data.filters.search; roomFilter = data.filters.roomId; patientFilter = data.filters.patientId; statusFilter = data.filters.status; });
let busy = $state(false);
let deletingCycle = $state<CycleDetail | null>(null);
let deletionReason = $state('');
let createOpen = $state(false);
let createPatientId = $state('');
let createDoctorId = $state('');
let createPlacementId = $state('');
let createPlacementMode = $state('new');
let createRoomId = $state('');
let createStartsOn = $state('');
let createEndsOn = $state('');
let createError = $state('');
let creationRequest: { payload: string; id: string } | null = null;
let matchingPlacements = $derived(data.reference.placements.filter(p => p.patientId === createPatientId && p.status === 'active'));
function choosePatient() {
    const placements = data.reference.placements.filter(p => p.patientId === createPatientId && p.status === 'active');
    createPlacementId = placements.length === 1 ? placements[0].id : '';
    createPlacementMode = placements.length ? 'existing' : 'new';
}
function openCreate() {
    createPatientId = ''; createDoctorId = ''; createPlacementId = ''; createRoomId = '';
    createStartsOn = ''; createEndsOn = ''; createPlacementMode = 'new'; createError = '';
    creationRequest = null; createOpen = true;
}
let selectedCycleId = $state<string | null>(null);
let selectedCycle = $state<CycleDetail | null>(null);
let detailNeedsRefresh = $state(false);
let detailError = $state('');
let detailSuccess = $state('');
let detailPlacementId = $state('');
let cycleTable: HTMLDivElement;
let returnFocus: HTMLElement | null = null;
let listPosition = { x: 0, y: 0, left: 0 };
let canManage = $derived(data.user.role === 'PERAWAT' && selectedCycle?.nurseId === data.user.id);
let pendingRequest = $derived(selectedCycle?.requests.find(item => item.status === 'pending'));
let detailLoading = $state(false);
let cycleView = $state<'detail' | 'placement' | 'request' | 'decision' | 'delete'>('detail');
let decisionRequestId = $state('');
let requestKind = $state('release');
let cycles = $derived(data.cycles);
let rooms = $derived(data.reference.rooms);
let counts = $derived(['pending', 'assigned', 'in_care', 'extend', 'released'].map((status) => ({ status, count: data.cycles.filter((c) => c.status === status).length })));
async function openDetail(id: string) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    listPosition = { x: window.scrollX, y: window.scrollY, left: cycleTable?.querySelector<HTMLElement>('[data-slot="table-container"]')?.scrollLeft ?? 0 };
    cycleView = 'detail';
    selectedCycleId = id;
    selectedCycle = null;
    detailLoading = true;
    detailNeedsRefresh = false;
    detailError = '';
    detailSuccess = '';
    requestKind = 'release';
    try {
        const detail = await careCycles.detail(id);
        if (selectedCycleId === id) {
            selectedCycle = detail;
            detailPlacementId = detail.placementId ?? '';
        }
    }
    catch (cause) {
        if (selectedCycleId === id)
            detailError = sessionFailure(cause, 'load', 'Detail rekap');
    }
    finally {
        if (selectedCycleId === id)
            detailLoading = false;
    }
}
function openFilters() {
    filterDraft = { patientId: patientFilter, roomId: roomFilter, status: statusFilter };
    filterOpen = true;
}
async function filterCycles(event: SubmitEvent, draft = { roomId: roomFilter, patientId: patientFilter, status: statusFilter }) {
    event.preventDefault();
    if (filterBusy) return;
    filterBusy = true;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ search: search.trim(), ...draft })) if (value) query.set(key, value);
    try {
        await goto(`/dashboard${query.size ? '?' + query : ''}`, { reset: false });
        filterOpen = false;
    } catch (cause) { toast.error(sessionFailure(cause, 'load', 'Daftar rekap rawat inap')); }
    finally { filterBusy = false; }
}
async function closeDetail() {
    if (busy) return;
    selectedCycleId = null;
    selectedCycle = null;
    await tick();
    requestAnimationFrame(() => {
        const focusTarget = returnFocus?.isConnected ? returnFocus : document.querySelector<HTMLInputElement>('.dashboard-page input[type="search"]');
        focusTarget?.focus({ preventScroll: true });
        const tableScroller = cycleTable?.querySelector<HTMLElement>('[data-slot="table-container"]');
        if (tableScroller) tableScroller.scrollLeft = listPosition.left;
        window.scrollTo({ left: listPosition.x, top: listPosition.y, behavior: 'instant' });
    });
}
async function refreshDetail() {
    if (busy || !selectedCycleId) return;
    busy = true;
    detailError = '';
    try {
        selectedCycle = await careCycles.detail(selectedCycleId);
        detailPlacementId = selectedCycle.placementId ?? '';
        detailNeedsRefresh = false;
        cycleView = 'detail';
        detailSuccess = 'Detail terbaru dimuat. Periksa kembali sebelum melanjutkan.';
        try { await invalidateAll(); }
        catch { detailError = 'Detail terbaru sudah dimuat, tetapi daftar gagal diperbarui. Tutup dan cari pasien kembali.'; }
    } catch (cause) { detailError = sessionFailure(cause, 'load', 'Detail rekap'); }
    finally { busy = false; }
}
async function saveDetail(cycle: CycleDetail, operation: () => Promise<unknown>) {
    if (busy || detailNeedsRefresh) return;
    busy = true;
    detailError = '';
    detailSuccess = '';
    try { await operation(); }
    catch (cause) {
        detailError = sessionFailure(cause, 'save', 'rekap rawat inap');
        detailNeedsRefresh = isVersionConflict(cause) || isUnconfirmedSave(cause);
        busy = false;
        return;
    }
    // A committed write must not be retried with a stale version if the read fails.
    detailNeedsRefresh = true;
    detailSuccess = 'Perubahan berhasil disimpan.';
    try {
        selectedCycle = await careCycles.detail(cycle.id);
        detailPlacementId = selectedCycle.placementId ?? '';
        detailNeedsRefresh = false;
        cycleView = 'detail';
    } catch (cause) {
        detailError = `Perubahan tersimpan. ${sessionFailure(cause, 'load', 'Detail rekap')}`;
    }
    try { await invalidateAll(); }
    catch { detailError ||= 'Perubahan tersimpan, tetapi daftar gagal diperbarui. Tutup dan cari pasien kembali.'; }
    finally { busy = false; }
}
async function send(operation: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    busy = true;
    const toastId = toast.loading('Menyimpan perubahan…');
    try {
        await operation();
        await invalidateAll().then(
            () => toast.success('Perubahan berhasil disimpan.', { id: toastId }),
            () => toast.warning('Perubahan rekap tersimpan. Muat ulang halaman untuk melihat daftar terbaru.', { id: toastId })
        );
        return true;
    }
    catch (cause) {
        toast.error(sessionFailure(cause, 'save', 'rekap rawat inap'), { id: toastId });
        return false;
    }
    finally {
        busy = false;
    }
}
async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    if (!createPatientId || !createDoctorId) { createError = 'Pilih pasien dan dokter penanggung jawab.'; return; }
    const pending = (event.submitter as HTMLButtonElement)?.value === 'pending';
    const input: NewCycle = {
        patientId: createPatientId, doctorId: createDoctorId,
        ...(pending ? { placementId: null } : createPlacementMode === 'existing'
            ? { placementId: createPlacementId }
            : { newPlacement: { roomId: createRoomId, startsOn: createStartsOn, endsOn: createEndsOn } })
    };
    const payload = JSON.stringify(input);
    if (creationRequest?.payload !== payload) creationRequest = { payload, id: crypto.randomUUID() };
    busy = true;
    createError = '';
    const toastId = toast.loading('Menyimpan rawat inap…');
    try {
        const created = await careCycles.create({ ...input, requestId: creationRequest.id });
        createOpen = false;
        toast.success(created.status === 'assigned' ? 'Rekap dan penempatan berhasil disimpan.' : 'Rekap tersimpan dengan status Menunggu. Pilih penempatan sebelum memulai perawatan.', { id: toastId });
        await openDetail(created.id);
        await invalidateAll();
    } catch (cause) {
        if (createOpen) { createError = isUnconfirmedSave(cause) ? 'Rekap belum dapat dipastikan tersimpan. Periksa daftar rekap terbaru. Jika perlu mencoba lagi, kirim isian yang sama.' : sessionFailure(cause, 'save', 'rekap rawat inap'); toast.error(createError, { id: toastId }); }
        else toast.warning('Rekap tersimpan, tetapi daftar gagal dimuat. Muat ulang halaman.', { id: toastId });
    }
    finally { busy = false; }
}
async function transition(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const status: ChangeCycle['status'] = cycle.status === 'pending' ? 'assigned' : 'in_care';
    await saveDetail(cycle, () => careCycles.change(cycle.id, { status, expectedVersion: cycle.version }));
}
async function request(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const kind = String(formText(form, 'kind'));
    await saveDetail(cycle, () => careCycles.request(cycle.id, { kind: kind as NewRequest['kind'], requestedEnd: kind === 'extend' ? formText(form, 'requestedEnd') : null, reason: formText(form, 'reason') }));
}
async function decide(event: SubmitEvent, cycle: CycleDetail, requestId: string, decision: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    await saveDetail(cycle, () => careCycles.decide(cycle.id, requestId, { decision: decision as Decision['decision'], note: formText(form, 'note'), expectedVersion: cycle.version }));
}
async function assignPlacement(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const placementId = detailPlacementId || null;
    await saveDetail(cycle, () => careCycles.change(cycle.id, { expectedVersion: cycle.version, placementId }));
}
async function deleteCycle(cycle: CycleDetail) {
    if (cycle.status !== 'pending' || busy) return;
    const reason = deletionReason.trim();
    if (!reason) { toast.error('Isi Alasan penghapusan rekap rawat inap.'); return; }
    if (await send(() => careCycles.remove(cycle.id, { expectedVersion: cycle.version, reason }))) {
        deletingCycle = null;
        closeDetail();
    }
}
</script>

<svelte:head><title>Rekap rawat inap | InpaCare</title></svelte:head>
<div class="dashboard-page flex min-w-0 flex-col gap-6">
<section class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	<div><h1 class="page-title">Rekap rawat inap</h1><p class="page-subtitle">Lihat penempatan, status perawatan, dan permintaan untuk setiap pasien.</p></div>
</section>

<section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Jumlah rekap menurut status">
	{#each counts as item}<Card class="gap-1 p-4"><strong class="text-2xl font-semibold tabular-nums">{item.count}</strong><span class="text-sm text-muted-foreground">{({pending:'Menunggu',assigned:'Sudah ditempatkan',in_care:'Dalam perawatan',extend:'Diperpanjang',released:'Pelepasan'} as Record<string,string>)[item.status]}</span></Card>{/each}
</section>

<div class="flex flex-wrap gap-3"><Button variant="outline" class="h-11" aria-haspopup="dialog" onclick={() => notificationsOpen = true}><Bell aria-hidden="true" /> Lihat notifikasi</Button></div>

{#if data.user.role === 'PERAWAT'}
    <div class="create-panel"><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" onclick={openCreate}><Plus aria-hidden="true" /> Mulai rawat inap</Button></div>
{/if}
{#if createOpen}
    <Modal busy={busy} protectChanges title="Mulai rawat inap" description="Pilih pasien, dokter, dan penempatan dalam satu formulir." onclose={() => { if (!busy) createOpen = false; }}>
        {#snippet children(close)}
        <p class="create-help">Gunakan penempatan yang ada atau pilih ruang dan periode baru. Jika ruang belum tersedia, simpan sebagai Menunggu.</p>
        {#if data.creationCandidates.length === 0}
            <p class="empty">Belum ada pasien terdaftar tanpa rekap aktif. Periksa rekap yang ada atau minta data pasien didaftarkan terlebih dahulu.</p>
            <Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" onclick={close}><X aria-hidden="true" /> Tutup</Button>
        {:else}
            <form class="create-form" onsubmit={create}>
                <label class="field">Pasien terdaftar<FormSelect name="patientId" required bind:value={createPatientId} onValueChange={choosePatient} disabled={busy} options={[{ value: "", label: "Pilih pasien" }, ...(data.creationCandidates).map((patient) => ({ value: patient.id, label: (patient.name) + " · " + (patient.medicalRecordNo) }))]} /></label>
                <p class="muted">Hanya pasien yang belum memiliki rekap aktif yang dapat dipilih.</p>
                <label class="field">Dokter penanggung jawab<FormSelect name="doctorId" required bind:value={createDoctorId} disabled={busy} options={[{ value: "", label: "Pilih dokter aktif" }, ...(data.reference.staff.filter(s => s.role === 'DOKTER' && s.active)).map((doctor) => ({ value: doctor.id, label: (doctor.name) }))]} /></label>
                <label class="field">Cara penempatan<FormSelect bind:value={createPlacementMode} disabled={busy || !createPatientId} options={[{ value: 'existing', label: 'Gunakan penempatan yang ada', disabled: matchingPlacements.length === 0 }, { value: 'new', label: 'Buat penempatan baru' }]} /></label>
                {#if createPlacementMode === 'existing'}
                    <label class="field">Penempatan pasien<FormSelect name="placementId" required bind:value={createPlacementId} disabled={busy} options={[{ value: '', label: 'Pilih penempatan aktif' }, ...matchingPlacements.map(placement => ({ value: placement.id, label: `${placement.roomName} · ${date(placement.startsOn)}–${date(placement.endsOn)}` }))]} /></label>
                {:else}
                    <label class="field">Ruangan<FormSelect name="roomId" required bind:value={createRoomId} disabled={busy || !createPatientId} options={[{ value: '', label: 'Pilih ruangan' }, ...rooms.filter(room => room.status === 'available').map(room => ({ value: room.id, label: `${room.name} · ${room.roomClass}` }))]} /></label>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <label class="field">Tanggal masuk<FormDatePicker name="startsOn" required bind:value={createStartsOn} disabled={busy || !createPatientId} /></label>
                        <label class="field">Tanggal selesai<FormDatePicker name="endsOn" required bind:value={createEndsOn} disabled={busy || !createPatientId} /></label>
                    </div>
                    <p class="muted">Kapasitas dan bentrok jadwal diperiksa saat menyimpan. Jika ruang penuh, pilih ruang atau periode lain.</p>
                {/if}
                <p class="create-note">Simpan dan tempatkan menghasilkan status <strong>Sudah ditempatkan</strong>. Pilih <strong>Mulai perawatan</strong> pada detail saat pasien benar-benar mulai dirawat.</p>
                {#if createError}<p role="alert" class="text-sm text-destructive">{createError}</p>{/if}
                <div class="form-actions flex-col sm:flex-row">
                    <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={close}><X aria-hidden="true" /> Batalkan</Button>
                    <Button variant="outline" type="submit" name="intent" value="pending" formnovalidate class="h-11" disabled={busy || !createPatientId || !createDoctorId}>Simpan sebagai Menunggu</Button>
                    <Button type="submit" name="intent" value="assigned" class="h-11" disabled={busy || !createPatientId || !createDoctorId}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan dan tempatkan'}</Button>
                </div>
            </form>
        {/if}
        {/snippet}
    </Modal>
{/if}

<Card class="gap-4 p-5 sm:p-6 ">
	<div class="panel-header"><div><h2>Daftar rekap pasien</h2><span class="muted">{cycles.length} dari {data.cycles.length} pasien</span></div></div>
	<form class="filters" onsubmit={(event) => filterCycles(event)}><label class="field search-field">Cari nama atau nomor rekam medis<Input class="h-11 text-base md:text-sm" type="search" bind:value={search} placeholder="Cari nama pasien..." /></label><Button variant="outline" class="h-11" aria-haspopup="dialog" onclick={openFilters}><Filter aria-hidden="true" /> Filter rekap{#if patientFilter || roomFilter || statusFilter}<span class="sr-only"> aktif</span>{/if}</Button><Button type="submit" class="h-11" disabled={filterBusy}><Search aria-hidden="true" /> Cari pasien</Button></form>
	<div class="table-wrap" bind:this={cycleTable}><Table class="data-table"><TableHeader><TableRow><TableHead>Pasien</TableHead><TableHead>Ruangan</TableHead><TableHead>Dokter</TableHead><TableHead>Perawat</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>
		{#each cycles as cycle (cycle.id)}<TableRow>
			<TableCell><strong>{cycle.patientName}</strong><span class="cell-meta">{#if /^CY-\d+$/.test(cycle.id)}{cycle.id}{' · '}{/if}{cycle.medicalRecordNo}</span></TableCell>
			<TableCell>{cycle.room ?? 'Belum ditempatkan'}</TableCell><TableCell>{cycle.doctorName}</TableCell><TableCell>{cycle.nurseName}</TableCell>
			<TableCell><Badge value={cycle.status}/>{#if cycle.requests.some(item => item.status === 'pending')}<span class="cell-meta">Menunggu keputusan dokter</span>{/if}</TableCell>
			<TableCell><Button variant="outline" class="h-11 w-full px-4 no-underline hover:no-underline" onclick={() => void openDetail(cycle.id)}><Eye aria-hidden="true" /> {data.user.role === 'DOKTER' && cycle.requests.some((item) => item.status === 'pending') ? 'Tinjau permintaan' : 'Lihat detail'}</Button></TableCell>
		</TableRow>
		{:else}<TableRow><TableCell colspan={6} class="empty">Tidak ada rekap yang cocok.</TableCell></TableRow>{/each}
	</TableBody></Table></div>
</Card>

{#if selectedCycleId}
<Modal {busy} title={cycleView === 'detail' ? 'Detail rekap rawat inap' : cycleView === 'placement' ? 'Ubah penempatan' : cycleView === 'request' ? 'Ajukan perpanjangan atau pelepasan' : cycleView === 'decision' ? 'Keputusan dokter' : 'Hapus rekap berstatus Menunggu?'}
 description="Informasi perawatan, penanggung jawab, dan permintaan perubahan pasien."
 protectChanges={cycleView !== 'detail' && cycleView !== 'delete'} formKey={cycleView}
 backLabel={cycleView !== 'detail' ? 'Kembali ke detail' : undefined}
 onclose={() => { if (cycleView === 'detail') closeDetail(); else { cycleView = 'detail'; deletingCycle = null; } }}>
 {#snippet children(close)}
 {#if detailError}<p class="error mb-4" role="alert">{detailError}</p>{/if}
 {#if detailSuccess}<p class="mb-4 text-sm" role="status">{detailSuccess}</p>{/if}
 {#if detailNeedsRefresh}
    <p class="mb-3 text-sm text-muted-foreground">Baca keadaan terbaru sebelum melanjutkan. Memuat detail tidak mengirim ulang perubahan Anda.</p>
    <Button variant="outline" class="mb-4" disabled={busy} onclick={() => void refreshDetail()}><RefreshCw aria-hidden="true" /> Muat detail terbaru</Button>
 {/if}
 {#if cycleView === 'detail'}{#if detailLoading}<p class="muted" role="status">Memuat detail pasien...</p>
		{:else if selectedCycle}
			<div class="detail-grid cycle-summary">
				<div class="detail-item"><span>Pasien</span><strong>{selectedCycle.patientName}</strong><small>{selectedCycle.medicalRecordNo}</small></div>
				<div class="detail-item"><span>Ruangan</span><strong>{selectedCycle.room ?? 'Belum ditempatkan'}</strong></div>
				<div class="detail-item"><span>Dokter</span><strong>{selectedCycle.doctorName}</strong></div>
				<div class="detail-item"><span>Perawat</span><strong>{selectedCycle.nurseName}</strong></div>
				<div class="detail-item"><span>Status saat ini</span><strong><Badge value={selectedCycle.status}/></strong></div>
				<div class="detail-item"><span>Versi data</span><strong>{selectedCycle.version}</strong></div>
			</div>
			{#if canManage && selectedCycle.status==='pending'}<div class="card-actions"><Button variant="outline" disabled={busy || detailNeedsRefresh} onclick={() => cycleView = 'placement'}><Pencil aria-hidden="true" /> Ubah penempatan</Button><Button variant="destructive" disabled={busy || detailNeedsRefresh} onclick={() => { deletingCycle = selectedCycle; deletionReason = ''; cycleView = 'delete'; }}><Trash2 aria-hidden="true" /> Hapus rekap</Button></div>{/if}
			{#if canManage && selectedCycle.placementId && ['pending', 'assigned'].includes(selectedCycle.status)}
                <p class="mb-3 text-sm text-muted-foreground">{selectedCycle.status === 'pending' ? 'Penempatan sudah terhubung. Konfirmasikan bahwa pasien sudah ditempatkan.' : 'Konfirmasikan saat perawatan pasien benar-benar dimulai.'}</p>
                <form class="card-actions" onsubmit={(event) => transition(event, selectedCycle!)}><Button type="submit" disabled={busy || detailNeedsRefresh}><Check aria-hidden="true" /> {selectedCycle.status === 'pending' ? 'Konfirmasi sudah ditempatkan' : 'Mulai perawatan'}</Button></form>
            {/if}
			{#if canManage && selectedCycle.placementId && ['in_care', 'extend'].includes(selectedCycle.status)}<div class="card-actions"><Button variant="outline" disabled={busy || detailNeedsRefresh || !!pendingRequest} onclick={() => cycleView = 'request'}><Send aria-hidden="true" /> Ajukan perpanjangan / pelepasan</Button>{#if pendingRequest}<p class="approval-note">Pengajuan sebelumnya masih menunggu keputusan dokter.</p>{/if}</div>{/if}
			<section class="detail-section"><h3>Riwayat permintaan</h3>
				{#if selectedCycle.requests.length === 0}<p class="muted">Belum ada permintaan.</p>
				{:else}{#each selectedCycle.requests as item (item.id)}<div class="request-item"><div class="request-heading"><strong>{item.kind === 'extend' ? `Perpanjangan sampai ${item.requestedEnd ? date(item.requestedEnd) : "—"}` : 'Pelepasan'}</strong><Badge value={item.status} label={requestLabels[item.status] ?? item.status}/></div><p>Alasan: {item.reason}</p><small>Diajukan oleh {item.requestedBy}{item.decidedBy ? ` · Diputuskan oleh ${item.decidedBy}` : ''}</small>{#if item.note}<p>Catatan dokter: {item.note}</p>{/if}
					{#if data.user.role === 'DOKTER' && selectedCycle.doctorId === data.user.id && item.status === 'pending'}<Button variant="outline" disabled={busy || detailNeedsRefresh} onclick={() => { decisionRequestId = item.id; cycleView = 'decision'; }}><Eye aria-hidden="true" /> Tinjau keputusan</Button>{/if}
				</div>{/each}{/if}
			</section>
		{:else}<Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" disabled={busy} onclick={() => void refreshDetail()}><RefreshCw aria-hidden="true" /> Coba lagi</Button>{/if}
 {:else if selectedCycle}
 <p class="mb-5 font-medium">{selectedCycle.patientName} · {selectedCycle.medicalRecordNo}</p>
 {#if cycleView === 'placement'}<form onsubmit={(event)=>assignPlacement(event,selectedCycle!)}><label class="field">Penempatan<FormSelect name="placementId" bind:value={detailPlacementId} disabled={busy || detailNeedsRefresh} options={[{ value: "", label: "Belum ditempatkan" }, ...(data.reference.placements.filter((p)=>p.status==='active'&&p.patientId===selectedCycle!.patientId)).map((placement) => ({ value: placement.id, label: (placement.roomName) + " · " + date(placement.startsOn) + "–" + date(placement.endsOn) }))]} /></label><div class="form-actions"><Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy || detailNeedsRefresh}><Save aria-hidden="true" /> Simpan penempatan</Button></div></form>
 {:else if cycleView === 'request'}{#if pendingRequest}<p class="approval-note" id="cycle-request-blocked">Pengajuan sebelumnya masih menunggu keputusan dokter. Pengajuan baru belum dapat dikirim.</p>{/if}<form onsubmit={(event) => request(event, selectedCycle!)}><fieldset class="request-fields" disabled={busy || detailNeedsRefresh || !!pendingRequest} aria-describedby={pendingRequest ? 'cycle-request-blocked' : undefined}><legend class="request-legend">Pengajuan perubahan perawatan</legend><div class="form-grid"><label class="field">Jenis permintaan<FormSelect name="kind" bind:value={requestKind} options={[{ value: "release", label: "Pelepasan" }, { value: "extend", label: "Perpanjangan" }]} /></label>{#if requestKind === 'extend'}<label class="field">Perpanjang sampai tanggal<FormDatePicker class="h-11 text-base md:text-sm" name="requestedEnd" type="date" required /></label>{/if}<label class="field full">Alasan<Textarea name="reason" maxlength={500} required></Textarea></label></div><div class="form-actions"><Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline"><Send aria-hidden="true" /> Ajukan ke dokter</Button></div></fieldset></form>
 {:else if cycleView === 'decision'}<form onsubmit={(event) => decide(event, selectedCycle!, decisionRequestId, String((event.submitter as HTMLButtonElement)?.value))}><label class="field">Catatan keputusan<Input class="h-11 text-base md:text-sm" name="note" maxlength={500} required disabled={busy || detailNeedsRefresh} /></label><div class="form-actions"><Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="outline" type="submit" class="h-11 px-4 no-underline hover:no-underline" name="decision" value="reject" disabled={busy || detailNeedsRefresh}><X aria-hidden="true" /> Tolak</Button><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" name="decision" value="approve" disabled={busy || detailNeedsRefresh}><Check aria-hidden="true" /> Setujui</Button></div></form>
 {:else if cycleView === 'delete'}<form class="flex flex-col gap-4" onsubmit={(event) => { event.preventDefault(); if (deletingCycle) void deleteCycle(deletingCycle); }}>
            <label class="field">Alasan penghapusan<Textarea name="reason" bind:value={deletionReason} required maxlength={500}/></label>
            <div class="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
                <Button type="submit" variant="destructive" disabled={busy}><Trash2 aria-hidden="true" /> {busy ? 'Menghapus…' : 'Konfirmasi hapus'}</Button>
            </div>
        </form>
 {/if}
 {/if}
 {/snippet}
</Modal>
{/if}

<p class="muted workflow-note">Alur: Menunggu → Sudah ditempatkan → Dalam perawatan → Diperpanjang / Pelepasan. Perpanjangan dan pelepasan berlaku setelah keputusan dokter.</p>

</div>
<style>
	.approval-note{padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface-subtle, #f3f4f6);font-size:13px;line-height:1.6}
	.request-fields{border:0;padding:0;margin:0;min-width:0}
	.request-fields:disabled{opacity:.65}
	.request-legend{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
	.card-actions{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px}
	.create-panel{margin-bottom:24px}
	.create-note{padding:16px;background:var(--surface-subtle, #f3f4f6);border-radius:8px;font-size:13px;line-height:1.6}
	.form-actions{display:flex;justify-content:flex-end;gap:12px}
	.create-help{margin:12px 0 18px;font-size:13px}
	.create-form{display:grid;gap:16px}
	.search-field{flex:2;min-width:220px}
	.cell-meta{display:block;color:var(--muted-foreground);font-size:12px;margin-top:4px}
	.request-item{border-top:1px solid var(--border);padding-top:12px;margin-top:12px;font-size:13px}
	.request-item small{display:block;color:var(--muted-foreground);margin-top:4px}
	.cycle-summary{padding-bottom:24px}
	.detail-section{border-top:1px solid var(--border);padding:24px 0}
	.detail-section:last-child{padding-bottom:0}
	.detail-section h3{margin-bottom:8px}
	.detail-section>p{font-size:13px;margin-bottom:16px}
	.detail-section form{margin-top:16px}
	.request-item p{margin-top:8px;color:var(--foreground)}
	.request-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
	.workflow-note{margin-top:20px;font-size:12px;max-width:80ch}
</style>

{#if notificationsOpen}<NotificationDialog service={notificationService} onclose={() => notificationsOpen = false} />{/if}
{#if filterOpen}
<Modal title="Filter rekap" description="Pilih pasien, ruangan, dan status perawatan untuk membatasi daftar rekap." busy={filterBusy} onclose={() => filterOpen = false}>
    {#snippet children(close)}
    <form class="flex flex-col gap-4" onsubmit={(event) => filterCycles(event, filterDraft)}>
<label class="field">Pasien<FormSelect bind:value={filterDraft.patientId} options={[{ value: "", label: "Semua pasien" }, ...(data.reference.patients).map((patient) => ({ value: patient.id, label: (patient.name) + " · " + (patient.medicalRecordNo) }))]} /></label><label class="field">Ruangan<FormSelect bind:value={filterDraft.roomId} options={[{ value: "", label: "Semua ruangan" }, ...(rooms).map((room) => ({ value: room.id, label: (room.name) }))]} /></label><label class="field">Status<FormSelect bind:value={filterDraft.status} options={[{ value: "", label: "Semua status" }, ...(counts).flatMap((item) => [{ value: item.status, label: (({pending:'Menunggu',assigned:'Sudah ditempatkan',in_care:'Dalam perawatan',extend:'Diperpanjang',released:'Pelepasan'} as Record<string,string>)[item.status]) }]), { value: "pending_approval", label: "Menunggu keputusan" }]} /></label>
        <div class="form-actions"><Button variant="outline" disabled={filterBusy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button type="submit" disabled={filterBusy}><Filter aria-hidden="true" /> Terapkan filter</Button></div>
    </form>
    {/snippet}
</Modal>
{/if}
