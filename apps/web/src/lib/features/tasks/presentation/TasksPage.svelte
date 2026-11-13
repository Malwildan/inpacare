<script lang="ts">
import { goto, invalidateAll } from '$app/navigation';
import type { Tasks, TasksPageData, Task, TaskHistory, NewTask, BoardStatus, TaskBoard } from '$lib/features/tasks';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import Modal from '$lib/shared/ui/Modal.svelte';
import { Plus } from 'lucide-svelte';
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
    if (!canOperate(task)) return false;
    if (status === task.status) return !filtered;
    return (task.status === 'todo' && status === 'in_progress') || (task.status === 'in_progress' && status === 'done') || (coordinator && status === 'cancelled' && (task.status === 'todo' || task.status === 'in_progress'));
}
function statusLabel(status: string) { return statuses.find(([key]) => key === status)?.[1] ?? status; }
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
function dragOver(event: DragEvent, status: BoardStatus, before: string | null = null) { if (!dragTask || !allowed(dragTask, status) || before === dragTask.id) { dragTarget = null; return; } event.preventDefault(); dragTarget = { status, before: filtered ? null : before }; const el = (event.currentTarget as HTMLElement).closest<HTMLElement>('.task-column'); if (el) { const rect = el.getBoundingClientRect(); if (event.clientY < rect.top + 35) el.scrollTop -= 16; else if (event.clientY > rect.bottom - 35) el.scrollTop += 16; } const boardEl = document.querySelector('.task-board'); if (boardEl) { const b = boardEl.getBoundingClientRect(); if (event.clientX < b.left + 45) boardEl.scrollLeft -= 16; else if (event.clientX > b.right - 45) boardEl.scrollLeft += 16; } }
function drop(event: DragEvent) { event.preventDefault(); event.stopPropagation(); const task = dragTask; const target = dragTarget; dragTask = null; dragTarget = null; if (!task || !target) return; if (target.status === 'cancelled' && task.status !== 'cancelled') startMove(task, target.status, target.before); else void moveTask(task, target.status, target.before); }
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
async function removeTask() {
    const task = selected;
    if (!task) return;
    const reason = prompt('Alasan penghapusan logis:');
    if (!reason?.trim()) return;
    const removed = await submit(() => tasks.remove(task.id, { expectedVersion: task.version, reason }));
    if (removed && selected?.id === task.id) selected = null;
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
<section class="page-heading"><div><h1 class="page-title">Tugas Perawatan</h1><p class="page-subtitle">Tugas pasien dengan PIC, rentang waktu, prioritas, dan riwayat perubahan.</p></div>{#if coordinator}<button class="button primary" aria-expanded={creating} onclick={()=>{creating=!creating;error='';}}><Plus size={16} aria-hidden="true"/> Buat tugas</button>{/if}</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="success" role="status">{notice}</p>{/if}

{#if creating&&coordinator}<section class="panel form-panel"><h2>Buat tugas perawatan</h2><form class="form-grid" onsubmit={createTask}>
	<label class="field">Penempatan pasien<select name="placementId" required><option value="">Pilih pasien / ruangan</option>{#each placements as p}<option value={p.id}>{p.patientName} · {p.roomName} ({p.startsOn}–{p.endsOn})</option>{/each}</select></label>
	<label class="field">Perawat PIC<select name="picId" required><option value="">Pilih PIC aktif</option>{#each data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active) as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label>
	<label class="field">Judul<input name="title" required maxlength="150" /></label><label class="field">Prioritas<select name="priority"><option value="normal">Normal</option><option value="high">Tinggi</option><option value="low">Rendah</option></select></label>
	<label class="field">Waktu mulai<input name="startsAt" type="datetime-local" required /></label><label class="field">Waktu selesai<input name="endsAt" type="datetime-local" required /></label>
	<label class="field">Deskripsi<textarea name="description" rows="2"></textarea></label><label class="field">Catatan awal<textarea name="notes" rows="2"></textarea></label>
	<div class="form-actions"><button class="button primary" disabled={busy}>Simpan tugas</button><button class="button secondary" type="button" onclick={()=>creating=false}>Batal</button></div>
</form></section>{/if}
<section class="panel filter-panel"><form class="filters task-filters" onsubmit={(event)=>{event.preventDefault();void filterTasks();}}><label class="field search-field">Cari tugas atau pasien<input type="search" bind:value={search} placeholder="Nama pasien, nomor RM, judul tugas" /></label><details class="advanced"><summary>Filter lanjutan</summary><div class="filters"><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option>{#each statuses as [key,label]}<option value={key}>{label}</option>{/each}</select></label><label class="field">Prioritas<select bind:value={priorityFilter}><option value="">Semua prioritas</option><option value="high">Tinggi</option><option value="normal">Normal</option><option value="low">Rendah</option></select></label><label class="field">Ruangan<select bind:value={roomFilter}><option value="">Semua ruangan</option>{#each data.reference.rooms as room}<option value={room.id}>{room.name}</option>{/each}</select></label><label class="field">Pasien<select bind:value={patientFilter}><option value="">Semua pasien</option>{#each data.reference.patients as patient}<option value={patient.id}>{patient.name}</option>{/each}</select></label><label class="field">PIC<select bind:value={picFilter}><option value="">Semua PIC</option>{#each data.reference.staff.filter((s)=>s.role==='PERAWAT') as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label><label class="field">Dari tanggal<input type="date" bind:value={fromFilter}/></label><label class="field">Sampai tanggal<input type="date" bind:value={toFilter}/></label></div></details><button class="button" type="submit">Terapkan filter</button></form>{#if filtered}<div class="applied"><span>Filter aktif:</span>{#each Object.entries(data.filters).filter(([,value])=>value) as [key,value]}<button class="button small" onclick={()=>{ const q = new URLSearchParams(window.location.search); q.delete(key); q.delete('page'); void goto(`/tasks?${q}`, { keepFocus: true, noScroll: true }); }}>{key}: {value} - Hapus</button>{/each}<button class="text-link" onclick={()=>goto('/tasks')}>Hapus semua</button></div>{/if}</section>
<div class="task-board" role="region" aria-label="Papan tugas perawatan" ondragleave={(event)=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) dragTarget=null;}}>
 {#each statuses as [key,label]}
  {@const status = key as BoardStatus}
  {@const column = board[status]}
  <section class="task-column" aria-label={label} ondragover={(e)=>dragOver(e,status)} ondrop={drop}>
   <div class="column-heading" tabindex="-1" id={`heading-${status}`}><strong>{label}</strong><span>{column.error ? 'Gagal dimuat' : `${column.items.length} / ${column.total}`}</span></div>
   {#if column.filtered}<p class="empty">Disembunyikan oleh filter status.</p>
   {:else}
    {#each column.items as task (task.id)}
     {#if dragTarget?.status===status && dragTarget.before===task.id}<div class="drop-marker" aria-label="Posisi penyisipan"></div>{/if}
     <article class:dragging={dragTask?.id===task.id} class="task-card" draggable={canOperate(task) && !pending.includes(task.id)} ondragstart={(e)=>dragStart(e,task)} ondragend={endDrag} ondragover={(e)=>{e.stopPropagation();dragOver(e,status,task.id);}} ondrop={drop}>
      <button id={`task-${task.id}`} class="card-open" onclick={(event)=>openCard(task,event)}><strong class="card-title">{task.title}</strong><span>{task.patientName} - {task.roomName}</span><span class="badge {task.priority}">Prioritas {task.priority==='high'?'Tinggi':task.priority==='low'?'Rendah':'Normal'}</span><span>{local(task.startsAt)} - {local(task.endsAt)}</span><span>PIC: {task.picName}</span></button>
      {#if pending.includes(task.id)}<p role="status">Menyimpan...</p>{:else if canOperate(task) && statuses.some(([key])=>allowed(task,key as BoardStatus))}<button class="button small move-button" onclick={()=>startMove(task)}>Pindahkan</button>{/if}
     </article>
    {:else}{#if !column.error}<p class="empty">Tidak ada tugas.</p>{/if}{/each}
    {#if dragTarget?.status===status && !dragTarget.before}<div class="drop-marker" aria-label="Posisi penyisipan di akhir"></div>{/if}
    {#if column.error}<p class="error" role="alert">Daftar gagal dimuat. <button class="text-link" onclick={()=>loadMore(status)}>Coba lagi</button></p>{:else if column.items.length < column.total}<button class="button small" disabled={loading.includes(status)} onclick={()=>loadMore(status)}>{loading.includes(status) ? 'Memuat...' : 'Muat lebih banyak'}</button>{/if}
    {#if status==='todo' && coordinator}<button class="button small add-card" onclick={()=>{creating=true;error='';}}>+ Tambah tugas</button>{/if}
   {/if}
  </section>
 {/each}
</div>
<p class="muted">Tugas hanya dapat maju ke tahap berikutnya; tugas selesai atau dibatalkan tidak dapat dibuka kembali.{#if filtered} Urutan dinonaktifkan saat filter aktif. Perpindahan status ditambahkan di akhir daftar.{/if}</p>
{#if moving}<Modal title={`Pindahkan ${moving.title}`} onclose={()=>moving=null}><form class="move-form" onsubmit={confirmMove}><label class="field">Status tujuan<select bind:value={destination} onchange={()=>beforeId=''}>{#each statuses as [key,label]}{#if allowed(moving,key as BoardStatus)}<option value={key}>{label}</option>{/if}{/each}</select></label>{#if !filtered}<label class="field">Posisi<select bind:value={beforeId}><option value="">Akhir daftar</option>{#each board[destination].items.filter(t=>t.id!==moving?.id) as anchor}<option value={anchor.id}>Sebelum {anchor.title}</option>{/each}</select></label>{:else}<p class="muted">Hapus filter untuk mengatur posisi.</p>{/if}{#if destination==='cancelled' && moving.status!=='cancelled'}<label class="field">Alasan pembatalan<textarea bind:value={reason} required maxlength="500"></textarea></label><p>Konfirmasi pembatalan tugas ini.</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<div class="card-actions"><button class="button primary" disabled={pending.includes(moving.id)}>Konfirmasi pindahkan</button><button class="button secondary" type="button" onclick={()=>moving=null}>Batal</button></div></form></Modal>{/if}
{#if selected}<Modal title={selected.title} onclose={closeDetail}><p class="task-context">{selected.patientName} · {selected.roomName} · {selected.picName}</p><p><strong>Status:</strong> {statusLabel(selected.status)} - <strong>Prioritas:</strong> {selected.priority}</p>{#if canOperate(selected) && statuses.some(([key])=>allowed(selected!,key as BoardStatus))}<button class="button small" onclick={()=>selected&&startMove(selected)}>Pindahkan</button>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<p>{selected.description||'Tidak ada deskripsi.'}</p><p><strong>Pembuat:</strong> {selected.createdByName}</p><p><strong>Catatan:</strong> {selected.notes||'Belum ada catatan.'}</p><p class="muted">{local(selected.startsAt)} – {local(selected.endsAt)} · versi {selected!.version}</p>
	{#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}<details class="edit-task"><summary class="text-link">Ubah detail tugas</summary><form class="form-grid" onsubmit={updateTask}><label class="field">Judul<input name="title" value={selected.title} required maxlength="150"/></label><label class="field">Prioritas<select name="priority" value={selected.priority}><option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Tinggi</option></select></label><label class="field">Mulai<input name="startsAt" type="datetime-local" value={localInput(selected.startsAt)} required/></label><label class="field">Selesai<input name="endsAt" type="datetime-local" value={localInput(selected.endsAt)} required/></label><label class="field full">Deskripsi<textarea name="description" rows="3">{selected.description}</textarea></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan detail</button></div></form></details>{/if}
	{#if data.user.id===selected.picId||coordinator}<form class="inline-edit" onsubmit={addNote}><label class="field">Catatan tindakan<textarea name="notes" rows="2" maxlength="3000" required>{selected.notes}</textarea></label><button class="button secondary small" disabled={busy}>Simpan catatan</button></form>{/if}
	{#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}<form class="inline-edit" onsubmit={reassign}><label class="field">Alihkan ke perawat<select name="picId" required>{#each data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active&&u.id!==selected?.picId) as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label><label class="field">Alasan pengalihan<input name="reason" required maxlength="500" /></label><button class="button secondary small" disabled={busy}>Alihkan PIC</button></form><div class="card-actions"><button class="button danger small" disabled={busy||selected.status==='cancelled'} onclick={()=>selected&&changeStatus(selected,'cancelled')}>Batalkan dengan alasan</button><button class="button danger small" disabled={busy} onclick={removeTask}>Hapus logis dengan alasan</button></div>{/if}
	<h3>Riwayat tugas</h3><ol class="history-list">{#each history as item}<li><strong>{item.action}</strong> · {item.actorName} <time>{local(item.createdAt)}</time>{#if item.reason}<p>{item.reason}</p>{/if}<details><summary>Nilai sebelum dan sesudah</summary><p>Sebelum</p><pre class="audit-values">{JSON.stringify(item.before,null,2)}</pre><p>Sesudah</p><pre class="audit-values">{JSON.stringify(item.after,null,2)}</pre></details></li>{:else}<li class="muted">Belum ada riwayat.</li>{/each}</ol></Modal>{/if}

<style>
.audit-values { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; font-size: 0.8rem; }
.task-board{display:flex;gap:12px;overflow-x:auto;align-items:flex-start;background:#eaf0ef;padding:12px;border-radius:12px;max-width:100%}
.task-column{flex:0 0 292px;min-width:0;min-height:140px;max-height:70vh;overflow-y:auto;background:#f2f5f4;border-radius:12px;padding:10px}
.column-heading{position:sticky;top:-10px;z-index:1;background:#f2f5f4;display:flex;justify-content:space-between;gap:8px;padding:10px 2px;font-size:13px}.column-heading span{color:var(--muted)}
.task-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;overflow-wrap:anywhere}.task-card.dragging{opacity:.5}.card-open{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:2px}.card-open span{font-size:12px}.card-title{font-size:14px}.card-open:focus-visible{outline:2px solid var(--primary, #16745c);outline-offset:3px}.move-button{margin-top:8px}.drop-marker{height:48px;border:2px dashed #397b6a;border-radius:8px;margin-bottom:8px}.card-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}.filter-panel{padding:12px}.advanced{min-width:0}.advanced summary{cursor:pointer}.advanced .filters{margin-top:12px}.applied{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.applied .button{white-space:normal;overflow-wrap:anywhere;text-align:left;max-width:100%;min-width:0}.move-form{display:grid;gap:12px}.add-card{margin-top:8px}
.task-context{margin:-8px 0 20px;font-size:13px}.edit-task{margin:20px 0;border-top:1px solid var(--border);padding-top:14px}.edit-task summary{cursor:pointer}.task-filters{align-items:end}
.inline-edit{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:20px 0}
.inline-edit .field{flex:1;min-width:0}
.history-list{padding-left:20px}
.history-list li{padding:10px 0;border-bottom:1px solid var(--border);font-size:13px}
.history-list time{display:block;color:var(--muted);font-size:12px;margin-top:4px}
.history-list p{margin:4px 0}

@media(max-width:620px){.inline-edit{align-items:stretch;flex-direction:column}}
</style>
