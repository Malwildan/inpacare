<script lang="ts">
import { date } from '$lib/shared/format';
import { toast } from '$lib/shared/ui/sonner/index.js';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import * as AlertDialog from '$lib/shared/ui/alert-dialog/index.js';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
import { invalidateAll, goto } from '$app/navigation';
import type { Placements, CalendarPageData, Placement, PlacementHistory } from '$lib/features/placements';
import { todayJakarta } from '$lib/features/placements';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, History, Pencil, Plus, Save, X } from 'lucide-svelte';
let { data, placementService, cycleId = '' }: {
    data: CalendarPageData;
    placementService: Placements;
    cycleId?: string;
} = $props();
let roomFilter = $state('');
let placing = $state(false);
let editingPlacement = $state<Placement | null>(null);
let cancelling = $state<Placement | null>(null);
let cancelReason = $state('');
let historyPlacement = $state<Placement | null>(null);
let history = $state<PlacementHistory[]>([]);
let canManage = $derived(data.user.role === 'PERAWAT' && data.user.coordinator);
let busy = $state(false);
let rooms = $derived(data.rooms.filter((room) => !roomFilter || room.id === roomFilter));
let dates = $derived(Array.from({ length: 7 }, (_, i) => {
    const day = new Date(data.from + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + i);
    return day;
}));
const calendarHref = (from?: string) => {
    const query = new URLSearchParams({ ...(from ? { from } : {}), ...(cycleId ? { cycle: cycleId } : {}) });
    return `/calendar${query.size ? '?' + query : ''}`;
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dayLabel = (date: Date) => new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' }).format(date);
const titleDate = (date: Date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
const dayPlacements = (roomId: string, day: Date) => data.placements.filter((p) => p.status === 'active' && p.roomId === roomId && p.startsOn <= iso(day) && p.endsOn >= iso(day));
async function moveWeek(delta: number) {
    const next = new Date(data.from + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + delta * 7);
    await goto(calendarHref(iso(next)));
}
async function place(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const toastId = toast.loading('Menyimpan penempatan…');
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
        await placementService.create({ patientId: formText(form, 'patientId'), roomId: formText(form, 'roomId'), startsOn: formText(form, 'startsOn'), endsOn: formText(form, 'endsOn') });
        placing = false;
        await invalidateAll().then(
            () => toast.success('Penempatan berhasil disimpan.', { id: toastId }),
            () => toast.warning('Penempatan tersimpan. Muat ulang kalender untuk melihat jadwal terbaru.', { id: toastId })
        );
    }
    catch (e) {
        toast.error(sessionFailure(e, 'save', 'penempatan'), { id: toastId });
    }
    finally {
        busy = false;
    }
}
async function mutatePlacement(operation: () => Promise<unknown>, message: string) {
    if (busy) return false;
    busy = true;
    const toastId = toast.loading('Menyimpan perubahan penempatan…');
    try {
        await operation();
        editingPlacement = null;
        await invalidateAll().then(
            () => toast.success(message, { id: toastId }),
            () => toast.warning(`${message} Muat ulang kalender untuk melihat jadwal terbaru.`, { id: toastId })
        );
        return true;
    } catch (e) {
        toast.error(sessionFailure(e, 'save', 'perubahan penempatan'), { id: toastId });
        return false;
    } finally {
        busy = false;
    }
}
async function cancelPlacement(p: Placement) {
    if (busy) return;
    if (await mutatePlacement(() => placementService.cancel(p.id, { expectedVersion: p.version, reason: cancelReason }), 'Penempatan dibatalkan.')) {
        cancelling = null;
        await showHistory(p);
    }
}
async function reschedule(event: SubmitEvent, p: Placement) {
    event.preventDefault();
    const f = new FormData(event.currentTarget as HTMLFormElement);
    await mutatePlacement(() => placementService.update(p.id, { patientId: p.patientId, roomId: formText(f, 'roomId'), startsOn: formText(f, 'startsOn'), endsOn: formText(f, 'endsOn'), expectedVersion: p.version, reason: formText(f, 'reason') }), 'Perubahan penempatan berhasil disimpan.');
}
async function showHistory(p: Placement) {
    if (busy) return;
    busy = true;
    try { history = await placementService.history(p.id); historyPlacement = p; }
    catch (e) { toast.error(sessionFailure(e, 'load', 'Riwayat penempatan')); }
    finally { busy = false; }
}
const roomLabel = (id: string) => data.rooms.find(room => room.id === id)?.name ?? id;
const historyDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value));
</script>

<svelte:head><title>Kalender penempatan | InpaCare</title></svelte:head>
<div class="placement-page flex min-w-0 flex-col gap-6">
<section class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	<h1 class="page-title">Kalender penempatan</h1>
    {#if cycleId}<Button href={`/dashboard?${new URLSearchParams({ cycleId })}`} variant="outline">Kembali ke rekap pasien</Button>{/if}
	{#if data.user.role === 'PERAWAT'}<Button variant="default" class="h-11 px-4 no-underline hover:no-underline" aria-haspopup="dialog" onclick={() => { placing=!placing; }}><Plus size={16} aria-hidden="true"/> Tempatkan pasien</Button>{/if}
</section>
{#if data.user.role === 'PERAWAT' && !canManage}<p class="text-sm text-muted-foreground">Anda dapat membuat penempatan awal. Hubungi koordinator untuk mengubah jadwal, memindahkan ruang, atau membatalkan penempatan.</p>{/if}

<Card class="gap-4 p-5 sm:p-6 ">
	<div class="filters">
		<label class="field room-filter">Filter jadwal ruangan<FormSelect bind:value={roomFilter} options={[{ value: "", label: "Semua ruangan" }, ...(data.rooms).map((room) => ({ value: room.id, label: (room.name) }))]} /></label>
		<div class="week-navigation" aria-label="Navigasi kalender">
			<Button variant="ghost" class="size-11 p-2 no-underline hover:no-underline" aria-label="Minggu sebelumnya" onclick={() => void moveWeek(-1)}><ChevronLeft size={18} aria-hidden="true"/></Button>
			<strong>{titleDate(dates[0])} – {titleDate(dates[6])} {dates[6].getUTCFullYear()}</strong>
			<Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" onclick={() => void goto(calendarHref())}>Hari ini</Button>
			<Button variant="ghost" class="size-11 p-2 no-underline hover:no-underline" aria-label="Minggu berikutnya" onclick={() => void moveWeek(1)}><ChevronRight size={18} aria-hidden="true"/></Button>
		</div>
	</div>
	<div class="table-wrap calendar-wrap"><Table class="calendar">
		<TableHeader><TableRow><TableHead class="room-head">Ruangan</TableHead>{#each dates as day}<TableHead class={iso(day) === todayJakarta() ? 'today' : ''}><span>{dayLabel(day)}</span><strong>{titleDate(day)}</strong></TableHead>{/each}</TableRow></TableHeader>
		<TableBody>{#each rooms as room (room.id)}
			<TableRow><TableHead scope="row" class="room-name"><strong>{room.name} · {room.id}</strong><span>{room.roomClass} · kapasitas {room.capacity}</span></TableHead>
			{#each dates as day}
				<TableCell>
					{#if room.status!=='available'}<span class="room-unavailable">Dalam pemeliharaan</span>
					{:else if dayPlacements(room.id,day).length===0}<span class="free">Tersedia</span>
					{:else}<div class="day-bookings">{#each dayPlacements(room.id,day) as p (p.id)}
						<div class="booking" class:start={p.startsOn===iso(day)} class:end={p.endsOn===iso(day)} title={`${p.patientName} · ${date(p.startsOn)}–${date(p.endsOn)}`}>
							<strong>{p.patientName}</strong>
							{#if p.startsOn===iso(day) || p.endsOn===iso(day)}<small>{titleDate(new Date(p.startsOn+'T00:00:00Z'))} – {titleDate(new Date(p.endsOn+'T00:00:00Z'))}</small>{/if}
						</div>
					{/each}</div>{/if}
				</TableCell>
			{/each}</TableRow>
		{:else}<TableRow><TableCell class="empty" colspan={8}>Belum ada data ruangan.</TableCell></TableRow>{/each}</TableBody>
	</Table></div>
	<div class="legend"><span><i class="dot available-dot"></i>Tersedia</span><span><i class="dot occupied-dot"></i>Terisi</span><span><i class="dot maintenance-dot"></i>Dalam pemeliharaan</span></div>
	<p class="footnote">Tanggal masuk dan tanggal selesai sama-sama dihitung. Saat Anda menyimpan, InpaCare memeriksa kapasitas ruang dan jadwal pasien.</p>
</Card>
{#if canManage}
<Card class="gap-4 p-5 sm:p-6 placement-list">
    <div class="panel-header"><div><h2>Kelola penempatan</h2><p class="muted">Isi alasan saat mengubah atau membatalkan penempatan. Jika penempatan terkait rekap, ajukan perubahan tanggal kepada dokter. Pilih ruang yang tetap mencakup jadwal tugas yang tersimpan.</p></div></div>
    <div class="table-wrap"><Table class="data-table">
        <TableHeader><TableRow><TableHead>Pasien</TableHead><TableHead>Ruangan</TableHead><TableHead>Periode</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
        <TableBody>{#each data.placements as placement (placement.id)}
            <TableRow>
                <TableCell><strong>{placement.patientName}</strong><span class="cell-meta">{placement.medicalRecordNo} · {placement.status === 'active' ? 'Aktif' : 'Dibatalkan'}</span></TableCell>
                <TableCell>{placement.roomName}</TableCell><TableCell>{date(placement.startsOn)} – {date(placement.endsOn)}</TableCell>
                <TableCell><div class="action-buttons action-buttons--table">
                    <Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" disabled={busy || placement.status !== 'active'} aria-haspopup="dialog" onclick={() => editingPlacement = placement}><Pencil aria-hidden="true" /> Ubah penempatan</Button>
                    <Button variant="destructive" class="h-11 px-4 no-underline hover:no-underline" disabled={busy || placement.status !== 'active'} aria-haspopup="dialog" onclick={() => { cancelling = placement; cancelReason = ''; }}><Ban aria-hidden="true" /> Batalkan</Button>
                    <Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" disabled={busy} aria-haspopup="dialog" onclick={() => void showHistory(placement)}><History aria-hidden="true" /> Riwayat</Button>
                </div></TableCell>
            </TableRow>
        {:else}<TableRow><TableCell colspan={4} class="empty">Belum ada penempatan pada pekan ini. Pilih pekan lain untuk melihat jadwalnya.</TableCell></TableRow>{/each}</TableBody>
    </Table></div>
</Card>
{/if}
</div>
{#if placing && data.user.role === 'PERAWAT'}<Modal title="Penempatan pasien" description="Pilih pasien, ruang, tanggal masuk, dan tanggal selesai. InpaCare memeriksa ketersediaan saat Anda menyimpan." {busy} protectChanges onclose={() => placing = false}>
{#snippet children(close)}
	<form aria-label="Penempatan pasien" class="form-grid" onsubmit={place}>
		<label class="field">Pasien<FormSelect name="patientId" required options={[{ value: "", label: "Pilih pasien" }, ...(data.patients).map((patient) => ({ value: patient.id, label: (patient.name) + " · " + (patient.medicalRecordNo) }))]} /></label>
		<label class="field">Ruangan<FormSelect name="roomId" required options={[{ value: "", label: "Pilih ruangan tersedia" }, ...(data.rooms.filter((r)=>r.status==='available')).map((room) => ({ value: room.id, label: (room.name) + " · " + (room.roomClass) + " · kapasitas " + (room.capacity) }))]} /></label>
		<label class="field">Tanggal masuk<FormDatePicker class="h-11 text-base md:text-sm" name="startsOn" type="date" value={data.from} required /></label>
		<label class="field">Tanggal selesai<FormDatePicker class="h-11 text-base md:text-sm" name="endsOn" type="date" value={data.to} required /></label>
		<div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan penempatan…' : 'Simpan penempatan'}</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={close}><X aria-hidden="true" /> Batal</Button></div>
	</form>
{/snippet}</Modal>{/if}

{#if editingPlacement && canManage}{@const placement = editingPlacement}<Modal title="Ubah penempatan" description={`Ubah ruang atau tanggal penempatan ${placement.patientName}. Untuk tanggal yang terkait rekap, ajukan perubahan kepada dokter.`} {busy} protectChanges onclose={() => editingPlacement = null}>
{#snippet children(close)}
    <form class="form-grid" onsubmit={(event) => reschedule(event, placement)}>
        <label class="field">Pasien<Input class="h-11 text-base md:text-sm" value={placement.patientName} disabled /></label>
        <label class="field">Ruangan<FormSelect name="roomId" value={placement.roomId} required options={data.rooms.filter(room => room.status === 'available' || room.id === placement.roomId).map(room => ({ value: room.id, label: room.name + ' \u00b7 ' + room.roomClass }))} /></label>
        <label class="field">Tanggal masuk<FormDatePicker name="startsOn" value={placement.startsOn} required /></label>
        <label class="field">Tanggal selesai<FormDatePicker name="endsOn" value={placement.endsOn} required /></label>
        <label class="field sm:col-span-2">Alasan perubahan<Textarea name="reason" required maxlength={2000} /></label>
        <div class="form-actions"><Button type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> Simpan penempatan</Button><Button variant="outline" class="h-11 px-4" type="button" onclick={close}><X aria-hidden="true" /> Batal</Button></div>
    </form>
{/snippet}</Modal>{/if}
{#if historyPlacement && canManage}<Modal title="Riwayat penempatan" description={historyPlacement.patientName + ' \u00b7 ' + historyPlacement.roomName} onclose={() => historyPlacement = null}>
{#snippet children(close)}
    <div class="grid gap-5">
        {#each history as item (item.id)}
            <article class="grid min-w-0 gap-3 border-b pb-5 last:border-0 last:pb-0">
                <div><h3 class="text-base font-semibold">{item.action === 'cancelled' ? 'Pembatalan' : 'Perubahan'} oleh {item.actorName}</h3><p class="text-sm text-muted-foreground">{historyDate(item.createdAt)} WIB</p></div>
                <p class="wrap-anywhere whitespace-pre-wrap">{item.reason}</p>
                <dl class="grid min-w-0 gap-2 text-sm">
                    <dt class="font-semibold">Sebelum</dt><dd class="wrap-anywhere">{roomLabel(item.before.room_id)} · {date(item.before.starts_on)} – {date(item.before.ends_on)} · {item.before.status === 'active' ? 'Aktif' : 'Dibatalkan'} · versi {item.before.version}</dd>
                    <dt class="font-semibold">Sesudah</dt><dd class="wrap-anywhere">{roomLabel(item.after.room_id)} · {date(item.after.starts_on)} – {date(item.after.ends_on)} · {item.after.status === 'active' ? 'Aktif' : 'Dibatalkan'} · versi {item.after.version}</dd>
                </dl>
            </article>
        {:else}<p class="text-muted-foreground">Belum ada perubahan penempatan yang tercatat.</p>{/each}
        <div class="form-actions"><Button variant="outline" class="h-11 px-4" onclick={close}><X aria-hidden="true" /> Tutup riwayat</Button></div>
    </div>
{/snippet}</Modal>{/if}
<AlertDialog.Root open={canManage && cancelling !== null} onOpenChange={(open) => { if (!open && !busy) cancelling = null; }}>
    <AlertDialog.Content onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}>
        <AlertDialog.Header>
            <AlertDialog.Title>Batalkan penempatan?</AlertDialog.Title>
            <AlertDialog.Description>Penempatan {cancelling?.patientName} di {cancelling?.roomName} akan dibatalkan. Riwayatnya tetap tersimpan. Isi alasan untuk melanjutkan.</AlertDialog.Description>
        </AlertDialog.Header>
        <label class="field">Alasan pembatalan<Textarea bind:value={cancelReason} required maxlength={2000} disabled={busy} /></label>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={busy}><ArrowLeft aria-hidden="true" /> Kembali</AlertDialog.Cancel>
            <AlertDialog.Action disabled={busy || !cancelReason.trim()} variant="destructive-confirm" onclick={(event) => { event.preventDefault(); if (cancelling) void cancelPlacement(cancelling); }}>
                <Ban aria-hidden="true" /> {busy ? 'Membatalkan…' : 'Batalkan penempatan'}
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
<style>
.placement-page :global(.form-panel h2){margin-bottom:8px}
.placement-page :global(.form-panel p){margin-bottom:20px;font-size:13px}
.placement-page :global(.filters){justify-content:space-between;gap:20px}
.placement-page :global(.room-filter){min-width:180px;max-width:300px}
.placement-page :global(.cell-meta){display:block;color:var(--muted-foreground);font-size:12px;margin-top:4px}
.placement-page :global(.placement-list){margin-top:24px}
.placement-page :global(.week-navigation){display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.placement-page :global(.week-navigation strong){font-size:14px;white-space:nowrap}
.placement-page :global(.calendar){width:100%;border-collapse:separate;border-spacing:0;min-width:1120px;table-layout:fixed}
.placement-page :global(.calendar th),.placement-page :global(.calendar td){border-bottom:1px solid var(--border);border-right:1px solid var(--border);text-align:left;vertical-align:top;padding:12px 10px;white-space:normal}
.placement-page :global(.calendar thead th){background:var(--background);font-size:12px;font-weight:500;color:var(--muted-foreground)}
.placement-page :global(.calendar thead th span),.placement-page :global(.calendar thead th strong){display:block}
.placement-page :global(.calendar thead th strong){font-size:14px;color:var(--foreground);margin-top:4px}
.placement-page :global(.calendar .room-head),.placement-page :global(.calendar .room-name){width:176px;position:sticky;left:0;z-index:1}
.placement-page :global(.calendar .room-name){background:var(--card)}
.placement-page :global(.room-name strong),.placement-page :global(.room-name span){display:block;overflow-wrap:anywhere}
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
