export type Invoice = {
    id: string;
    patientId: string;
    patientName: string;
    medicalRecordNo: string;
    placementId: string | null;
    bpjsSnapshot: boolean;
    totalAmount: string;
    coveredAmount: string;
    payableAmount: string;
    status: string;
    version: number;
    createdAt: string;
    lineCount: number;
    claimVerified: boolean;
    claimResult: string | null;
};
export type InvoiceDetail = {
    id: string;
    patientId: string;
    patientName: string;
    medicalRecordNo: string;
    placementId: string | null;
    bpjsSnapshot: boolean;
    totalAmount: string;
    coveredAmount: string;
    payableAmount: string;
    status: string;
    version: number;
    createdAt: string;
    lines: ({
        id: string;
        description: string;
        quantity: number;
        unitPrice: string;
        lineTotal: string;
        roomItemId: string | null;
        kind: string | null;
    })[];
    history: ({
        id: string;
        action: string;
        reason: string;
        actor: string;
        before: Record<string, unknown> | null;
        after: Record<string, unknown>;
        createdAt: string;
    })[];
    claimVerified: boolean;
    claimResult: string | null;
};
export type InvoiceLine = {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    roomItemId: string | null;
    kind: string | null;
};
export type PatientInvoiceContext = {
    patient: {
        id: string;
        name: string;
        medicalRecordNo: string;
        bpjs: boolean;
        bpjsNumber: string | null;
    };
    placements: ({
        id: string;
        roomId: string;
        room: string;
        startsOn: string;
        endsOn: string;
        status: string;
    })[];
    invoices: ({
        id: string;
        status: string;
        totalAmount: string;
        payableAmount: string;
        createdAt: string;
    })[];
};
export type NewInvoice = {
    patientId: string;
    placementId?: string | null;
    coveredAmount: string;
    lines: ({
        roomItemId?: string | null;
        kind?: string;
        description: string;
        quantity: number;
        unitPrice: string;
    })[];
};
export type ChangePayment = {
    status: string;
    reason: string;
    expectedVersion: number;
};
export type EditLine = {
    roomItemId?: string | null;
    kind?: string | null;
    description: string;
    quantity: number;
    unitPrice: string;
    expectedVersion: number;
    reason: string;
};
export type DeleteLine = {
    expectedVersion: number;
    reason: string;
};
export type ClaimVerification = {
    expectedVersion: number;
    reason: string;
    verified: boolean;
    result: string;
};
export type DeleteInvoice = {
    expectedVersion: number;
    reason: string;
};
export type CreatedInvoice = {
    id: string;
    patientId: string;
    patientName: string;
    bpjsSnapshot: boolean;
    totalAmount: string;
    coveredAmount: string;
    payableAmount: string;
    status: string;
    version: number;
    lines: ({
        id: string;
        description: string;
        quantity: number;
        unitPrice: string;
        lineTotal: string;
        roomItemId: string | null;
        kind: string | null;
    })[];
};
export type PaymentResult = {
    status: "paid" | "unpaid";
    version: number;
    totalAmount: string;
    coveredAmount: string;
    payableAmount: string;
};
export type LineMutation = {
    ok: boolean;
    version: number;
    line: {
        id: string;
        roomItemId: string | null;
        kind: string;
        description: string;
        quantity: number;
        unitPrice: string;
        lineTotal: string;
    };
    totalAmount: string;
    coveredAmount: string;
    payableAmount: string;
};
export type ClaimResult = {
    claimVerified: boolean;
    version: number;
    claimResult: string;
};
