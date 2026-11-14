<script>
import BillingPage from '$lib/features/billing/presentation/BillingPage.svelte';

const patient = { id: 'patient', name: 'Pasien Uji', medicalRecordNo: 'RM-TEST', bpjs: true, bpjsNumber: 'SYNTHETIC' };
const invoice = $state({ id: 'invoice', patientId: 'patient', patientName: patient.name, medicalRecordNo: patient.medicalRecordNo, placementId: 'placement', bpjsSnapshot: true, totalAmount: '300000.50', coveredAmount: '100000.25', payableAmount: '200000.25', status: 'unpaid', version: 13, createdAt: '2026-11-02T00:00:00Z', lineCount: 2, claimVerified: false, claimResult: null,
    lines: [
        { id: 'line', description: 'Layanan dengan deskripsi panjang untuk pemeriksaan tampilan tagihan', quantity: 1, unitPrice: '200000.25', lineTotal: '200000.25', roomItemId: null, kind: 'service' },
        { id: 'other-line', description: 'Perlengkapan', quantity: 1, unitPrice: '100000.25', lineTotal: '100000.25', roomItemId: null, kind: 'item' }
    ],
    history: [{ id: 'history', action: 'created', actor: 'Admisi Uji', reason: 'Pembuatan sintetis', before: null, after: {}, createdAt: '2026-11-02T00:00:00Z' }]
});
const context = { patient, placements: [{ id: 'placement', roomId: 'room', room: 'Ruangan Uji', startsOn: '2026-11-02', endsOn: '2026-11-08', status: 'active' }], invoices: [invoice] };
const data = $state({ user: { id: 'admisi', name: 'Admisi Uji', role: 'ADMISI', coordinator: false }, invoices: [invoice], rooms: [], reference: { patients: [patient], rooms: [], placements: [], staff: [] } });
const writes = [];
window.billingWrites = writes;
const billing = {
    list: async () => data.invoices,
    detail: async () => invoice,
    openInvoice: async () => ({ ...invoice, patientContext: context }),
    patientContext: async () => context,
    create: async input => { window.invoiceCreate = input; throw new Error('Tagihan gagal tersimpan.'); },
    changePayment: async (id, input) => { writes.push({ action: 'payment', id, ...input }); throw new Error('Versi tagihan berubah.'); },
    editLine: async (id, lineId, input) => { writes.push({ action: 'editLine', id, lineId, ...input }); throw new Error('Rincian gagal tersimpan.'); },
    verifyClaim: async (id, input) => { writes.push({ action: 'claim', id, ...input }); throw new Error('Klaim gagal tersimpan.'); },
    deleteLine: async (id, lineId, input) => {
        writes.push({ action: 'deleteLine', id, lineId, ...input });
        if (writes.filter(write => write.action === 'deleteLine').length === 1) {
            await new Promise((resolve, reject) => { window.rejectLineRemoval = () => reject(new Error('Versi rincian berubah.')); });
        } else {
            invoice.lines = invoice.lines.filter(line => line.id !== lineId);
        }
    },
    remove: async (id, input) => { writes.push({ action: 'deleteInvoice', id, ...input }); data.invoices = []; }
};
</script>

<div class="min-w-0 p-4"><BillingPage {data} {billing} /></div>
