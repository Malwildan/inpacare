import { EntityManager } from "typeorm";
import {
  InvoiceListFilters,
  InvoiceStore,
} from "../../../../application/billing/invoice-store.port";
export class TypeOrmInvoiceStore implements InvoiceStore {
  constructor(private readonly manager: EntityManager) {}
  async list(q: InvoiceListFilters) {
    const search = q.search ?? "";
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',i.id,'patientId',i.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',i.placement_id,'bpjsSnapshot',i.bpjs_snapshot,'totalAmount',i.total_amount::text,'coveredAmount',i.covered_amount::text,'payableAmount',i.payable_amount::text,'status',i.status,'claimVerified',i.claim_verified,'claimResult',i.claim_result,'version',i.version,'createdAt',i.created_at,'lineCount',count(l.id)) AS item FROM invoices i JOIN patients p ON p.id=i.patient_id LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE i.deleted_at IS NULL AND ($1='' OR p.name ILIKE $2 OR p.medical_record_no ILIKE $2 OR i.id ILIKE $2) AND ($3::text IS NULL OR i.status=$3) GROUP BY i.id,p.name,p.medical_record_no ORDER BY i.created_at DESC,i.id LIMIT $4`,
      [search, `%${search}%`, q.status ?? null, q.limit ?? 50],
    );
    return {
      items: rows.map((r: { item: Record<string, unknown> }) => r.item),
      total: rows.length,
    };
  }
  async patientInfo(patientId: string) {
    const [p] = await this.manager.query(
      `SELECT jsonb_build_object('id',id,'name',name,'medicalRecordNo',medical_record_no,'bpjs',bpjs,'bpjsNumber',bpjs_number) AS item FROM patients WHERE id=$1`,
      [patientId],
    );
    return p?.item;
  }
  async patientPlacements(patientId: string) {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',pl.id,'roomId',pl.room_id,'room',r.name,'startsOn',pl.starts_on,'endsOn',pl.ends_on,'status',pl.status) AS item FROM placements pl JOIN rooms r ON r.id=pl.room_id WHERE pl.patient_id=$1 ORDER BY pl.starts_on DESC LIMIT 50`,
      [patientId],
    );
    return rows.map((r: { item: Record<string, unknown> }) => r.item);
  }
  async patientInvoices(patientId: string) {
    return this.manager.query(
      `SELECT id,status,total_amount::text AS "totalAmount",payable_amount::text AS "payableAmount",created_at AS "createdAt" FROM invoices WHERE patient_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
      [patientId],
    );
  }
  async detail(id: string) {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',i.id,'patientId',i.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',i.placement_id,'bpjsSnapshot',i.bpjs_snapshot,'totalAmount',i.total_amount::text,'coveredAmount',i.covered_amount::text,'payableAmount',i.payable_amount::text,'status',i.status,'claimVerified',i.claim_verified,'claimResult',i.claim_result,'version',i.version,'createdAt',i.created_at,'lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'roomItemId',l.room_item_id,'kind',l.kind,'description',l.description,'quantity',l.quantity,'unitPrice',l.unit_price::text,'lineTotal',l.line_total::text) ORDER BY l.id) FROM invoice_lines l WHERE l.invoice_id=i.id),'[]'::jsonb),'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'reason',h.reason,'actor',u.name,'before',h.before_data,'after',h.after_data,'createdAt',h.created_at) ORDER BY h.created_at DESC) FROM invoice_history h JOIN users u ON u.id=h.actor_id WHERE h.invoice_id=i.id),'[]'::jsonb)) AS item FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.id=$1 AND i.deleted_at IS NULL`,
      [id],
    );
    return rows[0]?.item;
  }
  async patientForCreate(id: string) {
    const rows = await this.manager.query(
      `SELECT name,bpjs FROM patients WHERE id=$1`,
      [id],
    );
    return rows[0];
  }
  async placementMatches(placementId: string, patientId: string) {
    const rows = await this.manager.query(
      `SELECT id FROM placements WHERE id=$1 AND patient_id=$2`,
      [placementId, patientId],
    );
    return !!rows.length;
  }
  async createInvoice(d: {
    id: string;
    patientId: string;
    placementId: string | null;
    bpjs: boolean;
    total: string;
    covered: string;
    payable: string;
    actorId: string;
  }) {
    await this.manager.query(
      `INSERT INTO invoices(id,patient_id,placement_id,bpjs_snapshot,total_amount,covered_amount,payable_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        d.id,
        d.patientId,
        d.placementId,
        d.bpjs,
        d.total,
        d.covered,
        d.payable,
        d.actorId,
      ],
    );
  }
  async createLine(d: {
    id: string;
    invoiceId: string;
    roomItemId: string | null;
    kind: string;
    description: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }) {
    await this.manager.query(
      `INSERT INTO invoice_lines(id,invoice_id,room_item_id,kind,description,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        d.id,
        d.invoiceId,
        d.roomItemId,
        d.kind,
        d.description,
        d.quantity,
        d.unitPrice,
        d.lineTotal,
      ],
    );
  }
  async history(d: {
    id: string;
    invoiceId: string;
    actorId: string;
    action: string;
    reason: string;
    before: unknown;
    after: unknown;
  }) {
    await this.manager.query(
      `INSERT INTO invoice_history(id,invoice_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [
        d.id,
        d.invoiceId,
        d.actorId,
        d.action,
        d.reason,
        d.before === null ? null : JSON.stringify(d.before),
        JSON.stringify(d.after),
      ],
    );
  }
  async lockInvoice(id: string) {
    const rows = await this.manager.query(
      `SELECT * FROM invoices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return rows[0];
  }
  async updatePayment(id: string, status: string) {
    await this.manager.query(
      `UPDATE invoices SET status=$1,version=version+1,updated_at=now() WHERE id=$2`,
      [status, id],
    );
  }
  async updateInvoice(id: string, d: { status: string; total: string; covered: string; payable: string }) {
    await this.manager.query(
      `UPDATE invoices SET status=$1,total_amount=$2,covered_amount=$3,payable_amount=$4,version=version+1,updated_at=now() WHERE id=$5 AND deleted_at IS NULL`,
      [d.status, d.total, d.covered, d.payable, id],
    );
  }
  async invoiceLines(id: string) {
    return this.manager.query(`SELECT id,room_item_id,kind,description,quantity,unit_price,line_total FROM invoice_lines WHERE invoice_id=$1 ORDER BY id FOR UPDATE`, [id]);
  }
  async replaceLines(invoiceId: string, lines: { id: string; roomItemId: string | null; kind: string; description: string; quantity: number; unitPrice: string; lineTotal: string }[]) {
    await this.manager.query(`DELETE FROM invoice_lines WHERE invoice_id=$1`, [invoiceId]);
    for (const line of lines) await this.createLine({ ...line, invoiceId });
  }
  async lockLine(invoiceId: string, lineId: string) {
    const rows = await this.manager.query(
      `SELECT * FROM invoice_lines WHERE id=$1 AND invoice_id=$2 FOR UPDATE`,
      [lineId, invoiceId],
    );
    return rows[0];
  }
  async updateLine(
    id: string,
    d: {
      roomItemId: string | null;
      kind: string;
      description: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
    },
  ) {
    await this.manager.query(
      `UPDATE invoice_lines SET room_item_id=$1,kind=$2,description=$3,quantity=$4,unit_price=$5,line_total=$6 WHERE id=$7`,
      [
        d.roomItemId,
        d.kind,
        d.description,
        d.quantity,
        d.unitPrice,
        d.lineTotal,
        id,
      ],
    );
  }
  async totalLines(id: string) {
    const rows = await this.manager.query(
      `SELECT COALESCE(sum(line_total),0)::numeric(15,2)::text AS total FROM invoice_lines WHERE invoice_id=$1`,
      [id],
    );
    return rows[0].total;
  }
  async updateFinancialTotals(id: string, total: string, payable: string) {
    await this.manager.query(
      `UPDATE invoices SET total_amount=$1,payable_amount=$2,version=version+1,updated_at=now() WHERE id=$3`,
      [total, payable, id],
    );
  }
  async countLines(id: string) {
    const rows = await this.manager.query(
      `SELECT count(*)::int AS n FROM invoice_lines WHERE invoice_id=$1`,
      [id],
    );
    return Number(rows[0].n);
  }
  async deleteLine(id: string) {
    await this.manager.query(`DELETE FROM invoice_lines WHERE id=$1`, [id]);
  }
  async verifyClaim(
    id: string,
    actorId: string,
    verified: boolean,
    result: string,
  ) {
    await this.manager.query(
      `UPDATE invoices SET claim_verified=$1,claim_result=$4,claim_verified_at=now(),claim_verified_by=$2,version=version+1,updated_at=now() WHERE id=$3`,
      [verified, actorId, id, result],
    );
  }
  async deleteInvoice(id: string) {
    await this.manager.query(
      `UPDATE invoices SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1`,
      [id],
    );
  }
}
