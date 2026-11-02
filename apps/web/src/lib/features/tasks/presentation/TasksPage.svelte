<script lang="ts">
import { goto, invalidateAll } from '$app/navigation';
import type { Tasks, TasksPageData, Task, TaskHistory, NewTask, UpdateTask } from '$lib/features/tasks';
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
const visible = $derived(data.tasks);
async function filterTasks(nextPage = 0) { const q = new URLSearchParams({ page: String(nextPage) }); for (const [key, value] of Object.entries({ search: search.trim(), status: statusFilter, priority: priorityFilter, roomId: roomFilter, patientId: patientFilter, picId: picFilter, from: fromFilter, to: toFilter }))
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
async function changeStatus(task: Task, status: string) { const reason = status === 'cancelled' ? window.prompt('Alasan pembatalan tugas:')?.trim() : undefined; if (status === 'cancelled' && (!reason || !confirm('Batalkan tugas ini?')))
    return; if (await submit(() => tasks.update(task.id, { expectedVersion: task.version, status: status as UpdateTask['status'], reason })))
    await open(task.id); }
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
<section class="stats" aria-label="Ringkasan tugas">{#each statuses as [key,label]}<div class="stat"><strong>{data.counts[key]??0}</strong><span>{label}</span></div>{/each}</section>
{#if creating&&coordinator}<section class="panel form-panel"><h2>Buat tugas perawatan</h2><form class="form-grid" onsubmit={createTask}>
	<label class="field">Penempatan pasien<select name="placementId" required><option value="">Pilih pasien / ruangan</option>{#each placements as p}<option value={p.id}>{p.patientName} · {p.roomName} ({p.startsOn}–{p.endsOn})</option>{/each}</select></label>
	<label class="field">Perawat PIC<select name="picId" required><option value="">Pilih PIC aktif</option>{#each data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active) as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label>
	<label class="field">Judul<input name="title" required maxlength="150" /></label><label class="field">Prioritas<select name="priority"><option value="normal">Normal</option><option value="high">Tinggi</option><option value="low">Rendah</option></select></label>
	<label class="field">Waktu mulai<input name="startsAt" type="datetime-local" required /></label><label class="field">Waktu selesai<input name="endsAt" type="datetime-local" required /></label>
	<label class="field">Deskripsi<textarea name="description" rows="2"></textarea></label><label class="field">Catatan awal<textarea name="notes" rows="2"></textarea></label>
	<div class="form-actions"><button class="button primary" disabled={busy}>Simpan tugas</button><button class="button secondary" type="button" onclick={()=>creating=false}>Batal</button></div>
</form></section>{/if}
<section class="panel"><form class="filters task-filters" onsubmit={(event)=>{event.preventDefault();void filterTasks();}}><label class="field search-field">Cari tugas atau pasien<input type="search" bind:value={search} placeholder="Nama pasien, nomor RM, judul tugas" /></label><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option>{#each statuses as [key,label]}<option value={key}>{label}</option>{/each}</select></label><label class="field">Prioritas<select bind:value={priorityFilter}><option value="">Semua prioritas</option><option value="high">Tinggi</option><option value="normal">Normal</option><option value="low">Rendah</option></select></label><label class="field">Ruangan<select bind:value={roomFilter}><option value="">Semua ruangan</option>{#each data.reference.rooms as room}<option value={room.id}>{room.name}</option>{/each}</select></label><label class="field">Pasien<select bind:value={patientFilter}><option value="">Semua pasien</option>{#each data.reference.patients as patient}<option value={patient.id}>{patient.name}</option>{/each}</select></label><label class="field">PIC<select bind:value={picFilter}><option value="">Semua PIC</option>{#each data.reference.staff.filter((s)=>s.role==='PERAWAT') as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label><label class="field">Dari tanggal<input type="date" bind:value={fromFilter}/></label><label class="field">Sampai tanggal<input type="date" bind:value={toFilter}/></label><button class="button" type="submit">Terapkan filter</button></form></section>
<div class="panel-header board-toolbar"><span class="muted">Menampilkan {data.total?data.page*50+1:0}–{Math.min(data.page*50+50,data.total)} dari {data.total} tugas</span><div class="card-actions"><button class="button small" disabled={data.page===0} onclick={()=>filterTasks(data.page-1)}>Sebelumnya</button><button class="button small" disabled={(data.page+1)*50>=data.total} onclick={()=>filterTasks(data.page+1)}>Berikutnya</button></div></div>
<div class="task-board">
	{#each statuses as [key,label]}
		<section class="task-column" aria-label={label}>
			<div class="column-heading"><strong>{label}</strong><span>{visible.filter((t)=>t.status===key).length}</span></div>
			{#each visible.filter((t)=>t.status===key) as task (task.id)}
				<article class="task-card">
					<span class="badge {task.priority}">Prioritas {task.priority==='high'?'Tinggi':task.priority==='low'?'Rendah':'Normal'}</span>
					<h3>{task.title}</h3>
					<p><strong>{task.patientName}</strong> · {task.roomName}</p>
					<p class="muted">{local(task.startsAt)} – {local(task.endsAt)}</p>
					<p class="muted">PIC: {task.picName}</p>
					<div class="card-actions"><button class="text-link" onclick={()=>open(task)}>Riwayat / catatan</button>{#if task.status==='todo'&&task.picId===data.user.id}<button class="button primary small" disabled={busy} onclick={()=>changeStatus(task,'in_progress')}>Mulai</button>{:else if task.status==='in_progress'&&task.picId===data.user.id}<button class="button primary small" disabled={busy} onclick={()=>changeStatus(task,'done')}>Selesaikan</button>{/if}</div>
				</article>
			{:else}<p class="empty">Tidak ada tugas.</p>{/each}
		</section>
	{/each}
</div>
{#if selected}<Modal title={selected.title} onclose={()=>selected=null}><p class="task-context">{selected.patientName} · {selected.roomName} · {selected.picName}</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<p>{selected.description||'Tidak ada deskripsi.'}</p><p><strong>Pembuat:</strong> {selected.createdByName}</p><p><strong>Catatan:</strong> {selected.notes||'Belum ada catatan.'}</p><p class="muted">{local(selected.startsAt)} – {local(selected.endsAt)} · versi {selected!.version}</p>
	{#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}<details class="edit-task"><summary class="text-link">Ubah detail tugas</summary><form class="form-grid" onsubmit={updateTask}><label class="field">Judul<input name="title" value={selected.title} required maxlength="150"/></label><label class="field">Prioritas<select name="priority" value={selected.priority}><option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Tinggi</option></select></label><label class="field">Mulai<input name="startsAt" type="datetime-local" value={localInput(selected.startsAt)} required/></label><label class="field">Selesai<input name="endsAt" type="datetime-local" value={localInput(selected.endsAt)} required/></label><label class="field full">Deskripsi<textarea name="description" rows="3">{selected.description}</textarea></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan detail</button></div></form></details>{/if}
	{#if data.user.id===selected.picId||coordinator}<form class="inline-edit" onsubmit={addNote}><label class="field">Catatan tindakan<textarea name="notes" rows="2" maxlength="3000" required>{selected.notes}</textarea></label><button class="button secondary small" disabled={busy}>Simpan catatan</button></form>{/if}
	{#if coordinator&&selected.status!=='done'&&selected.status!=='cancelled'}<form class="inline-edit" onsubmit={reassign}><label class="field">Alihkan ke perawat<select name="picId" required>{#each data.reference.staff.filter((u)=>u.role==='PERAWAT'&&u.active&&u.id!==selected?.picId) as nurse}<option value={nurse.id}>{nurse.name}</option>{/each}</select></label><label class="field">Alasan pengalihan<input name="reason" required maxlength="500" /></label><button class="button secondary small" disabled={busy}>Alihkan PIC</button></form><div class="card-actions"><button class="button danger small" disabled={busy||selected.status==='cancelled'} onclick={()=>selected&&changeStatus(selected,'cancelled')}>Batalkan dengan alasan</button><button class="button danger small" disabled={busy} onclick={removeTask}>Hapus logis dengan alasan</button></div>{/if}
	<h3>Riwayat tugas</h3><ol class="history-list">{#each history as item}<li><strong>{item.action}</strong> · {item.actorName} <time>{local(item.createdAt)}</time>{#if item.reason}<p>{item.reason}</p>{/if}<details><summary>Nilai sebelum dan sesudah</summary><p>Sebelum</p><pre class="audit-values">{JSON.stringify(item.before,null,2)}</pre><p>Sesudah</p><pre class="audit-values">{JSON.stringify(item.after,null,2)}</pre></details></li>{:else}<li class="muted">Belum ada riwayat.</li>{/each}</ol></Modal>{/if}

<style>
.audit-values { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; font-size: 0.8rem; }
.task-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;align-items:start}
.task-column{min-width:0}
.column-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 12px;margin-bottom:16px;border-bottom:1px solid var(--border);font-size:13px}
.column-heading strong{font-weight:600}
.column-heading>span{color:var(--muted);font-variant-numeric:tabular-nums}
.task-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;overflow-wrap:anywhere}
.task-card h3{font-size:15px;line-height:1.45;margin:12px 0 8px}
.task-card p{font-size:12px;line-height:1.6;margin:6px 0}
.task-card p strong{color:var(--text);font-weight:500}
.card-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}
.card-actions .text-link{font-size:12px;padding:6px 0;min-height:32px}
.board-toolbar .card-actions{margin-top:0}
.task-context{margin:-8px 0 20px;font-size:13px}.edit-task{margin:20px 0;border-top:1px solid var(--border);padding-top:14px}.edit-task summary{cursor:pointer}.task-filters{align-items:end}
.inline-edit{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:20px 0}
.inline-edit .field{flex:1;min-width:0}
.history-list{padding-left:20px}
.history-list li{padding:10px 0;border-bottom:1px solid var(--border);font-size:13px}
.history-list time{display:block;color:var(--muted);font-size:12px;margin-top:4px}
.history-list p{margin:4px 0}
@media(max-width:1150px){.task-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.task-board{grid-template-columns:1fr}.board-toolbar{align-items:flex-start;flex-direction:column}.inline-edit{align-items:stretch;flex-direction:column}}
</style>
