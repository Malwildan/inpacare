import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import Decimal from "decimal.js";
import { DataSource, EntityManager } from "typeorm";
import { id } from "../../common/domain";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";
import {
  CreateInvoiceDto,
  DeleteInvoiceDto,
  EditInvoiceLineDto,
  InvoiceLineDto,
  PaymentDto,
  VerifyClaimDto,
} from "./dto/invoice.dto";

const ExactDecimal = Decimal.clone({
  precision: 32,
  rounding: Decimal.ROUND_HALF_UP,
});
export const parseInvoiceMoney = (v: string, label = "Nominal") => {
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(v.trim()))
    throw AppError.validation(
      `${label} harus berupa nominal desimal valid maksimal dua desimal.`,
    );
  const d = new ExactDecimal(v.trim());
  if (d.greaterThanOrEqualTo("10000000000000"))
    throw AppError.validation(`${label} terlalu besar.`);
  return d.toFixed(2);
};

@Injectable()
export class TagihanService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  private role(actor: Actor) {
    if (actor.role !== "ADMISI") throw AppError.forbidden();
  }
  async list(actor: Actor, search = "", status?: string, limit = 50) {
    this.role(actor);
    if (status && !["paid", "unpaid"].includes(status))
      throw AppError.validation("Status pembayaran tidak valid.");
    const pattern = `%${search.trim()}%`;
    const rows = await this.db.query(
      `SELECT jsonb_build_object('id',i.id,'patientId',i.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',i.placement_id,'bpjsSnapshot',i.bpjs_snapshot,'totalAmount',i.total_amount::text,'coveredAmount',i.covered_amount::text,'payableAmount',i.payable_amount::text,'status',i.status,'claimVerified',i.claim_verified,'version',i.version,'createdAt',i.created_at,'lineCount',count(l.id)) AS item FROM invoices i JOIN patients p ON p.id=i.patient_id LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE i.deleted_at IS NULL AND ($1='' OR p.name ILIKE $2 OR p.medical_record_no ILIKE $2 OR i.id ILIKE $2) AND ($3::text IS NULL OR i.status=$3) GROUP BY i.id,p.name,p.medical_record_no ORDER BY i.created_at DESC,i.id LIMIT $4`,
      [
        search.trim(),
        pattern,
        status ?? null,
        Math.min(100, Math.max(1, limit)),
      ],
    );
    return {
      items: rows.map((r: { item: unknown }) => r.item),
      total: rows.length,
    };
  }
  async patientContext(actor: Actor, patientId: string) {
    this.role(actor);
    const [patient] = await this.db.query(
      `SELECT jsonb_build_object('id',id,'name',name,'medicalRecordNo',medical_record_no,'bpjs',bpjs,'bpjsNumber',bpjs_number) AS item FROM patients WHERE id=$1`,
      [patientId],
    );
    if (!patient) throw AppError.notFound();
    const placements = await this.db.query(
      `SELECT jsonb_build_object('id',pl.id,'roomId',pl.room_id,'room',r.name,'startsOn',pl.starts_on,'endsOn',pl.ends_on,'status',pl.status) AS item FROM placements pl JOIN rooms r ON r.id=pl.room_id WHERE pl.patient_id=$1 ORDER BY pl.starts_on DESC LIMIT 50`,
      [patientId],
    );
    const invoices = await this.db.query(
      `SELECT id,status,total_amount::text AS "totalAmount",payable_amount::text AS "payableAmount",created_at AS "createdAt" FROM invoices WHERE patient_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
      [patientId],
    );
    return {
      patient: patient.item,
      placements: placements.map((r: { item: unknown }) => r.item),
      invoices,
    };
  }
  async detail(actor: Actor, invoiceId: string) {
    this.role(actor);
    const [row] = await this.db.query(
      `SELECT jsonb_build_object('id',i.id,'patientId',i.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',i.placement_id,'bpjsSnapshot',i.bpjs_snapshot,'totalAmount',i.total_amount::text,'coveredAmount',i.covered_amount::text,'payableAmount',i.payable_amount::text,'status',i.status,'claimVerified',i.claim_verified,'version',i.version,'createdAt',i.created_at,'lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'roomItemId',l.room_item_id,'kind',l.kind,'description',l.description,'quantity',l.quantity,'unitPrice',l.unit_price::text,'lineTotal',l.line_total::text) ORDER BY l.id) FROM invoice_lines l WHERE l.invoice_id=i.id),'[]'::jsonb),'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'reason',h.reason,'actor',u.name,'before',h.before_data,'after',h.after_data,'createdAt',h.created_at) ORDER BY h.created_at DESC) FROM invoice_history h JOIN users u ON u.id=h.actor_id WHERE h.invoice_id=i.id),'[]'::jsonb)) AS item FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.id=$1 AND i.deleted_at IS NULL`,
      [invoiceId],
    );
    if (!row) throw AppError.notFound();
    return row.item;
  }
  private parseLines(input: InvoiceLineDto[]) {
    if (input.length < 1 || input.length > 30)
      throw AppError.validation("Tagihan harus memuat 1–30 rincian.");
    return input.map((line) => {
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 10000
      )
        throw AppError.validation("Jumlah layanan harus 1–10.000.");
      if (!line.description.trim())
        throw AppError.validation("Nama layanan wajib diisi.");
      const unitPrice = parseInvoiceMoney(line.unitPrice, "Harga satuan");
      const lineTotal = new ExactDecimal(unitPrice)
        .mul(line.quantity)
        .toFixed(2);
      return {
        id: id(),
        roomItemId: line.roomItemId ?? null,
        kind: line.kind ?? "service",
        description: line.description.trim(),
        quantity: line.quantity,
        unitPrice,
        lineTotal,
      };
    });
  }
  private total(lines: { lineTotal: string }[]) {
    return lines
      .reduce((a, l) => a.plus(l.lineTotal), new ExactDecimal(0))
      .toFixed(2);
  }
  private async history(
    m: EntityManager,
    invoiceId: string,
    actor: Actor,
    action: string,
    reason: string,
    before: unknown,
    after: unknown,
  ) {
    await m.query(
      `INSERT INTO invoice_history(id,invoice_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [
        id(),
        invoiceId,
        actor.id,
        action,
        reason,
        before === null ? null : JSON.stringify(before),
        JSON.stringify(after),
      ],
    );
  }
  async create(actor: Actor, input: CreateInvoiceDto) {
    this.role(actor);
    const [patient] = await this.db.query(
      `SELECT name,bpjs FROM patients WHERE id=$1`,
      [input.patientId],
    );
    if (!patient) throw AppError.notFound();
    if (input.placementId) {
      const [p] = await this.db.query(
        `SELECT id FROM placements WHERE id=$1 AND patient_id=$2`,
        [input.placementId, input.patientId],
      );
      if (!p) throw AppError.validation("Penempatan pasien tidak cocok.");
    }
    const lines = this.parseLines(input.lines),
      total = this.total(lines),
      covered = parseInvoiceMoney(input.coveredAmount, "Nilai jaminan");
    if (new ExactDecimal(covered).greaterThan(total))
      throw AppError.validation(
        "Jumlah jaminan tidak boleh melebihi total tagihan.",
      );
    if (!patient.bpjs && new ExactDecimal(covered).greaterThan(0))
      throw AppError.validation(
        "Pasien tanpa BPJS tidak dapat menggunakan nilai jaminan.",
      );
    const payable = new ExactDecimal(total).minus(covered).toFixed(2),
      invoiceId = id();
    await this.db.transaction(async (m) => {
      await m.query(
        `INSERT INTO invoices(id,patient_id,placement_id,bpjs_snapshot,total_amount,covered_amount,payable_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          invoiceId,
          input.patientId,
          input.placementId ?? null,
          patient.bpjs,
          total,
          covered,
          payable,
          actor.id,
        ],
      );
      for (const l of lines)
        await m.query(
          `INSERT INTO invoice_lines(id,invoice_id,room_item_id,kind,description,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            l.id,
            invoiceId,
            l.roomItemId,
            l.kind,
            l.description,
            l.quantity,
            l.unitPrice,
            l.lineTotal,
          ],
        );
      const after = {
        status: "unpaid",
        totalAmount: total,
        coveredAmount: covered,
        payableAmount: payable,
        lines,
      };
      await this.history(
        m,
        invoiceId,
        actor,
        "created",
        "Tagihan dibuat",
        null,
        after,
      );
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
  async changePayment(actor: Actor, invoiceId: string, input: PaymentDto) {
    this.role(actor);
    if (!input.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    if (!input.status || !["paid", "unpaid"].includes(input.status))
      throw AppError.validation("Status pembayaran tidak valid.");
    return this.db.transaction(async (m) => {
      const [row] = await m.query(
        `SELECT * FROM invoices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId],
      );
      if (!row) throw AppError.notFound();
      if (Number(row.version) !== input.expectedVersion)
        throw AppError.conflict(
          "Tagihan telah berubah. Muat ulang lalu coba lagi.",
        );
      if (row.status === input.status)
        throw AppError.validation("Tagihan sudah memiliki status tersebut.");
      const before = {
        status: row.status,
        version: Number(row.version),
        totalAmount: String(row.total_amount),
        coveredAmount: String(row.covered_amount),
        payableAmount: String(row.payable_amount),
      };
      await m.query(
        `UPDATE invoices SET status=$1,version=version+1,updated_at=now() WHERE id=$2`,
        [input.status, invoiceId],
      );
      const after = {
        ...before,
        status: input.status,
        version: Number(row.version) + 1,
      };
      await this.history(
        m,
        invoiceId,
        actor,
        "status_changed",
        input.reason.trim(),
        before,
        after,
      );
      return after;
    });
  }
  async editLine(
    actor: Actor,
    invoiceId: string,
    lineId: string,
    input: EditInvoiceLineDto,
  ) {
    this.role(actor);
    if (!input.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    const lines = this.parseLines([input]);
    const l = lines[0];
    return this.db.transaction(async (m) => {
      const [inv] = await m.query(
        `SELECT * FROM invoices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId],
      );
      if (!inv) throw AppError.notFound();
      if (inv.status === "paid")
        throw AppError.conflict(
          "Tagihan lunas tidak dapat mengubah rincian keuangan.",
        );
      if (Number(inv.version) !== input.expectedVersion)
        throw AppError.conflict();
      const [old] = await m.query(
        `SELECT * FROM invoice_lines WHERE id=$1 AND invoice_id=$2 FOR UPDATE`,
        [lineId, invoiceId],
      );
      if (!old) throw AppError.notFound();
      const before = {
        line: {
          id: old.id,
          description: old.description,
          quantity: old.quantity,
          unitPrice: String(old.unit_price),
          lineTotal: String(old.line_total),
        },
        totalAmount: String(inv.total_amount),
        coveredAmount: String(inv.covered_amount),
        payableAmount: String(inv.payable_amount),
      };
      await m.query(
        `UPDATE invoice_lines SET room_item_id=$1,kind=$2,description=$3,quantity=$4,unit_price=$5,line_total=$6 WHERE id=$7`,
        [
          input.roomItemId ?? null,
          input.kind ?? "service",
          input.description.trim(),
          input.quantity,
          l.unitPrice,
          l.lineTotal,
          lineId,
        ],
      );
      const [sum] = await m.query(
        `SELECT COALESCE(sum(line_total),0)::numeric(15,2)::text AS total FROM invoice_lines WHERE invoice_id=$1`,
        [invoiceId],
      );
      const total = new ExactDecimal(sum.total),
        covered = new ExactDecimal(inv.covered_amount);
      if (covered.greaterThan(total))
        throw AppError.validation(
          "Jumlah jaminan tidak boleh melebihi total tagihan.",
        );
      await m.query(
        `UPDATE invoices SET total_amount=$1,payable_amount=$2,version=version+1,updated_at=now() WHERE id=$3`,
        [total.toFixed(2), total.minus(covered).toFixed(2), invoiceId],
      );
      const after = {
        line: {
          id: lineId,
          description: input.description.trim(),
          quantity: input.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        },
        totalAmount: total.toFixed(2),
        coveredAmount: covered.toFixed(2),
        payableAmount: total.minus(covered).toFixed(2),
      };
      await this.history(
        m,
        invoiceId,
        actor,
        "line_updated",
        input.reason.trim(),
        before,
        after,
      );
      return { ok: true, version: Number(inv.version) + 1, ...after };
    });
  }
  async deleteLine(
    actor: Actor,
    invoiceId: string,
    lineId: string,
    input: DeleteInvoiceDto,
  ) {
    this.role(actor);
    if (!input.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    return this.db.transaction(async (m) => {
      const [inv] = await m.query(
        `SELECT * FROM invoices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId],
      );
      if (!inv) throw AppError.notFound();
      if (inv.status === "paid")
        throw AppError.conflict(
          "Tagihan lunas tidak dapat mengubah rincian keuangan.",
        );
      if (Number(inv.version) !== input.expectedVersion)
        throw AppError.conflict();
      const [line] = await m.query(
        `SELECT * FROM invoice_lines WHERE id=$1 AND invoice_id=$2 FOR UPDATE`,
        [lineId, invoiceId],
      );
      if (!line) throw AppError.notFound();
      const count = await m.query(
        `SELECT count(*)::int AS n FROM invoice_lines WHERE invoice_id=$1`,
        [invoiceId],
      );
      if (count[0].n <= 1)
        throw AppError.validation(
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
        totalAmount: String(inv.total_amount),
      };
      await m.query(`DELETE FROM invoice_lines WHERE id=$1`, [lineId]);
      const [sum] = await m.query(
        `SELECT COALESCE(sum(line_total),0)::numeric(15,2)::text AS total FROM invoice_lines WHERE invoice_id=$1`,
        [invoiceId],
      );
      const total = new ExactDecimal(sum.total),
        covered = new ExactDecimal(inv.covered_amount);
      if (covered.greaterThan(total))
        throw AppError.validation(
          "Jumlah jaminan tidak boleh melebihi total tagihan.",
        );
      await m.query(
        `UPDATE invoices SET total_amount=$1,payable_amount=$2,version=version+1,updated_at=now() WHERE id=$3`,
        [total.toFixed(2), total.minus(covered).toFixed(2), invoiceId],
      );
      const after = {
        deletedLineId: lineId,
        totalAmount: total.toFixed(2),
        coveredAmount: covered.toFixed(2),
        payableAmount: total.minus(covered).toFixed(2),
      };
      await this.history(
        m,
        invoiceId,
        actor,
        "line_deleted",
        input.reason.trim(),
        before,
        after,
      );
      return { ok: true, version: Number(inv.version) + 1, ...after };
    });
  }
  async verifyClaim(actor: Actor, invoiceId: string, input: VerifyClaimDto) {
    this.role(actor);
    if (!input.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    return this.db.transaction(async (m) => {
      const [inv] = await m.query(
        `SELECT * FROM invoices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId],
      );
      if (!inv) throw AppError.notFound();
      if (!inv.bpjs_snapshot)
        throw AppError.validation("Tagihan ini tidak memiliki snapshot BPJS.");
      if (Number(inv.version) !== input.expectedVersion)
        throw AppError.conflict();
      const before = {
        claimVerified: !!inv.claim_verified,
        version: Number(inv.version),
      };
      await m.query(
        `UPDATE invoices SET claim_verified=$1,claim_verified_at=CASE WHEN $1 THEN now() ELSE NULL END,claim_verified_by=CASE WHEN $1 THEN $2 ELSE NULL END,version=version+1,updated_at=now() WHERE id=$3`,
        [input.verified, actor.id, invoiceId],
      );
      const after = {
        claimVerified: input.verified,
        version: Number(inv.version) + 1,
      };
      await this.history(
        m,
        invoiceId,
        actor,
        "claim_verification",
        input.reason.trim(),
        before,
        after,
      );
      return after;
    });
  }
  async remove(actor: Actor, invoiceId: string, input: DeleteInvoiceDto) {
    this.role(actor);
    if (!input.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    return this.db.transaction(async (m) => {
      const [inv] = await m.query(
        `SELECT * FROM invoices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId],
      );
      if (!inv) throw AppError.notFound();
      if (inv.status === "paid")
        throw AppError.conflict("Tagihan lunas tidak dapat dihapus.");
      if (Number(inv.version) !== input.expectedVersion)
        throw AppError.conflict();
      await m.query(
        `UPDATE invoices SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1`,
        [invoiceId],
      );
      const after = { deleted: true, version: Number(inv.version) + 1 };
      await this.history(
        m,
        invoiceId,
        actor,
        "deleted",
        input.reason.trim(),
        { status: inv.status, version: Number(inv.version) },
        after,
      );
      return { id: invoiceId, ...after };
    });
  }
}
