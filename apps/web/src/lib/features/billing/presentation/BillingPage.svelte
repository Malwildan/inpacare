<script lang="ts">
import { invalidateAll } from '$app/navigation';
import type { Billing, BillingPageData, PatientInvoiceContext, SelectedInvoice, Invoice, InvoiceLine, ChangePayment } from '$lib/features/billing';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { money as rupiah } from '$lib/shared/format';
import { Plus } from 'lucide-svelte';
import Modal from '$lib/shared/ui/Modal.svelte';
let { data, billing }: {
    data: BillingPageData;
    billing: Billing;
} = $props();
let creating = $state(false);
let patientId = $state('');
let creationContext = $state<PatientInvoiceContext | null>(null);
let search = $state('');
let statusFilter = $state('');
let lines = $state([{ description: '', quantity: 1, unitPrice: '' }]);
let coveredAmount = $state('0');
let busy = $state(false);
let error = $state('');
let success = $state('');
let selected = $state<SelectedInvoice | null>(null);
let editingInvoice = $state(false);
let editLines = $state<InvoiceLine[]>([]);
let editCovered = $state('0');
let editReason = $state('');
let deletingInvoice = $state<SelectedInvoice | null>(null);
let deleteReason = $state('');
let editTotal = $derived(editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
let patient = $derived(data.reference.patients.find((item) => item.id === patientId));
let total = $derived(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
let covered = $derived(Number(coveredAmount) || 0);
let payable = $derived(Math.max(0, total - covered));
let invoices = $derived(data.invoices.filter((invoice) => (!search || `${invoice.patientName} ${invoice.medicalRecordNo} ${invoice.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
    (!statusFilter || invoice.status === statusFilter)));
async function send<T>(operation: () => Promise<T>) {
    busy = true;
    error = '';
    success = '';
    try {
        const result = await operation();
        await invalidateAll();
        success = 'Perubahan berhasil disimpan.';
        return result;
    }
    catch (cause) {
        error = sessionFailure(cause);
    }
    finally {
        busy = false;
    }
}
async function create(event: SubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const result = await send(() => billing.create({
        patientId: formText(form, 'patientId'), placementId: formText(form, 'placementId') || null, coveredAmount: String(coveredAmount),
        lines: lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: String(line.unitPrice) }))
    }));
    if (result) {
        creating = false;
        lines = [{ description: '', quantity: 1, unitPrice: '' }];
        coveredAmount = '0';
    }
}
async function openInvoice(id: string) {
    error = '';
    try {
        const invoice = await billing.openInvoice(id);
        editingInvoice = false;
        selected = invoice;
    }
    catch (cause) {
        error = sessionFailure(cause);
    }
}
function startInvoiceEdit() {
    if (!selected || selected.status === 'paid') return;
    editLines = selected.lines.map((line) => ({ ...line }));
    editCovered = selected.coveredAmount;
    editReason = '';
    editingInvoice = true;
    error = '';
}
async function saveInvoiceEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!selected) return;
    const id = selected.id;
    const result = await send(() => billing.changePayment(id, {
        lines: editLines.map(({ roomItemId, kind, description, quantity, unitPrice }) => ({ roomItemId, kind, description, quantity: Number(quantity), unitPrice: String(unitPrice) })),
        coveredAmount: String(editCovered), reason: editReason, expectedVersion: selected!.version
    }));
    if (result) { editingInvoice = false; await openInvoice(id); }
}
async function updateStatus(event: SubmitEvent, invoice: Pick<Invoice, 'id' | 'version'>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const result = await send(() => billing.changePayment(invoice.id, { status: formText(form, 'status') as ChangePayment['status'], reason: formText(form, 'reason'), expectedVersion: invoice.version }));
    if (result && selected?.id === invoice.id)
        await openInvoice(invoice.id);
}
async function editLine(event: SubmitEvent, line: InvoiceLine) { event.preventDefault(); if (!selected)
    return; const f = new FormData(event.currentTarget as HTMLFormElement); const reason = String(formText(f, 'reason') ?? '').trim(); if (!reason) {
    error = 'Alasan perubahan rincian wajib diisi.';
    return;
} const result = await send(() => billing.editLine(selected!.id, line.id, { roomItemId: formText(f, 'roomItemId') || null, kind: formText(f, 'kind') || null, description: formText(f, 'description'), quantity: Number(formText(f, 'quantity')), unitPrice: String(formText(f, 'unitPrice')), expectedVersion: selected!.version, reason })); if (result)
    await openInvoice(selected!.id); }
async function deleteLine(line: InvoiceLine) { if (!selected)
    return; const reason = prompt('Alasan penghapusan rincian:'); if (!reason?.trim() || !confirm(`Hapus rincian ${line.description}?`))
    return; const id = selected.id; if (await send(() => billing.deleteLine(id, line.id, { expectedVersion: selected!.version, reason })))
    await openInvoice(id); }
async function verifyClaim(event: SubmitEvent, invoice: Pick<Invoice, 'id' | 'version'>) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); if (await send(() => billing.verifyClaim(invoice.id, { result: formText(f, 'result'), verified: formText(f, 'verified') === 'true', reason: formText(f, 'reason'), expectedVersion: invoice.version })))
    await openInvoice(invoice.id); }
function startInvoiceDelete() {
    if (!selected) return;
    deletingInvoice = selected;
    deleteReason = '';
    error = '';
}
async function deleteInvoice(event: SubmitEvent) {
    event.preventDefault();
    const invoice = deletingInvoice;
    if (!invoice) return;
    if (await send(() => billing.remove(invoice.id, { expectedVersion: invoice.version, reason: deleteReason }))) {
        deletingInvoice = null;
        if (selected?.id === invoice.id) selected = null;
        editingInvoice = false;
        success = 'Tagihan berhasil dihapus. Riwayat penghapusan tetap tercatat.';
    }
}
async function choosePatient(value: string) {
    patientId = value;
    creationContext = null;
    if (!data.reference.patients.find((item) => item.id === value)?.bpjs)
        coveredAmount = '0';
    if (value) {
        try {
            const context = await billing.patientContext(value);
            if (patientId === value)
                creationContext = context;
        }
        catch (cause) {
            if (patientId === value)
                error = sessionFailure(cause);
        }
    }
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
			{#if creationContext}<label class="field">Penempatan<select name="placementId"><option value="">Tanpa penempatan</option>{#each creationContext.placements as placement}<option value={placement.id}>{placement.room} · {placement.startsOn} – {placement.endsOn}</option>{/each}</select></label>{/if}
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
		<div class="panel-header"><div><h2>Rincian tagihan · {selected.patientName}</h2><span class="muted">{selected.id} · {selected.medicalRecordNo}</span></div><button class="button secondary small" onclick={() => selected=null}>Tutup</button></div>
		<div class="patient-card"><strong>{selected.patientContext.patient.name}</strong><span>Status BPJS pasien: {selected.patientContext.patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</span><span>Riwayat tagihan pasien: {selected.patientContext.invoices.length}</span></div>
		<div class="table-wrap"><table class="data-table"><thead><tr><th>Layanan</th><th>Qty</th><th>Harga satuan</th><th>Subtotal</th></tr></thead><tbody>{#each selected.lines as line}<tr><td>{line.description}</td><td>{line.quantity}</td><td>{rupiah(line.unitPrice)}</td><td>{rupiah(line.lineTotal)}</td></tr>{/each}</tbody></table></div>
		{#if data.user.role==='ADMISI'}<div class="invoice-line-editors"><div class="line-heading"><h3>Rincian dan jaminan</h3><button class="button secondary small" disabled={busy||selected.status==='paid'} onclick={startInvoiceEdit}>Ubah tagihan</button></div>{#if editingInvoice}<form onsubmit={saveInvoiceEdit}><div class="line-heading"><h3>Edit rincian</h3><button class="button small" type="button" disabled={editLines.length>=30} onclick={()=>editLines=[...editLines,{id:'',description:'',quantity:1,unitPrice:'0',lineTotal:'0',roomItemId:null,kind:'service'}]}>Tambah baris</button></div>{#each editLines as line,index (index)}<div class="line-editor"><label class="field">Jenis<input bind:value={line.kind} maxlength="40"/></label><label class="field">Item ruangan<select bind:value={line.roomItemId}><option value={null}>Layanan tanpa item ruangan</option>{#each data.rooms as room}{#each room.items as roomItem}<option value={roomItem.id}>{room.name} · {roomItem.name}</option>{/each}{/each}</select></label><label class="field">Deskripsi<input bind:value={line.description} required maxlength="160"/></label><label class="field">Jumlah<input bind:value={line.quantity} type="number" min="1" max="10000" required/></label><label class="field">Harga satuan<input bind:value={line.unitPrice} type="number" min="0" step="0.01" required/></label><button class="remove-line" type="button" aria-label="Hapus rincian" disabled={editLines.length<=1} onclick={()=>editLines=editLines.filter((_,i)=>i!==index)}>Hapus</button></div>{/each}<label class="field">Jumlah jaminan BPJS (Rp)<input bind:value={editCovered} type="number" min="0" step="0.01" disabled={!selected.bpjsSnapshot} required/></label><label class="field">Alasan perubahan<input bind:value={editReason} required maxlength="500"/></label><div class="detail-totals"><span>Total layanan: {rupiah(editTotal)}</span><strong>Dibayar pasien: {rupiah(Math.max(0,editTotal-Number(editCovered)))}</strong></div><div class="form-actions"><button class="button primary" disabled={busy}>Simpan perubahan</button><button class="button secondary" type="button" onclick={()=>editingInvoice=false}>Batal</button></div></form>{:else}{#each selected.lines as line (line.id)}<form class="line-editor" onsubmit={(event)=>editLine(event,line)}><label class="field">Jenis<input name="kind" value={line.kind??''} placeholder="layanan / item"/></label><label class="field">Item ruangan<select name="roomItemId" value={line.roomItemId??''}><option value="">Layanan tanpa item ruangan</option>{#each data.rooms as room}{#each room.items as roomItem}<option value={roomItem.id}>{room.name} · {roomItem.name}</option>{/each}{/each}</select></label><label class="field">Deskripsi<input name="description" value={line.description} required maxlength="160"/></label><label class="field">Jumlah<input name="quantity" type="number" min="1" value={line.quantity} required/></label><label class="field">Harga satuan<input name="unitPrice" type="number" min="0" step="0.01" value={line.unitPrice} required/></label><label class="field">Alasan<input name="reason" required maxlength="500"/></label><div class="row-actions"><button class="button primary small" disabled={busy}>Simpan</button><button class="button danger small" type="button" disabled={busy||selected.status==='paid'} onclick={()=>void deleteLine(line)}>Hapus</button></div></form>{/each}{/if}</div><div class="invoice-management"><p>Status verifikasi klaim: <strong>{selected.claimResult??'Belum ada hasil verifikasi'}</strong></p><div class="row-actions"><form class="form-grid" onsubmit={(event)=>selected&&verifyClaim(event,selected)}><label class="field">Hasil verifikasi klaim<input name="result" value={selected.claimResult??''} required maxlength="120" list="claim-results"/><datalist id="claim-results"><option value="Disetujui"></option><option value="Ditolak"></option><option value="Perlu perbaikan berkas"></option></datalist></label><label class="field">Keputusan klaim<select name="verified" value={String(selected.claimVerified)}><option value="false">Belum disetujui</option><option value="true">Disetujui</option></select></label><label class="field">Alasan verifikasi<input name="reason" required maxlength="500"/></label><button class="button secondary small" disabled={busy||!selected.bpjsSnapshot}>Simpan verifikasi klaim</button></form><button class="button danger small" disabled={busy||selected.status==='paid'} onclick={startInvoiceDelete}>Hapus tagihan</button></div></div>{/if}
		<div class="detail-totals"><span>Jaminan BPJS ({selected.bpjsSnapshot ? 'ya' : 'tidak'}): {rupiah(selected.coveredAmount)}</span><strong>Total: {rupiah(selected.totalAmount)} · Dibayar pasien: {rupiah(selected.payableAmount)}</strong></div>
		<h3>Riwayat perubahan</h3>{#if selected.history.length}<ul class="history-list">{#each selected.history as item}<li><strong>{({created:'Tagihan dibuat',status_changed:'Status pembayaran diubah',updated:'Tagihan dan jaminan diperbarui',line_updated:'Rincian diperbarui',line_deleted:'Rincian dihapus',claim_verification:'Klaim diverifikasi',deleted:'Tagihan dihapus'} as Record<string,string>)[item.action] ?? item.action} · {item.actor}</strong><span>{item.reason} · {new Date(item.createdAt).toLocaleString('id-ID')}</span></li>{/each}</ul>{:else}<p class="muted">Belum ada riwayat.</p>{/if}
	</section>
{/if}

{#if deletingInvoice}
    <Modal title="Hapus tagihan?" onclose={() => { if (!busy) deletingInvoice = null; }}>
        <form onsubmit={deleteInvoice}>
            <p>Tagihan <strong>{deletingInvoice.id}</strong> atas nama <strong>{deletingInvoice.patientName}</strong> akan dihapus dari daftar. Riwayat penghapusan tetap tersimpan.</p>
            {#if error}<p class="error" role="alert">{error}</p>{/if}
            <label class="field">Alasan penghapusan<input bind:value={deleteReason} maxlength="500" required /></label>
            <div class="form-actions">
                <button class="button danger" disabled={busy}>Ya, hapus</button>
                <button class="button secondary" type="button" disabled={busy} onclick={() => deletingInvoice = null}>Batal</button>
            </div>
        </form>
    </Modal>
{/if}

<section class="stats" aria-label="Ringkasan pembayaran"><div class="stat"><strong>{data.invoices.length}</strong><span>Total tagihan</span></div><div class="stat"><strong>{data.invoices.filter((item) => item.status === 'unpaid').length}</strong><span>Belum dibayar</span></div><div class="stat"><strong>{data.invoices.filter((item) => item.status === 'paid').length}</strong><span>Lunas</span></div><div class="stat"><strong>{rupiah(data.invoices.reduce((sum: number,item) => sum + Number(item.payableAmount),0))}</strong><span>Total dibayar pasien</span></div></section>

<section class="panel">
	<div class="panel-header"><div><h2>Daftar tagihan</h2><span class="muted">{invoices.length} dari {data.invoices.length} tagihan</span></div></div>
	<div class="filters"><label class="field search-field">Cari pasien / nomor tagihan<input type="search" bind:value={search} placeholder="Cari nama pasien..." /></label><label class="field">Status<select bind:value={statusFilter}><option value="">Semua status</option><option value="unpaid">Belum dibayar</option><option value="paid">Lunas</option></select></label></div>
	<div class="table-wrap"><table class="data-table"><thead><tr><th>Pasien</th><th>Nomor tagihan</th><th>Total</th><th>Jaminan</th><th>Dibayar pasien</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
		{#each invoices as invoice (invoice.id)}<tr><td><strong>{invoice.patientName}</strong><span class="cell-meta">{invoice.medicalRecordNo}</span></td><td>{invoice.id}</td><td>{rupiah(invoice.totalAmount)}</td><td>{invoice.bpjsSnapshot ? rupiah(invoice.coveredAmount) : '—'}</td><td>{rupiah(invoice.payableAmount)}</td><td><span class="badge {invoice.status}">{invoice.status === 'paid' ? 'Lunas' : 'Belum dibayar'}</span></td><td><div class="row-actions"><button class="text-link" onclick={() => void openInvoice(invoice.id)}>Lihat detail</button>{#if data.user.role === 'ADMISI'}<details><summary>Ubah status</summary><form class="status-form" onsubmit={(event) => updateStatus(event,invoice)}><label class="field">Status<select name="status"><option value="paid" disabled={invoice.status==='paid'}>Lunas</option><option value="unpaid" disabled={invoice.status==='unpaid'}>Belum dibayar</option></select></label><label class="field">Alasan<input name="reason" maxlength="500" required /></label><button class="button primary small" disabled={busy}>Simpan</button></form></details>{/if}</div></td></tr>
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
	.row-actions .text-link,.row-actions summary{font-size:13px;padding:6px 0;min-height:44px}
	.row-actions summary{cursor:pointer;color:var(--primary)}
	.status-form{width:220px;padding:12px 0 4px}
	.status-form .field{margin-bottom:12px}
	.data-table th:nth-child(n+3):nth-child(-n+5),.data-table td:nth-child(n+3):nth-child(-n+5){text-align:right;white-space:nowrap}
	.detail-totals{display:flex;justify-content:space-between;gap:16px;padding:20px 0;font-variant-numeric:tabular-nums}
	.history-list{list-style:none;padding:0}
	.history-list li{display:grid;gap:6px;border-top:1px solid var(--border);padding:16px 0;font-size:13px}
	.history-list span{color:var(--muted)}
	.scope-note{margin-top:20px;font-size:12px;max-width:80ch}
	.invoice-line-editors{border-top:1px solid var(--border);padding:20px 0}.invoice-line-editors h3{margin-bottom:16px}.line-editor{display:grid;grid-template-columns:1fr 1.5fr 90px 1fr 1fr auto;align-items:end;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)}.invoice-management{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding-top:18px}.invoice-management p{margin:0;font-size:13px}.row-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
	@media(max-width:1100px){.create-layout{grid-template-columns:1fr}}
	@media(max-width:800px){.line-row{grid-template-columns:1fr 72px 1fr auto}.line-editor{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-totals{flex-direction:column}}
	@media(max-width:550px){.line-row{grid-template-columns:80px minmax(0,1fr)}.line-row .field:first-child{grid-column:1/-1}.patient-card{align-items:flex-start;flex-direction:column}.line-heading{align-items:flex-start;flex-direction:column}}
	@media(max-width:600px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.stat{border-right:0}.stats .stat:not(:last-child){border-bottom:1px solid var(--border)}.stat:last-child{grid-column:1/-1}.stat strong{overflow-wrap:anywhere}}
</style>
