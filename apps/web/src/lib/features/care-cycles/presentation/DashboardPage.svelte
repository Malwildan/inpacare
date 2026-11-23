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
import { tick, untrack } from 'svelte';
import { ApiError, isVersionConflict } from '$lib/shared/errors';
import type { CareCycles, CycleAssignee, DashboardData, Cycle as CycleDetail, ChangeCycle, NewCycle, NewRequest, Decision, CycleRequestReview as Review } from '$lib/features/care-cycles';
import type { Tasks } from '$lib/features/tasks';
import { isUnconfirmedSave, sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { NotificationDialog, type Notifications } from '$lib/features/notifications';
import CycleObservations from './CycleObservations.svelte';
import CycleTaskForm from './CycleTaskForm.svelte';
import CycleTasks from './CycleTasks.svelte';
import CycleRequestReview from './CycleRequestReview.svelte';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
const cycleStatuses = [
    { status: 'pending', label: 'Menunggu', tone: 'bg-warning-soft text-warning' },
    { status: 'assigned', label: 'Sudah ditempatkan', tone: 'bg-secondary text-secondary-foreground' },
    { status: 'in_care', label: 'Dalam perawatan', tone: 'bg-info-soft text-info' },
    { status: 'extend', label: 'Diperpanjang', tone: 'bg-extended-soft text-extended' },
    { status: 'released', label: 'Pelepasan', tone: 'bg-success-soft text-success' },
];
const requestLabels: Record<string, string> = { pending: 'Menunggu keputusan', approved: 'Disetujui', rejected: 'Ditolak' };
const assignmentTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
import Badge from '$lib/shared/ui/status-badge.svelte';
let { data, careCycles, notificationService, tasks }: {
    data: DashboardData;
    careCycles: CareCycles;
    notificationService: Notifications;
    tasks: Tasks;
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
let patientLookup = $state('');
let admissionSearch = $state('');
const matchesPatient = (patient: { name: string; medicalRecordNo: string }, query: string) =>
    `${patient.name} ${patient.medicalRecordNo}`.toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID'));
let firstAdmissions = $derived(data.creationCandidates.filter(patient => patient.firstAdmission && matchesPatient(patient, admissionSearch)));
let patientOptions = $derived(data.creationCandidates.filter(patient => patient.id === createPatientId || matchesPatient(patient, patientLookup)));
let createDoctorId = $state('');
let createNurseId = $state('');
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
function openCreate(patientId = '') {
    createPatientId = patientId; patientLookup = ''; createDoctorId = ''; createNurseId = ''; createRoomId = '';
    createStartsOn = ''; createEndsOn = ''; createError = '';
    choosePatient();
    creationRequest = null; createOpen = true;
}
const destination = untrack(() => data.cycleDestination);
let selectedCycleId = $state<string | null>(destination?.cycle.id ?? null);
let selectedCycle = $state<CycleDetail | null>(destination?.cycle ?? null);
let detailNeedsRefresh = $state(false);
let detailError = $state('');
let detailSuccess = $state('');
let detailPlacementId = $state(destination?.cycle.placementId ?? '');
let cycleTable: HTMLDivElement;
let cycleSearchInput = $state<HTMLInputElement | null>(null);
let returnFocus: HTMLElement | null = null;
let listPosition = { x: 0, y: 0, left: 0 };
let canManage = $derived(data.user.role === 'PERAWAT' && selectedCycle?.nurseId === data.user.id);
let canAssign = $derived(data.user.role === 'PERAWAT' && data.user.coordinator);
let pendingRequest = $derived(selectedCycle?.requests.find(item => item.status === 'pending'));
let readiness = $derived(selectedCycle?.releaseReadiness);
let releaseBlocked = $derived(Boolean(readiness?.prerequisite || readiness?.tasks.length));
const prerequisiteLabels = {
    care_not_started: 'Konfirmasikan penempatan dan mulai perawatan sebelum mengajukan pelepasan.',
    placement_missing: 'Kaitkan penempatan pasien sebelum mengajukan pelepasan.',
    placement_inactive: 'Penempatan pasien sudah tidak aktif. Periksa penempatan bersama koordinator.',
    placement_not_started: 'Tanggal masuk penempatan belum tiba. Periksa jadwal penempatan.',
    room_unavailable: 'Ruangan tidak menerima perubahan penempatan.',
};
const taskSchedule = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
});
const taskHref = (id: string, cycle: string) => `/tasks?${new URLSearchParams({ task: id, cycle })}`;
const placementHref = (cycle: string, from: string | null) =>
    `/calendar?${new URLSearchParams({ cycle, ...(from ? { from } : {}) })}`;
let detailLoading = $state(false);
let cycleView = $state<'detail' | 'placement' | 'request' | 'decision' | 'delete' | 'assignee' | 'observations' | 'task'>('detail');
let taskCandidates = $state<CycleAssignee[]>([]);
let observationEditing = $state(false);
let decisionRequestId = $state('');
let activeReview = $state<Review | null>(null);
let reviewBody = $state<HTMLDivElement | null>(null);
let requestKind = $state('release');
let cycles = $derived(data.cycles);
let rooms = $derived(data.reference.rooms);
let counts = $derived(cycleStatuses.map((item) => ({
    ...item,
    count: data.cycles.filter((cycle) => cycle.status === item.status).length,
})));
async function openDetail(id: string, requestId?: string) {
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
    if (requestId && selectedCycle?.id === id) await openReview(id, requestId);
}
async function loadReview(cycleId: string, requestId: string) {
    busy = true;
    detailError = '';
    detailSuccess = '';
    try {
        activeReview = await careCycles.review(cycleId, requestId);
        detailNeedsRefresh = false;
        return true;
    } catch (cause) {
        activeReview = null;
        detailNeedsRefresh = true;
        detailError = sessionFailure(cause, 'load', 'Pengajuan');
        return false;
    } finally {
        busy = false;
    }
}
async function openReview(cycleId: string, requestId: string) {
    decisionRequestId = requestId;
    activeReview = null;
    await loadReview(cycleId, requestId);
    cycleView = 'decision';
    await tick();
    reviewBody?.querySelector('h3')?.focus();
}
async function refreshTaskContext(cycleId: string) {
    const [cycle, candidates] = await Promise.all([
        careCycles.detail(cycleId),
        careCycles.assignmentCandidates(),
    ]);
    selectedCycle = cycle;
    detailPlacementId = cycle.placementId ?? '';
    taskCandidates = candidates;
}
async function openTaskForm() {
    if (busy || detailNeedsRefresh) return;
    busy = true;
    detailError = '';
    detailSuccess = '';
    try {
        taskCandidates = await careCycles.assignmentCandidates();
        cycleView = 'task';
    } catch (cause) {
        detailError = sessionFailure(cause, 'load', 'Daftar perawat aktif');
    } finally {
        busy = false;
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
function gotoDashboard() {
    const filters = new URLSearchParams(Object.entries(data.filters).filter(([, value]) => value));
    return goto(`/dashboard${filters.size ? '?' + filters : ''}`, { replaceState: true });
}
async function closeDetail() {
    if (busy) return;
    if (destination) {
        try { await gotoDashboard(); }
        catch (cause) { toast.error(sessionFailure(cause, 'load', 'Daftar rekap rawat inap')); }
        return;
    }
    selectedCycleId = null;
    selectedCycle = null;
    await tick();
    requestAnimationFrame(() => {
        const focusTarget = returnFocus?.isConnected ? returnFocus : cycleSearchInput;
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
async function refreshReview() {
    if (busy || !selectedCycleId) return;
    if (await loadReview(selectedCycleId, decisionRequestId)) {
        detailSuccess = 'Pengajuan terbaru dimuat. Periksa kembali sebelum memutuskan.';
    }
}
async function saveDetail(cycle: CycleDetail, operation: () => Promise<unknown>, release = false) {
    if (busy || detailNeedsRefresh) return;
    busy = true;
    detailError = '';
    detailSuccess = '';
    try { await operation(); }
    catch (cause) {
        detailError = sessionFailure(cause, 'save', 'rekap rawat inap');
        const reviewChanged = cycleView === 'decision' && cause instanceof ApiError && [403, 404, 409, 422].includes(cause.status);
        detailNeedsRefresh = reviewChanged || isVersionConflict(cause) || isUnconfirmedSave(cause) || (release && cause instanceof ApiError && cause.status === 409);
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
        const reload = destination ? gotoDashboard() : invalidateAll();
        await reload.then(
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
    if (canAssign && !createNurseId) {
        createError = 'Pilih perawat penanggung jawab.';
        (event.currentTarget as HTMLFormElement).querySelector<HTMLSelectElement>('[name="nurseId"]')?.focus();
        return;
    }
    const pending = (event.submitter as HTMLButtonElement)?.value === 'pending';
    const input: NewCycle = {
        patientId: createPatientId, doctorId: createDoctorId,
        ...(canAssign ? { nurseId: createNurseId } : {}),
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
    await saveDetail(cycle, () => careCycles.request(cycle.id, { kind: kind as NewRequest['kind'], requestedEnd: kind === 'extend' ? formText(form, 'requestedEnd') : null, reason: formText(form, 'reason') }), kind === 'release');
}
async function decide(cycle: CycleDetail, review: Review, decision: Decision['decision'], note: string) {
    await saveDetail(cycle, () => careCycles.decide(cycle.id, review.request.id, { decision, note, expectedVersion: review.cycle.version }));
}
async function assignPlacement(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const placementId = detailPlacementId || null;
    await saveDetail(cycle, () => careCycles.change(cycle.id, { expectedVersion: cycle.version, placementId }));
}
async function reassign(event: SubmitEvent, cycle: CycleDetail) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    await saveDetail(cycle, () => careCycles.reassign(cycle.id, {
        nurseId: formText(fields, 'nurseId'),
        expectedVersion: cycle.version,
        reason: formText(fields, 'reason'),
    }));
}
async function deleteCycle(cycle: CycleDetail) {
    if (cycle.status !== 'pending' || busy) return;
    const reason = deletionReason.trim();
    if (!reason) { toast.error('Isi Alasan penghapusan rekap rawat inap.'); return; }
    if (await send(() => careCycles.remove(cycle.id, { expectedVersion: cycle.version, reason }))) {
        deletingCycle = null;
        if (!destination) closeDetail();
    }
}
</script>

<svelte:head><title>Rekap rawat inap | InpaCare</title></svelte:head>
<div class="dashboard-page flex min-w-0 flex-col gap-6">
<section class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	<div><h1 class="page-title">Rekap rawat inap</h1></div>
</section>

<section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Jumlah rekap menurut status">
	{#each counts as item (item.status)}
        <Card class={`gap-1 p-4 ${item.tone}`}>
            <strong class="text-2xl font-semibold tabular-nums">{item.count}</strong>
            <span class="text-sm">{item.label}</span>
        </Card>
    {/each}
</section>

<div class="flex flex-wrap gap-3"><Button variant="outline" class="h-11" aria-haspopup="dialog" onclick={() => notificationsOpen = true}><Bell aria-hidden="true" /> Lihat notifikasi</Button></div>

{#if data.user.role === 'PERAWAT'}
    <Card class="gap-4 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <h2 class="text-lg font-semibold">Antrean mulai rawat inap</h2>
            <Button class="h-11" onclick={() => openCreate()}><Plus aria-hidden="true" /> Mulai rawat inap</Button>
        </div>
        {#if data.creationCandidates.some(patient => patient.firstAdmission)}
            <label class="field max-w-md">Cari pasien baru<Input class="h-11" type="search" bind:value={admissionSearch} placeholder="Nama atau nomor rekam medis" /></label>
            <ul class="divide-y">
                {#each firstAdmissions.slice(0, 10) as patient (patient.id)}
                    <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{patient.name} <span class="text-sm text-muted-foreground">· {patient.medicalRecordNo}</span></span>
                        <Button variant="outline" class="h-11" onclick={() => openCreate(patient.id)} aria-label={`Mulai rawat inap untuk ${patient.name} (${patient.medicalRecordNo})`}>Mulai rawat inap</Button>
                    </li>
                {:else}
                    <li class="py-2 text-sm text-muted-foreground">Pasien baru tidak ditemukan.</li>
                {/each}
            </ul>
            {#if firstAdmissions.length > 10}<p class="text-sm text-muted-foreground">Menampilkan 10 dari {firstAdmissions.length} pasien. Cari nama atau nomor rekam medis untuk menemukan pasien lainnya.</p>{/if}
        {:else}
            <p class="text-sm text-muted-foreground">Belum ada pasien baru yang menunggu rawat inap.</p>
        {/if}
    </Card>
{/if}
{#if createOpen}
    <Modal busy={busy} protectChanges title="Mulai rawat inap" onclose={() => { if (!busy) createOpen = false; }}>
        {#snippet children(close)}
        <p class="create-help">Gunakan penempatan yang ada atau pilih ruang dan periode baru. Jika ruang belum tersedia, simpan sebagai Menunggu.</p>
        {#if data.creationCandidates.length === 0}
            <p class="empty">Belum ada pasien terdaftar tanpa rekap aktif. Periksa rekap yang ada atau minta data pasien didaftarkan terlebih dahulu.</p>
            <Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" onclick={close}><X aria-hidden="true" /> Tutup</Button>
        {:else}
            <form class="create-form" method="post" onsubmit={create}>
                <label class="field">Cari pasien terdaftar<Input class="h-11" type="search" bind:value={patientLookup} placeholder="Nama atau nomor rekam medis" /></label>
                <label class="field">Pasien terdaftar<FormSelect name="patientId" required bind:value={createPatientId} onValueChange={choosePatient} disabled={busy} options={[{ value: "", label: "Pilih pasien" }, ...patientOptions.map((patient) => ({ value: patient.id, label: (patient.name) + " · " + (patient.medicalRecordNo) }))]} /></label>
                <p class="muted">Hanya pasien yang belum memiliki rekap aktif yang dapat dipilih.</p>
                <label class="field">Dokter penanggung jawab<FormSelect name="doctorId" required bind:value={createDoctorId} disabled={busy} options={[{ value: "", label: "Pilih dokter aktif" }, ...(data.reference.staff.filter(s => s.role === 'DOKTER' && s.active)).map((doctor) => ({ value: doctor.id, label: (doctor.name) }))]} /></label>
                {#if canAssign}
                    <label class="field" for="create-cycle-nurse">Perawat penanggung jawab
                        <select id="create-cycle-nurse" class="assignee-select" name="nurseId" required bind:value={createNurseId} disabled={busy}>
                            <option value="" disabled>Pilih perawat aktif</option>
                            {#each data.assignmentCandidates as nurse (nurse.id)}
                                <option value={nurse.id}>{nurse.name}</option>
                            {/each}
                        </select>
                    </label>
                {/if}
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
	<form class="filters" onsubmit={(event) => filterCycles(event)}><label class="field search-field">Cari nama atau nomor rekam medis<Input bind:ref={cycleSearchInput} class="h-11 text-base md:text-sm" type="search" bind:value={search} placeholder="Cari nama pasien..." /></label><Button variant="outline" class="h-11" aria-haspopup="dialog" onclick={openFilters}><Filter aria-hidden="true" /> Filter rekap{#if patientFilter || roomFilter || statusFilter}<span class="sr-only"> aktif</span>{/if}</Button><Button type="submit" class="h-11" disabled={filterBusy}><Search aria-hidden="true" /> Cari pasien</Button></form>
	<div class="table-wrap" bind:this={cycleTable}><Table class="data-table"><TableHeader><TableRow><TableHead>Pasien</TableHead><TableHead>Ruangan</TableHead><TableHead>Dokter</TableHead><TableHead>Perawat</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>
		{#each cycles as cycle (cycle.id)}<TableRow>
			<TableCell><strong>{cycle.patientName}</strong><span class="cell-meta">{#if /^CY-\d+$/.test(cycle.id)}{cycle.id}{' · '}{/if}{cycle.medicalRecordNo}</span></TableCell>
			<TableCell>{cycle.room ?? 'Belum ditempatkan'}</TableCell><TableCell>{cycle.doctorName}</TableCell><TableCell>{cycle.nurseName}</TableCell>
			<TableCell><Badge value={cycle.status}/>{#if cycle.requests.some(item => item.status === 'pending')}<span class="cell-meta">Menunggu keputusan dokter</span>{/if}</TableCell>
			<TableCell>
                {@const requestId = data.user.role === 'DOKTER' ? cycle.requests.find(item => item.status === 'pending')?.id : undefined}
                <Button variant="outline" class="h-11 w-full px-4 no-underline hover:no-underline" onclick={() => void openDetail(cycle.id, requestId)}><Eye aria-hidden="true" /> {requestId ? 'Tinjau permintaan' : 'Lihat detail'}</Button>
            </TableCell>
		</TableRow>
		{:else}<TableRow><TableCell colspan={6} class="empty">Tidak ada rekap yang cocok.</TableCell></TableRow>{/each}
	</TableBody></Table></div>
</Card>

{#if selectedCycleId}
<Modal {busy} title={cycleView === 'detail' ? 'Detail rekap rawat inap' : cycleView === 'observations' ? 'Observasi keperawatan' : cycleView === 'placement' ? 'Ubah penempatan' : cycleView === 'request' ? 'Ajukan perpanjangan atau pelepasan' : cycleView === 'decision' ? 'Keputusan dokter' : cycleView === 'assignee' ? 'Alihkan penanggung jawab' : cycleView === 'task' ? 'Buat tugas perawatan' : 'Hapus rekap berstatus Menunggu?'}
 description="Informasi perawatan, penanggung jawab, dan permintaan perubahan pasien."
 protectChanges={cycleView === 'observations' ? observationEditing : cycleView !== 'detail' && cycleView !== 'delete'}
 formKey={observationEditing ? 'observation-form' : cycleView}
 initialFocus={cycleView === 'detail' && destination?.requestId ? '[data-notification-request]' : undefined}
 backLabel={observationEditing ? 'Kembali ke observasi' : cycleView !== 'detail' ? 'Kembali ke detail' : undefined}
 onclose={() => { if (observationEditing) observationEditing = false; else if (cycleView === 'detail') closeDetail(); else { cycleView = 'detail'; deletingCycle = null; } }}>
 {#snippet children(close)}
 {#if detailError}<p class="error mb-4" role="alert">{detailError}</p>{/if}
 {#if detailSuccess}<p class="mb-4 text-sm" role="status">{detailSuccess}</p>{/if}
 {#if detailNeedsRefresh}
    <p class="mb-3 text-sm text-muted-foreground">Baca keadaan terbaru sebelum melanjutkan. Memuat detail tidak mengirim ulang perubahan Anda.</p>
    <Button variant="outline" class="mb-4" disabled={busy} onclick={() => void (cycleView === 'decision' ? refreshReview() : refreshDetail())}>
        <RefreshCw aria-hidden="true" /> {cycleView === 'decision' ? 'Muat pengajuan terbaru' : 'Muat detail terbaru'}
    </Button>
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
            <div id="cycle-care-actions" tabindex="-1">
			{#if canManage && selectedCycle.status==='pending'}<div class="card-actions"><Button variant="outline" disabled={busy || detailNeedsRefresh} onclick={() => cycleView = 'placement'}><Pencil aria-hidden="true" /> Ubah penempatan</Button><Button variant="destructive" disabled={busy || detailNeedsRefresh} onclick={() => { deletingCycle = selectedCycle; deletionReason = ''; cycleView = 'delete'; }}><Trash2 aria-hidden="true" /> Hapus rekap</Button></div>{/if}
			{#if canManage && selectedCycle.placementId && ['pending', 'assigned'].includes(selectedCycle.status)}
                <p class="mb-3 text-sm text-muted-foreground">{selectedCycle.status === 'pending' ? 'Penempatan sudah terhubung. Konfirmasikan bahwa pasien sudah ditempatkan.' : 'Konfirmasikan saat perawatan pasien benar-benar dimulai.'}</p>
                <form class="card-actions" onsubmit={(event) => transition(event, selectedCycle!)}><Button type="submit" disabled={busy || detailNeedsRefresh}><Check aria-hidden="true" /> {selectedCycle.status === 'pending' ? 'Konfirmasi sudah ditempatkan' : 'Mulai perawatan'}</Button></form>
            {/if}
            </div>
			{#if canManage && selectedCycle.placementId && ['in_care', 'extend'].includes(selectedCycle.status)}<div class="card-actions"><Button variant="outline" disabled={busy || detailNeedsRefresh || !!pendingRequest} onclick={() => cycleView = 'request'}><Send aria-hidden="true" /> Ajukan perpanjangan / pelepasan</Button>{#if pendingRequest}<p class="approval-note">Pengajuan sebelumnya masih menunggu keputusan dokter.</p>{/if}</div>{/if}
			<div class="card-actions">
				<Button variant="outline" disabled={busy || detailNeedsRefresh} onclick={() => cycleView = 'observations'}>Observasi keperawatan</Button>
				{#if data.user.role === 'DOKTER' && selectedCycle.doctorId === data.user.id}
					<Button variant="outline" href={`/medical-records?cycleId=${encodeURIComponent(selectedCycle.id)}`}><Plus aria-hidden="true" /> Tambah rekam medis</Button>
				{/if}
			</div>
            {#if canAssign}
                <section class="detail-section" aria-labelledby="cycle-task-heading">
                    <h3 id="cycle-task-heading">Tugas perawatan</h3>
                    {#if selectedCycle.status !== 'released'}
                        {#if selectedCycle.taskPlacement}
                            <Button variant="outline" class="mb-3 h-11" disabled={busy || detailNeedsRefresh} onclick={openTaskForm}><Plus aria-hidden="true" /> Buat tugas</Button>
                        {:else}
                            <p class="mb-3 text-sm text-muted-foreground">Kaitkan penempatan aktif ke rekap sebelum membuat tugas.</p>
                        {/if}
                    {/if}
                    <CycleTasks cycleId={selectedCycle.id} {tasks} />
                </section>
            {/if}
            {#if canAssign}
                {@const history = selectedCycle.assignmentHistory ?? []}
                <section class="detail-section">
                    <h3>Riwayat pengalihan penanggung jawab</h3>
                    {#if history.length === 0}
                        <p class="muted">Belum ada pengalihan.</p>
                    {:else}
                        {#each history as entry (entry.id)}
                            <div class="request-item">
                                <strong>{entry.previousNurseName} → {entry.newNurseName}</strong>
                                <small>{entry.actorName} · <time datetime={entry.createdAt}>{assignmentTime.format(new Date(entry.createdAt))} WIB</time></small>
                                <p>{entry.reason}</p>
                            </div>
                        {/each}
                    {/if}
                    <Button variant="outline" class="mt-4" disabled={busy || detailNeedsRefresh} onclick={() => cycleView = 'assignee'}><Pencil aria-hidden="true" /> Alihkan penanggung jawab</Button>
                </section>
            {/if}
            {#if canManage && readiness}
                <section class="detail-section" aria-labelledby="release-readiness">
                    <h3 id="release-readiness">Kesiapan pelepasan</h3>
                    {#if readiness.prerequisite}
                        <p>{prerequisiteLabels[readiness.prerequisite]}
                            {#if selectedCycle.status === 'pending' || selectedCycle.status === 'assigned'}
                                <a class="text-link underline" href="#cycle-care-actions">Lihat tindakan perawatan</a>
                            {:else if readiness.prerequisite === 'room_unavailable' && data.user.coordinator}
                                <a class="text-link underline" href={`/rooms?${new URLSearchParams({ cycle: selectedCycle.id, search: selectedCycle.room ?? '' })}`}>Buka pengaturan ruangan</a>
                            {:else}
                                {#if readiness.prerequisite === 'room_unavailable'}Hubungi koordinator untuk memeriksa status ruangan.{/if}
                                <a class="text-link underline" href={placementHref(selectedCycle.id, readiness.placementStartsOn)}>Buka kalender penempatan</a>
                            {/if}
                        </p>
                    {/if}
                    {#if pendingRequest}
                        <p>{pendingRequest.kind === 'release' ? 'Pengajuan pelepasan' : 'Pengajuan perpanjangan'} menunggu keputusan dokter.
                            <a class="text-link underline" href="#cycle-requests">Lihat pengajuan</a>
                        </p>
                    {/if}
                    {#if readiness.tasks.length}
                        <ul class="divide-y">
                            {#each readiness.tasks as task (task.id)}
                                <li class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                                    <div>
                                        <strong>{task.title}</strong> · <Badge value={task.status} />
                                        <p>Penanggung jawab {task.picName}</p>
                                        <p>{taskSchedule.format(new Date(task.startsAt))} sampai {taskSchedule.format(new Date(task.endsAt))} WIB</p>
                                    </div>
                                    {#if task.canOpen}
                                        <Button href={taskHref(task.id, selectedCycle.id)} variant="outline" class="min-h-11" aria-label={`Buka tugas ${task.title}`}>Buka tugas</Button>
                                    {:else}
                                        <span class="text-muted-foreground">Hubungi penanggung jawab atau koordinator.</span>
                                    {/if}
                                </li>
                            {/each}
                        </ul>
                    {:else if !pendingRequest && !releaseBlocked}
                        <p>Siap diajukan ke dokter.</p>
                    {/if}
                    <Button variant="outline" class="mt-2" disabled={busy} onclick={() => void refreshDetail()}><RefreshCw aria-hidden="true" /> Perbarui kesiapan</Button>
                </section>
            {/if}
            <section class="detail-section" id="cycle-requests" tabindex="-1"><h3>Riwayat permintaan</h3>
				{#if selectedCycle.requests.length === 0}<p class="muted">Belum ada permintaan.</p>
				{:else}{#each selectedCycle.requests as item (item.id)}
                    {@const targeted = item.id === destination?.requestId}
                    <div class="request-item" class:request-target={targeted} data-notification-request={targeted ? '' : undefined}
                        role={targeted ? 'group' : undefined} aria-label={targeted ? 'Permintaan dari notifikasi' : undefined} tabindex="-1">
                    <div class="request-heading"><strong>{item.kind === 'extend' ? `Perpanjangan sampai ${item.requestedEnd ? date(item.requestedEnd) : "—"}` : 'Pelepasan'}</strong><Badge value={item.status} label={requestLabels[item.status] ?? item.status}/></div><p>Alasan: {item.reason}</p><small>Diajukan oleh {item.requestedBy}{item.decidedBy ? ` · Diputuskan oleh ${item.decidedBy}` : ''}{#if item.decidedAt} · <time datetime={item.decidedAt}>{assignmentTime.format(new Date(item.decidedAt))} WIB</time>{/if}</small>{#if item.note}<p>Catatan dokter: {item.note}</p>{/if}
					{#if data.user.role === 'DOKTER' && selectedCycle.doctorId === data.user.id && item.status === 'pending'}<Button variant="outline" disabled={busy || detailNeedsRefresh} onclick={() => void openReview(selectedCycle!.id, item.id)}><Eye aria-hidden="true" /> Tinjau keputusan</Button>{/if}
				</div>{/each}{/if}
			</section>
		{:else}<Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" disabled={busy} onclick={() => void refreshDetail()}><RefreshCw aria-hidden="true" /> Coba lagi</Button>{/if}
 {:else if cycleView === 'decision'}
    {#if selectedCycle && activeReview}
        <div bind:this={reviewBody}>
            <CycleRequestReview review={activeReview} disabled={busy || detailNeedsRefresh}
                onDecision={(decision, note) => void decide(selectedCycle!, activeReview!, decision, note)} />
        </div>
    {/if}
 {:else if selectedCycle}
 {#if cycleView !== 'task'}<p class="mb-5 font-medium">{selectedCycle.patientName} · {selectedCycle.medicalRecordNo}</p>{/if}
 {#if cycleView === 'observations'}
    {#key selectedCycle.id}
        <CycleObservations cycleId={selectedCycle.id} {careCycles} canRecord={canManage} bind:busy bind:editing={observationEditing} onCancel={close} />
    {/key}
 {:else if cycleView === 'task' && canAssign}
        <CycleTaskForm cycle={selectedCycle} candidates={taskCandidates} {tasks} bind:busy onCancel={close}
            onRefresh={() => refreshTaskContext(selectedCycle!.id)}
            onCreated={() => { cycleView = 'detail'; detailSuccess = 'Tugas berhasil dibuat.'; }} />
 {:else if cycleView === 'placement'}<form onsubmit={(event)=>assignPlacement(event,selectedCycle!)}><label class="field">Penempatan<FormSelect name="placementId" bind:value={detailPlacementId} disabled={busy || detailNeedsRefresh} options={[{ value: "", label: "Belum ditempatkan" }, ...(data.reference.placements.filter((p)=>p.status==='active'&&p.patientId===selectedCycle!.patientId)).map((placement) => ({ value: placement.id, label: (placement.roomName) + " · " + date(placement.startsOn) + "–" + date(placement.endsOn) }))]} /></label><div class="form-actions"><Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy || detailNeedsRefresh}><Save aria-hidden="true" /> Simpan penempatan</Button></div></form>
 {:else if cycleView === 'request'}{#if requestKind === 'release' && releaseBlocked}<p class="approval-note">Pelepasan belum dapat diajukan. Kembali ke detail untuk memeriksa kesiapan.</p>{/if}{#if pendingRequest}<p class="approval-note" id="cycle-request-blocked">Pengajuan sebelumnya masih menunggu keputusan dokter. Pengajuan baru belum dapat dikirim.</p>{/if}<form onsubmit={(event) => request(event, selectedCycle!)}><fieldset class="request-fields" disabled={busy || detailNeedsRefresh || !!pendingRequest} aria-describedby={pendingRequest ? 'cycle-request-blocked' : undefined}><legend class="request-legend">Pengajuan perubahan perawatan</legend><div class="form-grid"><label class="field">Jenis permintaan<FormSelect name="kind" bind:value={requestKind} options={[{ value: "release", label: "Pelepasan" }, { value: "extend", label: "Perpanjangan" }]} /></label>{#if requestKind === 'extend'}<label class="field">Perpanjang sampai tanggal<FormDatePicker class="h-11 text-base md:text-sm" name="requestedEnd" type="date" required /></label>{/if}<label class="field full">Alasan<Textarea name="reason" maxlength={500} required></Textarea></label></div><div class="form-actions"><Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" disabled={requestKind === 'release' && releaseBlocked} class="h-11 px-4 no-underline hover:no-underline"><Send aria-hidden="true" /> Ajukan ke dokter</Button></div></fieldset></form>
 {:else if cycleView === 'assignee'}
    <p class="mb-4 text-sm">Penanggung jawab saat ini <strong>{selectedCycle.nurseName}</strong>.</p>
    <form class="flex flex-col gap-4" method="post" aria-label="Pengalihan penanggung jawab" onsubmit={(event) => reassign(event, selectedCycle!)}>
        <label class="field" for="new-cycle-nurse">Perawat penanggung jawab baru
            <select id="new-cycle-nurse" class="assignee-select" name="nurseId" required disabled={busy || detailNeedsRefresh}>
                <option value="" disabled selected>Pilih perawat aktif</option>
                {#each data.assignmentCandidates as nurse (nurse.id)}
                    {#if nurse.id !== selectedCycle.nurseId}
                        <option value={nurse.id}>{nurse.name}</option>
                    {/if}
                {/each}
            </select>
        </label>
        <label class="field" for="cycle-assignment-reason">Alasan pengalihan
            <Textarea id="cycle-assignment-reason" name="reason" maxlength={500} required disabled={busy || detailNeedsRefresh} />
        </label>
        <div class="form-actions">
            <Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
            <Button type="submit" disabled={busy || detailNeedsRefresh}><Save aria-hidden="true" /> Alihkan penanggung jawab</Button>
        </div>
    </form>
 {:else if cycleView === 'delete'}<form class="flex flex-col gap-4" onsubmit={(event) => { event.preventDefault(); if (deletingCycle) void deleteCycle(deletingCycle); }}>
            <label class="field">Alasan penghapusan<Textarea name="reason" bind:value={deletionReason} required maxlength={500}/></label>
            <div class="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
                <Button type="submit" variant="destructive-confirm" disabled={busy}><Trash2 aria-hidden="true" /> {busy ? 'Menghapus…' : 'Konfirmasi hapus'}</Button>
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
    .assignee-select { min-width: 0; min-height: 3rem; width: 100%; padding-inline: .75rem; border: 1px solid var(--input); border-radius: var(--radius); background: var(--background); color: var(--foreground); font: inherit; font-size: max(1rem, 1em); }
    .assignee-select:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    .assignee-select:user-invalid { border-color: var(--destructive); }
	.approval-note{padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface-subtle, #f3f4f6);font-size:13px;line-height:1.6}
	.request-fields{border:0;padding:0;margin:0;min-width:0}
	.request-fields:disabled{opacity:.65}
	.request-legend{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
	.card-actions{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px}
	.create-note{padding:16px;background:var(--surface-subtle, #f3f4f6);border-radius:8px;font-size:13px;line-height:1.6}
	.form-actions{display:flex;justify-content:flex-end;gap:12px}
	.create-help{margin:12px 0 18px;font-size:13px}
	.create-form{display:grid;gap:16px}
	.search-field{flex:2;min-width:220px}
	.cell-meta{display:block;color:var(--muted-foreground);font-size:12px;margin-top:4px}
	.request-item{border-top:1px solid var(--border);padding-top:12px;margin-top:12px;font-size:13px}
	.request-item small{display:block;color:var(--muted-foreground);margin-top:4px}
	.request-target{border:1px solid var(--ring);border-radius:var(--radius);padding:12px}
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
<label class="field">Pasien<FormSelect bind:value={filterDraft.patientId} options={[{ value: "", label: "Semua pasien" }, ...(data.reference.patients).map((patient) => ({ value: patient.id, label: (patient.name) + " · " + (patient.medicalRecordNo) }))]} /></label><label class="field">Ruangan<FormSelect bind:value={filterDraft.roomId} options={[{ value: "", label: "Semua ruangan" }, ...(rooms).map((room) => ({ value: room.id, label: (room.name) }))]} /></label><label class="field">Status<FormSelect bind:value={filterDraft.status} options={[{ value: "", label: "Semua status" }, ...cycleStatuses.map(({ status, label }) => ({ value: status, label })), { value: "pending_approval", label: "Menunggu keputusan" }]} /></label>
        <div class="form-actions"><Button variant="outline" disabled={filterBusy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button type="submit" disabled={filterBusy}><Filter aria-hidden="true" /> Terapkan filter</Button></div>
    </form>
    {/snippet}
</Modal>
{/if}
