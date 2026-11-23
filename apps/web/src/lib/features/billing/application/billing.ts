import type { ReleaseHandoffPage, Invoice, InvoiceDetail, PatientInvoiceContext, NewInvoice, ChangePayment, EditLine, DeleteLine, ClaimVerification, DeleteInvoice, CreatedInvoice, PaymentResult, LineMutation, ClaimResult } from '../domain/models';
import type { Room } from '$lib/features/rooms';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
export type BillingRepository = {
    list(): Promise<Invoice[]>;
    releaseHandoffs(offset: number): Promise<ReleaseHandoffPage>;
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
    handoffs: ReleaseHandoffPage | null;
    releaseOffset: number;
    user: User;
    reference: Reference;
};
export function draftRoomLines(
    placement: PatientInvoiceContext['placements'][number] | undefined,
    rooms: ReadonlyArray<Pick<Room, 'id' | 'name' | 'dailyRate'>>
): NewInvoice['lines'] {
    if (!placement || placement.status === 'cancelled') return [];
    const room = rooms.find((item) => item.id === placement.roomId);
    if (!room) return [];
    // Placement calendars include both the arrival and departure dates.
    const days = (Date.parse(`${placement.endsOn}T00:00:00Z`) - Date.parse(`${placement.startsOn}T00:00:00Z`)) / 86_400_000 + 1;
    if (!Number.isInteger(days) || days < 1) return [];
    return [{
        kind: 'room', roomItemId: null,
        description: `Kamar ${room.name} (hari)`.slice(0, 160),
        quantity: days, unitPrice: room.dailyRate
    }];
}
export function createBillingUseCases(repository: BillingRepository) {
    return { ...repository, async openInvoice(id: string): Promise<SelectedInvoice> {
            const invoice = await repository.detail(id);
            return { ...invoice, patientContext: await repository.patientContext(invoice.patientId) };
        } };
}
export type Billing = ReturnType<typeof createBillingUseCases>;
