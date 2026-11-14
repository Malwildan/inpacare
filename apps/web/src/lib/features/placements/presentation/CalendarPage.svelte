<script lang="ts">
import * as AlertDialog from '$lib/shared/ui/alert-dialog/index.js';
import { Alert, AlertDescription } from '$lib/shared/ui/alert/index.js';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import { NativeSelect, NativeSelectOption } from '$lib/shared/ui/native-select/index.js';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
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
let cancelling = $state<Placement | null>(null);
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
async function cancelPlacement(p: Placement) {
    if (busy) return;
    await mutatePlacement(() => placementService.cancel(p.id, { expectedVersion: p.version }));
    if (!error) cancelling = null;
}
async function reschedule(event: SubmitEvent, p: Placement) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); await mutatePlacement(() => placementService.update(p.id, { patientId: p.patientId, roomId: p.roomId, startsOn: formText(f, 'startsOn'), endsOn: formText(f, 'endsOn'), expectedVersion: p.version })); }
</script>

<svelte:head><title>Kalender Ruangan | InpaCare</title></svelte:head>
<div class="placement-page flex min-w-0 flex-col gap-6">
<section class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	<div><h1 class="page-title">Kalender Ruangan</h1><p class="page-subtitle">Pantau ketersediaan dan durasi rawat inap setiap pasien.</p></div>
	{#if data.user.role === 'PERAWAT'}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline" aria-expanded={placing} onclick={() => { placing=!placing; error=''; }}><Plus size={16} aria-hidden="true"/> Tempatkan pasien</Button>{/if}
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}{#if success}<p class="success" role="status">{success}</p>{/if}
{#if placing && data.user.role === 'PERAWAT'}<Card class="gap-4 p-5 sm:p-6 form-panel"><h2>Penempatan pasien</h2><p class="muted">Tanggal masuk dan keluar dihitung inklusif. Konflik kapasitas diperiksa saat disimpan.</p>
	<form aria-label="Penempatan pasien" class="form-grid" onsubmit={place}>
		<label class="field">Pasien<NativeSelect name="patientId" required><NativeSelectOption value="">Pilih pasien</NativeSelectOption>{#each data.patients as patient}<NativeSelectOption value={patient.id}>{patient.name} · {patient.medicalRecordNo}</NativeSelectOption>{/each}</NativeSelect></label>
		<label class="field">Ruangan<NativeSelect name="roomId" required><NativeSelectOption value="">Pilih ruangan tersedia</NativeSelectOption>{#each data.rooms.filter((r)=>r.status==='available') as room}<NativeSelectOption value={room.id}>{room.name} · {room.roomClass} · kapasitas {room.capacity}</NativeSelectOption>{/each}</NativeSelect></label>
		<label class="field">Tanggal masuk<Input class="h-11 text-base md:text-sm" name="startsOn" type="date" value={data.from} required /></label>
		<label class="field">Tanggal keluar<Input class="h-11 text-base md:text-sm" name="endsOn" type="date" value={data.to} required /></label>
		<div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}>{busy ? 'Menyimpan penempatan…' : 'Simpan penempatan'}</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={() => placing=false}>Batal</Button></div>
	</form>
</Card>{/if}
<Card class="gap-4 p-5 sm:p-6 ">
	<div class="filters">
		<label class="field room-filter">Filter jadwal ruangan<NativeSelect bind:value={roomFilter}><NativeSelectOption value="">Semua ruangan</NativeSelectOption>{#each data.rooms as room}<NativeSelectOption value={room.id}>{room.name}</NativeSelectOption>{/each}</NativeSelect></label>
		<div class="week-navigation" aria-label="Navigasi kalender">
			<Button variant="ghost" class="size-11 p-2 no-underline hover:no-underline" aria-label="Minggu sebelumnya" onclick={() => void moveWeek(-1)}><ChevronLeft size={18} aria-hidden="true"/></Button>
			<strong>{titleDate(dates[0])} – {titleDate(dates[6])} {dates[6].getUTCFullYear()}</strong>
			<Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" onclick={() => void goto('/calendar')}>Hari ini</Button>
			<Button variant="ghost" class="size-11 p-2 no-underline hover:no-underline" aria-label="Minggu berikutnya" onclick={() => void moveWeek(1)}><ChevronRight size={18} aria-hidden="true"/></Button>
		</div>
	</div>
	<div class="table-wrap calendar-wrap"><Table class="calendar">
		<TableHeader><TableRow><TableHead class="room-head">Ruangan</TableHead>{#each dates as day}<TableHead class={iso(day) === todayJakarta() ? 'today' : ''}><span>{dayLabel(day)}</span><strong>{titleDate(day)}</strong></TableHead>{/each}</TableRow></TableHeader>
		<TableBody>{#each rooms as room (room.id)}
			<TableRow><TableHead scope="row" class="room-name"><strong>{room.name} · {room.id}</strong><span>{room.roomClass} · kapasitas {room.capacity}</span></TableHead>
			{#each dates as day}
				<TableCell>
					{#if room.status!=='available'}<span class="room-unavailable">Maintenance</span>
					{:else if dayPlacements(room.id,day).length===0}<span class="free">Tersedia</span>
					{:else}<div class="day-bookings">{#each dayPlacements(room.id,day) as p (p.id)}
						<div class="booking" class:start={p.startsOn===iso(day)} class:end={p.endsOn===iso(day)} title={p.patientName+' · '+p.startsOn+' – '+p.endsOn}>
							<strong>{p.patientName}</strong>
							{#if p.startsOn===iso(day) || p.endsOn===iso(day)}<small>{titleDate(new Date(p.startsOn+'T00:00:00Z'))} – {titleDate(new Date(p.endsOn+'T00:00:00Z'))}</small>{/if}
						</div>
					{/each}</div>{/if}
				</TableCell>
			{/each}</TableRow>
		{:else}<TableRow><TableCell class="empty" colspan={8}>Belum ada data ruangan.</TableCell></TableRow>{/each}</TableBody>
	</Table></div>
	<div class="legend"><span><i class="dot available-dot"></i>Tersedia</span><span><i class="dot occupied-dot"></i>Occupied</span><span><i class="dot maintenance-dot"></i>Maintenance</span></div>
	<p class="footnote">Rentang tanggal bersifat inklusif. Penempatan baru divalidasi kembali terhadap kapasitas dan jadwal pasien ketika disimpan.</p>
</Card>
{#if data.user?.role==='PERAWAT'}<Card class="gap-4 p-5 sm:p-6 placement-list"><div class="panel-header"><div><h2>Kelola penempatan</h2><p class="muted">Jadwal aktif dapat diubah atau dibatalkan. Pembatalan ditolak bila masih memiliki dependensi.</p></div></div><div class="table-wrap"><Table class="data-table"><TableHeader><TableRow><TableHead>Pasien</TableHead><TableHead>Ruangan</TableHead><TableHead>Periode</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{#each data.placements as placement (placement.id)}<TableRow><TableCell><strong>{placement.patientName}</strong><span class="cell-meta">{placement.medicalRecordNo}</span></TableCell><TableCell>{placement.roomName}</TableCell><TableCell>{placement.startsOn} – {placement.endsOn}</TableCell><TableCell><div class="actions"><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" aria-expanded={editingPlacement?.id===placement.id} onclick={()=>editingPlacement=editingPlacement?.id===placement.id?null:placement}>Ubah tanggal</Button><Button variant="destructive" class="h-11 px-4 no-underline hover:no-underline" disabled={busy||placement.status!=='active'} onclick={()=>{ error=''; cancelling=placement; }}>Batalkan</Button></div></TableCell></TableRow>{#if editingPlacement?.id===placement.id}<TableRow><TableCell colspan={4}><form class="form-grid" onsubmit={(event)=>reschedule(event,placement)}><label class="field">Pasien<Input class="h-11 text-base md:text-sm" value={placement.patientName} disabled/></label><label class="field">Ruangan<Input class="h-11 text-base md:text-sm" value={placement.roomName} disabled/></label><label class="field">Tanggal masuk<Input class="h-11 text-base md:text-sm" name="startsOn" type="date" value={placement.startsOn} required/></label><label class="field">Tanggal keluar<Input class="h-11 text-base md:text-sm" name="endsOn" type="date" value={placement.endsOn} required/></label><div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}>Simpan jadwal</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={()=>editingPlacement=null}>Batal</Button></div></form></TableCell></TableRow>{/if}{:else}<TableRow><TableCell colspan={4} class="empty">Tidak ada penempatan di rentang minggu ini.</TableCell></TableRow>{/each}</TableBody></Table></div></Card>{/if}
</div>
<AlertDialog.Root open={cancelling !== null} onOpenChange={(open) => { if (!open && !busy) cancelling = null; }}>
    <AlertDialog.Content onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}>
        <AlertDialog.Header>
            <AlertDialog.Title>Batalkan penempatan?</AlertDialog.Title>
            <AlertDialog.Description>Batalkan penempatan {cancelling?.patientName} di {cancelling?.roomName}? Ketergantungan dan versi data akan diperiksa saat disimpan.</AlertDialog.Description>
        </AlertDialog.Header>
        {#if error}<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>{/if}
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={busy}>Kembali</AlertDialog.Cancel>
            <AlertDialog.Action disabled={busy} variant="destructive" onclick={(event) => { event.preventDefault(); if (cancelling) void cancelPlacement(cancelling); }}>
                {busy ? 'Membatalkan…' : 'Konfirmasi pembatalan'}
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
<style>
.placement-page :global(.form-panel h2){margin-bottom:8px}
.placement-page :global(.form-panel p){margin-bottom:20px;font-size:13px}
.placement-page :global(.filters){justify-content:space-between;gap:20px}
.placement-page :global(.room-filter){min-width:180px;max-width:300px}
.placement-page :global(.actions){display:flex;gap:8px;flex-wrap:wrap}
.placement-page :global(.cell-meta){display:block;color:var(--muted-foreground);font-size:12px;margin-top:4px}
.placement-page :global(.placement-list){margin-top:24px}
.placement-page :global(.week-navigation){display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.placement-page :global(.week-navigation strong){font-size:14px;white-space:nowrap}
.placement-page :global(.calendar){width:100%;border-collapse:separate;border-spacing:0;min-width:1120px;table-layout:fixed}
.placement-page :global(.calendar th),.placement-page :global(.calendar td){border-bottom:1px solid var(--border);border-right:1px solid var(--border);text-align:left;vertical-align:top;padding:12px 10px}
.placement-page :global(.calendar thead th){background:var(--background);font-size:12px;font-weight:500;color:var(--muted-foreground)}
.placement-page :global(.calendar thead th span),.placement-page :global(.calendar thead th strong){display:block}
.placement-page :global(.calendar thead th strong){font-size:14px;color:var(--foreground);margin-top:4px}
.placement-page :global(.calendar .room-head),.placement-page :global(.calendar .room-name){width:176px;position:sticky;left:0;z-index:1}
.placement-page :global(.calendar .room-name){background:var(--card)}
.placement-page :global(.room-name strong),.placement-page :global(.room-name span){display:block}
.placement-page :global(.room-name strong){font-size:13px;font-weight:600}
.placement-page :global(.room-name span){margin-top:6px;color:var(--muted-foreground);font-size:12px;font-weight:400}
.placement-page :global(.calendar td){height:96px;background:var(--card)}
.placement-page :global(.calendar .today){background:var(--primary-soft)}
.placement-page :global(.free){color:#28643f;font-size:12px}
.placement-page :global(.room-unavailable){color:var(--muted-foreground);font-size:12px}
.placement-page :global(.day-bookings){display:flex;flex-direction:column;gap:6px}
.placement-page :global(.booking){padding:8px;border:1px solid transparent;border-radius:6px;background:var(--primary-soft);color:var(--primary);min-height:34px;overflow:hidden;font-size:12px}
.placement-page :global(.booking.start),.placement-page :global(.booking.end){border-color:var(--border)}
.placement-page :global(.booking strong),.placement-page :global(.booking small){display:block;overflow-wrap:anywhere}
.placement-page :global(.booking small){font-size:12px;margin-top:4px}
.placement-page :global(.legend){display:flex;flex-wrap:wrap;gap:20px;margin:20px 0 12px;font-size:12px;color:var(--muted-foreground)}
.placement-page :global(.legend span){display:flex;align-items:center;gap:8px}
.placement-page :global(.dot){width:8px;height:8px;border-radius:50%}
.placement-page :global(.available-dot){background:#3c8154}
.placement-page :global(.occupied-dot){background:var(--primary)}
.placement-page :global(.maintenance-dot){background:var(--muted-foreground)}
.placement-page :global(.footnote){font-size:12px;max-width:80ch}
	@media(max-width:1000px){
.placement-page :global(.filters){align-items:stretch;flex-direction:column}
.placement-page :global(.room-filter){max-width:none}}
	@media(max-width:600px){
.placement-page :global(.week-navigation){gap:4px}
.placement-page :global(.week-navigation strong){font-size:13px}
.placement-page :global(.room-filter){min-width:0}}
</style>
