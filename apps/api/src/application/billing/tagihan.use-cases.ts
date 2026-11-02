import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
import {
  calculateInvoiceLines,
  invoiceAmountGreaterThan,
  invoiceAmountIsPositive,
  parseInvoiceMoney,
  subtractInvoiceAmounts,
  totalInvoiceLines,
  InvoiceLineInput,
} from "../../domain/billing/invoice-total";
import { id } from "../shared/runtime";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { InvoiceStore } from "./invoice-store.port";
export interface CreateInvoiceInput {
  patientId: string;
  placementId?: string | null;
  coveredAmount: string;
  lines: InvoiceLineInput[];
}
export interface PaymentInput {
  reason: string;
  expectedVersion: number;
  status: string;
}
export interface EditInvoiceLineInput extends InvoiceLineInput {
  expectedVersion: number;
  reason: string;
}
export interface DeleteInvoiceInput {
  expectedVersion: number;
  reason: string;
}
export interface VerifyClaimInput {
  result: string;
  expectedVersion: number;
  reason: string;
  verified: boolean;
}
export class TagihanUseCases {
  constructor(
    private readonly store: InvoiceStore,
    private readonly uow: UnitOfWork,
  ) {}
  private role(actor: Actor) {
    if (actor.role !== "ADMISI") throw DomainError.forbidden();
  }
  async list(actor: Actor, search = "", status?: string, limit = 50) {
    this.role(actor);
    if (status && !["paid", "unpaid"].includes(status))
      throw DomainError.validation("Status pembayaran tidak valid.");
    return this.store.list({
      search: search.trim(),
      status,
      limit: Math.min(100, Math.max(1, limit)),
    });
  }
  async patientContext(actor: Actor, patientId: string) {
    this.role(actor);
    const patient = await this.store.patientInfo(patientId);
    if (!patient) throw DomainError.notFound();
    const placements = await this.store.patientPlacements(patientId),
      invoices = await this.store.patientInvoices(patientId);
    return { patient, placements, invoices };
  }
  async detail(actor: Actor, invoiceId: string) {
    this.role(actor);
    const result = await this.store.detail(invoiceId);
    if (!result) throw DomainError.notFound();
    return result;
  }
  async create(actor: Actor, input: CreateInvoiceInput) {
    this.role(actor);
    const patient = await this.store.patientForCreate(input.patientId);
    if (!patient) throw DomainError.notFound();
    if (
      input.placementId &&
      !(await this.store.placementMatches(input.placementId, input.patientId))
    )
      throw DomainError.validation("Penempatan pasien tidak cocok.");
    const lines = calculateInvoiceLines(input.lines, id),
      total = totalInvoiceLines(lines),
      covered = parseInvoiceMoney(input.coveredAmount, "Nilai jaminan");
    if (invoiceAmountGreaterThan(covered, total))
      throw DomainError.validation(
        "Jumlah jaminan tidak boleh melebihi total tagihan.",
      );
    if (!patient.bpjs && invoiceAmountIsPositive(covered))
      throw DomainError.validation(
        "Pasien tanpa BPJS tidak dapat menggunakan nilai jaminan.",
      );
    const payable = subtractInvoiceAmounts(total, covered),
      invoiceId = id();
    await this.uow.run(async (tx) => {
      await tx.billing.createInvoice({
        id: invoiceId,
        patientId: input.patientId,
        placementId: input.placementId ?? null,
        bpjs: patient.bpjs,
        total,
        covered,
        payable,
        actorId: actor.id,
      });
      for (const line of lines)
        await tx.billing.createLine({
          id: line.id,
          invoiceId,
          roomItemId: line.roomItemId,
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        });
      await tx.billing.history({
        id: id(),
        invoiceId,
        actorId: actor.id,
        action: "created",
        reason: "Tagihan dibuat",
        before: null,
        after: {
          status: "unpaid",
          totalAmount: total,
          coveredAmount: covered,
          payableAmount: payable,
          lines,
        },
      });
    });
    return {
      id: invoiceId,
      patientId: input.patientId,
      patientName: patient.name,
      bpjsSnapshot: patient.bpjs,
      totalAmount: total,
      coveredAmount: covered,
      payableAmount: payable,
      status: "unpaid",
      version: 1,
      lines,
    };
  }
  async changePayment(actor: Actor, invoiceId: string, input: PaymentInput) {
    this.role(actor);
    if (!input.reason.trim())
      throw DomainError.validation("Alasan wajib diisi.");
    if (!input.status || !["paid", "unpaid"].includes(input.status))
      throw DomainError.validation("Status pembayaran tidak valid.");
    return this.uow.run(async (tx) => {
      const row = await tx.billing.lockInvoice(invoiceId);
      if (!row) throw DomainError.notFound();
      if (Number(row.version) !== input.expectedVersion)
        throw DomainError.conflict(
          "Tagihan telah berubah. Muat ulang lalu coba lagi.",
        );
      if (row.status === input.status)
        throw DomainError.validation("Tagihan sudah memiliki status tersebut.");
      const before = {
        status: row.status,
        version: Number(row.version),
        totalAmount: String(row.total_amount),
        coveredAmount: String(row.covered_amount),
        payableAmount: String(row.payable_amount),
      };
      await tx.billing.updatePayment(invoiceId, input.status);
      const after = {
        ...before,
        status: input.status,
        version: Number(row.version) + 1,
      };
      await tx.billing.history({
        id: id(),
        invoiceId,
        actorId: actor.id,
        action: "status_changed",
        reason: input.reason.trim(),
        before,
        after,
      });
      return after;
    });
  }
  async editLine(
    actor: Actor,
    invoiceId: string,
    lineId: string,
    input: EditInvoiceLineInput,
  ) {
    this.role(actor);
    if (!input.reason.trim())
      throw DomainError.validation("Alasan wajib diisi.");
    const line = calculateInvoiceLines([input], id)[0];
    return this.uow.run(async (tx) => {
      const invoice = await tx.billing.lockInvoice(invoiceId);
      if (!invoice) throw DomainError.notFound();
      if (invoice.status === "paid")
        throw DomainError.conflict(
          "Tagihan lunas tidak dapat mengubah rincian keuangan.",
        );
      if (Number(invoice.version) !== input.expectedVersion)
        throw DomainError.conflict();
      const old = await tx.billing.lockLine(invoiceId, lineId);
      if (!old) throw DomainError.notFound();
      const before = {
        line: {
          id: old.id,
          description: old.description,
          quantity: old.quantity,
          unitPrice: String(old.unit_price),
          lineTotal: String(old.line_total),
        },
        totalAmount: String(invoice.total_amount),
        coveredAmount: String(invoice.covered_amount),
        payableAmount: String(invoice.payable_amount),
      };
      await tx.billing.updateLine(lineId, {
        roomItemId: input.roomItemId ?? null,
        kind: input.kind ?? "service",
        description: input.description.trim(),
        quantity: input.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      });
      const total = await tx.billing.totalLines(invoiceId),
        covered = String(invoice.covered_amount);
      if (invoiceAmountGreaterThan(covered, total))
        throw DomainError.validation(
          "Jumlah jaminan tidak boleh melebihi total tagihan.",
        );
      const payable = subtractInvoiceAmounts(total, covered);
      await tx.billing.updateFinancialTotals(invoiceId, total, payable);
      const after = {
        line: {
          id: lineId,
          description: input.description.trim(),
          quantity: input.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        },
        totalAmount: total,
        coveredAmount: covered,
        payableAmount: payable,
      };
      await tx.billing.history({
        id: id(),
        invoiceId,
        actorId: actor.id,
        action: "line_updated",
        reason: input.reason.trim(),
        before,
        after,
      });
      return { ok: true, version: Number(invoice.version) + 1, ...after };
    });
  }
  async deleteLine(
    actor: Actor,
    invoiceId: string,
    lineId: string,
    input: DeleteInvoiceInput,
  ) {
    this.role(actor);
    if (!input.reason.trim())
      throw DomainError.validation("Alasan wajib diisi.");
    return this.uow.run(async (tx) => {
      const invoice = await tx.billing.lockInvoice(invoiceId);
      if (!invoice) throw DomainError.notFound();
      if (invoice.status === "paid")
        throw DomainError.conflict(
          "Tagihan lunas tidak dapat mengubah rincian keuangan.",
        );
      if (Number(invoice.version) !== input.expectedVersion)
        throw DomainError.conflict();
      const line = await tx.billing.lockLine(invoiceId, lineId);
      if (!line) throw DomainError.notFound();
      if ((await tx.billing.countLines(invoiceId)) <= 1)
        throw DomainError.validation(
          "Tagihan harus memiliki setidaknya satu rincian.",
        );
      const before = {
        line: {
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: String(line.unit_price),
          lineTotal: String(line.line_total),
        },
        totalAmount: String(invoice.total_amount),
      };
      await tx.billing.deleteLine(lineId);
      const total = await tx.billing.totalLines(invoiceId),
        covered = String(invoice.covered_amount);
      if (invoiceAmountGreaterThan(covered, total))
        throw DomainError.validation(
          "Jumlah jaminan tidak boleh melebihi total tagihan.",
        );
      const payable = subtractInvoiceAmounts(total, covered);
      await tx.billing.updateFinancialTotals(invoiceId, total, payable);
      const after = {
        deletedLineId: lineId,
        totalAmount: total,
        coveredAmount: covered,
        payableAmount: payable,
      };
      await tx.billing.history({
        id: id(),
        invoiceId,
        actorId: actor.id,
        action: "line_deleted",
        reason: input.reason.trim(),
        before,
        after,
      });
      return { ok: true, version: Number(invoice.version) + 1, ...after };
    });
  }
  async verifyClaim(actor: Actor, invoiceId: string, input: VerifyClaimInput) {
    this.role(actor);
    if (!input.result.trim())
      throw DomainError.validation("Hasil verifikasi wajib diisi.");
    if (!input.reason.trim())
      throw DomainError.validation("Alasan wajib diisi.");
    return this.uow.run(async (tx) => {
      const invoice = await tx.billing.lockInvoice(invoiceId);
      if (!invoice) throw DomainError.notFound();
      if (!invoice.bpjs_snapshot)
        throw DomainError.validation(
          "Tagihan ini tidak memiliki snapshot BPJS.",
        );
      if (Number(invoice.version) !== input.expectedVersion)
        throw DomainError.conflict();
      const before = {
        claimVerified: !!invoice.claim_verified,
        claimResult: invoice.claim_result,
        version: Number(invoice.version),
      };
      await tx.billing.verifyClaim(
        invoiceId,
        actor.id,
        input.verified,
        input.result.trim(),
      );
      const after = {
        claimVerified: input.verified,
        claimResult: input.result.trim(),
        version: Number(invoice.version) + 1,
      };
      await tx.billing.history({
        id: id(),
        invoiceId,
        actorId: actor.id,
        action: "claim_verification",
        reason: input.reason.trim(),
        before,
        after,
      });
      return after;
    });
  }
  async remove(actor: Actor, invoiceId: string, input: DeleteInvoiceInput) {
    this.role(actor);
    if (!input.reason.trim())
      throw DomainError.validation("Alasan wajib diisi.");
    return this.uow.run(async (tx) => {
      const invoice = await tx.billing.lockInvoice(invoiceId);
      if (!invoice) throw DomainError.notFound();
      if (invoice.status === "paid")
        throw DomainError.conflict("Tagihan lunas tidak dapat dihapus.");
      if (Number(invoice.version) !== input.expectedVersion)
        throw DomainError.conflict();
      await tx.billing.deleteInvoice(invoiceId);
      const after = { deleted: true, version: Number(invoice.version) + 1 };
      await tx.billing.history({
        id: id(),
        invoiceId,
        actorId: actor.id,
        action: "deleted",
        reason: input.reason.trim(),
        before: { status: invoice.status, version: Number(invoice.version) },
        after,
      });
      return { id: invoiceId, ...after };
    });
  }
}
