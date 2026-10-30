<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';

	let { data } = $props();
	let search = $state('');
	let statusFilter = $state('');
	let busy = $state(false);
	let error = $state('');
	let success = $state('');

	let cycles = $derived(data.cycles.filter((cycle: any) =>
		(!statusFilter || cycle.status === statusFilter) &&
		(!search || `${cycle.patientName} ${cycle.medicalRecordNo} ${cycle.room ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
	));
	let counts = $derived(['pending', 'assigned', 'in_care', 'extend', 'released'].map((status) => ({ status, count: data.cycles.filter((c: any) => c.status === status).length })));

	async function send(path: string, method: string, payload?: object) {
		busy = true; error = ''; success = '';
		try {
			await api(path, { method, ...(payload ? { body: JSON.stringify(payload) } : {}) });
			await invalidateAll();
			success = 'Perubahan berhasil disimpan.';
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Perubahan gagal disimpan.'; }
		finally { busy = false; }
	}

	function create(event: SubmitEvent) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		void send('/cycles', 'POST', { patientId: form.get('patientId'), doctorId: form.get('doctorId'), placementId: form.get('placementId') || null });
	}
	function transition(event: SubmitEvent, cycle: any) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		void send(`/cycles/${cycle.id}`, 'PATCH', { status: form.get('status'), expectedVersion: cycle.version });
	}
	function request(event: SubmitEvent, cycle: any) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const kind = String(form.get('kind'));
		void send(`/cycles/${cycle.id}/requests`, 'POST', { kind, requestedEnd: kind === 'extend' ? form.get('requestedEnd') : null, reason: form.get('reason') });
	}
	function decide(event: SubmitEvent, cycle: any, requestId: string, decision: string) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		void send(`/cycles/${cycle.id}/requests/${requestId}/decision`, 'POST', { decision, note: form.get('note'), expectedVersion: cycle.version });
	}
</script>

<svelte:head><title>Dashboard Siklus | InpaCare</title></svelte:head>
<section class="page-heading">
	<div><h1 class="page-title">Dashboard Siklus Inpatient Care</h1><p class="page-subtitle">Pantau setiap pasien dan kelanjutan proses rawat inap sesuai kondisi terkini.</p></div>
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p class="success" role="status">{success}</p>{/if}

<section class="stats" aria-label="Ringkasan siklus">
	{#each counts as item}<div class="stat"><strong>{item.count}</strong><span>{({pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan'} as Record<string,string>)[item.status]}</span></div>{/each}
</section>

{#if data.user.role === 'PERAWAT'}
	<section class="panel create-panel">
		<div class="panel-header"><div><h2>Tambah rekap pasien</h2><p class="muted">Tetapkan dokter penanggung jawab dan, bila sudah ada, penempatan aktif.</p></div></div>
		<form class="create-form" onsubmit={create}>
			<label class="field">Pasien<select name="patientId" required><option value="">Pilih pasien</option>{#each data.reference.patients as patient}<option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>{/each}</select></label>
			<label class="field">Dokter<select name="doctorId" required><option value="">Pilih dokter</option>{#each data.reference.staff.filter((s: any) => s.role === 'DOKTER') as doctor}<option value={doctor.id}>{doctor.name}</option>{/each}</select></label>
			<label class="field">Penempatan aktif<select name="placementId"><option value="">Belum ditempatkan</option>{#each data.reference.placements.filter((p: any) => p.status === 'active') as placement}<option value={placement.id}>{placement.patientName} · {placement.roomName} · {placement.startsOn}–{placement.endsOn}</option>{/each}</select></label>
			<button class="button primary" disabled={busy}>Tambah rekap</button>
		</form>
	</section>
{/if}

<section class="panel notifications" aria-label="Notifikasi">
	<div class="panel-header"><div><h2>Notifikasi</h2><span class="muted">{data.notifications.filter((item: any) => !item.readAt).length} belum dibaca</span></div></div>
	{#if data.notifications.length === 0}<p class="empty">Belum ada notifikasi.</p>{:else}<ul>{#each data.notifications as item (item.id)}<li><span>{item.message}</span>{#if !item.readAt}<button class="button secondary small" disabled={busy} onclick={() => void send(`/notifications/${item.id}/read`, 'POST')}>Tandai dibaca</button>{/if}</li>{/each}</ul>{/if}
</section>

<section class="panel">
	<div class="panel-header"><div><h2>Daftar rekap pasien</h2><span class="muted">{cycles.length} dari {data.cycles.length} pasien</span></div></div>
	<div class="filters"><label class="field search-field">Cari nama atau nomor rekam medis<input bind:value={search} placeholder="Cari nama pasien..." /></label><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option>{#each counts as item}<option value={item.status}>{({pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan'} as Record<string,string>)[item.status]}</option>{/each}</select></label></div>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>Pasien</th><th>Ruangan</th><th>Dokter</th><th>Perawat</th><th>Status</th><th>Proses</th></tr></thead><tbody>
		{#each cycles as cycle (cycle.id)}<tr>
			<td><strong>{cycle.patientName}</strong><span class="cell-meta">{cycle.id} · {cycle.medicalRecordNo}</span></td>
			<td>{cycle.room ?? 'Belum ditempatkan'}</td><td>{cycle.doctorName}</td><td>{cycle.nurseName}</td>
			<td><span class="badge status-{cycle.status}">{{pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan'}[cycle.status] ?? cycle.status}</span></td>
			<td>
				{#if data.user.role === 'PERAWAT' && ['pending','assigned'].includes(cycle.status)}
					<form class="actions" onsubmit={(event) => transition(event, cycle)}><select name="status" aria-label="Status siklus">{#if cycle.status === 'pending'}<option value="assigned">Assigned</option>{:else}<option value="in_care">In Care</option>{/if}</select><button class="button secondary small" disabled={busy}>Perbarui</button></form>
				{/if}
				{#if data.user.role === 'PERAWAT' && ['in_care','extend'].includes(cycle.status) && !cycle.requests.some((r: any) => r.status === 'pending')}
					<form class="request-form" onsubmit={(event) => request(event, cycle)}><label class="field">Permintaan<select name="kind"><option value="release">Pelepasan</option><option value="extend">Perpanjangan</option></select></label><label class="field">Sampai tanggal<input name="requestedEnd" type="date" /></label><label class="field">Alasan<input name="reason" maxlength="500" required /></label><button class="button secondary small" disabled={busy}>Ajukan</button></form>
				{/if}
				{#if cycle.requests.length}<div class="cycle-requests"><strong>Permintaan dokter</strong>{#each cycle.requests as item (item.id)}<div class="request-item"><span>{item.kind === 'extend' ? `Perpanjangan sampai ${item.requestedEnd}` : 'Pelepasan'} · {item.status === 'pending' ? 'Menunggu keputusan' : item.status}</span><small>{item.reason}{item.note ? ` · ${item.note}` : ''}</small>
					{#if data.user.role === 'DOKTER' && item.status === 'pending'}<form class="decision-form" onsubmit={(event) => decide(event, cycle, item.id, String((event.submitter as HTMLButtonElement)?.value))}><label class="field">Catatan keputusan<input name="note" maxlength="500" required /></label><button class="button primary small" name="decision" value="approve" disabled={busy}>Setujui</button><button class="button secondary small" name="decision" value="reject" disabled={busy}>Tolak</button></form>{/if}
				</div>{/each}</div>{/if}
			</td>
		</tr>
		{:else}<tr><td colspan="6" class="empty">Tidak ada rekap yang cocok.</td></tr>{/each}
	</tbody></table></div>
</section>

<p class="muted workflow-note">Alur: Pending → Assigned → In Care → Extend / Pelepasan. Perpanjangan dan pelepasan berlaku setelah keputusan dokter.</p>

<style>
	.panel{margin-bottom:16px}.create-panel{padding:16px 18px}.create-form{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;align-items:end;gap:12px}.search-field{flex:1;min-width:220px}.cell-meta{display:block;color:#858b9b;font-size:11px;margin-top:4px}.actions{display:flex;align-items:center;gap:6px}.actions select{min-width:120px;width:auto}.notifications ul{list-style:none;padding:0;margin:0}.notifications li{padding:10px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #eef0f4;font-size:13px}.request-form,.decision-form{display:flex;align-items:end;gap:6px;margin-top:8px;flex-wrap:wrap}.request-form .field,.decision-form .field{flex:1;min-width:100px}.cycle-requests{margin-top:10px;max-width:480px}.request-item{background:#f6f7fa;border-radius:7px;padding:8px;margin-top:6px;font-size:12px}.request-item small{display:block;color:#626879;margin-top:4px}.badge.status-pending{color:#8a5700;background:#fff6e5}.badge.status-assigned{color:#1268a8;background:#e8f4ff}.badge.status-in_care{color:#236b3d;background:#e9f6ec}.badge.status-extend{color:#383fba;background:#eef0ff}.badge.status-released{color:#236b3d;background:#e5f5e9}.workflow-note{margin-top:14px}@media(max-width:900px){.create-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.create-form{grid-template-columns:1fr}.notifications li{align-items:flex-start;flex-direction:column}}
</style>
