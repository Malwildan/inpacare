export interface InvoiceListFilters {
  search?: string;
  status?: string;
  limit?: number;
}
export interface InvoiceRow extends Record<string, unknown> {
  id: string;
  patient_id: string;
  bpjs_snapshot: boolean;
  status: string;
  version: number | string;
  total_amount: string;
  covered_amount: string;
  payable_amount: string;
  claim_verified: boolean;
  claim_result: string | null;
}
export interface InvoiceLineRow extends Record<string, unknown> {
  id: string;
  room_item_id: string | null;
  kind: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}
export interface InvoiceStore {
  list(filters: InvoiceListFilters): Promise<{
    items: Record<string, unknown>[];
    total: number;
  }>;
  patientInfo(patientId: string): Promise<Record<string, unknown> | undefined>;
  patientPlacements(patientId: string): Promise<Record<string, unknown>[]>;
  patientInvoices(patientId: string): Promise<Record<string, unknown>[]>;
  detail(invoiceId: string): Promise<Record<string, unknown> | undefined>;
  patientForCreate(patientId: string): Promise<
    | {
        name: string;
        bpjs: boolean;
      }
    | undefined
  >;
  placementMatches(placementId: string, patientId: string): Promise<boolean>;
  createInvoice(input: {
    id: string;
    patientId: string;
    placementId: string | null;
    bpjs: boolean;
    total: string;
    covered: string;
    payable: string;
    actorId: string;
  }): Promise<void>;
  createLine(input: {
    id: string;
    invoiceId: string;
    roomItemId: string | null;
    kind: string;
    description: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }): Promise<void>;
  history(input: {
    id: string;
    invoiceId: string;
    actorId: string;
    action: string;
    reason: string;
    before: unknown;
    after: unknown;
  }): Promise<void>;
  nextId(): Promise<string>;
  lockInvoice(invoiceId: string): Promise<InvoiceRow | undefined>;
  updatePayment(invoiceId: string, status: string): Promise<void>;
  updateInvoice(invoiceId: string, input: { status: string; total: string; covered: string; payable: string }): Promise<void>;
  invoiceLines(invoiceId: string): Promise<InvoiceLineRow[]>;
  replaceLines(invoiceId: string, lines: { id: string; roomItemId: string | null; kind: string; description: string; quantity: number; unitPrice: string; lineTotal: string }[]): Promise<void>;
  lockLine(
    invoiceId: string,
    lineId: string,
  ): Promise<InvoiceLineRow | undefined>;
  updateLine(
    lineId: string,
    input: {
      roomItemId: string | null;
      kind: string;
      description: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
    },
  ): Promise<void>;
  totalLines(invoiceId: string): Promise<string>;
  updateFinancialTotals(
    invoiceId: string,
    total: string,
    payable: string,
  ): Promise<void>;
  countLines(invoiceId: string): Promise<number>;
  deleteLine(lineId: string): Promise<void>;
  verifyClaim(
    invoiceId: string,
    actorId: string,
    verified: boolean,
    result: string,
  ): Promise<void>;
  deleteInvoice(invoiceId: string): Promise<void>;
}
