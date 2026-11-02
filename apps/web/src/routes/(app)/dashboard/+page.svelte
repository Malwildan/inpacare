<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import Modal from '$lib/components/Modal.svelte';

	type CycleDetail = {
		id: string; patientName: string; medicalRecordNo: string; room: string | null;
		doctorName: string; nurseName: string; status: string; version: number;
		requests: { id: string; kind: string; requestedEnd: string | null; reason: string;
			requestedBy: string; status: string; note: string | null; decidedBy: string | null }[];
	};
	const statusLabels: Record<string, string> = { pending: 'Pending', assigned: 'Assigned', in_care: 'In Care', extend: 'Extend', released: 'Pelepasan' };
	const requestLabels: Record<string, string> = { pending: 'Menunggu keputusan', approved: 'Disetujui', rejected: 'Ditolak' };

	let { data } = $props();
	let search = $state('');
	let roomFilter = $state('');
	let statusFilter = $state('');
	let busy = $state(false);
	let error = $state('');
	let success = $state('');
	let selectedCycleId = $state<string | null>(null);
	let selectedCycle = $state<CycleDetail | null>(null);
	let detailLoading = $state(false);
	let requestKind = $state('release');

	let cycles = $derived(data.cycles.filter((cycle: any) =>
		(!statusFilter || cycle.status === statusFilter) &&
		(!roomFilter || (roomFilter === '__unplaced__' ? !cycle.room : cycle.room === roomFilter)) &&
		(!search || `${cycle.patientName} ${cycle.medicalRecordNo}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
	));
	let rooms = $derived([...new Set(data.cycles.map((cycle: any) => cycle.room).filter((room: unknown): room is string => typeof room === 'string' && room.length > 0))].sort((a, b) => a.localeCompare(b, 'id')));
	let hasUnplaced = $derived(data.cycles.some((cycle: any) => !cycle.room));
	let counts = $derived(['pending', 'assigned', 'in_care', 'extend', 'released'].map((status) => ({ status, count: data.cycles.filter((c: any) => c.status === status).length })));

	async function openDetail(id: string) {
		selectedCycleId = id; selectedCycle = null; detailLoading = true; error = ''; success = ''; requestKind = 'release';
		try {
			const detail = await api<CycleDetail>(`/cycles/${id}`);
			if (selectedCycleId === id) selectedCycle = detail;
		} catch (cause) {
			if (selectedCycleId === id) error = cause instanceof Error ? cause.message : 'Detail gagal dimuat.';
		} finally { if (selectedCycleId === id) detailLoading = false; }
	}
	function closeDetail() { selectedCycleId = null; selectedCycle = null; error = ''; }

	async function send(path: string, method: string, payload?: object): Promise<boolean> {
		busy = true; error = ''; success = '';
		try {
			await api(path, { method, ...(payload ? { body: JSON.stringify(payload) } : {}) });
			await invalidateAll();
			success = 'Perubahan berhasil disimpan.';
			return true;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Perubahan gagal disimpan.'; return false; }
		finally { busy = false; }
	}

	function create(event: SubmitEvent) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		void send('/cycles', 'POST', { patientId: form.get('patientId'), doctorId: form.get('doctorId'), placementId: form.get('placementId') || null });
	}
	async function transition(event: SubmitEvent, cycle: CycleDetail) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		if (await send(`/cycles/${cycle.id}`, 'PATCH', { status: form.get('status'), expectedVersion: cycle.version })) closeDetail();
	}
	async function request(event: SubmitEvent, cycle: CycleDetail) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const kind = String(form.get('kind'));
		if (await send(`/cycles/${cycle.id}/requests`, 'POST', { kind, requestedEnd: kind === 'extend' ? form.get('requestedEnd') : null, reason: form.get('reason') })) closeDetail();
	}
	async function decide(event: SubmitEvent, cycle: CycleDetail, requestId: string, decision: string) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		if (await send(`/cycles/${cycle.id}/requests/${requestId}/decision`, 'POST', { decision, note: form.get('note'), expectedVersion: cycle.version })) closeDetail();
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
	<div class="filters"><label class="field search-field">Cari nama atau nomor rekam medis<input bind:value={search} placeholder="Cari nama pasien..." /></label><label class="field">Ruangan<select bind:value={roomFilter}><option value="">Semua ruangan</option>{#each rooms as room}<option value={room}>{room}</option>{/each}{#if hasUnplaced}<option value="__unplaced__">Belum ditempatkan</option>{/if}</select></label><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option>{#each counts as item}<option value={item.status}>{({pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan'} as Record<string,string>)[item.status]}</option>{/each}</select></label></div>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>Pasien</th><th>Ruangan</th><th>Dokter</th><th>Perawat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
		{#each cycles as cycle (cycle.id)}<tr>
			<td><strong>{cycle.patientName}</strong><span class="cell-meta">{cycle.id} · {cycle.medicalRecordNo}</span></td>
			<td>{cycle.room ?? 'Belum ditempatkan'}</td><td>{cycle.doctorName}</td><td>{cycle.nurseName}</td>
			<td><span class="badge status-{cycle.status}">{statusLabels[cycle.status] ?? cycle.status}</span></td>
			<td><button class="button secondary small" onclick={() => void openDetail(cycle.id)}>{data.user.role === 'DOKTER' && cycle.requests.some((item: any) => item.status === 'pending') ? 'Tinjau permintaan' : 'Lihat detail'}</button></td>
		</tr>
		{:else}<tr><td colspan="6" class="empty">Tidak ada rekap yang cocok.</td></tr>{/each}
	</tbody></table></div>
</section>

{#if selectedCycleId}
	<Modal title="Detail siklus inpatient care" onclose={closeDetail}>
		{#if detailLoading}<p class="muted" role="status">Memuat detail pasien...</p>
		{:else if selectedCycle}
			<div class="detail-grid cycle-summary">
				<div class="detail-item"><span>Pasien</span><strong>{selectedCycle.patientName}</strong><small>{selectedCycle.medicalRecordNo}</small></div>
				<div class="detail-item"><span>Ruangan</span><strong>{selectedCycle.room ?? 'Belum ditempatkan'}</strong></div>
				<div class="detail-item"><span>Dokter</span><strong>{selectedCycle.doctorName}</strong></div>
				<div class="detail-item"><span>Perawat</span><strong>{selectedCycle.nurseName}</strong></div>
				<div class="detail-item"><span>Status saat ini</span><strong><span class="badge status-{selectedCycle.status}">{statusLabels[selectedCycle.status] ?? selectedCycle.status}</span></strong></div>
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if data.user.role === 'PERAWAT' && ['pending', 'assigned'].includes(selectedCycle.status)}
				<section class="detail-section"><h3>Perbarui status</h3><p class="muted">Lanjutkan ke tahap berikutnya dalam siklus perawatan.</p>
					<form onsubmit={(event) => transition(event, selectedCycle!)}><label class="field">Tahap berikutnya<select name="status" required><option value={selectedCycle.status === 'pending' ? 'assigned' : 'in_care'}>{selectedCycle.status === 'pending' ? 'Assigned' : 'In Care'}</option></select></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan status</button></div></form>
				</section>
			{/if}
			{#if data.user.role === 'PERAWAT' && ['in_care', 'extend'].includes(selectedCycle.status) && !selectedCycle.requests.some((item) => item.status === 'pending')}
				<section class="detail-section"><h3>Ajukan perpanjangan atau pelepasan</h3><p class="muted">Permintaan akan ditinjau oleh dokter penanggung jawab.</p>
					<form onsubmit={(event) => request(event, selectedCycle!)}><div class="form-grid"><label class="field">Jenis permintaan<select name="kind" bind:value={requestKind}><option value="release">Pelepasan</option><option value="extend">Perpanjangan</option></select></label>{#if requestKind === 'extend'}<label class="field">Perpanjang sampai tanggal<input name="requestedEnd" type="date" required /></label>{/if}<label class="field full">Alasan<textarea name="reason" maxlength="500" required></textarea></label></div><div class="form-actions"><button class="button primary" disabled={busy}>Ajukan ke dokter</button></div></form>
				</section>
			{/if}
			<section class="detail-section"><h3>Riwayat permintaan</h3>
				{#if selectedCycle.requests.length === 0}<p class="muted">Belum ada permintaan.</p>
				{:else}{#each selectedCycle.requests as item (item.id)}<div class="request-item"><div class="request-heading"><strong>{item.kind === 'extend' ? `Perpanjangan sampai ${item.requestedEnd}` : 'Pelepasan'}</strong><span class="badge {item.status}">{requestLabels[item.status] ?? item.status}</span></div><p>Alasan: {item.reason}</p><small>Diajukan oleh {item.requestedBy}{item.decidedBy ? ` · Diputuskan oleh ${item.decidedBy}` : ''}</small>{#if item.note}<p>Catatan dokter: {item.note}</p>{/if}
					{#if data.user.role === 'DOKTER' && item.status === 'pending'}<form onsubmit={(event) => decide(event, selectedCycle!, item.id, String((event.submitter as HTMLButtonElement)?.value))}><label class="field">Catatan keputusan<input name="note" maxlength="500" required /></label><div class="form-actions"><button class="button secondary" name="decision" value="reject" disabled={busy}>Tolak</button><button class="button primary" name="decision" value="approve" disabled={busy}>Setujui</button></div></form>{/if}
				</div>{/each}{/if}
			</section>
		{:else}{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="button secondary" onclick={() => void openDetail(selectedCycleId!)}>Coba lagi</button>{/if}
	</Modal>
{/if}

<p class="muted workflow-note">Alur: Pending → Assigned → In Care → Extend / Pelepasan. Perpanjangan dan pelepasan berlaku setelah keputusan dokter.</p>

<style>
	.panel{margin-bottom:16px}.create-panel{padding:16px 18px}.create-form{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;align-items:end;gap:12px}.search-field{flex:1;min-width:220px}.cell-meta{display:block;color:#858b9b;font-size:11px;margin-top:4px}.notifications ul{list-style:none;padding:0;margin:0}.notifications li{padding:10px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #eef0f4;font-size:13px}.cycle-summary{padding-bottom:20px}.detail-section{border-top:1px solid #edf0f4;padding:20px 0}.detail-section:last-child{padding-bottom:0}.detail-section h3{margin-bottom:6px}.detail-section>p{font-size:13px;margin-bottom:14px}.detail-section form{margin-top:14px}.request-item{background:#f6f7fa;border-radius:7px;padding:14px;margin-top:10px;font-size:13px}.request-item p{margin-top:8px;color:#3d4659}.request-item small{display:block;color:#626879;margin-top:6px}.request-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.badge.status-pending{color:#8a5700;background:#fff6e5}.badge.status-assigned{color:#1268a8;background:#e8f4ff}.badge.status-in_care{color:#236b3d;background:#e9f6ec}.badge.status-extend{color:#383fba;background:#eef0ff}.badge.status-released{color:#236b3d;background:#e5f5e9}.workflow-note{margin-top:14px}@media(max-width:900px){.create-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.create-form{grid-template-columns:1fr}.notifications li{align-items:flex-start;flex-direction:column}}
</style>
