<script lang="ts">
import { toast } from '$lib/shared/ui/sonner/index.js';
import { Button, buttonVariants } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { goto, invalidateAll } from '$app/navigation';
import type { Tasks, TasksPageData, Task, TaskHistory, NewTask, BoardStatus, TaskBoard } from '$lib/features/tasks';
import { sessionFailure } from '$lib/shared/presentation/session';
import { date } from '$lib/shared/format';
import { formText } from '$lib/shared/presentation/form';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import StatusBadge from '$lib/shared/ui/status-badge.svelte';
import { Badge } from '$lib/shared/ui/badge/index.js';
import { ArrowDownToLine, ArrowRightLeft, Ban, ChevronDown, Eye, Filter, ListPlus, LockKeyhole, Pencil, Plus, RefreshCw, Save, Search, SlidersHorizontal, Trash2, Undo2, UserRoundPen, X } from 'lucide-svelte';
import { onDestroy, untrack } from 'svelte';
let { data, tasks, taskId = '', cycleId = '' }: {
    data: TasksPageData;
    tasks: Tasks;
    taskId?: string;
    cycleId?: string;
} = $props();
const cycleHref = $derived(`/dashboard?${new URLSearchParams({ cycleId })}`);
$effect(() => {
    if (taskId) untrack(() => void open(taskId));
});
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
let taskView = $state<'detail' | 'edit' | 'note' | 'reassign' | 'audit'>('detail');
let selectedAudit = $state<TaskHistory | null>(null);
let filterOpen = $state(false);
let history = $state<TaskHistory[]>([]);
let busy = $state(false);
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
let dragTarget = $state<BoardStatus | null>(null);
let pressedTaskId = $state<string | null>(null);
let dragImage: HTMLElement | null = null;
let origin: HTMLElement | null = null;
let suppressClick = false;
const filtered = $derived(Object.values(data.filters).some(Boolean));
$effect(() => {
    const next = data.board;
    board = next; generation++; refreshErrors.clear(); dragTask = null; dragTarget = null; clearDragVisuals();
    untrack(() => {
        for (const [key] of statuses) {
            const status = key as BoardStatus;
            if (next[status].error) reportColumnFailure(status);
        }
    });
});
function reportColumnFailure(status: BoardStatus, description?: string) {
    toast.error(`Daftar ${statusLabel(status)} gagal dimuat.`, {
        id: `task-column-${status}`,
        description,
        action: { label: 'Coba lagi', onClick: () => { void loadMore(status); } }
    });
}
function canOperate(task: Task) { return coordinator || task.picId === data.user.id; }
function canDrag(task: Task) { return task.status !== 'done' && task.status !== 'cancelled' && canOperate(task) && !pending.includes(task.id); }
function allowed(task: Task, status: BoardStatus) {
    if (task.status === 'done' || task.status === 'cancelled') return false;
    if (!canOperate(task)) return false;
    if (status === task.status) return !filtered;
    return (task.status === 'todo' && status === 'in_progress') || (task.status === 'in_progress' && status === 'done') || (coordinator && status === 'cancelled' && (task.status === 'todo' || task.status === 'in_progress'));
}
function dropLockReason(task: Task, status: BoardStatus) {
    if (task.status === 'done' || task.status === 'cancelled') return 'Tugas selesai atau dibatalkan tidak dapat dipindahkan.';
    if (!canOperate(task)) return 'Hanya penanggung jawab atau koordinator yang dapat memindahkan tugas ini.';
    if (status === 'cancelled' && !coordinator) return 'Hanya koordinator yang dapat membatalkan tugas.';
    if (task.status === 'todo' && status === 'done') return 'Pindahkan ke Sedang dikerjakan terlebih dahulu.';
    return 'Tugas tidak dapat kembali ke Belum dikerjakan.';
}
function statusLabel(status: string) { return statuses.find(([key]) => key === status)?.[1] ?? status; }
function priorityLabel(priority: string) { return ({ high: 'Tinggi', normal: 'Normal', low: 'Rendah' } as Record<string, string>)[priority] ?? priority; }
function auditFieldLabel(key: string) {
    const labels: Record<string, string> = { search: 'Pencarian', from: 'Dari tanggal', to: 'Sampai tanggal', id: 'ID tugas', title: 'Judul', description: 'Deskripsi', notes: 'Catatan tindakan', status: 'Status', priority: 'Prioritas', version: 'Versi', pic_id: 'Penanggung jawab', pic_nurse_id: 'Penanggung jawab', patient_id: 'Pasien', room_id: 'Ruangan', placement_id: 'Penempatan', starts_at: 'Waktu mulai', ends_at: 'Waktu selesai', created_at: 'Waktu dibuat', created_by: 'Dibuat oleh', created_by_id: 'Dibuat oleh', updated_at: 'Waktu diperbarui', actor_id: 'Pelaku', before_task_id: 'Tugas sebelumnya' };
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
    if (normalized === 'roomid') return data.reference.rooms.find(room => room.id === value)?.name ?? String(value);
    if (normalized === 'patientid') return data.reference.patients.find(patient => patient.id === value)?.name ?? String(value);
    if (['startsat', 'endsat', 'createdat', 'updatedat'].includes(normalized) && typeof value === 'string') return local(value);
    return String(value);
}
function auditActionLabel(action: string) {
    return ({ created: 'Tugas dibuat', updated: 'Detail atau status diperbarui', reordered: 'Urutan diubah', reassigned: 'Penanggung jawab dialihkan', deleted: 'Tugas dihapus' } as Record<string, string>)[action.toLowerCase()] ?? auditFieldLabel(action);
}
function startMove(task: Task, status?: BoardStatus, before: string | null = null) {
    if (pending.includes(task.id)) return;
    if (reasonTaskId !== task.id) reason = ''; reasonTaskId = task.id; moving = task; destination = status ?? (filtered ? (task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'cancelled') : task.status as BoardStatus); beforeId = before ?? '';
}
async function refreshColumn(status: BoardStatus, current = generation) {
    if (data.filters.status && data.filters.status !== status) return;
    const column = board[status];
    try {
        const page = await tasks.list({ ...data.filters, status, order: 'board', limit: 50, offset: 0 });
        if (current === generation && board[status] === column) { refreshErrors.delete(status); board[status] = { items: page.items, total: page.total, error: false, filtered: false }; toast.dismiss(`task-column-${status}`); }
    } catch (failure) {
        const description = sessionFailure(failure, 'load', 'Daftar tugas');
        if (current === generation && board[status] === column) {
            refreshErrors.add(status); board[status] = { ...column, error: true };
            reportColumnFailure(status, description);
        }
    }
}
async function loadMore(status: BoardStatus) {
    if (loading.includes(status)) return;
    const current = generation; const column = board[status]; const reset = refreshErrors.has(status); loading = [...loading, status];
    try {
        const page = await tasks.list({ ...data.filters, status, order: 'board', limit: 50, offset: reset ? 0 : column.items.length });
        if (current === generation && board[status] === column) { refreshErrors.delete(status); board[status] = { items: reset ? page.items : [...column.items, ...page.items], total: page.total, error: false, filtered: false }; toast.dismiss(`task-column-${status}`); }
    } catch (failure) {
        const description = sessionFailure(failure, 'load', 'Daftar tugas');
        if (current === generation && board[status] === column) {
            board[status] = { ...column, error: true };
            reportColumnFailure(status, description);
        }
    } finally { loading = loading.filter(item => item !== status); }
}
async function moveTask(task: Task, status: BoardStatus, before: string | null, cancellationReason?: string) {
    if (!allowed(task, status) || pending.includes(task.id)) return false;
    if (status === 'cancelled' && task.status !== 'cancelled' && !cancellationReason?.trim()) { toast.error('Masukkan alasan pembatalan.'); return false; }
    const current = generation;
    const source = task.status as BoardStatus;
    const snapshot = structuredClone($state.snapshot(board));
    pending = [...pending, task.id];
    const toastId = toast.loading(`Menyimpan ${task.title} ke ${statusLabel(status)}.`, { id: `task-move-${task.id}` });
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
            toast.success(`${task.title} dipindahkan ke ${statusLabel(status)}.`, { id: toastId });
            return true;
        }
        if (board[status].filtered) board[source] = { ...board[source], items: board[source].items.filter(item => item.id !== task.id) };
        else board[status] = { ...board[status], items: board[status].items.map(item => item.id === task.id ? saved : item) };
        await Promise.all([...new Set([source, status])].map(column => refreshColumn(column, current)));
        toast.success(`${task.title} dipindahkan ke ${statusLabel(status)}.${board[status].filtered ? ' Tugas tidak ditampilkan karena filter status.' : ''}`, { id: toastId });
        if (current !== generation) return true;
        if (selected?.id === task.id) { selected = null; }
        requestAnimationFrame(() => (document.getElementById(`task-${task.id}`) ?? document.getElementById(`heading-${source}`))?.focus());
        return true;
    } catch (e) {
        const message = sessionFailure(e, 'save', 'status tugas');
        if (current !== generation) {
            await Promise.all(statuses.map(([key]) => refreshColumn(key as BoardStatus)));
            toast.error(message, { id: toastId });
            return false;
        }
        for (const column of new Set([source, status])) board[column] = snapshot[column];
        await Promise.all([...new Set([source, status])].map(column => refreshColumn(column, current)));
        toast.error(message, { id: toastId });
        return false;
    } finally { pending = pending.filter(id => id !== task.id); }
}
async function confirmMove(event: SubmitEvent) { event.preventDefault(); if (!moving) return; const task = moving; if (await moveTask(task, destination, beforeId || null, destination === 'cancelled' ? reason : undefined)) { moving = null; reason = ''; requestAnimationFrame(() => (document.getElementById(`task-${task.id}`) ?? document.getElementById(`heading-${task.status}`))?.focus()); } }
function releaseCard() { pressedTaskId = null; }
function clearDragVisuals() { releaseCard(); dragImage?.remove(); dragImage = null; }
onDestroy(clearDragVisuals);
function pressCard(event: PointerEvent, task: Task) {
    if (event.button === 0 && event.isPrimary && canDrag(task)) pressedTaskId = task.id;
}
function dragStart(event: DragEvent, task: Task) {
    if (!canDrag(task)) { event.preventDefault(); clearDragVisuals(); return; }
    clearDragVisuals();
    if (event.dataTransfer) {
        const card = event.currentTarget as HTMLElement;
        const bounds = card.getBoundingClientRect();
        // The browser snapshots this lifted copy as its native drag image.
        dragImage = card.cloneNode(true) as HTMLElement;
        dragImage.classList.remove('task-card', 'card-pressed', 'card-dragging');
        dragImage.classList.add('task-drag-preview');
        dragImage.removeAttribute('data-task-id');
        dragImage.removeAttribute('draggable');
        dragImage.setAttribute('aria-hidden', 'true');
        dragImage.inert = true;
        dragImage.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        dragImage.style.width = `${card.offsetWidth}px`;
        document.body.append(dragImage);
        event.dataTransfer.setDragImage(dragImage, Math.max(0, event.clientX - bounds.left), Math.max(0, event.clientY - bounds.top));
    }
    dragTask = task; suppressClick = true;
    event.dataTransfer?.setData('text/plain', task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function dragOver(event: DragEvent, status: BoardStatus) {
    if (!dragTask) return;
    const valid = status === dragTask.status || allowed(dragTask, status);
    dragTarget = valid ? status : null;
    if (event.dataTransfer) event.dataTransfer.dropEffect = valid ? 'move' : 'none';
    if (valid) event.preventDefault();
    const column = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.column-scroll');
    if (valid && column) {
        const rect = column.getBoundingClientRect();
        if (event.clientY < rect.top + 35) column.scrollTop -= 16;
        else if (event.clientY > rect.bottom - 35) column.scrollTop += 16;
    }
    const boardElement = (event.currentTarget as HTMLElement).closest<HTMLElement>('.task-board');
    if (boardElement) {
        const rect = boardElement.getBoundingClientRect();
        if (event.clientX < rect.left + 45) boardElement.scrollLeft -= 16;
        else if (event.clientX > rect.right - 45) boardElement.scrollLeft += 16;
    }
}
function drop(event: DragEvent, status: BoardStatus) {
    event.preventDefault(); event.stopPropagation();
    const task = dragTask;
    endDrag();
    if (!task || status === task.status || !allowed(task, status)) return;
    if (status === 'cancelled') startMove(task, status);
    else void moveTask(task, status, null);
}
function endDrag() { dragTask = null; dragTarget = null; clearDragVisuals(); setTimeout(() => suppressClick = false, 0); }
function closeDetail() { taskView = 'detail'; selectedAudit = null; selected = null; requestAnimationFrame(() => origin?.focus()); }
function closeMove() {
    const task = moving;
    moving = null;
    if (task && pending.includes(task.id)) closeDetail();
}
function openCard(task: Task, event: MouseEvent) { if (suppressClick) return; origin = event.currentTarget as HTMLElement; void open(task); }

function closeFilters() {
    statusFilter = data.filters.status; priorityFilter = data.filters.priority; roomFilter = data.filters.roomId;
    patientFilter = data.filters.patientId; picFilter = data.filters.picId; fromFilter = data.filters.from; toFilter = data.filters.to;
    filterOpen = false;
}
async function filterTasks() { endDrag(); const q = new URLSearchParams(); for (const [key, value] of Object.entries({ search: search.trim(), status: statusFilter, priority: priorityFilter, roomId: roomFilter, patientId: patientFilter, picId: picFilter, from: fromFilter, to: toFilter }))
    if (value)
        q.set(key, value); await goto(`/tasks?${q}`, { reset: false }); }
const statuses = [['todo', 'Belum dikerjakan'], ['in_progress', 'Sedang dikerjakan'], ['done', 'Selesai'], ['cancelled', 'Dibatalkan']];
const placements = $derived(data.reference.placements.filter((p) => p.status === 'active'));
async function reloadHistory(id: string) { try {
    history = await tasks.history(id);
}
catch (failure) {
    history = [];
    toast.error(sessionFailure(failure, 'load', 'Riwayat tugas'));
} }
async function open(task: Task | string) { const id = typeof task === 'string' ? task : task.id; try {
    selected = await tasks.get(id); taskView = 'detail';
    await reloadHistory(id);
}
catch (failure) {
    toast.error(sessionFailure(failure, 'load', 'Detail tugas'));
    selected = null;
} }
async function submit(operation: () => Promise<unknown>) {
    if (busy) return false;
    busy = true;
    const toastId = toast.loading('Menyimpan perubahan…');
    try {
        await operation();
        await invalidateAll().then(
            () => toast.success('Perubahan berhasil disimpan.', { id: toastId }),
            () => toast.warning('Perubahan tugas tersimpan. Muat ulang papan untuk melihat data terbaru.', { id: toastId })
        );
        return true;
    } catch (e) {
        toast.error(sessionFailure(e, 'save', 'tugas perawatan'), { id: toastId });
        return false;
    } finally {
        busy = false;
    }
}
async function createTask(event: SubmitEvent) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); const placement = placements.find((p) => p.id === formText(f, 'placementId')); if (!placement) {
    toast.error('Pilih penempatan pasien yang masih aktif.');
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
}
async function removeTask(event: SubmitEvent) {
    event.preventDefault();
    const task = deletingTask;
    if (!task || busy) return;
    const reason = deletionReason.trim();
    if (!reason) { toast.error('Isi Alasan penghapusan tugas.'); return; }
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

<svelte:head><title>Tugas perawatan | InpaCare</title></svelte:head>
<svelte:window onpointerup={releaseCard} onpointercancel={releaseCard} onblur={releaseCard} />
<div class="tasks-page flex min-w-0 flex-col gap-6">
<section class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="page-title">Tugas perawatan</h1></div>{#if coordinator}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline" aria-haspopup="dialog" onclick={()=>{creating=!creating;}}><Plus size={16} aria-hidden="true"/> Buat tugas</Button>{/if}</section>

{#if cycleId}<Button href={cycleHref} variant="outline" class="self-start">Kembali ke rekap pasien</Button>{/if}
<Card class="gap-4 p-5 sm:p-6 filter-panel"><form class="filters task-filters" onsubmit={(event)=>{event.preventDefault();void filterTasks();}}><label class="field search-field">Cari tugas atau pasien<Input class="h-11 text-base md:text-sm" type="search" bind:value={search} placeholder="Nama pasien, nomor RM, judul tugas" /></label><Button variant="outline" class="h-11" aria-haspopup="dialog" onclick={() => { statusFilter = data.filters.status; priorityFilter = data.filters.priority; roomFilter = data.filters.roomId; patientFilter = data.filters.patientId; picFilter = data.filters.picId; fromFilter = data.filters.from; toFilter = data.filters.to; filterOpen = true; }}><Filter aria-hidden="true" /> Filter lanjutan</Button><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" type="submit"><Search aria-hidden="true" /> Cari tugas</Button></form>{#if filtered}<div class="applied"><span>Filter aktif:</span>{#each Object.entries(data.filters).filter(([,value])=>value) as [key,value]}<Button variant="default" class="h-auto min-h-11 max-w-full min-w-0 whitespace-normal break-words px-3 py-2 text-left no-underline hover:no-underline" onclick={()=>{ const q = new URLSearchParams(window.location.search); q.delete(key); q.delete('page'); void goto(`/tasks?${q}`, { reset: false }); }}><Trash2 aria-hidden="true" /> {auditFieldLabel(key)}: {auditValue(value,key)} - Hapus</Button>{/each}<Button variant="link" class="h-11 px-4 no-underline hover:no-underline text-link" onclick={()=>goto('/tasks')}><X aria-hidden="true" /> Hapus semua</Button></div>{/if}</Card>
<div class="task-board" role="region" aria-label="Papan tugas perawatan" ondragleave={(event)=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) dragTarget=null;}}>
 {#each statuses as [key,label]}
  {@const status = key as BoardStatus}
  {@const column = board[status]}
  <section class="task-column" aria-label={label} data-status={status} ondragenter={(e)=>dragOver(e,status)} ondragover={(e)=>dragOver(e,status)} ondrop={(e)=>drop(e,status)} ondragleave={(event)=>{if (dragTarget === status && !event.currentTarget.contains(event.relatedTarget as Node)) dragTarget = null;}}>
   <div class="column-scroll">
   <div class="column-heading" tabindex="-1" id={`heading-${status}`}><strong>{label}</strong><span class="sr-only" aria-live="polite">{column.error ? 'Daftar gagal dimuat' : `${column.items.length} dari ${column.total} tugas dimuat`}</span><Badge variant="outline" class="shrink-0 tabular-nums">{column.error ? 'Gagal dimuat' : column.total}</Badge></div>
   {#if column.filtered}<p class="empty">Disembunyikan oleh filter status.</p>
   {:else}
    {#each column.items as task (task.id)}
     <Card role="article" data-task-id={task.id} class={`task-card mb-2 gap-0 overflow-visible p-0 [overflow-wrap:anywhere] ${pressedTaskId===task.id ? 'card-pressed' : ''} ${dragTask?.id===task.id ? 'card-dragging' : ''}`} draggable={canDrag(task)} ondragstart={(e)=>dragStart(e,task)} ondragend={endDrag}>
      <Button variant="ghost" id={`task-${task.id}`} aria-label={`Detail ${task.title}`} aria-haspopup="dialog" aria-busy={pending.includes(task.id)} class="card-open h-auto min-h-11 w-full flex-col items-start gap-1.5 rounded-xl whitespace-normal p-4 text-left font-normal hover:bg-accent/50" onpointerdown={(event)=>pressCard(event,task)} onclick={(event)=>openCard(task,event)}><strong class="card-title">{task.title}</strong><span>{task.patientName} - {task.roomName}</span><StatusBadge value={task.priority} label={`Prioritas ${priorityLabel(task.priority)}`} /><span>{local(task.startsAt)} - {local(task.endsAt)}</span><span>Penanggung jawab: {task.picName}</span>{#if pending.includes(task.id)}<span role="status">Menyimpan...</span>{/if}</Button>
     </Card>
    {:else}{#if !column.error}<p class="empty">{filtered ? 'Tidak ada tugas yang cocok. Coba ubah atau hapus filter.' : 'Belum ada tugas dengan status ini.'}</p>{/if}{/each}
    {#if column.error}<Button variant="outline" class="h-11 px-4" disabled={loading.includes(status)} onclick={()=>loadMore(status)}><RefreshCw aria-hidden="true" /> {loading.includes(status) ? 'Memuat...' : 'Coba lagi'}</Button>{:else if column.items.length < column.total}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline" disabled={loading.includes(status)} onclick={()=>loadMore(status)}><ListPlus aria-hidden="true" /> {loading.includes(status) ? 'Memuat...' : 'Muat lebih banyak'}</Button>{/if}
   {/if}
   </div>
   {#if dragTask}
    {@const cancel = dragTask.status === status}
    {@const valid = cancel || allowed(dragTask, status)}
    <div class="column-drop-overlay" class:locked={!valid} class:active={valid && dragTarget === status} data-drop-state={cancel ? 'cancel' : valid ? 'allowed' : 'locked'}>
     <div class="drop-message">
      {#if cancel}<Undo2 size={24} aria-hidden="true" /><strong>Batal pindah</strong><span>Lepaskan untuk mengembalikan kartu tanpa mengubah urutan.</span>
      {:else if valid}<ArrowDownToLine size={24} aria-hidden="true" /><strong>Pindahkan ke sini</strong><span>{status === 'cancelled' ? 'Konfirmasi alasan untuk membatalkan tugas.' : 'Tugas masuk ke urutan paling bawah.'}</span>
      {:else}<LockKeyhole size={24} aria-hidden="true" /><strong>Tidak dapat dipindahkan</strong><span>{dropLockReason(dragTask, status)}</span>{/if}
     </div>
    </div>
   {/if}
  </section>
 {/each}
</div>
<p class="muted">Seret ke kolom tujuan untuk menaruh tugas di urutan paling bawah, atau lepaskan di kolom asal untuk membatalkan perpindahan. Tugas hanya dapat maju ke tahap berikutnya; tugas selesai atau dibatalkan tidak dapat dibuka kembali.{#if filtered} Urutan dinonaktifkan saat filter aktif. Perpindahan status ditambahkan di akhir daftar.{/if}</p>

</div>

{#if creating || selected || moving || (deletionOpen && deletingTask)}
<Modal title={creating ? 'Buat tugas perawatan' : moving ? `Pindahkan ${moving.title}` : deletionOpen ? 'Hapus tugas?' : taskView === 'edit' ? 'Ubah detail tugas' : taskView === 'note' ? 'Tambah catatan' : taskView === 'reassign' ? 'Alihkan penanggung jawab' : taskView === 'audit' ? 'Rincian perubahan tugas' : selected?.title ?? 'Detail tugas'}
 description={moving ? 'Pilih status tujuan dan posisi tugas. Pembatalan memerlukan alasan.' : undefined}
 busy={!moving && (busy || !!selected && pending.includes(selected.id))}
 protectChanges={creating || !moving && !deletionOpen && ['edit', 'note', 'reassign'].includes(taskView)}
 formKey={creating ? 'create' : moving ? 'move' : deletionOpen ? 'delete' : taskView === 'audit' ? `audit-${selectedAudit?.id}` : taskView}
 backLabel={selected && (moving && !pending.includes(moving.id) || deletionOpen || taskView !== 'detail') ? 'Kembali ke detail' : undefined}
 onclose={() => { if (moving) closeMove(); else if (deletionOpen) deletionOpen = false; else if (creating) creating = false; else if (taskView !== 'detail') taskView = 'detail'; else closeDetail(); }}>
 {#snippet children(close)}
 {#if creating && coordinator}<form class="form-grid" onsubmit={createTask}>
	<label class="field">Penempatan pasien<FormSelect name="placementId" required options={[{ value: "", label: "Pilih pasien / ruangan" }, ...(placements).map((p) => ({ value: p.id, label: (p.patientName) + " · " + (p.roomName) + " (" + date(p.startsOn) + "–" + date(p.endsOn) + ")" }))]} /></label>
	<label class="field">Perawat penanggung jawab<FormSelect name="picId" required options={[{ value: "", label: "Pilih perawat aktif" }, ...(data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active)).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} /></label>
	<label class="field">Judul tugas<Input class="h-11 text-base md:text-sm" name="title" required maxlength={150} /></label><label class="field">Prioritas<FormSelect name="priority" options={[{ value: "normal", label: "Normal" }, { value: "high", label: "Tinggi" }, { value: "low", label: "Rendah" }]} /></label>
	<label class="field">Waktu mulai<FormDatePicker class="h-11 text-base md:text-sm" name="startsAt" type="datetime-local" required /></label><label class="field">Waktu selesai<FormDatePicker class="h-11 text-base md:text-sm" name="endsAt" type="datetime-local" required /></label>
	<label class="field">Deskripsi<Textarea name="description" rows={2}></Textarea></label><label class="field">Catatan awal<Textarea name="notes" rows={2}></Textarea></label>
	<div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}><Save aria-hidden="true" /> Simpan tugas</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={close}><X aria-hidden="true" /> Batal</Button></div>
</form>
 {:else if moving}<form class="move-form" onsubmit={confirmMove}><label class="field">Status tujuan<FormSelect bind:value={destination} onValueChange={()=>beforeId=''} options={[...(statuses).flatMap(([key,label]) => [...(moving && allowed(moving,key as BoardStatus) ? [{ value: key, label: (label) }] : [])])]} /></label>{#if !filtered}<label class="field">Posisi<FormSelect bind:value={beforeId} options={[{ value: "", label: "Akhir daftar" }, ...(board[destination].items.filter(t=>t.id!==moving?.id)).map((anchor) => ({ value: anchor.id, label: "Sebelum " + (anchor.title) }))]} /></label>{:else}<p class="muted">Hapus filter untuk mengatur posisi.</p>{/if}{#if destination==='cancelled' && moving.status!=='cancelled'}<label class="field">Alasan pembatalan<Textarea bind:value={reason} required maxlength={500}></Textarea></label><p>Tugas <strong>{moving.title}</strong> akan dipindahkan ke Dibatalkan dan tidak dapat dibuka kembali.</p>{/if}<div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={pending.includes(moving.id)}><ArrowRightLeft aria-hidden="true" /> {pending.includes(moving.id) ? 'Menyimpan…' : destination === 'cancelled' && moving.status !== 'cancelled' ? 'Batalkan tugas' : 'Konfirmasi pindahkan'}</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={close}><X aria-hidden="true" /> Batal</Button></div></form>
 {:else if deletionOpen && deletingTask}<form onsubmit={removeTask}>
            <p>Tugas <strong>{deletingTask.title}</strong> akan dihapus dari papan. Riwayat perubahan tetap tersimpan.</p>
            <label class="field">Alasan penghapusan<Textarea bind:value={deletionReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button variant="destructive" type="submit" class="h-11" disabled={busy}><Trash2 aria-hidden="true" /> Hapus tugas</Button>
                <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
            </div>
        </form>
 {:else if selected}
  {#if taskView === 'edit'}<form class="form-grid" onsubmit={updateTask}><label class="field">Judul tugas<Input class="h-11 text-base md:text-sm" name="title" value={selected.title} required maxlength={150}/></label><label class="field">Prioritas<FormSelect name="priority" value={selected.priority} options={[{ value: "low", label: "Rendah" }, { value: "normal", label: "Normal" }, { value: "high", label: "Tinggi" }]} /></label><label class="field">Mulai<FormDatePicker class="h-11 text-base md:text-sm" name="startsAt" type="datetime-local" value={localInput(selected.startsAt)} required/></label><label class="field">Selesai<FormDatePicker class="h-11 text-base md:text-sm" name="endsAt" type="datetime-local" value={localInput(selected.endsAt)} required/></label><label class="field full">Deskripsi<Textarea value={[(selected.description)].join("")} name="description" rows={3}></Textarea></label><div class="form-actions"><Button variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> Simpan detail</Button></div></form>
  {:else if taskView === 'note'}<form class="flex flex-col gap-4" onsubmit={addNote}><label class="field">Catatan tindakan<Textarea value={[(selected.notes)].join("")} name="notes" rows={2} maxlength={3000} required></Textarea></label><div class="form-actions"><Button variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> Simpan catatan</Button></div></form>
  {:else if taskView === 'reassign'}<form class="flex flex-col gap-4" onsubmit={reassign}><label class="field">Alihkan ke perawat<FormSelect name="picId" required options={[...(data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active&&u.id!==selected?.picId)).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} /></label><label class="field">Alasan pengalihan<Input class="h-11 text-base md:text-sm" name="reason" required maxlength={500} /></label><div class="form-actions"><Button variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4" disabled={busy}><UserRoundPen aria-hidden="true" /> Alihkan penanggung jawab</Button></div></form>
  {:else if taskView === 'audit' && selectedAudit}
   {@const item = selectedAudit}
   {@const beforeValues = item.before ?? {}}
   {@const auditKeys = [...new Set([...Object.keys(beforeValues), ...Object.keys(item.after ?? {})])]}
   <p class="mb-2 font-semibold">{auditActionLabel(item.action)} · {item.actorName}</p>
   <p class="mb-4 text-sm text-muted-foreground">{local(item.createdAt)}</p>
   {#if item.reason}<p class="mb-4">{item.reason}</p>{/if}
   <section aria-label="Nilai sebelum dan sesudah"><div class="audit-columns"><span aria-hidden="true"></span><span>Sebelum</span><span>Sesudah</span></div>{#if auditKeys.length}{#each auditKeys as auditKey}<div class="audit-row"><strong>{auditFieldLabel(auditKey)}</strong><span><span class="sr-only">Sebelum: </span>{auditValue(beforeValues[auditKey],auditKey)}</span><span><span class="sr-only">Sesudah: </span>{auditValue(item.after?.[auditKey],auditKey)}</span></div>{/each}{:else}<p class="muted">Belum ada data perubahan.</p>{/if}</section>
  {:else}<div class="detail-layout">
 <section class="detail-section" aria-labelledby="task-summary-heading">
  <h3 id="task-summary-heading">Ringkasan tugas</h3>
  {#if cycleId}<Button href={cycleHref} variant="outline" class="mb-3">Kembali ke rekap pasien</Button>{/if}
  <dl class="detail-grid">
   <div><dt>Pasien</dt><dd>{selected.patientName} <span class="muted">({selected.medicalRecordNo})</span></dd></div>
   <div><dt>Ruangan</dt><dd>{selected.roomName}</dd></div>
   <div><dt>Penanggung jawab</dt><dd>{selected.picName}</dd></div>
   <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
   <div><dt>Prioritas</dt><dd>{priorityLabel(selected.priority)}</dd></div>
   <div><dt>Jadwal</dt><dd>{local(selected.startsAt)}<br />sampai {local(selected.endsAt)}</dd></div>
   <div><dt>Dibuat oleh</dt><dd>{selected.createdByName}</dd></div>
  </dl>
  {#if canOperate(selected) && selected.status!=='done' && selected.status!=='cancelled' && statuses.some(([key])=>allowed(selected!,key as BoardStatus))}<Button variant="default" class="h-11 px-4" disabled={pending.includes(selected.id)} onclick={()=>selected&&startMove(selected)}><ArrowRightLeft aria-hidden="true" /> Pindahkan</Button>{/if}
 </section>
 <section class="detail-section"><h3>Deskripsi</h3><p class="detail-copy">{selected.description||'Tidak ada deskripsi.'}</p></section>
 <section class="detail-section"><h3>Catatan tindakan</h3><p class="detail-copy">{selected.notes||'Belum ada catatan.'}</p></section>
 <p class="muted detail-version">Versi {selected.version}</p>
 {#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}
  <Button variant="outline" class="h-11" onclick={() => taskView = 'edit'}><Pencil aria-hidden="true" /> Ubah detail tugas</Button>
 {/if}
 {#if data.user.id===selected.picId||coordinator}<section class="detail-section"><h3>Tambah catatan</h3><Button variant="outline" onclick={() => taskView = 'note'}><Plus aria-hidden="true" /> Tambah catatan</Button></section>{/if}
 {#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}
  <section class="detail-section"><h3>Penugasan dan tindakan</h3><Button variant="outline" onclick={() => taskView = 'reassign'}><UserRoundPen aria-hidden="true" /> Alihkan penanggung jawab</Button><div class="card-actions"><Button variant="destructive" class="h-11 px-4" disabled={busy||selected.status==='cancelled'} onclick={()=>selected&&changeStatus(selected,'cancelled')}><Ban aria-hidden="true" /> Batalkan dengan alasan</Button><Button variant="destructive" class="h-11 px-4" disabled={busy} onclick={startTaskDelete}><Trash2 aria-hidden="true" /> Hapus tugas dengan alasan</Button></div></section>
 {/if}
  <section class="detail-section"><h3>Riwayat tugas</h3><ol class="history-list">{#each history as item}<li><strong>{auditActionLabel(item.action)}</strong> · {item.actorName} <time>{local(item.createdAt)}</time>{#if item.reason}<p>{item.reason}</p>{/if}<Button variant="outline" class="mt-3 min-h-11" onclick={() => { selectedAudit = item; taskView = 'audit'; }}><Eye aria-hidden="true" /> Lihat perubahan</Button></li>{:else}<li class="muted">Belum ada riwayat.</li>{/each}</ol></section>
</div>{/if}
 {/if}
 {/snippet}
</Modal>
{/if}
{#if filterOpen}
<Modal title="Filter tugas" description="Batasi tugas berdasarkan status, pasien, ruangan, penanggung jawab, prioritas, dan tanggal." onclose={closeFilters}>
 {#snippet children(close)}
 <form onsubmit={(event) => { event.preventDefault(); void filterTasks().then(() => filterOpen = false); }}>
 <div class="filters"><label class="field">Status<FormSelect bind:value={statusFilter} options={[{ value: "", label: "Semua status" }, ...(statuses).map(([key,label]) => ({ value: key, label: (label) }))]} /></label><label class="field">Prioritas<FormSelect bind:value={priorityFilter} options={[{ value: "", label: "Semua prioritas" }, { value: "high", label: "Tinggi" }, { value: "normal", label: "Normal" }, { value: "low", label: "Rendah" }]} /></label><label class="field">Ruangan<FormSelect bind:value={roomFilter} options={[{ value: "", label: "Semua ruangan" }, ...(data.reference.rooms).map((room) => ({ value: room.id, label: (room.name) }))]} /></label><label class="field">Pasien<FormSelect bind:value={patientFilter} options={[{ value: "", label: "Semua pasien" }, ...(data.reference.patients).map((patient) => ({ value: patient.id, label: (patient.name) }))]} /></label><label class="field">Penanggung jawab<FormSelect bind:value={picFilter} options={[{ value: "", label: "Semua penanggung jawab" }, ...(data.reference.staff.filter((s)=>s.role==='PERAWAT')).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} /></label><label class="field">Dari tanggal<FormDatePicker class="h-11 text-base md:text-sm" type="date" bind:value={fromFilter}/></label><label class="field">Sampai tanggal<FormDatePicker class="h-11 text-base md:text-sm" type="date" bind:value={toFilter}/></label></div>
 <div class="form-actions"><Button variant="outline" onclick={close}><X aria-hidden="true" /> Batal</Button><Button type="submit"><Filter aria-hidden="true" /> Terapkan filter</Button></div>
 </form>
 {/snippet}
</Modal>
{/if}

<style>
.task-board { display:flex; gap:16px; overflow-x:auto; align-items:stretch; background:var(--muted); padding:16px; border-radius:12px; max-width:100%; }
.task-column { position:relative; display:flex; flex-direction:column; flex:0 0 292px; min-width:0; background:var(--muted); }
.column-scroll { flex:1; min-height:140px; max-height:70vh; overflow-y:auto; padding:0 4px 4px; }
.column-heading { position:sticky; top:0; z-index:1; background:var(--muted); display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 2px 16px; font-size:13px; }
.card-title { font-size:14px; font-weight:600; }
.tasks-page :global(.card-open > span) { font-size:12px; }
.tasks-page :global(.task-card) { transition:transform 140ms cubic-bezier(.2,.8,.2,1), opacity 140ms ease, box-shadow 140ms ease; }
.tasks-page :global(.task-card[draggable="true"] .card-open) { cursor:grab; }
.tasks-page :global(.card-pressed) { transform:scale(.97); box-shadow:0 2px 6px color-mix(in srgb, var(--foreground) 8%, transparent); }
.tasks-page :global(.card-pressed .card-open) { cursor:grabbing; }
.tasks-page :global(.card-dragging) { transform:scale(.98); opacity:.4; }
:global(.task-drag-preview) {
    position:fixed; left:-10000px; top:0; margin:0; pointer-events:none;
    transform:translateY(-6px) rotate(-1deg) scale(1.02); border-color:var(--primary);
    box-shadow:0 18px 36px color-mix(in srgb, var(--foreground) 20%, transparent), 0 4px 12px color-mix(in srgb, var(--primary) 18%, transparent);
}
:global(.task-drag-preview .card-open > span) { font-size:12px; }
.column-drop-overlay {
    --drop-color:var(--primary);
    position:absolute; inset:0; z-index:2; display:grid; place-items:center; padding:16px;
    border:2px dashed var(--drop-color); border-radius:10px; pointer-events:none;
    background:repeating-linear-gradient(135deg, color-mix(in srgb, var(--drop-color) 10%, transparent) 0 10px, color-mix(in srgb, var(--drop-color) 20%, transparent) 10px 12px), color-mix(in srgb, var(--card) 76%, transparent);
    animation:drop-overlay-in 140ms ease-out;
    transition:box-shadow 160ms ease, border-color 160ms ease;
}
.column-drop-overlay.active { box-shadow:inset 0 0 0 1px var(--drop-color), inset 0 0 28px color-mix(in srgb, var(--drop-color) 25%, transparent), 0 0 12px color-mix(in srgb, var(--drop-color) 30%, transparent); }
.column-drop-overlay.locked { --drop-color:var(--muted-foreground); }
.column-drop-overlay[data-drop-state="cancel"] { --drop-color:var(--destructive); }
.drop-message { display:flex; flex-direction:column; align-items:center; gap:8px; max-width:100%; padding:16px; border:1px solid color-mix(in srgb, var(--drop-color) 35%, var(--border)); border-radius:10px; background:var(--card); color:var(--drop-color); text-align:center; overflow-wrap:anywhere; transition:transform 160ms cubic-bezier(.2,.8,.2,1); }
.column-drop-overlay.active .drop-message { transform:translateY(-2px); }
.drop-message strong { font-size:16px; }
.drop-message span { font-size:12px; color:var(--foreground); }
@keyframes drop-overlay-in { from { opacity:0; } to { opacity:1; } }
@media (prefers-reduced-motion:reduce) {
    .tasks-page :global(.card-pressed), .tasks-page :global(.card-dragging), :global(.task-drag-preview), .column-drop-overlay.active .drop-message { transform:none; }
}
.card-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:16px; }



.applied { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.move-form { display:grid; gap:12px; }


.task-filters { align-items:end; }


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
.audit-columns,.audit-row { display:grid; grid-template-columns:minmax(90px,.7fr) minmax(0,1fr) minmax(0,1fr); gap:8px; padding:8px; border-bottom:1px solid var(--border); }
.audit-columns { color:var(--muted-foreground); font-size:.8rem; font-weight:600; }
.audit-row > * { min-width:0; overflow-wrap:anywhere; white-space:pre-wrap; }
.audit-row strong { font-weight:500; }
@media(max-width:620px) {  .detail-grid { grid-template-columns:minmax(0,1fr); } .audit-columns,.audit-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr); } .audit-columns span:first-child { display:none; } .audit-row strong { grid-column:1 / -1; } }
</style>
