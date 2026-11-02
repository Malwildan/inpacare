import Decimal from "decimal.js";
import { DomainError } from "../shared/domain-error";
const ExactDecimal = Decimal.clone({
  precision: 32,
  rounding: Decimal.ROUND_HALF_UP,
});
export const parseInvoiceMoney = (value: string, label = "Nominal") => {
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value.trim()))
    throw DomainError.validation(
      `${label} harus berupa nominal desimal valid maksimal dua desimal.`,
    );
  const decimal = new ExactDecimal(value.trim());
  if (decimal.greaterThanOrEqualTo("10000000000000"))
    throw DomainError.validation(`${label} terlalu besar.`);
  return decimal.toFixed(2);
};
export interface InvoiceLineInput {
  id?: string;
  roomItemId?: string | null;
  kind?: string;
  description: string;
  quantity: number;
  unitPrice: string;
}
export interface InvoiceLineTotal extends InvoiceLineInput {
  id: string;
  roomItemId: string | null;
  kind: string;
  description: string;
  lineTotal: string;
}
export const calculateInvoiceLines = (
  lines: InvoiceLineInput[],
  newId: () => string,
): InvoiceLineTotal[] => {
  if (lines.length < 1 || lines.length > 30)
    throw DomainError.validation("Tagihan harus memuat 1–30 rincian.");
  return lines.map((line) => {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 10000
    )
      throw DomainError.validation("Jumlah layanan harus 1–10.000.");
    if (!line.description.trim())
      throw DomainError.validation("Nama layanan wajib diisi.");
    const unitPrice = parseInvoiceMoney(line.unitPrice, "Harga satuan");
    return {
      id: line.id ?? newId(),
      roomItemId: line.roomItemId ?? null,
      kind: line.kind ?? "service",
      description: line.description.trim(),
      quantity: line.quantity,
      unitPrice,
      lineTotal: new ExactDecimal(unitPrice).mul(line.quantity).toFixed(2),
    };
  });
};
export const totalInvoiceLines = (
  lines: {
    lineTotal: string;
  }[],
) =>
  lines
    .reduce((sum, line) => sum.plus(line.lineTotal), new ExactDecimal(0))
    .toFixed(2);
export const subtractInvoiceAmounts = (total: string, covered: string) =>
  new ExactDecimal(total).minus(covered).toFixed(2);
export const invoiceAmountGreaterThan = (left: string, right: string) =>
  new ExactDecimal(left).greaterThan(right);
export const invoiceAmountIsPositive = (value: string) =>
  new ExactDecimal(value).greaterThan(0);
