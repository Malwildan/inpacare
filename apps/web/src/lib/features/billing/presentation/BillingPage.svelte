<script lang="ts">
import { toast } from '$lib/shared/ui/sonner/index.js';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card } from '$lib/shared/ui/card/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
import { invalidateAll } from '$app/navigation';
import { draftRoomLines, type Billing, type BillingPageData, type PatientInvoiceContext, type SelectedInvoice, type Invoice, type InvoiceLine, type ChangePayment, type NewInvoice, type ReleaseHandoff } from '$lib/features/billing';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { date, money as rupiah } from '$lib/shared/format';
import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
import { Check, ChevronDown, Eye, List, Pencil, Plus, Save, Trash2, X } from 'lucide-svelte';
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
let placementId = $state('');
let handoff = $state<ReleaseHandoff | null>(null);
let contextLoading = $state(false);
let contextRequest = 0;
let draftEdited = $state(false);
let search = $state('');
let statusFilter = $state('');
let lines = $state<NewInvoice['lines']>([{ description: '', quantity: 1, unitPrice: '' }]);
let coveredAmount = $state('0');
let busy = $state(false);
let selected = $state<SelectedInvoice | null>(null);
let claimResultDraft = $state('');
let invoiceView = $state<'detail' | 'edit' | 'line' | 'claim' | 'delete' | 'deleteLine' | 'payment'>('detail');
let detailTab = $state('summary');
let editingLine = $state<InvoiceLine | null>(null);
let editLines = $state<InvoiceLine[]>([]);
let editCovered = $state('0');
let editReason = $state('');
let deletingInvoice = $state<SelectedInvoice | null>(null);
let deleteReason = $state('');
let deletingLine = $state<InvoiceLine | null>(null);
let lineDeleteReason = $state('');
let paymentInvoice = $state<Pick<Invoice, 'id' | 'version' | 'status' | 'patientName'> | null>(null);
let paymentStatus = $state('paid');
let paymentReason = $state('');
let locked = $derived(selected?.status === 'paid');
let editTotal = $derived(editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
let patient = $derived(creationContext?.patient ?? data.reference.patients.find((item) => item.id === patientId));
let patientOptions = $derived(data.reference.patients.some(item => item.id === patientId)
    ? data.reference.patients
    : [...data.reference.patients, ...(patient ? [patient] : [])]);
let availablePlacements = $derived.by(() => {
    const placements = creationContext?.placements ?? [];
    const episode = handoff?.placement;
    const options = placements.filter(item => item.status !== 'cancelled' || item.id === episode?.id);
    return episode && !options.some(item => item.id === episode.id) ? [episode, ...options] : options;
});
let creationPlacement = $derived(availablePlacements.find((item) => item.id === placementId));
let creationRoom = $derived(data.rooms.find((item) => item.id === creationPlacement?.roomId));
let total = $derived(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0));
let covered = $derived(Number(coveredAmount) || 0);
let payable = $derived(Math.max(0, total - covered));
let invoices = $derived(data.invoices.filter((invoice) => (!search || `${invoice.patientName} ${invoice.medicalRecordNo} ${invoice.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
    (!statusFilter || invoice.status === statusFilter)));
async function send<T>(operation: () => Promise<T>, message = 'Perubahan berhasil disimpan.') {
    if (busy) return;
    busy = true;
    const toastId = toast.loading('Menyimpan perubahan…');
    try {
        const result = await operation();
        try {
            await invalidateAll();
            toast.success(message, { id: toastId });
        } catch {
            toast.warning('Perubahan tagihan tersimpan. Muat ulang halaman untuk melihat daftar terbaru.', { id: toastId });
        }
        return result;
    }
    catch (cause) {
        toast.error(sessionFailure(cause, 'save', 'tagihan'), { id: toastId });
    }
    finally {
        busy = false;
    }
}
// Keep validation feedback visible in the shared toaster.
let lastInvalidAt = 0;
function reportInvalid(event: Event) {
    if (Date.now() - lastInvalidAt < 100) return;
    lastInvalidAt = Date.now();
    const field = event.target as HTMLInputElement;
    const label = field.labels?.[0]?.textContent?.trim() ?? 'Isian';
    if (field.validity.valueMissing) toast.error(`Isi ${label}.`);
    else toast.error(field.title || `Periksa nilai pada kolom ${label}.`);
}
async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy || contextLoading || !patientId) return;
    const result = await send(() => billing.create({
        patientId, placementId: placementId || null, coveredAmount: String(coveredAmount),
        lines: lines.map((line) => ({ ...line, quantity: Number(line.quantity), unitPrice: String(line.unitPrice) }))
    }));
    if (result) {
        creating = false;
        lines = [{ description: '', quantity: 1, unitPrice: '' }];
        coveredAmount = '0';
        patientId = '';
        placementId = '';
        creationContext = null;
        draftEdited = false;
    }
}
async function openInvoice(id: string) {
    try {
        const invoice = await billing.openInvoice(id);
        invoiceView = 'detail';
        selected = invoice;
        claimResultDraft = invoice.claimResult ?? '';
    }
    catch (cause) {
        toast.error(sessionFailure(cause, 'load', 'Detail tagihan'));
    }
}
function closeInvoiceView() {
    if (invoiceView === 'detail' || !selected) { selected = null; paymentInvoice = null; }
    invoiceView = 'detail';
    editingLine = null;
}
async function showInvoice(id: string) { detailTab = 'summary'; await openInvoice(id); }
function startInvoiceEdit() {
    if (!selected || selected.status === 'paid') return;
    editLines = selected.lines.map((line) => ({ ...line }));
    editCovered = selected.coveredAmount;
    editReason = '';
    invoiceView = 'edit';
}
async function saveInvoiceEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!selected) return;
    const id = selected.id;
    const result = await send(() => billing.changePayment(id, {
        lines: editLines.map(({ roomItemId, kind, description, quantity, unitPrice }) => ({ roomItemId, kind, description, quantity: Number(quantity), unitPrice: String(unitPrice) })),
        coveredAmount: String(editCovered), reason: editReason, expectedVersion: selected!.version
    }));
    if (result) { invoiceView = 'detail'; await openInvoice(id); }
}
function startPaymentChange(invoice: Pick<Invoice, 'id' | 'version' | 'status' | 'patientName'>) {
    if (paymentInvoice?.id !== invoice.id) {
        paymentReason = '';
        paymentStatus = invoice.status === 'paid' ? 'unpaid' : 'paid';
    }
    paymentInvoice = invoice;
    invoiceView = 'payment';
}
async function updateStatus(event: SubmitEvent, invoice: Pick<Invoice, 'id' | 'version'>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const reason = formText(form, 'reason').trim();
    if (!reason) { toast.error('Isi Alasan perubahan status pembayaran.'); return; }
    const result = await send(() => billing.changePayment(invoice.id, { status: formText(form, 'status') as ChangePayment['status'], reason, expectedVersion: invoice.version }));
    if (result) {
        invoiceView = 'detail';
        paymentInvoice = null;
        paymentReason = '';
        if (selected?.id === invoice.id) await openInvoice(invoice.id);
    }
}
async function editLine(event: SubmitEvent, line: InvoiceLine) { event.preventDefault(); if (!selected)
    return; const f = new FormData(event.currentTarget as HTMLFormElement); const reason = String(formText(f, 'reason') ?? '').trim(); if (!reason) {
    toast.error('Isi Alasan perubahan rincian layanan.');
    return;
} const result = await send(() => billing.editLine(selected!.id, line.id, { roomItemId: formText(f, 'roomItemId') || null, kind: formText(f, 'kind') || null, description: formText(f, 'description'), quantity: Number(formText(f, 'quantity')), unitPrice: String(formText(f, 'unitPrice')), expectedVersion: selected!.version, reason })); if (result)
    await openInvoice(selected!.id); }
function startLineDelete(line: InvoiceLine) {
    if (deletingLine?.id !== line.id) lineDeleteReason = '';
    deletingLine = line;
    invoiceView = 'deleteLine';
}
async function deleteLine(event: SubmitEvent) {
    event.preventDefault();
    if (!selected || !deletingLine || busy) return;
    const reason = lineDeleteReason.trim();
    if (!reason) { toast.error('Isi Alasan penghapusan rincian layanan.'); return; }
    const id = selected.id;
    const lineId = deletingLine.id;
    const expectedVersion = selected.version;
    if (await send(async () => { await billing.deleteLine(id, lineId, { expectedVersion, reason }); return true; })) {
        invoiceView = 'detail';
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
    invoiceView = 'delete';
}
async function deleteInvoice(event: SubmitEvent) {
    event.preventDefault();
    const invoice = deletingInvoice;
    if (!invoice || busy) return;
    const reason = deleteReason.trim();
    if (!reason) { toast.error('Isi Alasan penghapusan tagihan.'); return; }
    if (await send(async () => { await billing.remove(invoice.id, { expectedVersion: invoice.version, reason }); return true; }, 'Tagihan berhasil dihapus. Riwayat penghapusan tetap tercatat.')) {
        invoiceView = 'detail';
        deletingInvoice = null;
        deleteReason = '';
        if (selected?.id === invoice.id) selected = null;
        invoiceView = 'detail';
    }
}
async function choosePatient(value: string, episode: ReleaseHandoff | null = null) {
    if (value === patientId) return;
    if (draftEdited && !confirm('Ganti pasien? Rincian dan jaminan yang sudah diubah akan dikosongkan.')) return;
    const request = ++contextRequest;
    patientId = value;
    handoff = episode;
    creationContext = null;
    placementId = '';
    lines = [{ description: '', quantity: 1, unitPrice: '' }];
    coveredAmount = '0';
    draftEdited = false;
    contextLoading = Boolean(value);
    if (value) {
        try {
            const context = await billing.patientContext(value);
            if (request === contextRequest) {
                creationContext = context;
                const placements = context.placements.filter((item) => item.status !== 'cancelled');
                if (episode) choosePlacement(episode.placement.id);
                else if (placements.length === 1) choosePlacement(placements[0].id);
            }
        }
        catch (cause) {
            if (request === contextRequest)
                toast.error(sessionFailure(cause, 'load', 'Daftar penempatan pasien'));
        }
        finally {
            if (request === contextRequest) contextLoading = false;
        }
    }
}
function choosePlacement(value: string) {
    if (value === placementId) return;
    if (draftEdited && !confirm('Ganti penempatan? Rincian dan jaminan yang sudah diubah akan dikosongkan.')) return;
    placementId = value;
    const suggested = draftRoomLines(availablePlacements.find((item) => item.id === value), data.rooms);
    lines = suggested.length ? suggested : [{ description: '', quantity: 1, unitPrice: '' }];
    coveredAmount = '0';
    draftEdited = false;
}
function startInvoiceCreation(episode: ReleaseHandoff | null = null) {
    handoff = null;
    ++contextRequest;
    patientId = '';
    placementId = '';
    creationContext = null;
    contextLoading = false;
    lines = [{ description: '', quantity: 1, unitPrice: '' }];
    coveredAmount = '0';
    draftEdited = false;
    creating = true;
    if (episode) void choosePatient(episode.patientId, episode);
}
</script>

<svelte:head><title>Tagihan | InpaCare</title></svelte:head>
<div class="billing-page flex min-w-0 flex-col gap-6">
<section class="flex flex-wrap items-start justify-between gap-4"><h1 class="page-title">Tagihan</h1><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" aria-haspopup="dialog" onclick={() => startInvoiceCreation()}><Plus size={16} aria-hidden="true"/> Buat tagihan</Button></section>

<section id="release-handoffs" aria-labelledby="release-handoffs-title">
    <Card class="gap-4 p-5">
        <h2 id="release-handoffs-title" class="text-lg font-semibold">Antrean administrasi akhir</h2>
        {#if !data.handoffs}
            <div><p class="text-sm" role="status">Antrean gagal dimuat.</p><Button variant="link" onclick={() => void invalidateAll()}>Muat ulang antrean</Button></div>
        {:else}
            <ul class="divide-y">
                {#each data.handoffs.items as episode (episode.cycleId)}
                    <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                            <p><strong>{episode.patientName}</strong> · {episode.medicalRecordNo}</p>
                            <p class="text-sm text-muted-foreground">
                                {episode.cycleId} · {episode.placement.room} · Dilepas {date(episode.releasedAt)}
                            </p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            {#each episode.invoices as invoice (invoice.id)}
                                <Button variant="outline" class="min-h-11" onclick={() => void showInvoice(invoice.id)}>
                                    Buka tagihan {invoice.id} <StatusBadge value={invoice.status} />
                                </Button>
                            {:else}
                                <span class="text-sm text-muted-foreground">Belum ada tagihan</span>
                                <Button variant="outline" class="min-h-11" onclick={() => startInvoiceCreation(episode)} aria-label={`Buat tagihan untuk ${episode.patientName} (${episode.cycleId})`}>Buat tagihan</Button>
                            {/each}
                        </div>
                    </li>
                {:else}
                    <li class="text-sm text-muted-foreground">Belum ada pelepasan di halaman ini.</li>
                {/each}
            </ul>
            {#if data.releaseOffset || data.handoffs.nextOffset !== null}
                <nav aria-label="Halaman antrean administrasi akhir" class="flex gap-2">
                    {#if data.releaseOffset}
                        <Button variant="outline" href={`/invoices?releaseOffset=${data.releaseOffset - 20}#release-handoffs`}>Sebelumnya</Button>
                    {/if}
                    {#if data.handoffs.nextOffset !== null}
                        <Button variant="outline" href={`/invoices?releaseOffset=${data.handoffs.nextOffset}#release-handoffs`}>Berikutnya</Button>
                    {/if}
                </nav>
            {/if}
        {/if}
    </Card>
</section>

{#if selected || (invoiceView === 'payment' && paymentInvoice)}
<Modal title={invoiceView === 'detail' ? 'Rincian tagihan' : invoiceView === 'edit' ? 'Ubah tagihan' : invoiceView === 'line' ? 'Ubah rincian layanan' : invoiceView === 'claim' ? 'Verifikasi klaim' : invoiceView === 'delete' ? 'Hapus tagihan?' : invoiceView === 'deleteLine' ? 'Hapus rincian tagihan?' : 'Ubah status pembayaran'}
 description={`${selected?.patientName ?? paymentInvoice?.patientName} · ${selected?.id ?? paymentInvoice?.id}`}
 {busy} wide={['detail', 'edit'].includes(invoiceView)} protectChanges={['edit', 'line', 'claim', 'payment'].includes(invoiceView)}
 formKey={invoiceView} backLabel={invoiceView !== 'detail' && selected ? 'Kembali ke detail' : undefined} onclose={closeInvoiceView}>
 {#snippet children(close)}
 <div class="billing-page">
 {#if invoiceView === 'detail' && selected}
  <nav class="mb-5 flex flex-wrap gap-2" aria-label="Bagian detail tagihan">
   {#each [['summary','Ringkasan'],['lines','Rincian'],['history','Riwayat']] as [value,label]}<Button variant={detailTab === value ? 'secondary' : 'ghost'} aria-pressed={detailTab === value} onclick={() => detailTab = value}><List aria-hidden="true" /> {label}</Button>{/each}
  </nav>
  <section aria-label="Rincian tagihan">
   {#if detailTab === 'summary'}<div class="patient-card"><strong>{selected.patientContext.patient.name}</strong><span>{selected.medicalRecordNo}</span><span>Status BPJS: {selected.patientContext.patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</span><StatusBadge value={selected.status} label={selected.status === 'paid' ? 'Lunas' : 'Belum dibayar'} /></div>
<div class="detail-totals"><span>{selected.bpjsSnapshot ? `Jaminan BPJS: ${rupiah(selected.coveredAmount)}` : 'Tanpa jaminan BPJS'}</span><strong>Total: {rupiah(selected.totalAmount)} · Bagian pasien: {rupiah(selected.payableAmount)}</strong></div>
<p>Hasil verifikasi klaim: <strong>{selected.claimResult ?? 'Belum ada hasil verifikasi'}</strong></p>
<p class="muted">Riwayat tagihan pasien: {selected.patientContext.invoices.length}</p>

   {:else if detailTab === 'lines'}
   <div class="table-wrap"><Table class="data-table"><TableHeader><TableRow><TableHead>Nama layanan</TableHead><TableHead>Jumlah</TableHead><TableHead>Harga satuan</TableHead><TableHead>Subtotal</TableHead>{#if data.user.role === 'ADMISI'}<TableHead>Aksi</TableHead>{/if}</TableRow></TableHeader><TableBody>
    {#each selected.lines as line (line.id)}<TableRow><TableCell class="whitespace-normal">{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{rupiah(line.unitPrice)}</TableCell><TableCell>{rupiah(line.lineTotal)}</TableCell>{#if data.user.role === 'ADMISI'}<TableCell><div class="action-buttons action-buttons--table"><Button variant="outline" disabled={busy || locked} onclick={() => { editingLine = line; invoiceView = 'line'; }}><Pencil aria-hidden="true" /> Ubah rincian</Button><Button variant="destructive" disabled={busy || locked} onclick={() => startLineDelete(line)}><Trash2 aria-hidden="true" /> Hapus rincian</Button></div></TableCell>{/if}</TableRow>{/each}
   </TableBody></Table></div>
   {:else}<h3>Riwayat perubahan</h3>{#if selected.history.length}<ul class="history-list">{#each selected.history as item}<li><strong>{({created:'Tagihan dibuat',status_changed:'Status pembayaran diubah',updated:'Tagihan dan jaminan diperbarui',line_updated:'Rincian diperbarui',line_deleted:'Rincian dihapus',claim_verification:'Klaim diverifikasi',deleted:'Tagihan dihapus'} as Record<string,string>)[item.action] ?? item.action} · {item.actor}</strong><span>{item.reason} · {new Date(item.createdAt).toLocaleString('id-ID')}</span></li>{/each}</ul>{:else}<p class="muted">Belum ada riwayat.</p>{/if}{/if}
  </section>
  {#if data.user.role === 'ADMISI'}
   {#if locked}<p class="locked-note">Tagihan lunas terkunci. Ubah status ke “Belum dibayar” untuk mengubah rincian atau menghapus tagihan.</p>{/if}
   <div class="form-actions">
    <Button variant="outline" disabled={busy || locked} onclick={startInvoiceEdit}><Pencil aria-hidden="true" /> Ubah tagihan</Button>
    <Button variant="outline" disabled={busy || !selected.bpjsSnapshot} onclick={() => { claimResultDraft = selected!.claimResult ?? ''; invoiceView = 'claim'; }}><Check aria-hidden="true" /> Verifikasi klaim</Button>
    <Button variant="outline" disabled={busy} onclick={() => selected && startPaymentChange(selected)}><Pencil aria-hidden="true" /> Ubah status</Button>
    <Button variant="destructive" disabled={busy || locked} onclick={startInvoiceDelete}><Trash2 aria-hidden="true" /> Hapus tagihan</Button>
   </div>
  {/if}
 {:else if invoiceView === 'edit' && selected}<form onsubmit={saveInvoiceEdit} oninvalidcapture={reportInvalid}><div class="line-heading"><h3>Ubah rincian</h3><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={editLines.length>=30} onclick={()=>editLines=[...editLines,{id:'',description:'',quantity:1,unitPrice:'0',lineTotal:'0',roomItemId:null,kind:'service'}]}><Plus aria-hidden="true" /> Tambah baris</Button></div>{#each editLines as line,index (line)}<div class="line-editor editing grid"><label class="field">Jenis<Input class="h-11 text-base md:text-sm" bind:value={line.kind} maxlength={40}/></label><label class="field">Perlengkapan ruangan<FormSelect bind:value={line.roomItemId} options={[{ value: null, label: "Layanan tanpa perlengkapan ruangan" }, ...(data.rooms).flatMap((room) => [...(room.items).map((roomItem) => ({ value: roomItem.id, label: (room.name) + " · " + (roomItem.name) }))])]} /></label><label class="field">Deskripsi<Input class="h-11 text-base md:text-sm" bind:value={line.description} required maxlength={160}/></label><label class="field">Jumlah<Input class="h-11 text-base md:text-sm" bind:value={line.quantity} type="number" min="1" max="10000" required/></label><MoneyInput label="Harga satuan" bind:value={line.unitPrice} required /><Button variant="destructive" size="icon" class="remove-line size-11" type="button" aria-label="Hapus baris rincian" title="Hapus baris" disabled={editLines.length<=1} onclick={()=>editLines=editLines.filter((_,i)=>i!==index)}><Trash2 size={18} aria-hidden="true" /></Button></div>{/each}<MoneyInput label="Nilai jaminan BPJS (Rp)" bind:value={editCovered} disabled={!selected.bpjsSnapshot} required hint={selected.bpjsSnapshot ? '' : 'Pasien ini tidak terdaftar BPJS, jadi jaminan otomatis Rp 0.'} /><label class="field">Alasan perubahan<Input class="h-11 text-base md:text-sm" bind:value={editReason} required maxlength={500}/></label><div class="detail-totals"><span>Total layanan: {rupiah(editTotal)}</span><strong>Bagian pasien: {rupiah(Math.max(0,editTotal-Number(editCovered)))}</strong></div><div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}><Save aria-hidden="true" /> Simpan perubahan</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" onclick={close}><X aria-hidden="true" /> Batal</Button></div></form>
 {:else if invoiceView === 'line' && selected && editingLine}{@const line = editingLine}<form class="form-grid" onsubmit={(event)=>editLine(event,line)}><fieldset class="contents" disabled={locked}><label class="field">Jenis<Input class="h-11 text-base md:text-sm" name="kind" value={line.kind??''} placeholder="layanan / perlengkapan"/></label><label class="field">Perlengkapan ruangan<FormSelect name="roomItemId" value={line.roomItemId??''} options={[{ value: "", label: "Layanan tanpa perlengkapan ruangan" }, ...(data.rooms).flatMap((room) => [...(room.items).map((roomItem) => ({ value: roomItem.id, label: (room.name) + " · " + (roomItem.name) }))])]} /></label><label class="field">Deskripsi<Input class="h-11 text-base md:text-sm" name="description" value={line.description} required maxlength={160}/></label><label class="field">Jumlah<Input class="h-11 text-base md:text-sm" name="quantity" type="number" min="1" value={line.quantity} required/></label><MoneyInput label="Harga satuan" name="unitPrice" value={line.unitPrice} required /><label class="field">Alasan<Input class="h-11 text-base md:text-sm" name="reason" required maxlength={500}/></label><div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy||locked}><Save aria-hidden="true" /> Simpan</Button><Button variant="outline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button></div></fieldset></form>
 {:else if invoiceView === 'claim' && selected}<form class="form-grid" onsubmit={(event)=>selected&&verifyClaim(event,selected)}><div class="field"><label for="claim-result">Hasil verifikasi klaim</label><div class="relative">
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
</div></div><label class="field">Keputusan klaim<FormSelect name="verified" value={String(selected.claimVerified)} options={[{ value: "false", label: "Belum disetujui" }, { value: "true", label: "Disetujui" }]} /></label><label class="field">Alasan verifikasi<Input class="h-11 text-base md:text-sm" name="reason" required maxlength={500}/></label><div class="form-actions"><Button variant="outline" onclick={close} disabled={busy}><X aria-hidden="true" /> Batal</Button><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy||!selected.bpjsSnapshot}><Save aria-hidden="true" /> Simpan verifikasi klaim</Button></div></form>
 {:else if invoiceView === 'delete' && deletingInvoice}<form onsubmit={deleteInvoice}>
            <p class="mb-4">Tagihan <strong>{deletingInvoice.id}</strong> atas nama <strong>{deletingInvoice.patientName}</strong> akan dihapus dari daftar. Riwayat penghapusan tetap tersimpan.</p>
            <label class="field">Alasan penghapusan<Input class="h-11 text-base md:text-sm" bind:value={deleteReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button variant="destructive-confirm" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy}><Trash2 aria-hidden="true" /> Ya, hapus</Button>
                <Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
            </div>
        </form>
 {:else if invoiceView === 'deleteLine' && deletingLine}<form onsubmit={deleteLine}>
            <p class="mb-4">Rincian <strong>{deletingLine.description}</strong> akan dihapus. Riwayat perubahan tetap tersimpan.</p>
            <label class="field">Alasan penghapusan<Textarea class="min-h-24" bind:value={lineDeleteReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button variant="destructive-confirm" type="submit" class="h-11" disabled={busy}><Trash2 aria-hidden="true" /> Konfirmasi hapus</Button>
                <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
            </div>
        </form>
 {:else if invoiceView === 'payment' && paymentInvoice}<form onsubmit={(event) => paymentInvoice && updateStatus(event, paymentInvoice)}>
            <p class="mb-4">Tagihan <strong>{paymentInvoice.id}</strong> · {paymentInvoice.patientName}</p>
            <label class="field">Status<FormSelect name="status" bind:value={paymentStatus} options={[{ value: "paid", label: "Lunas", disabled: paymentInvoice.status === 'paid' }, { value: "unpaid", label: "Belum dibayar", disabled: paymentInvoice.status === 'unpaid' }]} /></label>
            <label class="field">Alasan perubahan<Textarea name="reason" class="min-h-24" bind:value={paymentReason} maxlength={500} required /></label>
            <div class="form-actions">
                <Button type="submit" class="h-11" disabled={busy}><Save aria-hidden="true" /> Simpan status</Button>
                <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
            </div>
        </form>
 {/if}
 </div>
 {/snippet}
</Modal>
{/if}

<section class="grid min-w-0 grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Ringkasan pembayaran">
    <Card class="min-w-0 gap-1 p-5"><strong class="text-2xl tabular-nums">{data.invoices.length}</strong><span class="text-sm text-muted-foreground">Total tagihan</span></Card>
    <Card class="min-w-0 gap-1 p-5"><strong class="text-2xl tabular-nums">{data.invoices.filter((item) => item.status === 'unpaid').length}</strong><span class="text-sm text-muted-foreground">Belum dibayar</span></Card>
    <Card class="min-w-0 gap-1 p-5"><strong class="text-2xl tabular-nums">{data.invoices.filter((item) => item.status === 'paid').length}</strong><span class="text-sm text-muted-foreground">Lunas</span></Card>
    <Card class="min-w-0 gap-1 p-5"><strong class="break-words text-base tabular-nums sm:text-xl">{rupiah(data.invoices.reduce((sum: number,item) => sum + Number(item.payableAmount),0))}</strong><span class="text-sm text-muted-foreground">Total bagian pasien</span></Card>
</section>

<Card class="min-w-0 gap-4 p-5 sm:p-6" role="region" aria-label="Daftar tagihan">
	<div class="panel-header"><div><h2>Daftar tagihan</h2><span class="muted">{invoices.length} dari {data.invoices.length} tagihan</span></div></div>
	<div class="filters"><label class="field search-field">Cari pasien / nomor tagihan<Input class="h-11 text-base md:text-sm" type="search" bind:value={search} /></label><label class="field">Status<FormSelect bind:value={statusFilter} options={[{ value: "", label: "Semua status" }, { value: "unpaid", label: "Belum dibayar" }, { value: "paid", label: "Lunas" }]} /></label></div>
	<div class="table-wrap"><Table class="data-table"><TableHeader><TableRow><TableHead>Pasien</TableHead><TableHead>Nomor tagihan</TableHead><TableHead>Total</TableHead><TableHead>Jaminan</TableHead><TableHead>Bagian pasien</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>
		{#each invoices as invoice (invoice.id)}<TableRow><TableCell><strong>{invoice.patientName}</strong><span class="cell-meta">{invoice.medicalRecordNo}</span></TableCell><TableCell>{invoice.id}</TableCell><TableCell>{rupiah(invoice.totalAmount)}</TableCell><TableCell>{invoice.bpjsSnapshot ? rupiah(invoice.coveredAmount) : '—'}</TableCell><TableCell>{rupiah(invoice.payableAmount)}</TableCell><TableCell><StatusBadge value={invoice.status} label={invoice.status === 'paid' ? 'Lunas' : 'Belum dibayar'} /></TableCell><TableCell><div class="action-buttons action-buttons--table"><Button variant="outline" class="h-11 px-4" aria-haspopup="dialog" onclick={() => void showInvoice(invoice.id)}><Eye aria-hidden="true" /> Lihat detail</Button>{#if data.user.role === 'ADMISI'}<Button variant="outline" class="h-11" disabled={busy} onclick={() => startPaymentChange(invoice)}><Pencil aria-hidden="true" /> Ubah status</Button>{/if}</div></TableCell></TableRow>
		{:else}<TableRow><TableCell colspan={7} class="empty">{search || statusFilter ? 'Tidak ada tagihan yang cocok. Ubah pencarian atau filter status.' : 'Belum ada tagihan. Pilih Buat tagihan untuk menambahkan tagihan.'}</TableCell></TableRow>{/each}
	</TableBody></Table></div>
</Card>
<p class="muted scope-note">Status dan nilai jaminan di atas dicatat oleh petugas Admisi. Pembayaran dan verifikasi BPJS tidak terhubung ke layanan eksternal.</p>
</div>

{#if creating}
<Modal title="Buat tagihan baru" description="Pilih pasien untuk mengisi biaya kamar, lalu periksa dan lengkapi rincian." {busy} protectChanges wide onclose={() => creating = false}>
{#snippet children(close)}
<div class="billing-page"><form class="create-form" aria-label="Buat tagihan baru" onsubmit={create} oninvalidcapture={reportInvalid} oninput={(event) => { if (event.target instanceof HTMLInputElement) draftEdited = true; }}>	<section class="create-layout">
		<Card class="min-w-0 gap-4 p-5 sm:p-6">

			<label class="field">Pasien<FormSelect name="patientId" bind:value={() => patientId, (value) => { void choosePatient(value ?? ''); }} disabled={busy} required options={[{ value: "", label: "Pilih pasien" }, ...patientOptions.map((item) => ({ value: item.id, label: (item.medicalRecordNo) + " · " + (item.name) }))]} /></label>
			{#if patient}<div class="patient-card"><strong>{patient.name}</strong><span>{patient.medicalRecordNo}</span><span>Status BPJS: {patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</span></div>{/if}
			{#if contextLoading}<p class="text-sm text-muted-foreground" role="status">Memuat penempatan dan biaya kamar…</p>{/if}
			{#if creationContext}<label class="field">Penempatan<FormSelect name="placementId" bind:value={() => placementId, (value) => choosePlacement(value ?? '')} disabled={busy} options={[{ value: "", label: "Tanpa penempatan / isi manual" }, ...availablePlacements.map((placement) => ({ value: placement.id, label: (placement.room) + " · " + date(placement.startsOn) + "–" + date(placement.endsOn) }))]} /></label>
                <p class="text-sm text-muted-foreground" role="status">{#if creationPlacement && creationRoom && creationPlacement.status !== 'cancelled'}Rincian kamar memakai tarif per hari saat ini untuk {date(creationPlacement.startsOn)}–{date(creationPlacement.endsOn)}, termasuk tanggal masuk dan tanggal selesai. Periksa jumlah hari dan harga. Anda dapat mengubah atau menambah rincian.{:else if creationPlacement}Tarif kamar penempatan ini tidak tersedia. Isi rincian layanan secara manual.{:else if availablePlacements.length}Pilih penempatan untuk mengisi biaya kamar otomatis, atau isi rincian secara manual.{:else}Belum ada penempatan pasien. Rincian layanan dapat diisi secara manual.{/if}</p>
            {/if}
			<div class="line-heading"><h3>Rincian layanan</h3><Button variant="default" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={contextLoading || busy || lines.length >= 30} onclick={() => { lines = [...lines,{description:'',quantity:1,unitPrice:''}]; draftEdited = true; }}><Plus size={14} aria-hidden="true"/> Tambah baris</Button></div>
			{#each lines as line, index (line)}<div class="line-row"><label class="field">Nama layanan<Input class="h-11 text-base md:text-sm" bind:value={line.description} disabled={contextLoading || busy} maxlength={160} required placeholder="Contoh kamar kelas 2 (hari)" /></label><label class="field quantity-field">Jumlah<Input class="h-11 text-base md:text-sm" bind:value={line.quantity} disabled={contextLoading || busy} type="number" min="1" max="10000" required /></label><MoneyInput label="Harga satuan (Rp)" bind:value={line.unitPrice} disabled={contextLoading || busy} required /><Button variant="destructive" size="icon" class="remove-line size-11" type="button" aria-label="Hapus baris rincian" title="Hapus baris" disabled={contextLoading || busy || lines.length <= 1} onclick={() => { lines = lines.filter((_, i) => i !== index); draftEdited = true; }}><Trash2 size={18} aria-hidden="true" /></Button></div>{/each}
			<MoneyInput label="Nilai jaminan BPJS (Rp)" bind:value={coveredAmount} disabled={contextLoading || busy || !patient?.bpjs} required hint={!patient ? 'Pilih pasien terlebih dahulu.' : patient.bpjs ? 'Nilai diisi sesuai hasil pemeriksaan petugas; aplikasi demo tidak memverifikasi BPJS.' : 'Pasien ini tidak terdaftar BPJS, jadi jaminan otomatis Rp 0.'} />

		</Card>
		<Card class="summary h-max gap-0 p-5 sm:p-6" role="complementary" aria-label="Ringkasan biaya"><h2 class="mb-4">Ringkasan biaya</h2><div class="summary-row"><span>Total layanan</span><strong>{rupiah(total)}</strong></div><div class="summary-row"><span>Jaminan BPJS</span><strong>−{rupiah(covered)}</strong></div><div class="summary-row grand-total"><span>Total tagihan</span><strong>{rupiah(payable)}</strong></div></Card>
	</section><div class="form-actions"><Button variant="default" type="submit" class="h-11 px-4 no-underline hover:no-underline" disabled={busy || contextLoading || !patientId || (!!handoff && !creationContext)}><Save aria-hidden="true" /> Simpan tagihan</Button><Button variant="outline" class="h-11 px-4 no-underline hover:no-underline" type="button" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button></div></form>
</div>{/snippet}</Modal>
{/if}


<style>
	.create-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,0.8fr);gap:24px}
	.patient-card{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 0;margin-bottom:16px;border-bottom:1px solid var(--border);font-size:13px}
	.patient-card span{color:var(--muted-foreground)}
	.line-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:20px 0 8px}
	.line-row{display:grid;grid-template-columns:minmax(140px,1fr) 72px minmax(120px,160px) auto;gap:12px;align-items:end;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:20px}
	.summary-row{display:flex;justify-content:space-between;gap:16px;padding:12px 0;font-size:13px;border-bottom:1px solid var(--border)}
	.summary-row strong{font-variant-numeric:tabular-nums;white-space:nowrap}
	.grand-total{font-size:15px;border:0;border-top:1px solid var(--border);margin-top:12px;padding-top:20px}
	.search-field{min-width:220px;flex:2}
	.cell-meta{display:block;font-size:12px;color:var(--muted-foreground);margin-top:4px}
	.billing-page :global(.data-table th:nth-child(n+3):nth-child(-n+5)),.billing-page :global(.data-table td:nth-child(n+3):nth-child(-n+5)){text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
	.detail-totals{display:flex;justify-content:space-between;gap:16px;padding:20px 0;font-variant-numeric:tabular-nums}
	.history-list{list-style:none;padding:0}
	.history-list li{display:grid;gap:6px;border-top:1px solid var(--border);padding:16px 0;font-size:13px}
	.history-list span{color:var(--muted-foreground)}
	.scope-note{margin-top:20px;font-size:12px;max-width:80ch}

	/* Jenis | Perlengkapan ruangan | Deskripsi | Jumlah | Harga satuan | Alasan | Aksi */
	.line-editor{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(190px,1.3fr) minmax(170px,1.6fr) 72px minmax(120px,.9fr) minmax(130px,1fr) auto;align-items:end;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)}
	.line-editor.editing{grid-template-columns:repeat(3,minmax(0,1fr))}
	.billing-page :global(.table-wrap){container-type:inline-size}

	.locked-note{margin:0 0 16px;padding:12px 15px;border:1px solid var(--border);border-radius:8px;background:var(--background);font-size:13px}


	@media(max-width:1100px){.create-layout{grid-template-columns:1fr}}
	@media(max-width:1200px){.line-editor,.line-editor.editing{grid-template-columns:repeat(2,minmax(0,1fr))}.line-editor :global(.field:nth-child(3)),.line-editor.editing :global(.field:nth-child(3)){grid-column:1/-1}}
	@media(max-width:800px){.line-row{grid-template-columns:minmax(0,1fr) 64px minmax(0,1fr) auto}.detail-totals{flex-direction:column}}
	@media(max-width:550px){.line-row{grid-template-columns:80px minmax(0,1fr)}.line-row .field:first-child{grid-column:1/-1}.patient-card{align-items:flex-start;flex-direction:column}.line-heading{align-items:flex-start;flex-direction:column}}
</style>
