<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { api } from '$lib/api';

	let { data } = $props();
	let roomFilter = $state('');
	let placing = $state(false);
	let busy = $state(false);
	let error = $state('');
	let success = $state('');
	let rooms = $derived(data.rooms.filter((room: any) => !roomFilter || room.id === roomFilter));
	let dates = $derived(Array.from({length:7},(_,i) => {
		const day = new Date(data.from+'T00:00:00Z');
		day.setUTCDate(day.getUTCDate()+i);
		return day;
	}));
	const iso = (date: Date) => date.toISOString().slice(0,10);
	const dayLabel = (date: Date) => new Intl.DateTimeFormat('id-ID',{weekday:'short',timeZone:'UTC'}).format(date);
	const titleDate = (date: Date) => new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'UTC'}).format(date);
	const todayJakarta = () => {
		const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
		const value = (type: string) => parts.find((part) => part.type===type)!.value;
		return value('year')+'-'+value('month')+'-'+value('day');
	};
	const dayPlacements = (roomId: string, day: Date) => data.placements.filter((p: any) => p.roomId===roomId && p.startsOn<=iso(day) && p.endsOn>=iso(day));

	async function moveWeek(delta: number) {
		const next = new Date(data.from+'T00:00:00Z');
		next.setUTCDate(next.getUTCDate()+delta*7);
		await goto('/calendar?from='+iso(next));
	}
	async function place(event: SubmitEvent) {
		event.preventDefault(); busy=true; error=''; success='';
		const form = new FormData(event.currentTarget as HTMLFormElement);
		try {
			await api('/placements',{method:'POST',body:JSON.stringify({patientId:form.get('patientId'),roomId:form.get('roomId'),startsOn:form.get('startsOn'),endsOn:form.get('endsOn')})});
			await invalidateAll(); placing=false; success='Penempatan berhasil disimpan.';
		} catch(e) { error=e instanceof Error?e.message:'Penempatan gagal disimpan.'; }
		finally { busy=false; }
	}
</script>

<svelte:head><title>Kalender Ruangan | InpaCare</title></svelte:head>
<section class="page-heading">
	<div><h1 class="page-title">Kalender Ruangan</h1><p class="page-subtitle">Pantau ketersediaan dan durasi rawat inap setiap pasien.</p></div>
	{#if data.user.role === 'PERAWAT'}<button class="button primary" onclick={() => { placing=!placing; error=''; }}>＋ Tempatkan pasien</button>{/if}
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}{#if success}<p class="success" role="status">{success}</p>{/if}
{#if placing && data.user.role === 'PERAWAT'}<section class="panel form-panel"><h2>Penempatan pasien</h2><p class="muted">Tanggal masuk dan keluar dihitung inklusif. Konflik kapasitas diperiksa saat disimpan.</p>
	<form class="form-grid" onsubmit={place}>
		<label class="field">Pasien<select name="patientId" required><option value="">Pilih pasien</option>{#each data.patients as patient}<option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>{/each}</select></label>
		<label class="field">Ruangan<select name="roomId" required><option value="">Pilih ruangan tersedia</option>{#each data.rooms.filter((r:any)=>r.status==='available') as room}<option value={room.id}>{room.name} · {room.roomClass} · kapasitas {room.capacity}</option>{/each}</select></label>
		<label class="field">Tanggal masuk<input name="startsOn" type="date" value={data.from} required /></label>
		<label class="field">Tanggal keluar<input name="endsOn" type="date" value={data.to} required /></label>
		<div class="form-actions"><button class="button primary" disabled={busy}>Simpan penempatan</button><button class="button secondary" type="button" onclick={() => placing=false}>Batal</button></div>
	</form>
</section>{/if}
<section class="panel">
	<div class="filters">
		<label class="field room-filter">Filter jadwal ruangan<select bind:value={roomFilter}><option value="">Semua ruangan</option>{#each data.rooms as room}<option value={room.id}>{room.name}</option>{/each}</select></label>
		<div class="week-navigation" aria-label="Navigasi kalender">
			<button class="button secondary small" aria-label="Minggu sebelumnya" onclick={() => void moveWeek(-1)}>‹</button>
			<strong>{titleDate(dates[0])} – {titleDate(dates[6])} {dates[6].getUTCFullYear()}</strong>
			<button class="button secondary small" onclick={() => void goto('/calendar')}>Hari ini</button>
			<button class="button secondary small" aria-label="Minggu berikutnya" onclick={() => void moveWeek(1)}>›</button>
			<span class="view-pill">Minggu</span><span class="view-link" title="Tampilan bulan tersedia pada iterasi berikutnya">Bulan</span>
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
							{#if p.startsOn===iso(day) || day.getUTCDay()===1}<strong>{p.patientName}</strong>{/if}
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
<style>
	.panel{margin-bottom:18px}.form-panel{padding:20px}.form-panel h2{font-size:16px;margin:0 0 4px}.form-panel p{margin:0 0 14px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:14px}.form-actions{display:flex;align-items:end;gap:8px}.filters{display:flex;align-items:end;justify-content:space-between;gap:14px}.room-filter{min-width:200px}.week-navigation{display:flex;align-items:center;gap:9px}.week-navigation strong{font-size:14px;white-space:nowrap}.view-pill{border-radius:5px;background:#4e61f6;color:white;padding:6px 12px;font-size:12px}.view-link{color:#4e61f6;font-size:12px}
	.calendar{width:100%;border-collapse:separate;border-spacing:0;min-width:1000px;table-layout:fixed}.calendar th,.calendar td{border-bottom:1px solid #edf0f5;border-right:1px solid #edf0f5;text-align:left;vertical-align:top;padding:6px}.calendar thead th{height:54px;background:#fbfcfe;font-size:11px;color:#6f7584}.calendar thead th span,.calendar thead th strong{display:block}.calendar thead th strong{font-size:12px;color:#252a37;margin-top:3px}.calendar .room-head,.calendar .room-name{width:156px}.calendar .room-name{background:#fff}.room-name strong,.room-name span{display:block}.room-name strong{font-size:11px}.room-name span{margin-top:4px;color:#8a90a0;font-size:10px;font-weight:400}.calendar td{height:74px;background:#fff}.calendar .today{background:#f0f2ff}.free{color:#2b8650;font-size:10px}.room-unavailable{color:#898d99;font-size:10px}.day-bookings{display:flex;flex-direction:column;gap:3px}.booking{padding:4px 5px;border-radius:5px;background:#eceeff;color:#3344ad;min-height:24px;overflow:hidden;font-size:10px}.booking.start{border-left:2px solid #4e61f6}.booking.end{border-right:2px solid #4e61f6}.booking strong,.booking small{display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.booking small{font-size:9px;opacity:.8}.legend{display:flex;gap:15px;margin:14px 5px 8px;font-size:11px;color:#676d7c}.legend span{display:flex;align-items:center;gap:6px}.dot{width:9px;height:9px;border-radius:50%;background:#eee}.available-dot{background:#5eae79}.occupied-dot{background:#6b78ef}.maintenance-dot{background:#a4a7b0}.footnote{margin:8px 5px 2px;color:#838999;font-size:10px}.calendar-wrap{overflow-x:auto}
	@media(max-width:740px){.filters{align-items:stretch;flex-direction:column}.week-navigation{justify-content:space-between}.form-grid{grid-template-columns:1fr}.page-heading{align-items:flex-start}}
</style>
