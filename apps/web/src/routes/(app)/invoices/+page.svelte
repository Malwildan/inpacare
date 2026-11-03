<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { Plus } from 'lucide-svelte';
	import Modal from '$lib/components/Modal.svelte';

	let { data } = $props();
	let creating = $state(false);
	let patientId = $state('');
	let search = $state('');
	let statusFilter = $state('');
	let lines = $state([{ description: '', quantity: 1, unitPrice: '' }]);
	let coveredAmount = $state('0');
	let busy = $state(false);
	let error = $state('');
	let success = $state('');
	let selected = $state<any>(null);
	let editing = $state(false);
	let editLines = $state<{ description: string; quantity: number; unitPrice: string }[]>([]);
	let editCovered = $state('0');
	let editReason = $state('');
	let deleting = $state<any>(null);
	let deleteReason = $state('');
	let editTotal = $derived(editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
	let editPayable = $derived(Math.max(0, editTotal - (Number(editCovered) || 0)));
	const actionLabel: Record<string, string> = { created: 'Tagihan dibuat', status_changed: 'Status diubah', updated: 'Rincian tagihan diubah', deleted: 'Tagihan dihapus' };

	let patient = $derived(data.reference.patients.find((item: any) => item.id === patientId));
	let total = $derived(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
	let covered = $derived(Number(coveredAmount) || 0);
	let payable = $derived(Math.max(0, total - covered));
	let invoices = $derived(data.invoices.filter((invoice: any) =>
		(!search || `${invoice.patientName} ${invoice.medicalRecordNo} ${invoice.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
		(!statusFilter || invoice.status === statusFilter)
	));

	function rupiah(amount: string | number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits:0, maximumFractionDigits:2 }).format(Number(amount)); }
	async function send(path: string, method: string, payload?: object) {
		busy = true; error = ''; success = '';
		try {
			const result = await api(path, { method, ...(payload ? { body: JSON.stringify(payload) } : {}) });
			await invalidateAll();
			success = 'Perubahan berhasil disimpan.';
			return result;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Perubahan gagal disimpan.'; }
		finally { busy = false; }
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const result = await send('/invoices', 'POST', {
			patientId: form.get('patientId'), placementId: form.get('placementId') || null, coveredAmount:String(coveredAmount),
			lines: lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice:String(line.unitPrice) }))
		});
		if (result) { creating = false; lines = [{ description: '', quantity: 1, unitPrice: '' }]; coveredAmount = '0'; }
	}

	async function openInvoice(id: string) {
		error = '';
		try { selected = await api(`/invoices/${id}`); }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Rincian tagihan gagal dimuat.'; }
	}

	async function updateStatus(event: SubmitEvent, invoice: any) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const result=await send(`/invoices/${invoice.id}`, 'PATCH', { status: form.get('status'), reason: form.get('reason'), expectedVersion: invoice.version });
		if(result && selected?.id===invoice.id) await openInvoice(invoice.id);
	}
	function startEdit() {
		editLines = selected.lines.map((line: any) => ({ description: line.description, quantity: line.quantity, unitPrice: String(line.unitPrice) }));
		editCovered = String(selected.coveredAmount);
		editReason = '';
		editing = true;
		error = '';
	}

	async function saveEdit(event: SubmitEvent) {
		event.preventDefault();
		const id = selected.id;
		const result = await send(`/invoices/${id}`, 'PATCH', {
			lines: editLines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: String(line.unitPrice) })),
			coveredAmount: String(editCovered), reason: editReason, expectedVersion: selected.version
		});
		if (result) { editing = false; await openInvoice(id); }
	}

	async function confirmDelete(event: SubmitEvent) {
		event.preventDefault();
		const invoice = deleting;
		const result = await send(`/invoices/${invoice.id}`, 'DELETE', { reason: deleteReason, expectedVersion: invoice.version });
		if (result) {
			deleting = null; deleteReason = '';
			if (selected?.id === invoice.id) { selected = null; editing = false; }
			success = 'Tagihan berhasil dihapus. Riwayat penghapusan tetap tercatat.';
		}
	}

	function choosePatient(value: string) {
		patientId = value;
		if (!data.reference.patients.find((item: any) => item.id === value)?.bpjs) coveredAmount = '0';
	}
</script>

<svelte:head><title>Manajemen Tagihan | InpaCare</title></svelte:head>
<section class="page-heading"><div><h1 class="page-title">Manajemen Tagihan</h1><p class="page-subtitle">Catat biaya layanan dan perlengkapan pasien, lalu ikuti status pembayarannya.</p></div><button class="button primary" aria-expanded={creating} onclick={() => { creating = !creating; error=''; }}><Plus size={16} aria-hidden="true"/> Buat tagihan</button></section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p class="success" role="status">{success}</p>{/if}

{#if creating}
	<section class="create-layout">
		<form class="panel create-form" onsubmit={create}>
			<div class="panel-header"><div><h2>Buat tagihan baru</h2><p class="muted">Pilih pasien dan masukkan rincian biaya.</p></div></div>
			<label class="field">Pasien<select name="patientId" value={patientId} onchange={(event) => choosePatient((event.currentTarget as HTMLSelectElement).value)} required><option value="">Pilih pasien</option>{#each data.reference.patients as item}<option value={item.id}>{item.medicalRecordNo} · {item.name}</option>{/each}</select></label>
			{#if patient}<div class="patient-card"><strong>{patient.name}</strong><span>{patient.medicalRecordNo}</span><span>Status BPJS: {patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</span></div>{/if}
			<div class="line-heading"><h3>Rincian layanan</h3><button class="button small" type="button" disabled={lines.length >= 30} onclick={() => lines = [...lines,{description:'',quantity:1,unitPrice:''}]}><Plus size={14} aria-hidden="true"/> Tambah baris</button></div>
			{#each lines as line, index (index)}<div class="line-row"><label class="field">Layanan<input bind:value={line.description} maxlength="160" required placeholder="Contoh: Kamar kelas 2 (malam)" /></label><label class="field quantity-field">Qty<input bind:value={line.quantity} type="number" min="1" max="10000" required /></label><label class="field">Harga satuan (Rp)<input bind:value={line.unitPrice} type="number" min="0" step="0.01" required /></label><button class="remove-line" type="button" aria-label="Hapus rincian" disabled={lines.length <= 1} onclick={() => lines = lines.filter((_, i) => i !== index)}>Hapus</button></div>{/each}
			<label class="field">Jumlah jaminan BPJS (Rp)<input bind:value={coveredAmount} type="number" min="0" step="0.01" disabled={!patient?.bpjs} required /><small class="muted">Nilai diisi sesuai hasil pemeriksaan petugas; aplikasi demo tidak memverifikasi BPJS.</small></label>
			<div class="form-actions"><button class="button primary" disabled={busy || !patientId}>Simpan tagihan</button><button class="button secondary" type="button" onclick={() => creating=false}>Batal</button></div>
		</form>
		<aside class="panel summary"><h2>Ringkasan biaya</h2><div><span>Total layanan</span><strong>{rupiah(total)}</strong></div><div><span>Jaminan BPJS</span><strong>−{rupiah(covered)}</strong></div><div class="grand-total"><span>Total tagihan</span><strong>{rupiah(payable)}</strong></div></aside>
	</section>
{/if}

{#if selected}
	<section class="panel invoice-detail">
		<div class="panel-header"><div><h2>Rincian tagihan · {selected.patientName}</h2><span class="muted">{selected.id} · {selected.medicalRecordNo}</span></div><div class="row-actions">{#if data.user.role === 'ADMISI' && !editing}<button class="button primary small" onclick={startEdit}>Ubah tagihan</button><button class="button secondary small" onclick={() => { deleting = selected; deleteReason = ''; error = ''; }}>Hapus</button>{/if}<button class="button secondary small" onclick={() => { selected = null; editing = false; }}>Tutup</button></div></div>
		<div class="patient-card"><strong>{selected.patientName}</strong><span>{selected.medicalRecordNo}</span><span>Status BPJS: {selected.bpjsSnapshot ? 'Terdaftar' : 'Tidak terdaftar'}</span><span>Status: {selected.status === 'paid' ? 'Lunas' : 'Belum dibayar'}</span></div>
		{#if editing}
		<form class="create-form" onsubmit={saveEdit}>
			<div class="line-heading"><h3>Ubah rincian layanan</h3><button class="button small" type="button" disabled={editLines.length >= 30} onclick={() => editLines = [...editLines,{description:'',quantity:1,unitPrice:''}]}><Plus size={14} aria-hidden="true"/> Tambah baris</button></div>
			{#each editLines as line, index (index)}<div class="line-row"><label class="field">Layanan<input bind:value={line.description} maxlength="160" required /></label><label class="field quantity-field">Qty<input bind:value={line.quantity} type="number" min="1" max="10000" required /></label><label class="field">Harga satuan (Rp)<input bind:value={line.unitPrice} type="number" min="0" step="0.01" required /></label><button class="remove-line" type="button" aria-label="Hapus rincian" disabled={editLines.length <= 1} onclick={() => editLines = editLines.filter((_, i) => i !== index)}>Hapus</button></div>{/each}
			<label class="field">Jumlah jaminan BPJS (Rp)<input bind:value={editCovered} type="number" min="0" step="0.01" disabled={!selected.bpjsSnapshot} required /></label>
			<label class="field">Alasan perubahan<input bind:value={editReason} maxlength="500" required placeholder="Contoh: Koreksi tarif kamar" /></label>
			<div class="detail-totals"><span>Total layanan: {rupiah(editTotal)}</span><strong>Dibayar pasien: {rupiah(editPayable)}</strong></div>
			<div class="form-actions"><button class="button primary" disabled={busy}>Simpan perubahan</button><button class="button secondary" type="button" onclick={() => editing = false}>Batal</button></div>
		</form>
		{/if}
		<div class="table-wrap"><table class="data-table"><thead><tr><th>Layanan</th><th>Qty</th><th>Harga satuan</th><th>Subtotal</th></tr></thead><tbody>{#each selected.lines as line}<tr><td>{line.description}</td><td>{line.quantity}</td><td>{rupiah(line.unitPrice)}</td><td>{rupiah(line.lineTotal)}</td></tr>{/each}</tbody></table></div>
		<div class="detail-totals"><span>Jaminan BPJS ({selected.bpjsSnapshot ? 'ya' : 'tidak'}): {rupiah(selected.coveredAmount)}</span><strong>Total: {rupiah(selected.totalAmount)} · Dibayar pasien: {rupiah(selected.payableAmount)}</strong></div>
		<h3>Riwayat perubahan</h3>{#if selected.history.length}<ul class="history-list">{#each selected.history as item}<li><strong>{actionLabel[item.action] ?? item.action} · {item.actor}</strong><span>{item.reason} · {new Date(item.createdAt).toLocaleString('id-ID')}</span></li>{/each}</ul>{:else}<p class="muted">Belum ada riwayat.</p>{/if}
	</section>
{/if}

{#if deleting}
	<Modal title="Hapus tagihan?" onclose={() => deleting = null}>
		<form onsubmit={confirmDelete}>
			<p>Tagihan <strong>{deleting.id}</strong> atas nama <strong>{deleting.patientName}</strong> akan dihapus dari daftar. Riwayat penghapusan tetap tersimpan sebagai log.</p>
			<label class="field">Alasan penghapusan<input bind:value={deleteReason} maxlength="500" required placeholder="Contoh: Tagihan salah input" /></label>
			<div class="form-actions"><button class="button primary" disabled={busy}>Ya, hapus</button><button class="button secondary" type="button" onclick={() => deleting = null}>Batal</button></div>
		</form>
	</Modal>
{/if}

<section class="stats" aria-label="Ringkasan pembayaran"><div class="stat"><strong>{data.invoices.length}</strong><span>Total tagihan</span></div><div class="stat"><strong>{data.invoices.filter((item: any) => item.status === 'unpaid').length}</strong><span>Belum dibayar</span></div><div class="stat"><strong>{data.invoices.filter((item: any) => item.status === 'paid').length}</strong><span>Lunas</span></div><div class="stat"><strong>{rupiah(data.invoices.reduce((sum: number,item: any) => sum + Number(item.payableAmount),0))}</strong><span>Total dibayar pasien</span></div></section>

<section class="panel">
	<div class="panel-header"><div><h2>Daftar tagihan</h2><span class="muted">{invoices.length} dari {data.invoices.length} tagihan</span></div></div>
	<div class="filters"><label class="field search-field">Cari pasien / nomor tagihan<input type="search" bind:value={search} placeholder="Cari nama pasien..." /></label><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option><option value="unpaid">Belum dibayar</option><option value="paid">Lunas</option></select></label></div>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>Pasien</th><th>Nomor tagihan</th><th>Total</th><th>Jaminan</th><th>Dibayar pasien</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
		{#each invoices as invoice (invoice.id)}<tr><td><strong>{invoice.patientName}</strong><span class="cell-meta">{invoice.medicalRecordNo}</span></td><td>{invoice.id}</td><td>{rupiah(invoice.totalAmount)}</td><td>{invoice.bpjsSnapshot ? rupiah(invoice.coveredAmount) : '—'}</td><td>{rupiah(invoice.payableAmount)}</td><td><span class="badge {invoice.status}">{invoice.status === 'paid' ? 'Lunas' : 'Belum dibayar'}</span></td><td><div class="row-actions"><button class="text-link" onclick={() => void openInvoice(invoice.id)}>Lihat detail</button>{#if data.user.role === 'ADMISI'}<button class="text-link" onclick={() => { deleting = invoice; deleteReason = ''; error = ''; }}>Hapus</button>{/if}{#if data.user.role === 'ADMISI'}<details><summary>Ubah status</summary><form class="status-form" onsubmit={(event) => updateStatus(event,invoice)}><label class="field">Status<select name="status"><option value="paid" disabled={invoice.status==='paid'}>Lunas</option><option value="unpaid" disabled={invoice.status==='unpaid'}>Belum dibayar</option></select></label><label class="field">Alasan<input name="reason" maxlength="500" required /></label><button class="button primary small" disabled={busy}>Simpan</button></form></details>{/if}</div></td></tr>
		{:else}<tr><td colspan="7" class="empty">Belum ada tagihan yang cocok.</td></tr>{/each}
	</tbody></table></div>
</section>
<p class="muted scope-note">Status dan nilai jaminan di atas dicatat oleh petugas Admisi. Pembayaran dan verifikasi BPJS tidak terhubung ke layanan eksternal.</p>

<style>
	.create-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,0.8fr);gap:24px;margin-bottom:24px}
	.create-form>.field{margin-bottom:20px}
	.patient-card{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 0;margin-bottom:16px;border-bottom:1px solid var(--border);font-size:13px}
	.patient-card span{color:var(--muted)}
	.line-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:20px 0 8px}
	.line-row{display:grid;grid-template-columns:minmax(140px,1fr) 72px minmax(120px,160px) auto;gap:12px;align-items:end;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:20px}
	.remove-line{border:0;background:transparent;color:#a63636;padding:10px 4px;font-size:12px}
	.summary{height:max-content}
	.summary h2{margin-bottom:16px}
	.summary>div{display:flex;justify-content:space-between;gap:16px;padding:12px 0;font-size:13px;border-bottom:1px solid var(--border)}
	.summary strong{font-variant-numeric:tabular-nums;white-space:nowrap}
	.summary .grand-total{font-size:15px;border:0;border-top:1px solid var(--border);margin-top:12px;padding-top:20px}
	.search-field{min-width:220px;flex:2}
	.cell-meta{display:block;font-size:12px;color:var(--muted);margin-top:4px}
	.row-actions{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;min-width:160px}
	.row-actions .text-link,.row-actions summary{font-size:13px;padding:6px 0;min-height:32px}
	.row-actions summary{cursor:pointer;color:var(--primary)}
	.status-form{width:220px;padding:12px 0 4px}
	.status-form .field{margin-bottom:12px}
	.data-table th:nth-child(n+3):nth-child(-n+5),.data-table td:nth-child(n+3):nth-child(-n+5){text-align:right;white-space:nowrap}
	.detail-totals{display:flex;justify-content:space-between;gap:16px;padding:20px 0;font-variant-numeric:tabular-nums}
	.history-list{list-style:none;padding:0}
	.history-list li{display:grid;gap:6px;border-top:1px solid var(--border);padding:16px 0;font-size:13px}
	.history-list span{color:var(--muted)}
	.scope-note{margin-top:20px;font-size:12px;max-width:80ch}
	@media(max-width:1100px){.create-layout{grid-template-columns:1fr}}
	@media(max-width:800px){.line-row{grid-template-columns:1fr 72px 1fr auto}.detail-totals{flex-direction:column}}
	@media(max-width:550px){.line-row{grid-template-columns:80px minmax(0,1fr)}.line-row .field:first-child{grid-column:1/-1}.patient-card{align-items:flex-start;flex-direction:column}.line-heading{align-items:flex-start;flex-direction:column}}
	@media(max-width:600px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.stat{border-right:0}.stats .stat:not(:last-child){border-bottom:1px solid var(--border)}.stat:last-child{grid-column:1/-1}.stat strong{overflow-wrap:anywhere}}
</style>
