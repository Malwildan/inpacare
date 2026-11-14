<script lang="ts">
import { Button } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { goto, invalidateAll } from '$app/navigation';
import type { Tasks, TasksPageData, Task, TaskHistory, NewTask, BoardStatus, TaskBoard } from '$lib/features/tasks';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import StatusBadge from '$lib/shared/ui/status-badge.svelte';
import { Badge } from '$lib/shared/ui/badge/index.js';
import { ChevronDown, Plus } from 'lucide-svelte';
let { data, tasks }: {
    data: TasksPageData;
    tasks: Tasks;
} = $props();
let search = $state('');
let statusFilter = $state('');
let priorityFilter = $state('');
let roomFilter = $state('');
let patientFilter = $state('');
let picFilter = $state('');
let fromFilter = $state('');
let toFilter = $state('');
$effect(() => { search = data.filters.search; statusFilter = data.filters.status; priorityFilter = data.filters.priority; roomFilter = data.filters.roomId; patientFilter = data.filters.patientId; picFilter = data.filters.picId; fromFilter = data.filters.from; toFilter = data.filters.to; });
let creating = $state(false);
let selected = $state<Task | null>(null);
let history = $state<TaskHistory[]>([]);
let busy = $state(false);
let error = $state('');
let notice = $state('');
let deletingTask = $state<Task | null>(null);
let deletionOpen = $state(false);
let deletionReason = $state('');
const coordinator = $derived(data.user?.role === 'PERAWAT' && data.user?.coordinator);
let board = $state<TaskBoard>({ todo: { items: [], total: 0, error: false, filtered: false }, in_progress: { items: [], total: 0, error: false, filtered: false }, done: { items: [], total: 0, error: false, filtered: false }, cancelled: { items: [], total: 0, error: false, filtered: false } });
let generation = 0;
let loading = $state<BoardStatus[]>([]);
const refreshErrors = new Set<BoardStatus>();
let pending = $state<string[]>([]);
let moving = $state<Task | null>(null);
let destination = $state<BoardStatus>('todo');
let beforeId = $state('');
let reason = $state('');
let reasonTaskId = '';
let dragTask = $state<Task | null>(null);
let dragTarget = $state<{ status: BoardStatus; before: string | null } | null>(null);
let origin: HTMLElement | null = null;
let suppressClick = false;
const filtered = $derived(Object.values(data.filters).some(Boolean));
$effect(() => { board = data.board; generation++; refreshErrors.clear(); dragTask = null; dragTarget = null; });
function canOperate(task: Task) { return coordinator || task.picId === data.user.id; }
function allowed(task: Task, status: BoardStatus) {
    if (task.status === 'done' || task.status === 'cancelled') return false;
    if (!canOperate(task)) return false;
    if (status === task.status) return !filtered;
    return (task.status === 'todo' && status === 'in_progress') || (task.status === 'in_progress' && status === 'done') || (coordinator && status === 'cancelled' && (task.status === 'todo' || task.status === 'in_progress'));
}
function statusLabel(status: string) { return statuses.find(([key]) => key === status)?.[1] ?? status; }
function priorityLabel(priority: string) { return ({ high: 'Tinggi', normal: 'Normal', low: 'Rendah' } as Record<string, string>)[priority] ?? priority; }
function auditFieldLabel(key: string) {
    const labels: Record<string, string> = { id: 'ID tugas', title: 'Judul', description: 'Deskripsi', notes: 'Catatan tindakan', status: 'Status', priority: 'Prioritas', version: 'Versi', pic_id: 'PIC', pic_nurse_id: 'PIC', patient_id: 'Pasien', room_id: 'Ruangan', placement_id: 'Penempatan', starts_at: 'Waktu mulai', ends_at: 'Waktu selesai', created_at: 'Waktu dibuat', created_by: 'Dibuat oleh', created_by_id: 'Dibuat oleh', updated_at: 'Waktu diperbarui', actor_id: 'Pelaku', before_task_id: 'Tugas sebelumnya' };
    const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
    return labels[normalized] ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, value => value.toUpperCase());
}
function auditValue(value: unknown, key = ''): string {
    if (value === null || value === undefined || value === '') return 'Belum ada data';
    if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
    if (Array.isArray(value)) return value.length ? value.map(item => auditValue(item)).join(', ') : 'Belum ada data';
    if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => `${auditFieldLabel(nestedKey)}: ${auditValue(nestedValue, nestedKey)}`).join(' · ') || 'Belum ada data';
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    if (normalized === 'status') return statusLabel(String(value));
    if (normalized === 'priority') return priorityLabel(String(value));
    if (['picid', 'picnurseid', 'createdby', 'createdbyid', 'actorid', 'userid'].includes(normalized)) return data.reference.staff.find(staff => staff.id === value)?.name ?? String(value);
    if (['startsat', 'endsat', 'createdat', 'updatedat'].includes(normalized) && typeof value === 'string') return local(value);
    return String(value);
}
function auditActionLabel(action: string) {
    return ({ created: 'Tugas dibuat', updated: 'Detail atau status diperbarui', reordered: 'Urutan diubah', reassigned: 'PIC dialihkan', deleted: 'Tugas dihapus' } as Record<string, string>)[action.toLowerCase()] ?? auditFieldLabel(action);
}
function startMove(task: Task, status?: BoardStatus, before: string | null = null) {
    if (pending.includes(task.id)) return;
    if (reasonTaskId !== task.id) reason = ''; reasonTaskId = task.id; moving = task; destination = status ?? (filtered ? (task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'cancelled') : task.status as BoardStatus); beforeId = before ?? ''; error = '';
}
async function refreshColumn(status: BoardStatus, current = generation) {
    if (data.filters.status && data.filters.status !== status) return;
    const column = board[status];
    try {
        const page = await tasks.list({ ...data.filters, status, order: 'board', limit: 50, offset: 0 });
        if (current === generation && board[status] === column) { refreshErrors.delete(status); board[status] = { items: page.items, total: page.total, error: false, filtered: false }; }
    } catch (failure) { sessionFailure(failure); if (current === generation && board[status] === column) { refreshErrors.add(status); board[status] = { ...column, error: true }; } }
}
async function loadMore(status: BoardStatus) {
    if (loading.includes(status)) return;
    const current = generation; const column = board[status]; const reset = refreshErrors.has(status); loading = [...loading, status];
    try {
        const page = await tasks.list({ ...data.filters, status, order: 'board', limit: 50, offset: reset ? 0 : column.items.length });
        if (current === generation && board[status] === column) { refreshErrors.delete(status); board[status] = { items: reset ? page.items : [...column.items, ...page.items], total: page.total, error: false, filtered: false }; }
    } catch (failure) { sessionFailure(failure); if (current === generation && board[status] === column) board[status] = { ...column, error: true }; } finally { loading = loading.filter(item => item !== status); }
}
async function moveTask(task: Task, status: BoardStatus, before: string | null, cancellationReason?: string) {
    if (!allowed(task, status) || pending.includes(task.id)) return false;
    if (status === 'cancelled' && task.status !== 'cancelled' && !cancellationReason?.trim()) { error = 'Masukkan alasan pembatalan.'; return false; }
    const current = generation;
    const source = task.status as BoardStatus;
    const snapshot = structuredClone($state.snapshot(board));
    pending = [...pending, task.id]; error = ''; notice = `Menyimpan ${task.title} ke ${statusLabel(status)}.`;
    const next = { ...task, status };
    if (!board[status].filtered) {
        board[source] = { ...board[source], items: board[source].items.filter(item => item.id !== task.id) };
        const items = [...board[status].items];
        const index = before ? items.findIndex(item => item.id === before) : -1;
        items.splice(index < 0 ? items.length : index, 0, next);
        board[status] = { ...board[status], items };
    }
    try {
        const saved = await tasks.move(task.id, { expectedVersion: task.version, status, beforeTaskId: filtered ? null : before, ...(cancellationReason ? { reason: cancellationReason.trim() } : {}) });
        if (current !== generation) {
            await Promise.all(statuses.map(([key]) => refreshColumn(key as BoardStatus)));
            notice = `${task.title} dipindahkan ke ${statusLabel(status)}.`;
            return true;
        }
        if (board[status].filtered) board[source] = { ...board[source], items: board[source].items.filter(item => item.id !== task.id) };
        else board[status] = { ...board[status], items: board[status].items.map(item => item.id === task.id ? saved : item) };
        await Promise.all([...new Set([source, status])].map(column => refreshColumn(column, current)));
        if (current !== generation) return true;
        notice = `${task.title} dipindahkan ke ${statusLabel(status)}.${board[status].filtered ? ' Tugas tidak ditampilkan karena filter status.' : ''}`;
        if (board[source].error || board[status].error) notice += ' Daftar gagal diperbarui; coba lagi.';
        if (selected?.id === task.id) { selected = null; }
        requestAnimationFrame(() => (document.getElementById(`task-${task.id}`) ?? document.getElementById(`heading-${source}`))?.focus());
        return true;
    } catch (e) {
        sessionFailure(e);
        if (current !== generation) {
            await Promise.all(statuses.map(([key]) => refreshColumn(key as BoardStatus)));
            error = sessionFailure(e); notice = '';
            return false;
        }
        for (const column of new Set([source, status])) board[column] = snapshot[column];
        await Promise.all([...new Set([source, status])].map(column => refreshColumn(column, current)));
        error = sessionFailure(e); notice = '';
        return false;
    } finally { pending = pending.filter(id => id !== task.id); }
}
async function confirmMove(event: SubmitEvent) { event.preventDefault(); if (!moving) return; const task = moving; if (await moveTask(task, destination, beforeId || null, destination === 'cancelled' ? reason : undefined)) { moving = null; reason = ''; requestAnimationFrame(() => (document.getElementById(`task-${task.id}`) ?? document.getElementById(`heading-${task.status}`))?.focus()); } }
function dragStart(event: DragEvent, task: Task) { if (!canOperate(task) || pending.includes(task.id)) { event.preventDefault(); return; } dragTask = task; suppressClick = true; event.dataTransfer?.setData('text/plain', task.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }
function dropTarget(event: DragEvent, status: BoardStatus) {
    const column = (event.currentTarget as HTMLElement).closest<HTMLElement>('.task-column');
    if ((event.target as HTMLElement).closest('.column-heading')) return { status, before: null };
    const cards = [...(column?.querySelectorAll<HTMLElement>('.task-card') ?? [])].filter(card => card.dataset.taskId !== dragTask?.id);
    const before = cards.find(card => event.clientY <= card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2)?.dataset.taskId ?? null;
    return { status, before: filtered ? null : before };
}
function dragOver(event: DragEvent, status: BoardStatus) { if (!dragTask || !allowed(dragTask, status) || (event.target as HTMLElement).closest<HTMLElement>('.task-card')?.dataset.taskId === dragTask.id) { dragTarget = null; return; } event.preventDefault(); dragTarget = dropTarget(event, status); const el = (event.currentTarget as HTMLElement).closest<HTMLElement>('.task-column'); if (el) { const rect = el.getBoundingClientRect(); if (event.clientY < rect.top + 35) el.scrollTop -= 16; else if (event.clientY > rect.bottom - 35) el.scrollTop += 16; } const boardEl = document.querySelector('.task-board'); if (boardEl) { const b = boardEl.getBoundingClientRect(); if (event.clientX < b.left + 45) boardEl.scrollLeft -= 16; else if (event.clientX > b.right - 45) boardEl.scrollLeft += 16; } }
function drop(event: DragEvent, status: BoardStatus) {
    event.preventDefault(); event.stopPropagation();
    const task = dragTask;
    const target = task && allowed(task, status) ? dropTarget(event, status) : null;
    const ownCard = (event.target as HTMLElement).closest<HTMLElement>('.task-card')?.dataset.taskId === task?.id;
    dragTask = null; dragTarget = null;
    if (!task || !target || ownCard) return;
    if (target.status === 'cancelled' && task.status !== 'cancelled') startMove(task, target.status, target.before);
    else void moveTask(task, target.status, target.before);
}
function endDrag() { dragTask = null; dragTarget = null; setTimeout(() => suppressClick = false, 0); }
function closeDetail() { selected = null; requestAnimationFrame(() => origin?.focus()); }
function openCard(task: Task, event: MouseEvent) { if (suppressClick) return; origin = event.currentTarget as HTMLElement; void open(task); }

async function filterTasks() { dragTask = null; dragTarget = null; const q = new URLSearchParams(); for (const [key, value] of Object.entries({ search: search.trim(), status: statusFilter, priority: priorityFilter, roomId: roomFilter, patientId: patientFilter, picId: picFilter, from: fromFilter, to: toFilter }))
    if (value)
        q.set(key, value); await goto(`/tasks?${q}`, { keepFocus: true, noScroll: true }); }
const statuses = [['todo', 'Belum Dikerjakan'], ['in_progress', 'Sedang Dikerjakan'], ['done', 'Selesai'], ['cancelled', 'Dibatalkan']];
const placements = $derived(data.reference.placements.filter((p) => p.status === 'active'));
async function reloadHistory(id: string) { try {
    history = await tasks.history(id);
}
catch {
    history = [];
} }
async function open(task: Task | string) { const id = typeof task === 'string' ? task : task.id; error = ''; try {
    selected = await tasks.get(id);
    await reloadHistory(id);
}
catch (failure) {
    error = sessionFailure(failure);
    selected = null;
} }
async function submit(operation: () => Promise<unknown>) { if (busy) return false; busy = true; error = ''; notice = ''; try {
    await operation();
    await invalidateAll();
    notice = 'Perubahan berhasil disimpan.';
    return true;
}
catch (e) {
    error = sessionFailure(e);
    return false;
}
finally {
    busy = false;
} }
async function createTask(event: SubmitEvent) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); const placement = placements.find((p) => p.id === formText(f, 'placementId')); if (!placement) {
    error = 'Pilih penempatan pasien yang masih aktif.';
    return;
} const toIso = (s: string) => new Date(s).toISOString(); const ok = await submit(() => tasks.create({ patientId: placement.patientId, placementId: placement.id, picId: formText(f, 'picId'), title: formText(f, 'title'), description: formText(f, 'description'), notes: formText(f, 'notes'), priority: formText(f, 'priority') as NewTask['priority'], startsAt: toIso(String(formText(f, 'startsAt'))), endsAt: toIso(String(formText(f, 'endsAt'))) })); if (ok)
    creating = false; }
async function changeStatus(task: Task, status: BoardStatus) { if (status === 'cancelled') startMove(task, status); else await moveTask(task, status, null); }
async function addNote(event: SubmitEvent) {
    event.preventDefault();
    const task = selected;
    if (!task) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const saved = await submit(() => tasks.update(task.id, { expectedVersion: task.version, notes: formText(form, 'notes') }));
    if (saved && selected?.id === task.id) await open(task.id);
}
async function reassign(event: SubmitEvent) {
    event.preventDefault();
    const task = selected;
    if (!task) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const saved = await submit(() => tasks.reassign(task.id, { expectedVersion: task.version, picId: formText(form, 'picId'), reason: formText(form, 'reason') }));
    if (saved && selected?.id === task.id) await open(task.id);
}
function startTaskDelete() {
    if (!selected) return;
    if (deletingTask?.id !== selected.id) deletionReason = '';
    deletingTask = selected;
    deletionOpen = true;
    error = '';
}
async function removeTask(event: SubmitEvent) {
    event.preventDefault();
    const task = deletingTask;
    if (!task || busy) return;
    const reason = deletionReason.trim();
    if (!reason) { error = 'Alasan penghapusan wajib diisi.'; return; }
    const removed = await submit(() => tasks.remove(task.id, { expectedVersion: task.version, reason }));
    if (removed) {
        deletionOpen = false;
        deletingTask = null;
        deletionReason = '';
        if (selected?.id === task.id) selected = null;
    }
}
async function updateTask(event: SubmitEvent) {
    event.preventDefault();
    const task = selected;
    if (!task) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const saved = await submit(() => tasks.update(task.id, {
        expectedVersion: task.version,
        title: formText(form, 'title'), description: formText(form, 'description'),
        priority: formText(form, 'priority') as NewTask['priority'],
        startsAt: new Date(formText(form, 'startsAt')).toISOString(),
        endsAt: new Date(formText(form, 'endsAt')).toISOString()
    }));
    if (saved && selected?.id === task.id) await open(task.id);
}
const localInput = (value: string) => new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function local(value: string) { return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
</script>

<svelte:head><title>Tugas Perawatan | InpaCare</title></svelte:head>
<div class="tasks-page flex min-w-0 flex-col gap-6">
<section class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="page-title">Tugas Perawatan</h1><p class="page-subtitle">Tugas pasien dengan PIC, rentang waktu, prioritas, dan riwayat perubahan.</p></div>{#if coordinator}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline" aria-expanded={creating} onclick={()=>{creating=!creating;error='';}}><Plus size={16} aria-hidden="true"/> Buat tugas</Button>{/if}</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="success" role="status">{notice}</p>{/if}

{#if creating&&coordinator}<Card class="gap-4 p-5 sm:p-6 form-panel"><h2>Buat tugas perawatan</h2><form class="form-grid" onsubmit={createTask}>
	<label class="field">Penempatan pasien<FormSelect name="placementId" required options={[{ value: "", label: "Pilih pasien / ruangan" }, ...(placements).map((p) => ({ value: p.id, label: (p.patientName) + " · " + (p.roomName) + " (" + (p.startsOn) + "–" + (p.endsOn) + ")" }))]} /></label>
	<label class="field">Perawat PIC<FormSelect name="picId" required options={[{ value: "", label: "Pilih PIC aktif" }, ...(data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active)).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} /></label>
	<label class="field">Judul<Input class="h-11 text-base md:text-sm" name="title" required maxlength={150} /></label><label class="field">Prioritas<FormSelect name="priority" options={[{ value: "normal", label: "Normal" }, { value: "high", label: "Tinggi" }, { value: "low", label: "Rendah" }]} /></label>
	<label class="field">Waktu mulai<Input class="h-11 text-base md:text-sm" name="startsAt" type="datetime-local" required /></label><label class="field">Waktu selesai<Input class="h-11 text-base md:text-sm" name="endsAt" type="datetime-local" required /></label>
	<label class="field">Deskripsi<Textarea name="description" rows={2}></Textarea></label><label class="field">Catatan awal<Textarea name="notes" rows={2}></Textarea></label>
	<div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}>Simpan tugas</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={()=>creating=false}>Batal</Button></div>
</form></Card>{/if}
<Card class="gap-4 p-5 sm:p-6 filter-panel"><form class="filters task-filters" onsubmit={(event)=>{event.preventDefault();void filterTasks();}}><label class="field search-field">Cari tugas atau pasien<Input class="h-11 text-base md:text-sm" type="search" bind:value={search} placeholder="Nama pasien, nomor RM, judul tugas" /></label><details class="advanced"><summary>Filter lanjutan</summary><div class="filters"><label class="field">Status<FormSelect bind:value={statusFilter} options={[{ value: "", label: "Semua status" }, ...(statuses).map(([key,label]) => ({ value: key, label: (label) }))]} /></label><label class="field">Prioritas<FormSelect bind:value={priorityFilter} options={[{ value: "", label: "Semua prioritas" }, { value: "high", label: "Tinggi" }, { value: "normal", label: "Normal" }, { value: "low", label: "Rendah" }]} /></label><label class="field">Ruangan<FormSelect bind:value={roomFilter} options={[{ value: "", label: "Semua ruangan" }, ...(data.reference.rooms).map((room) => ({ value: room.id, label: (room.name) }))]} /></label><label class="field">Pasien<FormSelect bind:value={patientFilter} options={[{ value: "", label: "Semua pasien" }, ...(data.reference.patients).map((patient) => ({ value: patient.id, label: (patient.name) }))]} /></label><label class="field">PIC<FormSelect bind:value={picFilter} options={[{ value: "", label: "Semua PIC" }, ...(data.reference.staff.filter((s)=>s.role==='PERAWAT')).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} /></label><label class="field">Dari tanggal<Input class="h-11 text-base md:text-sm" type="date" bind:value={fromFilter}/></label><label class="field">Sampai tanggal<Input class="h-11 text-base md:text-sm" type="date" bind:value={toFilter}/></label></div></details><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" type="submit">Terapkan filter</Button></form>{#if filtered}<div class="applied"><span>Filter aktif:</span>{#each Object.entries(data.filters).filter(([,value])=>value) as [key,value]}<Button variant="default" class="h-auto min-h-11 max-w-full min-w-0 whitespace-normal break-words px-3 py-2 text-left no-underline hover:no-underline" onclick={()=>{ const q = new URLSearchParams(window.location.search); q.delete(key); q.delete('page'); void goto(`/tasks?${q}`, { keepFocus: true, noScroll: true }); }}>{key}: {value} - Hapus</Button>{/each}<Button variant="link" class="h-11 px-4 no-underline hover:no-underline text-link" onclick={()=>goto('/tasks')}>Hapus semua</Button></div>{/if}</Card>
<div class="task-board" role="region" aria-label="Papan tugas perawatan" ondragleave={(event)=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) dragTarget=null;}}>
 {#each statuses as [key,label]}
  {@const status = key as BoardStatus}
  {@const column = board[status]}
  <section class="task-column" aria-label={label} data-status={status} ondragover={(e)=>dragOver(e,status)} ondrop={(e)=>drop(e,status)}>
   <div class="column-heading" tabindex="-1" id={`heading-${status}`}><strong>{label}</strong><span class="sr-only" aria-live="polite">{column.error ? 'Daftar gagal dimuat' : `${column.items.length} dari ${column.total} tugas dimuat`}</span><Badge variant="outline" class="shrink-0 tabular-nums">{column.error ? 'Gagal dimuat' : column.total}</Badge></div>
   {#if column.filtered}<p class="empty">Disembunyikan oleh filter status.</p>
   {:else}
    {#each column.items as task (task.id)}
     {#if dragTarget?.status===status && dragTarget.before===task.id}<div class="drop-marker" aria-label="Posisi penyisipan"></div>{/if}
     <Card role="article" data-task-id={task.id} class={`task-card mb-2 gap-2 overflow-visible p-3 [overflow-wrap:anywhere] ${dragTask?.id===task.id ? 'opacity-50' : ''}`} draggable={task.status!=='done' && task.status!=='cancelled' && canOperate(task) && !pending.includes(task.id)} ondragstart={(e)=>dragStart(e,task)} ondragend={endDrag} ondragover={(e)=>{e.stopPropagation();dragOver(e,status);}} ondrop={(e)=>drop(e,status)}>
      <Button variant="ghost" id={`task-${task.id}`} aria-label={`Detail ${task.title}`} class="card-open h-auto min-h-11 w-full flex-col items-start gap-1.5 whitespace-normal p-1 text-left font-normal hover:bg-accent/50" onclick={(event)=>openCard(task,event)}><strong class="card-title">{task.title}</strong><span>{task.patientName} - {task.roomName}</span><StatusBadge value={task.priority} label={`Prioritas ${priorityLabel(task.priority)}`} /><span>{local(task.startsAt)} - {local(task.endsAt)}</span><span>PIC: {task.picName}</span></Button>
      <div class="task-card-actions"><Button variant="outline" class="h-11 px-3" onclick={(event)=>openCard(task,event)}>Detail</Button>{#if pending.includes(task.id)}<p role="status">Menyimpan...</p>{:else if task.status!=='done' && task.status!=='cancelled' && canOperate(task) && statuses.some(([key])=>allowed(task,key as BoardStatus))}<Button variant="default" class="h-11 px-3 move-button" onclick={()=>startMove(task)}>Pindahkan</Button>{/if}</div>
     </Card>
    {:else}{#if !column.error}<p class="empty">Tidak ada tugas.</p>{/if}{/each}
    {#if dragTarget?.status===status && !dragTarget.before}<div class="drop-marker" aria-label="Posisi penyisipan di akhir"></div>{/if}
    {#if column.error}<p class="error" role="alert">Daftar gagal dimuat. <Button variant="link" class="h-11 px-4 no-underline hover:no-underline text-link" onclick={()=>loadMore(status)}>Coba lagi</Button></p>{:else if column.items.length < column.total}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline" disabled={loading.includes(status)} onclick={()=>loadMore(status)}>{loading.includes(status) ? 'Memuat...' : 'Muat lebih banyak'}</Button>{/if}
    {#if status==='todo' && coordinator}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline add-card" onclick={()=>{creating=true;error='';}}>+ Tambah tugas</Button>{/if}
   {/if}
  </section>
 {/each}
</div>
<p class="muted">Tugas hanya dapat maju ke tahap berikutnya; tugas selesai atau dibatalkan tidak dapat dibuka kembali.{#if filtered} Urutan dinonaktifkan saat filter aktif. Perpindahan status ditambahkan di akhir daftar.{/if}</p>
{#if moving}<Modal title={`Pindahkan ${moving.title}`} description="Pilih status tujuan dan posisi tugas. Pembatalan memerlukan alasan." onclose={()=>moving=null}><form class="move-form" onsubmit={confirmMove}><label class="field">Status tujuan<FormSelect bind:value={destination} onValueChange={()=>beforeId=''} options={[...(statuses).flatMap(([key,label]) => [...(moving && allowed(moving,key as BoardStatus) ? [{ value: key, label: (label) }] : [])])]} /></label>{#if !filtered}<label class="field">Posisi<FormSelect bind:value={beforeId} options={[{ value: "", label: "Akhir daftar" }, ...(board[destination].items.filter(t=>t.id!==moving?.id)).map((anchor) => ({ value: anchor.id, label: "Sebelum " + (anchor.title) }))]} /></label>{:else}<p class="muted">Hapus filter untuk mengatur posisi.</p>{/if}{#if destination==='cancelled' && moving.status!=='cancelled'}<label class="field">Alasan pembatalan<Textarea bind:value={reason} required maxlength={500}></Textarea></label><p>Konfirmasi pembatalan tugas ini.</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<div class="card-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={pending.includes(moving.id)}>Konfirmasi pindahkan</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={()=>moving=null}>Batal</Button></div></form></Modal>{/if}
{#if selected}<Modal title={selected.title} description="Detail tugas, catatan tindakan dan riwayat perubahan." busy={busy || pending.includes(selected.id)} onclose={closeDetail}>
<div class="detail-layout">
 <section class="detail-section" aria-labelledby="task-summary-heading">
  <h3 id="task-summary-heading">Ringkasan tugas</h3>
  <dl class="detail-grid">
   <div><dt>Pasien</dt><dd>{selected.patientName} <span class="muted">({selected.medicalRecordNo})</span></dd></div>
   <div><dt>Ruangan</dt><dd>{selected.roomName}</dd></div>
   <div><dt>Penanggung jawab</dt><dd>{selected.picName}</dd></div>
   <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
   <div><dt>Prioritas</dt><dd>{priorityLabel(selected.priority)}</dd></div>
   <div><dt>Jadwal</dt><dd>{local(selected.startsAt)}<br />sampai {local(selected.endsAt)}</dd></div>
   <div><dt>Dibuat oleh</dt><dd>{selected.createdByName}</dd></div>
  </dl>
  {#if canOperate(selected) && selected.status!=='done' && selected.status!=='cancelled' && statuses.some(([key])=>allowed(selected!,key as BoardStatus))}<Button variant="default" class="h-11 px-4" onclick={()=>selected&&startMove(selected)}>Pindahkan</Button>{/if}
 </section>
 {#if error}<p class="error" role="alert">{error}</p>{/if}
 <section class="detail-section"><h3>Deskripsi</h3><p class="detail-copy">{selected.description||'Tidak ada deskripsi.'}</p></section>
 <section class="detail-section"><h3>Catatan tindakan</h3><p class="detail-copy">{selected.notes||'Belum ada catatan.'}</p></section>
 <p class="muted detail-version">Versi {selected.version}</p>
 {#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}
  <details class="edit-task detail-section"><summary class="text-link">Ubah detail tugas</summary><form class="form-grid" onsubmit={updateTask}><label class="field">Judul<Input class="h-11 text-base md:text-sm" name="title" value={selected.title} required maxlength={150}/></label><label class="field">Prioritas<FormSelect name="priority" value={selected.priority} options={[{ value: "low", label: "Rendah" }, { value: "normal", label: "Normal" }, { value: "high", label: "Tinggi" }]} /></label><label class="field">Mulai<Input class="h-11 text-base md:text-sm" name="startsAt" type="datetime-local" value={localInput(selected.startsAt)} required/></label><label class="field">Selesai<Input class="h-11 text-base md:text-sm" name="endsAt" type="datetime-local" value={localInput(selected.endsAt)} required/></label><label class="field full">Deskripsi<Textarea value={[(selected.description)].join("")} name="description" rows={3}></Textarea></label><div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4" disabled={busy}>Simpan detail</Button></div></form></details>
 {/if}
 {#if data.user.id===selected.picId||coordinator}<section class="detail-section"><h3>Tambah catatan</h3><form class="inline-edit" onsubmit={addNote}><label class="field">Catatan tindakan<Textarea value={[(selected.notes)].join("")} name="notes" rows={2} maxlength={3000} required></Textarea></label><Button variant="outline" type="submit" class="h-11 px-4" disabled={busy}>Simpan catatan</Button></form></section>{/if}
 {#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}
  <section class="detail-section"><h3>Penugasan dan tindakan</h3><form class="inline-edit" onsubmit={reassign}><label class="field">Alihkan ke perawat<FormSelect name="picId" required options={[...(data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active&&u.id!==selected?.picId)).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} /></label><label class="field">Alasan pengalihan<Input class="h-11 text-base md:text-sm" name="reason" required maxlength={500} /></label><Button variant="outline" type="submit" class="h-11 px-4" disabled={busy}>Alihkan PIC</Button></form><div class="card-actions"><Button variant="destructive" class="h-11 px-4" disabled={busy||selected.status==='cancelled'} onclick={()=>selected&&changeStatus(selected,'cancelled')}>Batalkan dengan alasan</Button><Button variant="destructive" class="h-11 px-4" disabled={busy} onclick={startTaskDelete}>Hapus logis dengan alasan</Button></div></section>
 {/if}
  <section class="detail-section"><h3>Riwayat tugas</h3><ol class="history-list">{#each history as item}{@const beforeValues=item.before??{}}{@const auditKeys=[...new Set([...Object.keys(beforeValues),...Object.keys(item.after??{})])]}<li><strong>{auditActionLabel(item.action)}</strong> · {item.actorName} <time>{local(item.createdAt)}</time>{#if item.reason}<p>{item.reason}</p>{/if}<details class="audit-disclosure"><summary>Nilai sebelum dan sesudah<ChevronDown size={16} aria-hidden="true" /></summary><div class="audit-columns"><span aria-hidden="true"></span><span>Sebelum</span><span>Sesudah</span></div>{#if auditKeys.length}{#each auditKeys as auditKey}<div class="audit-row"><strong>{auditFieldLabel(auditKey)}</strong><span><span class="sr-only">Sebelum: </span>{auditValue(beforeValues[auditKey],auditKey)}</span><span><span class="sr-only">Sesudah: </span>{auditValue(item.after?.[auditKey],auditKey)}</span></div>{/each}{:else}<p class="muted">Belum ada data perubahan.</p>{/if}</details></li>{:else}<li class="muted">Belum ada riwayat.</li>{/each}</ol></section>
</div></Modal>{/if}

{#if deletionOpen && deletingTask}
    <Modal title="Hapus tugas?" description="Catat alasan penghapusan logis tugas untuk riwayat perubahan." {busy} onclose={() => deletionOpen = false}>
        <form onsubmit={removeTask}>
            <p>Tugas <strong>{deletingTask.title}</strong> akan dihapus secara logis. Riwayat perubahan tetap tersimpan.</p>
            {#if error}<p class="error" role="alert">{error}</p>{/if}
            <label class="field">Alasan penghapusan<Textarea bind:value={deletionReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button variant="destructive" type="submit" class="h-11" disabled={busy}>Konfirmasi hapus</Button>
                <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={() => deletionOpen = false}>Batal</Button>
            </div>
        </form>
    </Modal>
{/if}
</div>

<style>
.task-board { display:flex; gap:16px; overflow-x:auto; align-items:flex-start; background:var(--muted); padding:16px; border-radius:12px; max-width:100%; }
.task-column { flex:0 0 292px; min-width:0; min-height:140px; max-height:70vh; overflow-y:auto; background:var(--muted); padding:0 4px 4px; }
.column-heading { position:sticky; top:0; z-index:1; background:var(--muted); display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 2px 16px; font-size:13px; }
.card-title { font-size:14px; font-weight:600; }
.tasks-page :global(.card-open > span) { font-size:12px; }
.drop-marker { height:0; border:0; margin:0; position:relative; z-index:2; pointer-events:none; }
.drop-marker::before { content:''; position:absolute; top:-2px; left:0; right:0; border-top:4px dashed var(--primary); }
.task-card-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px; }
.card-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:16px; }
.advanced { min-width:0; }
.advanced summary { cursor:pointer; min-height:44px; display:flex; align-items:center; }
.advanced .filters { margin-top:12px; }
.applied { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.move-form { display:grid; gap:12px; }
.edit-task { margin:20px 0; border-top:1px solid var(--border); padding-top:14px; }
.edit-task summary { cursor:pointer; min-height:44px; }
.task-filters { align-items:end; }
.inline-edit { display:flex; align-items:end; gap:12px; flex-wrap:wrap; margin:20px 0; }
.inline-edit .field { flex:1; min-width:0; }
.history-list { padding-left:20px; }
.history-list li { padding:10px 0; border-bottom:1px solid var(--border); font-size:13px; }
.history-list time { display:block; color:var(--muted-foreground); font-size:12px; margin-top:4px; }
.history-list p { margin:4px 0; }
.detail-layout { display:grid; gap:20px; min-width:0; }
.detail-section { min-width:0; border-top:1px solid var(--border); padding-top:16px; }
.detail-section h3 { margin:0 0 12px; font-size:1rem; font-weight:600; }
.detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 20px; margin:0 0 16px; }
.detail-grid dt { color:var(--muted-foreground); font-size:.8rem; }
.detail-grid dd { margin:3px 0 0; overflow-wrap:anywhere; }
.detail-copy { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.detail-version { margin:0; }
.audit-disclosure { min-width:0; margin-top:8px; }
.audit-disclosure summary { min-height:44px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; }
.audit-disclosure[open] :global(summary svg) { transform:rotate(180deg); }
.audit-columns,.audit-row { display:grid; grid-template-columns:minmax(90px,.7fr) minmax(0,1fr) minmax(0,1fr); gap:8px; padding:8px; border-bottom:1px solid var(--border); }
.audit-columns { color:var(--muted-foreground); font-size:.8rem; font-weight:600; }
.audit-row > * { min-width:0; overflow-wrap:anywhere; white-space:pre-wrap; }
.audit-row strong { font-weight:500; }
@media(max-width:620px) { .inline-edit { align-items:stretch; flex-direction:column; } .detail-grid { grid-template-columns:minmax(0,1fr); } .audit-columns,.audit-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr); } .audit-columns span:first-child { display:none; } .audit-row strong { grid-column:1 / -1; } }
</style>
