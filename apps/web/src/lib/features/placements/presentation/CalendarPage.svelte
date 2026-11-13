<script lang="ts">
import { invalidateAll, goto } from '$app/navigation';
import type { Placements, CalendarPageData, Placement } from '$lib/features/placements';
import { todayJakarta } from '$lib/features/placements';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-svelte';
let { data, placementService }: {
    data: CalendarPageData;
    placementService: Placements;
} = $props();
let roomFilter = $state('');
let placing = $state(false);
let editingPlacement = $state<Placement | null>(null);
let busy = $state(false);
let error = $state('');
let success = $state('');
let rooms = $derived(data.rooms.filter((room) => !roomFilter || room.id === roomFilter));
let dates = $derived(Array.from({ length: 7 }, (_, i) => {
    const day = new Date(data.from + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + i);
    return day;
}));
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dayLabel = (date: Date) => new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' }).format(date);
const titleDate = (date: Date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
const dayPlacements = (roomId: string, day: Date) => data.placements.filter((p) => p.roomId === roomId && p.startsOn <= iso(day) && p.endsOn >= iso(day));
async function moveWeek(delta: number) {
    const next = new Date(data.from + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + delta * 7);
    await goto('/calendar?from=' + iso(next));
}
async function place(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    success = '';
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
        await placementService.create({ patientId: formText(form, 'patientId'), roomId: formText(form, 'roomId'), startsOn: formText(form, 'startsOn'), endsOn: formText(form, 'endsOn') });
        await invalidateAll();
        placing = false;
        success = 'Penempatan berhasil disimpan.';
    }
    catch (e) {
        error = sessionFailure(e);
    }
    finally {
        busy = false;
    }
}
async function mutatePlacement(operation: () => Promise<unknown>) { busy = true; error = ''; success = ''; try {
    await operation();
    await invalidateAll();
    editingPlacement = null;
    success = 'Perubahan penempatan berhasil disimpan.';
}
catch (e) {
    error = sessionFailure(e);
}
finally {
    busy = false;
} }
async function cancelPlacement(p: Placement) { if (!confirm(`Batalkan penempatan ${p.patientName} di ${p.roomName}?`))
    return; await mutatePlacement(() => placementService.cancel(p.id, { expectedVersion: p.version })); }
async function reschedule(event: SubmitEvent, p: Placement) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); await mutatePlacement(() => placementService.update(p.id, { patientId: p.patientId, roomId: p.roomId, startsOn: formText(f, 'startsOn'), endsOn: formText(f, 'endsOn'), expectedVersion: p.version })); }
</script>

<svelte:head><title>Kalender Ruangan | InpaCare</title></svelte:head>
<section class="page-heading">
	<div><h1 class="page-title">Kalender Ruangan</h1><p class="page-subtitle">Pantau ketersediaan dan durasi rawat inap setiap pasien.</p></div>
	{#if data.user.role === 'PERAWAT'}<button class="button primary" aria-expanded={placing} onclick={() => { placing=!placing; error=''; }}><Plus size={16} aria-hidden="true"/> Tempatkan pasien</button>{/if}
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}{#if success}<p class="success" role="status">{success}</p>{/if}
{#if placing && data.user.role === 'PERAWAT'}<section class="panel form-panel"><h2>Penempatan pasien</h2><p class="muted">Tanggal masuk dan keluar dihitung inklusif. Konflik kapasitas diperiksa saat disimpan.</p>
	<form class="form-grid" onsubmit={place}>
		<label class="field">Pasien<select name="patientId" required><option value="">Pilih pasien</option>{#each data.patients as patient}<option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>{/each}</select></label>
		<label class="field">Ruangan<select name="roomId" required><option value="">Pilih ruangan tersedia</option>{#each data.rooms.filter((r)=>r.status==='available') as room}<option value={room.id}>{room.name} · {room.roomClass} · kapasitas {room.capacity}</option>{/each}</select></label>
		<label class="field">Tanggal masuk<input name="startsOn" type="date" value={data.from} required /></label>
		<label class="field">Tanggal keluar<input name="endsOn" type="date" value={data.to} required /></label>
		<div class="form-actions"><button class="button primary" disabled={busy}>{busy ? 'Menyimpan penempatan…' : 'Simpan penempatan'}</button><button class="button secondary" type="button" onclick={() => placing=false}>Batal</button></div>
	</form>
</section>{/if}
<section class="panel">
	<div class="filters">
		<label class="field room-filter">Filter jadwal ruangan<select bind:value={roomFilter}><option value="">Semua ruangan</option>{#each data.rooms as room}<option value={room.id}>{room.name}</option>{/each}</select></label>
		<div class="week-navigation" aria-label="Navigasi kalender">
			<button class="icon-button" aria-label="Minggu sebelumnya" onclick={() => void moveWeek(-1)}><ChevronLeft size={18} aria-hidden="true"/></button>
			<strong>{titleDate(dates[0])} – {titleDate(dates[6])} {dates[6].getUTCFullYear()}</strong>
			<button class="button secondary small" onclick={() => void goto('/calendar')}>Hari ini</button>
			<button class="icon-button" aria-label="Minggu berikutnya" onclick={() => void moveWeek(1)}><ChevronRight size={18} aria-hidden="true"/></button>
		</div>
	</div>
	<div class="table-wrap calendar-wrap"><table class="calendar">
		<thead><tr><th class="room-head">Ruangan</th>{#each dates as day}<th class:today={iso(day)===todayJakarta()}><span>{dayLabel(day)}</span><strong>{titleDate(day)}</strong></th>{/each}</tr></thead>
		<tbody>{#each rooms as room (room.id)}
			<tr><th scope="row" class="room-name"><strong>{room.name} · {room.id}</strong><span>{room.roomClass} · kapasitas {room.capacity}</span></th>
			{#each dates as day}
				<td>
					{#if room.status!=='available'}<span class="room-unavailable">Maintenance</span>
					{:else if dayPlacements(room.id,day).length===0}<span class="free">Tersedia</span>
					{:else}<div class="day-bookings">{#each dayPlacements(room.id,day) as p (p.id)}
						<div class="booking" class:start={p.startsOn===iso(day)} class:end={p.endsOn===iso(day)} title={p.patientName+' · '+p.startsOn+' – '+p.endsOn}>
							<strong>{p.patientName}</strong>
							{#if p.startsOn===iso(day) || p.endsOn===iso(day)}<small>{titleDate(new Date(p.startsOn+'T00:00:00Z'))} – {titleDate(new Date(p.endsOn+'T00:00:00Z'))}</small>{/if}
						</div>
					{/each}</div>{/if}
				</td>
			{/each}</tr>
		{:else}<tr><td class="empty" colspan="8">Belum ada data ruangan.</td></tr>{/each}</tbody>
	</table></div>
	<div class="legend"><span><i class="dot available-dot"></i>Tersedia</span><span><i class="dot occupied-dot"></i>Occupied</span><span><i class="dot maintenance-dot"></i>Maintenance</span></div>
	<p class="footnote">Rentang tanggal bersifat inklusif. Penempatan baru divalidasi kembali terhadap kapasitas dan jadwal pasien ketika disimpan.</p>
</section>
{#if data.user?.role==='PERAWAT'}<section class="panel placement-list"><div class="panel-header"><div><h2>Kelola penempatan</h2><p class="muted">Jadwal aktif dapat diubah atau dibatalkan. Pembatalan ditolak bila masih memiliki dependensi.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pasien</th><th>Ruangan</th><th>Periode</th><th>Aksi</th></tr></thead><tbody>{#each data.placements as placement (placement.id)}<tr><td><strong>{placement.patientName}</strong><span class="cell-meta">{placement.medicalRecordNo}</span></td><td>{placement.roomName}</td><td>{placement.startsOn} – {placement.endsOn}</td><td><div class="actions"><button class="button secondary small" aria-expanded={editingPlacement?.id===placement.id} onclick={()=>editingPlacement=editingPlacement?.id===placement.id?null:placement}>Ubah tanggal</button><button class="button danger small" disabled={busy||placement.status!=='active'} onclick={()=>void cancelPlacement(placement)}>Batalkan</button></div></td></tr>{#if editingPlacement?.id===placement.id}<tr><td colspan="4"><form class="form-grid" onsubmit={(event)=>reschedule(event,placement)}><label class="field">Pasien<input value={placement.patientName} disabled/></label><label class="field">Ruangan<input value={placement.roomName} disabled/></label><label class="field">Tanggal masuk<input name="startsOn" type="date" value={placement.startsOn} required/></label><label class="field">Tanggal keluar<input name="endsOn" type="date" value={placement.endsOn} required/></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan jadwal</button><button class="button secondary" type="button" onclick={()=>editingPlacement=null}>Batal</button></div></form></td></tr>{/if}{:else}<tr><td colspan="4" class="empty">Tidak ada penempatan di rentang minggu ini.</td></tr>{/each}</tbody></table></div></section>{/if}
<style>
	.form-panel h2{margin-bottom:8px}
	.form-panel p{margin-bottom:20px;font-size:13px}
	.filters{justify-content:space-between;gap:20px}
	.room-filter{min-width:180px;max-width:300px}
	.actions{display:flex;gap:8px;flex-wrap:wrap}.cell-meta{display:block;color:var(--muted);font-size:12px;margin-top:4px}.placement-list{margin-top:24px}
	.week-navigation{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
	.week-navigation strong{font-size:14px;white-space:nowrap}
	.calendar{width:100%;border-collapse:separate;border-spacing:0;min-width:1120px;table-layout:fixed}
	.calendar th,.calendar td{border-bottom:1px solid var(--border);border-right:1px solid var(--border);text-align:left;vertical-align:top;padding:12px 10px}
	.calendar thead th{background:var(--background);font-size:12px;font-weight:500;color:var(--muted)}
	.calendar thead th span,.calendar thead th strong{display:block}
	.calendar thead th strong{font-size:14px;color:var(--text);margin-top:4px}
	.calendar .room-head,.calendar .room-name{width:176px;position:sticky;left:0;z-index:1}
	.calendar .room-name{background:var(--surface)}
	.room-name strong,.room-name span{display:block}
	.room-name strong{font-size:13px;font-weight:600}
	.room-name span{margin-top:6px;color:var(--muted);font-size:12px;font-weight:400}
	.calendar td{height:96px;background:var(--surface)}
	.calendar .today{background:var(--primary-soft)}
	.free{color:#28643f;font-size:12px}
	.room-unavailable{color:var(--muted);font-size:12px}
	.day-bookings{display:flex;flex-direction:column;gap:6px}
	.booking{padding:8px;border:1px solid transparent;border-radius:6px;background:var(--primary-soft);color:var(--primary);min-height:34px;overflow:hidden;font-size:12px}
	.booking.start,.booking.end{border-color:var(--border)}
	.booking strong,.booking small{display:block;overflow-wrap:anywhere}
	.booking small{font-size:12px;margin-top:4px}
	.legend{display:flex;flex-wrap:wrap;gap:20px;margin:20px 0 12px;font-size:12px;color:var(--muted)}
	.legend span{display:flex;align-items:center;gap:8px}
	.dot{width:8px;height:8px;border-radius:50%}
	.available-dot{background:#3c8154}.occupied-dot{background:var(--primary)}.maintenance-dot{background:var(--muted)}
	.footnote{font-size:12px;max-width:80ch}
	@media(max-width:1000px){.filters{align-items:stretch;flex-direction:column}.room-filter{max-width:none}}
	@media(max-width:600px){.week-navigation{gap:4px}.week-navigation strong{font-size:13px}.room-filter{min-width:0}}
</style>
