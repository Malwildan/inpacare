<script lang="ts">
import { Button } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
import { invalidateAll } from '$app/navigation';
import type { Billing, BillingPageData, PatientInvoiceContext, SelectedInvoice, Invoice, InvoiceLine, ChangePayment } from '$lib/features/billing';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { money as rupiah } from '$lib/shared/format';
import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
import { ChevronDown, Plus, Trash2 } from 'lucide-svelte';
import { tick } from 'svelte';
import * as DropdownMenu from '$lib/shared/ui/dropdown-menu/index.js';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import StatusBadge from '$lib/shared/ui/status-badge.svelte';
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
let claimResultDraft = $state('');
let editingInvoice = $state(false);
let editLines = $state<InvoiceLine[]>([]);
let editCovered = $state('0');
let editReason = $state('');
let deletingInvoice = $state<SelectedInvoice | null>(null);
let deleteReason = $state('');
let invoiceDeleteOpen = $state(false);
let deletingLine = $state<InvoiceLine | null>(null);
let lineDeleteOpen = $state(false);
let lineDeleteReason = $state('');
let paymentInvoice = $state<Invoice | null>(null);
let paymentOpen = $state(false);
let paymentStatus = $state('paid');
let paymentReason = $state('');
let modalOpen = $derived(paymentOpen || invoiceDeleteOpen || lineDeleteOpen);
let locked = $derived(selected?.status === 'paid');
let editTotal = $derived(editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
let patient = $derived(data.reference.patients.find((item) => item.id === patientId));
let total = $derived(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
let covered = $derived(Number(coveredAmount) || 0);
let payable = $derived(Math.max(0, total - covered));
let invoices = $derived(data.invoices.filter((invoice) => (!search || `${invoice.patientName} ${invoice.medicalRecordNo} ${invoice.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
    (!statusFilter || invoice.status === statusFilter)));
async function send<T>(operation: () => Promise<T>) {
    if (busy) return;
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
// Browser validation bubbles disappear quickly and are easy to miss; also state the problem on the page.
let lastInvalidAt = 0;
function reportInvalid(event: Event) {
    if (Date.now() - lastInvalidAt < 100) return;
    lastInvalidAt = Date.now();
    const field = event.target as HTMLInputElement;
    const label = field.labels?.[0]?.textContent?.trim() ?? 'Isian';
    error = `${label}: ${field.title || field.validationMessage || 'isian belum valid.'}`;
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
        claimResultDraft = invoice.claimResult ?? '';
    }
    catch (cause) {
        error = sessionFailure(cause);
    }
}
// Row button: open the detail right under the clicked row, or close it if it is already open.
async function toggleInvoice(id: string) {
    if (selected?.id === id) { selected = null; editingInvoice = false; error = ''; return; }
    success = '';
    await openInvoice(id);
    await tick();
    document.getElementById('invoice-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
function startPaymentChange(invoice: Invoice) {
    if (paymentInvoice?.id !== invoice.id) {
        paymentReason = '';
        paymentStatus = invoice.status === 'paid' ? 'unpaid' : 'paid';
    }
    paymentInvoice = invoice;
    paymentOpen = true;
    error = '';
}
async function updateStatus(event: SubmitEvent, invoice: Pick<Invoice, 'id' | 'version'>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const reason = formText(form, 'reason').trim();
    if (!reason) { error = 'Alasan perubahan wajib diisi.'; return; }
    const result = await send(() => billing.changePayment(invoice.id, { status: formText(form, 'status') as ChangePayment['status'], reason, expectedVersion: invoice.version }));
    if (result) {
        paymentOpen = false;
        paymentInvoice = null;
        paymentReason = '';
        if (selected?.id === invoice.id) await openInvoice(invoice.id);
    }
}
async function editLine(event: SubmitEvent, line: InvoiceLine) { event.preventDefault(); if (!selected)
    return; const f = new FormData(event.currentTarget as HTMLFormElement); const reason = String(formText(f, 'reason') ?? '').trim(); if (!reason) {
    error = 'Alasan perubahan rincian wajib diisi.';
    return;
} const result = await send(() => billing.editLine(selected!.id, line.id, { roomItemId: formText(f, 'roomItemId') || null, kind: formText(f, 'kind') || null, description: formText(f, 'description'), quantity: Number(formText(f, 'quantity')), unitPrice: String(formText(f, 'unitPrice')), expectedVersion: selected!.version, reason })); if (result)
    await openInvoice(selected!.id); }
function startLineDelete(line: InvoiceLine) {
    if (deletingLine?.id !== line.id) lineDeleteReason = '';
    deletingLine = line;
    lineDeleteOpen = true;
    error = '';
}
async function deleteLine(event: SubmitEvent) {
    event.preventDefault();
    if (!selected || !deletingLine || busy) return;
    const reason = lineDeleteReason.trim();
    if (!reason) { error = 'Alasan penghapusan wajib diisi.'; return; }
    const id = selected.id;
    const lineId = deletingLine.id;
    const expectedVersion = selected.version;
    if (await send(async () => { await billing.deleteLine(id, lineId, { expectedVersion, reason }); return true; })) {
        lineDeleteOpen = false;
        deletingLine = null;
        lineDeleteReason = '';
        await openInvoice(id);
    }
}
async function verifyClaim(event: SubmitEvent, invoice: Pick<Invoice, 'id' | 'version'>) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); if (await send(() => billing.verifyClaim(invoice.id, { result: formText(f, 'result'), verified: formText(f, 'verified') === 'true', reason: formText(f, 'reason'), expectedVersion: invoice.version })))
    await openInvoice(invoice.id); }
function startInvoiceDelete() {
    if (!selected) return;
    if (deletingInvoice?.id !== selected.id) deleteReason = '';
    deletingInvoice = selected;
    invoiceDeleteOpen = true;
    error = '';
}
async function deleteInvoice(event: SubmitEvent) {
    event.preventDefault();
    const invoice = deletingInvoice;
    if (!invoice || busy) return;
    const reason = deleteReason.trim();
    if (!reason) { error = 'Alasan penghapusan wajib diisi.'; return; }
    if (await send(async () => { await billing.remove(invoice.id, { expectedVersion: invoice.version, reason }); return true; })) {
        invoiceDeleteOpen = false;
        deletingInvoice = null;
        deleteReason = '';
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
<div class="billing-page flex min-w-0 flex-col gap-6">
<section class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="page-title">Manajemen Tagihan</h1><p class="page-subtitle">Catat biaya layanan dan perlengkapan pasien, lalu ikuti status pembayarannya.</p></div><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" aria-expanded={creating} onclick={() => { creating = !creating; error=''; }}><Plus size={16} aria-hidden="true"/> Buat tagihan</Button></section>
{#if error && !selected && !creating && !modalOpen}<p class="error" role="alert">{error}</p>{/if}
{#if success && !selected}<p class="success" role="status">{success}</p>{/if}

{#if creating}
	<section class="create-layout">
		<Card class="min-w-0 gap-4 p-5 sm:p-6"><form class="create-form" aria-label="Buat tagihan baru" onsubmit={create} oninvalidcapture={reportInvalid}>
			<div class="panel-header"><div><h2>Buat tagihan baru</h2><p class="muted">Pilih pasien dan masukkan rincian biaya.</p></div></div>
			<label class="field">Pasien<FormSelect name="patientId" value={patientId} onValueChange={choosePatient} required options={[{ value: "", label: "Pilih pasien" }, ...(data.reference.patients).map((item) => ({ value: item.id, label: (item.medicalRecordNo) + " · " + (item.name) }))]} /></label>
			{#if patient}<div class="patient-card"><strong>{patient.name}</strong><span>{patient.medicalRecordNo}</span><span>Status BPJS: {patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</span></div>{/if}
			{#if creationContext}<label class="field">Penempatan<FormSelect name="placementId" options={[{ value: "", label: "Tanpa penempatan" }, ...(creationContext.placements).map((placement) => ({ value: placement.id, label: (placement.room) + " · " + (placement.startsOn) + " – " + (placement.endsOn) }))]} /></label>{/if}
			<div class="line-heading"><h3>Rincian layanan</h3><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={lines.length >= 30} onclick={() => lines = [...lines,{description:'',quantity:1,unitPrice:''}]}><Plus size={14} aria-hidden="true"/> Tambah baris</Button></div>
			{#each lines as line, index (line)}<div class="line-row"><label class="field">Layanan<Input class="h-11 text-base md:text-sm" bind:value={line.description} maxlength={160} required placeholder="Contoh: Kamar kelas 2 (malam)" /></label><label class="field quantity-field">Qty<Input class="h-11 text-base md:text-sm" bind:value={line.quantity} type="number" min="1" max="10000" required /></label><MoneyInput label="Harga satuan (Rp)" bind:value={line.unitPrice} required /><Button variant="outline" size="icon" class="remove-line size-11 text-destructive hover:text-destructive" type="button" aria-label="Hapus baris rincian" title="Hapus baris" disabled={lines.length <= 1} onclick={() => lines = lines.filter((_, i) => i !== index)}><Trash2 size={18} aria-hidden="true" /></Button></div>{/each}
			<MoneyInput label="Jumlah jaminan BPJS (Rp)" bind:value={coveredAmount} disabled={!patient?.bpjs} required hint={!patient ? 'Pilih pasien terlebih dahulu.' : patient.bpjs ? 'Nilai diisi sesuai hasil pemeriksaan petugas; aplikasi demo tidak memverifikasi BPJS.' : 'Pasien ini tidak terdaftar BPJS, jadi jaminan otomatis Rp 0.'} />
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy || !patientId}>Simpan tagihan</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={() => creating=false}>Batal</Button></div>
		</form></Card>
		<Card class="summary h-max gap-0 p-5 sm:p-6" role="complementary" aria-label="Ringkasan biaya"><h2 class="mb-4">Ringkasan biaya</h2><div class="summary-row"><span>Total layanan</span><strong>{rupiah(total)}</strong></div><div class="summary-row"><span>Jaminan BPJS</span><strong>−{rupiah(covered)}</strong></div><div class="summary-row grand-total"><span>Total tagihan</span><strong>{rupiah(payable)}</strong></div></Card>
	</section>
{/if}

{#snippet detailPanel()}
{#if selected}
	<div id="invoice-detail" class="invoice-detail invoice-detail-inline" role="region" aria-label="Rincian tagihan">
		<div class="panel-header"><div><h2>Rincian tagihan · {selected.patientName}</h2><span class="muted">{selected.id} · {selected.medicalRecordNo}</span></div><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" onclick={() => { selected = null; editingInvoice = false; error = ''; }}>Tutup</Button></div>
		{#if error && !modalOpen}<p class="error" role="alert">{error}</p>{/if}
		{#if success}<p class="success" role="status">{success}</p>{/if}
		<div class="patient-card"><strong>{selected.patientContext.patient.name}</strong><span>Status BPJS pasien: {selected.patientContext.patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</span><span>Riwayat tagihan pasien: {selected.patientContext.invoices.length}</span></div>
		<div class="table-wrap"><Table class="data-table"><TableHeader><TableRow><TableHead>Layanan</TableHead><TableHead>Qty</TableHead><TableHead>Harga satuan</TableHead><TableHead>Subtotal</TableHead></TableRow></TableHeader><TableBody>{#each selected.lines as line}<TableRow><TableCell>{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{rupiah(line.unitPrice)}</TableCell><TableCell>{rupiah(line.lineTotal)}</TableCell></TableRow>{/each}</TableBody></Table></div>
		{#if data.user.role==='ADMISI'}<div class="invoice-line-editors">{#if locked}<p class="locked-note" role="note">Tagihan ini sudah <strong>Lunas</strong>, jadi rincian, jaminan, dan penghapusan terkunci. Ubah status ke &ldquo;Belum dibayar&rdquo; dulu kalau perlu mengubahnya.</p>{/if}<div class="line-heading"><h3>Rincian dan jaminan</h3><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" disabled={busy||selected.status==='paid'} onclick={startInvoiceEdit}>Ubah tagihan</Button></div>{#if editingInvoice}<form onsubmit={saveInvoiceEdit} oninvalidcapture={reportInvalid}><div class="line-heading"><h3>Edit rincian</h3><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={editLines.length>=30} onclick={()=>editLines=[...editLines,{id:'',description:'',quantity:1,unitPrice:'0',lineTotal:'0',roomItemId:null,kind:'service'}]}>Tambah baris</Button></div>{#each editLines as line,index (line)}<div class="line-editor editing"><label class="field">Jenis<Input class="h-11 text-base md:text-sm" bind:value={line.kind} maxlength={40}/></label><label class="field">Item ruangan<FormSelect bind:value={line.roomItemId} options={[{ value: null, label: "Layanan tanpa item ruangan" }, ...(data.rooms).flatMap((room) => [...(room.items).map((roomItem) => ({ value: roomItem.id, label: (room.name) + " · " + (roomItem.name) }))])]} /></label><label class="field">Deskripsi<Input class="h-11 text-base md:text-sm" bind:value={line.description} required maxlength={160}/></label><label class="field">Jumlah<Input class="h-11 text-base md:text-sm" bind:value={line.quantity} type="number" min="1" max="10000" required/></label><MoneyInput label="Harga satuan" bind:value={line.unitPrice} required /><Button variant="outline" size="icon" class="remove-line size-11 text-destructive hover:text-destructive" type="button" aria-label="Hapus baris rincian" title="Hapus baris" disabled={editLines.length<=1} onclick={()=>editLines=editLines.filter((_,i)=>i!==index)}><Trash2 size={18} aria-hidden="true" /></Button></div>{/each}<MoneyInput label="Jumlah jaminan BPJS (Rp)" bind:value={editCovered} disabled={!selected.bpjsSnapshot} required hint={selected.bpjsSnapshot ? '' : 'Pasien ini tidak terdaftar BPJS, jadi jaminan otomatis Rp 0.'} /><label class="field">Alasan perubahan<Input class="h-11 text-base md:text-sm" bind:value={editReason} required maxlength={500}/></label><div class="detail-totals"><span>Total layanan: {rupiah(editTotal)}</span><strong>Dibayar pasien: {rupiah(Math.max(0,editTotal-Number(editCovered)))}</strong></div><div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}>Simpan perubahan</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={()=>editingInvoice=false}>Batal</Button></div></form>{:else}{#each selected.lines as line (line.id)}<form class="line-editor" onsubmit={(event)=>editLine(event,line)}><fieldset class="contents" disabled={locked}><label class="field">Jenis<Input class="h-11 text-base md:text-sm" name="kind" value={line.kind??''} placeholder="layanan / item"/></label><label class="field">Item ruangan<FormSelect name="roomItemId" value={line.roomItemId??''} options={[{ value: "", label: "Layanan tanpa item ruangan" }, ...(data.rooms).flatMap((room) => [...(room.items).map((roomItem) => ({ value: roomItem.id, label: (room.name) + " · " + (roomItem.name) }))])]} /></label><label class="field">Deskripsi<Input class="h-11 text-base md:text-sm" name="description" value={line.description} required maxlength={160}/></label><label class="field">Jumlah<Input class="h-11 text-base md:text-sm" name="quantity" type="number" min="1" value={line.quantity} required/></label><MoneyInput label="Harga satuan" name="unitPrice" value={line.unitPrice} required /><label class="field">Alasan<Input class="h-11 text-base md:text-sm" name="reason" required maxlength={500}/></label><div class="row-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy||locked}>Simpan</Button><Button variant="outline" size="icon" class="size-11 text-destructive hover:text-destructive" type="button" aria-label="Hapus rincian" title={locked ? 'Tagihan lunas tidak dapat diubah' : 'Hapus rincian'} disabled={busy||locked} onclick={()=>startLineDelete(line)}><Trash2 size={18} aria-hidden="true" /></Button></div></fieldset></form>{/each}{/if}</div><div class="invoice-management"><div><p>Status verifikasi klaim: <strong>{selected.claimResult??'Belum ada hasil verifikasi'}</strong></p>{#if !selected.bpjsSnapshot}<p class="muted note">Pasien tidak terdaftar BPJS, jadi verifikasi klaim tidak tersedia.</p>{/if}</div><div class="row-actions"><form class="form-grid" onsubmit={(event)=>selected&&verifyClaim(event,selected)}><div class="field"><label for="claim-result">Hasil verifikasi klaim</label><div class="relative">
    <Input id="claim-result" class="h-11 pr-12 text-base md:text-sm" name="result" bind:value={claimResultDraft} required maxlength={120} />
    <DropdownMenu.Root>
        <DropdownMenu.Trigger>
            {#snippet child({ props })}
                <Button {...props} type="button" variant="ghost" class="absolute top-0 right-0 size-11" aria-label="Saran hasil verifikasi"><ChevronDown size={16} aria-hidden="true" /></Button>
            {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
            {#each ['Disetujui', 'Ditolak', 'Perlu perbaikan berkas'] as result}
                <DropdownMenu.Item class="min-h-11" onSelect={() => claimResultDraft = result}>{result}</DropdownMenu.Item>
            {/each}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
</div></div><label class="field">Keputusan klaim<FormSelect name="verified" value={String(selected.claimVerified)} options={[{ value: "false", label: "Belum disetujui" }, { value: "true", label: "Disetujui" }]} /></label><label class="field">Alasan verifikasi<Input class="h-11 text-base md:text-sm" name="reason" required maxlength={500}/></label><Button variant="outline" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy||!selected.bpjsSnapshot}>Simpan verifikasi klaim</Button></form><div class="delete-invoice"><Button variant="outline" class="h-11 gap-2 px-4 text-destructive no-underline hover:text-destructive hover:no-underline" disabled={busy||locked} onclick={startInvoiceDelete}><Trash2 size={16} aria-hidden="true" /> Hapus tagihan</Button>{#if locked}<span class="muted note">Tagihan lunas tidak dapat dihapus.</span>{/if}</div></div></div>{/if}
		<div class="detail-totals"><span>{selected.bpjsSnapshot ? `Jaminan BPJS: ${rupiah(selected.coveredAmount)}` : 'Tanpa jaminan BPJS (pasien tidak terdaftar)'}</span><strong>Total: {rupiah(selected.totalAmount)} · Dibayar pasien: {rupiah(selected.payableAmount)}</strong></div>
		<h3>Riwayat perubahan</h3>{#if selected.history.length}<ul class="history-list">{#each selected.history as item}<li><strong>{({created:'Tagihan dibuat',status_changed:'Status pembayaran diubah',updated:'Tagihan dan jaminan diperbarui',line_updated:'Rincian diperbarui',line_deleted:'Rincian dihapus',claim_verification:'Klaim diverifikasi',deleted:'Tagihan dihapus'} as Record<string,string>)[item.action] ?? item.action} · {item.actor}</strong><span>{item.reason} · {new Date(item.createdAt).toLocaleString('id-ID')}</span></li>{/each}</ul>{:else}<p class="muted">Belum ada riwayat.</p>{/if}
	</div>
{/if}
{/snippet}

{#if invoiceDeleteOpen && deletingInvoice}
    <Modal title="Hapus tagihan?" description="Periksa tagihan dan masukkan alasan sebelum menghapusnya." {busy} onclose={() => invoiceDeleteOpen = false}>
        <form onsubmit={deleteInvoice}>
            <p class="mb-4">Tagihan <strong>{deletingInvoice.id}</strong> atas nama <strong>{deletingInvoice.patientName}</strong> akan dihapus dari daftar. Riwayat penghapusan tetap tersimpan.</p>
            {#if error}<p class="error" role="alert">{error}</p>{/if}
            <label class="field">Alasan penghapusan<Input class="h-11 text-base md:text-sm" bind:value={deleteReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button variant="destructive" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}>Ya, hapus</Button>
                <Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={busy} onclick={() => invoiceDeleteOpen = false}>Batal</Button>
            </div>
        </form>
    </Modal>
{/if}

{#if paymentOpen && paymentInvoice}
    <Modal title="Ubah status pembayaran" description="Pilih status pembayaran dan catat alasan perubahan untuk riwayat tagihan." {busy} onclose={() => paymentOpen = false}>
        <form onsubmit={(event) => paymentInvoice && updateStatus(event, paymentInvoice)}>
            <p class="mb-4">Tagihan <strong>{paymentInvoice.id}</strong> · {paymentInvoice.patientName}</p>
            {#if error}<p class="error" role="alert">{error}</p>{/if}
            <label class="field">Status<FormSelect name="status" bind:value={paymentStatus} options={[{ value: "paid", label: "Lunas", disabled: paymentInvoice.status === 'paid' }, { value: "unpaid", label: "Belum dibayar", disabled: paymentInvoice.status === 'unpaid' }]} /></label>
            <label class="field">Alasan perubahan<Textarea name="reason" class="min-h-24" bind:value={paymentReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button type="submit" class="h-11" disabled={busy}>Simpan status</Button>
                <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={() => paymentOpen = false}>Batal</Button>
            </div>
        </form>
    </Modal>
{/if}

{#if lineDeleteOpen && deletingLine}
    <Modal title="Hapus rincian tagihan?" description="Masukkan alasan penghapusan rincian. Total akan dihitung kembali oleh server." {busy} onclose={() => lineDeleteOpen = false}>
        <form onsubmit={deleteLine}>
            <p class="mb-4">Rincian <strong>{deletingLine.description}</strong> akan dihapus. Riwayat perubahan tetap tersimpan.</p>
            {#if error}<p class="error" role="alert">{error}</p>{/if}
            <label class="field">Alasan penghapusan<Textarea class="min-h-24" bind:value={lineDeleteReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button variant="destructive" type="submit" class="h-11" disabled={busy}>Konfirmasi hapus</Button>
                <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={() => lineDeleteOpen = false}>Batal</Button>
            </div>
        </form>
    </Modal>
{/if}

<section class="grid min-w-0 grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Ringkasan pembayaran">
    <Card class="min-w-0 gap-1 p-5"><strong class="text-2xl tabular-nums">{data.invoices.length}</strong><span class="text-sm text-muted-foreground">Total tagihan</span></Card>
    <Card class="min-w-0 gap-1 p-5"><strong class="text-2xl tabular-nums">{data.invoices.filter((item) => item.status === 'unpaid').length}</strong><span class="text-sm text-muted-foreground">Belum dibayar</span></Card>
    <Card class="min-w-0 gap-1 p-5"><strong class="text-2xl tabular-nums">{data.invoices.filter((item) => item.status === 'paid').length}</strong><span class="text-sm text-muted-foreground">Lunas</span></Card>
    <Card class="min-w-0 gap-1 p-5"><strong class="break-words text-base tabular-nums sm:text-xl">{rupiah(data.invoices.reduce((sum: number,item) => sum + Number(item.payableAmount),0))}</strong><span class="text-sm text-muted-foreground">Total dibayar pasien</span></Card>
</section>

<Card class="min-w-0 gap-4 p-5 sm:p-6" role="region" aria-label="Daftar tagihan">
	<div class="panel-header"><div><h2>Daftar tagihan</h2><span class="muted">{invoices.length} dari {data.invoices.length} tagihan</span></div></div>
	<div class="filters"><label class="field search-field">Cari pasien / nomor tagihan<Input class="h-11 text-base md:text-sm" type="search" bind:value={search} placeholder="Cari nama pasien..." /></label><label class="field">Status<FormSelect bind:value={statusFilter} options={[{ value: "", label: "Semua status" }, { value: "unpaid", label: "Belum dibayar" }, { value: "paid", label: "Lunas" }]} /></label></div>
	<div class="table-wrap"><Table class="data-table"><TableHeader><TableRow><TableHead>Pasien</TableHead><TableHead>Nomor tagihan</TableHead><TableHead>Total</TableHead><TableHead>Jaminan</TableHead><TableHead>Dibayar pasien</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>
		{#each invoices as invoice (invoice.id)}<TableRow><TableCell><strong>{invoice.patientName}</strong><span class="cell-meta">{invoice.medicalRecordNo}</span></TableCell><TableCell>{invoice.id}</TableCell><TableCell>{rupiah(invoice.totalAmount)}</TableCell><TableCell>{invoice.bpjsSnapshot ? rupiah(invoice.coveredAmount) : '—'}</TableCell><TableCell>{rupiah(invoice.payableAmount)}</TableCell><TableCell><StatusBadge value={invoice.status} label={invoice.status === 'paid' ? 'Lunas' : 'Belum dibayar'} /></TableCell><TableCell><div class="row-actions"><Button variant="outline" class="h-11 px-4" aria-expanded={selected?.id === invoice.id} onclick={() => void toggleInvoice(invoice.id)}>{selected?.id === invoice.id ? 'Tutup detail' : 'Lihat detail'}</Button>{#if data.user.role === 'ADMISI'}<Button variant="outline" class="h-11" disabled={busy} onclick={() => startPaymentChange(invoice)}>Ubah status</Button>{/if}</div></TableCell></TableRow>
		{#if selected?.id === invoice.id}<TableRow class="detail-row hover:bg-transparent"><TableCell colspan={7} class="whitespace-normal p-0">{@render detailPanel()}</TableCell></TableRow>{/if}
		{:else}<TableRow><TableCell colspan={7} class="empty">Belum ada tagihan yang cocok.</TableCell></TableRow>{/each}
	</TableBody></Table></div>
</Card>
<p class="muted scope-note">Status dan nilai jaminan di atas dicatat oleh petugas Admisi. Pembayaran dan verifikasi BPJS tidak terhubung ke layanan eksternal.</p>
</div>

<style>
	.create-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,0.8fr);gap:24px}
	.create-form>.field{margin-bottom:20px}
	.patient-card{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 0;margin-bottom:16px;border-bottom:1px solid var(--border);font-size:13px}
	.patient-card span{color:var(--muted-foreground)}
	.line-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:20px 0 8px}
	.line-row{display:grid;grid-template-columns:minmax(140px,1fr) 72px minmax(120px,160px) auto;gap:12px;align-items:end;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:20px}
	.summary-row{display:flex;justify-content:space-between;gap:16px;padding:12px 0;font-size:13px;border-bottom:1px solid var(--border)}
	.summary-row strong{font-variant-numeric:tabular-nums;white-space:nowrap}
	.grand-total{font-size:15px;border:0;border-top:1px solid var(--border);margin-top:12px;padding-top:20px}
	.search-field{min-width:220px;flex:2}
	.cell-meta{display:block;font-size:12px;color:var(--muted-foreground);margin-top:4px}
	.row-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:160px}
	.billing-page :global(.data-table th:nth-child(n+3):nth-child(-n+5)),.billing-page :global(.data-table td:nth-child(n+3):nth-child(-n+5)){text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
	.detail-totals{display:flex;justify-content:space-between;gap:16px;padding:20px 0;font-variant-numeric:tabular-nums}
	.history-list{list-style:none;padding:0}
	.history-list li{display:grid;gap:6px;border-top:1px solid var(--border);padding:16px 0;font-size:13px}
	.history-list span{color:var(--muted-foreground)}
	.scope-note{margin-top:20px;font-size:12px;max-width:80ch}
	.invoice-line-editors{border-top:1px solid var(--border);padding:20px 0}.invoice-line-editors h3{margin-bottom:16px}
	/* Jenis | Item ruangan | Deskripsi | Jumlah | Harga satuan | Alasan | Aksi */
	.line-editor{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(190px,1.3fr) minmax(170px,1.6fr) 72px minmax(120px,.9fr) minmax(130px,1fr) auto;align-items:end;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)}
	.line-editor.editing{grid-template-columns:minmax(100px,.8fr) minmax(190px,1.3fr) minmax(170px,1.6fr) 72px minmax(120px,.9fr) auto}
	.billing-page :global(.table-wrap){container-type:inline-size}
	.invoice-detail-inline{position:sticky;left:0;width:100cqw;box-sizing:border-box;display:flex;flex-direction:column;gap:16px;padding:24px;background:var(--muted);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
	.locked-note{margin:0 0 16px;padding:12px 15px;border:1px solid var(--border);border-radius:8px;background:var(--background);font-size:13px}
	.note{margin:4px 0 0;font-size:12px}.delete-invoice{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
	:global([data-slot="dialog-content"] .form-actions){border-top:0;padding-top:0;margin-top:20px}.invoice-management{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding-top:18px}.invoice-management p{margin:0;font-size:13px}.row-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
	@media(max-width:1100px){.create-layout{grid-template-columns:1fr}}
	@media(max-width:1200px){.line-editor,.line-editor.editing{grid-template-columns:repeat(2,minmax(0,1fr))}.line-editor :global(.field:nth-child(3)),.line-editor.editing :global(.field:nth-child(3)){grid-column:1/-1}}
	@media(max-width:800px){.line-row{grid-template-columns:1fr 72px 1fr auto}.invoice-detail-inline{padding:16px}.detail-totals{flex-direction:column}}
	@media(max-width:550px){.line-row{grid-template-columns:80px minmax(0,1fr)}.line-row .field:first-child{grid-column:1/-1}.patient-card{align-items:flex-start;flex-direction:column}.line-heading{align-items:flex-start;flex-direction:column}}
</style>
