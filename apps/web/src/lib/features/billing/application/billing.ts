import type { Invoice, InvoiceDetail, PatientInvoiceContext, NewInvoice, ChangePayment, EditLine, DeleteLine, ClaimVerification, DeleteInvoice, CreatedInvoice, PaymentResult, LineMutation, ClaimResult } from '../domain/models';
import type { Room } from '$lib/features/rooms';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
export type BillingRepository = {
    list(): Promise<Invoice[]>;
    detail(id: string): Promise<InvoiceDetail>;
    patientContext(id: string): Promise<PatientInvoiceContext>;
    create(input: NewInvoice): Promise<CreatedInvoice>;
    changePayment(id: string, input: ChangePayment): Promise<PaymentResult>;
    editLine(id: string, lineId: string, input: EditLine): Promise<LineMutation>;
    deleteLine(id: string, lineId: string, input: DeleteLine): Promise<unknown>;
    verifyClaim(id: string, input: ClaimVerification): Promise<ClaimResult>;
    remove(id: string, input: DeleteInvoice): Promise<unknown>;
};
export type SelectedInvoice = InvoiceDetail & {
    patientContext: PatientInvoiceContext;
};
export type BillingPageData = {
    invoices: Invoice[];
    rooms: Room[];
    user: User;
    reference: Reference;
};
export function createBillingUseCases(repository: BillingRepository) {
    return { ...repository, async openInvoice(id: string): Promise<SelectedInvoice> {
            const invoice = await repository.detail(id);
            return { ...invoice, patientContext: await repository.patientContext(invoice.patientId) };
        } };
}
export type Billing = ReturnType<typeof createBillingUseCases>;
