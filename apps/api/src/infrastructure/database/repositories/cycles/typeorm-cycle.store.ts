import { EntityManager } from "typeorm";
import { Actor } from "../../../../domain/auth/actor";
import {
  CycleListFilters,
  CycleStore,
} from "../../../../application/cycles/cycle-store.port";
export class TypeOrmCycleStore implements CycleStore {
  constructor(private readonly manager: EntityManager) {}
  async creationCandidates() {
    return this.manager.query(
      `SELECT p.id,p.name,p.medical_record_no AS "medicalRecordNo" FROM patients p WHERE NOT EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.status<>'released' AND c.deleted_at IS NULL) ORDER BY p.name,p.id`,
    );
  }
  async hasActiveCycle(patientId: string) {
    const rows = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM cycles WHERE patient_id=$1 AND status<>'released' AND deleted_at IS NULL) AS active`,
      [patientId],
    );
    return Boolean(rows[0]?.active);
  }
  async list(actor: Actor, filters: CycleListFilters) {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'roomId',pl.room_id,'doctorId',c.doctor_id,'doctorName',d.name,'nurseId',c.nurse_id,'nurseName',n.name,'status',c.status,'pendingApproval',EXISTS(SELECT 1 FROM cycle_requests q WHERE q.cycle_id=c.id AND q.status='pending'),'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'note',q.decision_note,'createdAt',q.created_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by WHERE q.cycle_id=c.id),'[]'::jsonb)) AS item FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.deleted_at IS NULL AND (($1='DOKTER' AND c.doctor_id=$2) OR ($1='PERAWAT' AND c.nurse_id=$2)) AND ($3::text IS NULL OR c.patient_id=$3) AND ($4::text IS NULL OR pl.room_id=$4) AND ($5::text IS NULL OR ($5='pending_approval' AND EXISTS(SELECT 1 FROM cycle_requests q WHERE q.cycle_id=c.id AND q.status='pending')) OR c.status=$5) AND ($6='' OR p.name ILIKE '%'||$6||'%' OR p.medical_record_no ILIKE '%'||$6||'%' OR r.name ILIKE '%'||$6||'%') ORDER BY c.created_at DESC,c.id LIMIT 100`,
      [
        actor.role,
        actor.id,
        filters.patientId ?? null,
        filters.roomId ?? null,
        filters.status ?? null,
        filters.search ?? "",
      ],
    );
    const items = rows.map((r: { item: Record<string, unknown> }) => r.item);
    return { items, total: items.length };
  }
  async detail(actor: Actor, cycleId: string) {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'doctorId',c.doctor_id,'doctorName',d.name,'nurseId',c.nurse_id,'nurseName',n.name,'status',c.status,'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'decidedBy',du.name,'note',q.decision_note,'createdAt',q.created_at,'decidedAt',q.decided_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by LEFT JOIN users du ON du.id=q.decided_by WHERE q.cycle_id=c.id),'[]'::jsonb)) AS item FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.id=$1 AND c.deleted_at IS NULL AND (($2='DOKTER' AND c.doctor_id=$3) OR ($2='PERAWAT' AND c.nurse_id=$3))`,
      [cycleId, actor.role, actor.id],
    );
    return rows[0]?.item;
  }
  async requestDetail(cycleId: string, requestId: string) {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',q.id,'cycleId',q.cycle_id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',u.name,'status',q.status,'decidedBy',du.name,'note',q.decision_note,'createdAt',q.created_at,'decidedAt',q.decided_at) AS item FROM cycle_requests q JOIN users u ON u.id=q.requested_by LEFT JOIN users du ON du.id=q.decided_by WHERE q.id=$1 AND q.cycle_id=$2`,
      [requestId, cycleId],
    );
    return rows[0]?.item;
  }
  async activeDoctor(id: string) {
    const rows = await this.manager.query(
      `SELECT id FROM users WHERE id=$1 AND role='DOKTER' AND active`,
      [id],
    );
    return !!rows.length;
  }
  async canReadPatient(actor: Actor, patientId: string) {
    const rows = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM patients p WHERE p.id=$1 AND ($2<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$3))) AS allowed`,
      [patientId, actor.role, actor.id],
    );
    return Boolean(rows[0]?.allowed);
  }
  async lockPatient(id: string) {
    const rows = await this.manager.query(
      `SELECT id FROM patients WHERE id=$1 FOR UPDATE`,
      [id],
    );
    return !!rows.length;
  }
  async placementRoom(placementId: string, patientId: string) {
    const rows = await this.manager.query(
      `SELECT room_id FROM placements WHERE id=$1 AND patient_id=$2`,
      [placementId, patientId],
    );
    return rows[0]?.room_id;
  }
  async roomForPlacement(placementId: string) {
    const rows = await this.manager.query(
      `SELECT room_id FROM placements WHERE id=$1`,
      [placementId],
    );
    return rows[0]?.room_id;
  }
  async lockRoom(id: string) {
    await this.manager.query(`SELECT id FROM rooms WHERE id=$1 FOR UPDATE`, [
      id,
    ]);
  }
  async activePlacement(placementId: string, patientId: string) {
    const rows = await this.manager.query(
      `SELECT id FROM placements p WHERE p.id=$1 AND p.patient_id=$2 AND p.status='active' AND NOT EXISTS(SELECT 1 FROM cycles c WHERE c.placement_id=p.id AND c.status='released') FOR UPDATE`,
      [placementId, patientId],
    );
    return !!rows.length;
  }
  async nextId(): Promise<string> {
    // Keep allocation and insertion in one transaction, including archived numbers.
    await this.manager.query("SELECT pg_advisory_xact_lock(7231932)");
    const [row] = await this.manager.query<{ next_number: string }[]>(
      "SELECT (COALESCE(MAX(substring(id FROM '^CY-([0-9]+)$')::numeric), 0) + 1)::text AS next_number FROM cycles",
    );
    return `CY-${row.next_number.padStart(3, "0")}`;
  }
  async createCycle(d: {
    id: string;
    patientId: string;
    placementId: string | null;
    doctorId: string;
    nurseId: string;
  }) {
    await this.manager.query(
      `INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id) VALUES($1,$2,$3,$4,$5)`,
      [d.id, d.patientId, d.placementId, d.doctorId, d.nurseId],
    );
  }
  async changeSeed(cycleId: string, nurseId: string) {
    const r = await this.manager.query(
      `SELECT patient_id,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL`,
      [cycleId, nurseId],
    );
    return r[0];
  }
  async lockCycleForChange(cycleId: string, nurseId: string) {
    const r = await this.manager.query(
      `SELECT status,version,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [cycleId, nurseId],
    );
    return r[0];
  }
  async updateCyclePlacementStatus(
    id: string,
    placementId: string | null,
    status: string,
  ) {
    await this.manager.query(
      `UPDATE cycles SET placement_id=$1,status=$2,version=version+1,updated_at=now() WHERE id=$3`,
      [placementId, status, id],
    );
  }
  async deleteSeed(cycleId: string, nurseId: string) {
    const r = await this.manager.query(
      `SELECT patient_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL`,
      [cycleId, nurseId],
    );
    return r[0];
  }
  async lockCycleForDelete(cycleId: string, nurseId: string) {
    const r = await this.manager.query(
      `SELECT * FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [cycleId, nurseId],
    );
    return r[0];
  }
  async hasPendingRequests(id: string) {
    const r = await this.manager.query(
      `SELECT id FROM cycle_requests WHERE cycle_id=$1 AND status='pending'`,
      [id],
    );
    return !!r.length;
  }
  async softDeleteCycle(id: string) {
    const [rows] = await this.manager.query(
      `UPDATE cycles SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
      [id],
    );
    return rows?.[0];
  }
  async addCycleHistory(d: {
    id: string;
    cycleId: string;
    actorId: string;
    reason: string;
    before: unknown;
    after: unknown;
  }) {
    await this.manager.query(
      `INSERT INTO cycle_history(id,cycle_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'deleted',$4,$5::jsonb,$6::jsonb)`,
      [
        d.id,
        d.cycleId,
        d.actorId,
        d.reason,
        JSON.stringify(d.before),
        JSON.stringify(d.after),
      ],
    );
  }
  async requestSeed(cycleId: string, nurseId: string) {
    const r = await this.manager.query(
      `SELECT patient_id,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL`,
      [cycleId, nurseId],
    );
    return r[0];
  }
  async lockPlacement(id: string) {
    await this.manager.query(
      `SELECT id FROM placements WHERE id=$1 FOR UPDATE`,
      [id],
    );
  }
  async lockCycleForRequest(cycleId: string, nurseId: string) {
    const r = await this.manager.query(
      `SELECT patient_id,placement_id,status FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [cycleId, nurseId],
    );
    return r[0];
  }
  async addRequest(d: {
    id: string;
    cycleId: string;
    kind: string;
    requestedEnd: string | null;
    reason: string;
    requestedBy: string;
    previousStatus: string;
  }) {
    await this.manager.query(
      `INSERT INTO cycle_requests(id,cycle_id,kind,requested_end,reason,requested_by,previous_status) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        d.id,
        d.cycleId,
        d.kind,
        d.requestedEnd,
        d.reason,
        d.requestedBy,
        d.previousStatus,
      ],
    );
  }
  async decisionSeed(cycleId: string, requestId: string) {
    const r = await this.manager.query(
      `SELECT c.patient_id,c.placement_id,c.doctor_id,c.nurse_id,q.kind,q.requested_end,q.status AS request_status FROM cycles c JOIN cycle_requests q ON q.cycle_id=c.id WHERE c.id=$1 AND q.id=$2 AND c.deleted_at IS NULL`,
      [cycleId, requestId],
    );
    return r[0];
  }
  async lockCycle(id: string) {
    const r = await this.manager.query(
      `SELECT version,status FROM cycles WHERE id=$1 FOR UPDATE`,
      [id],
    );
    return r[0];
  }
  async lockRequest(cycleId: string, requestId: string) {
    const r = await this.manager.query(
      `SELECT * FROM cycle_requests WHERE id=$1 AND cycle_id=$2 FOR UPDATE`,
      [requestId, cycleId],
    );
    return r[0];
  }
  async roomStatusCapacity(id: string) {
    const r = await this.manager.query(
      `SELECT capacity,status FROM rooms WHERE id=$1`,
      [id],
    );
    return r[0];
  }
  async placementDates(id: string) {
    const r = await this.manager.query(
      `SELECT starts_on::text AS starts_on,ends_on::text AS ends_on,status FROM placements WHERE id=$1`,
      [id],
    );
    return r[0];
  }
  async extensionDateCheck(
    requestedEnd: string,
    endsOn: string,
    startsOn: string,
  ) {
    const r = await this.manager.query(
      `SELECT ($1::date <= $2::date) AS invalid, ($1::date-$3::date)>365 AS too_long`,
      [requestedEnd, endsOn, startsOn],
    );
    return r[0];
  }
  async extensionOverlap(
    patientId: string,
    placementId: string,
    requestedEnd: string,
    endsOn: string,
  ) {
    const r = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM placements WHERE patient_id=$1 AND id<>$2 AND status='active' AND starts_on<=$3 AND ends_on>$4) AS found`,
      [patientId, placementId, requestedEnd, endsOn],
    );
    return !!r[0].found;
  }
  async extensionOccupancy(
    roomId: string,
    endsOn: string,
    requestedEnd: string,
    placementId: string,
  ) {
    const r = await this.manager.query(
      `WITH events AS (SELECT GREATEST(starts_on,$2::date+1)::date AS day,1::bigint AS d FROM placements WHERE room_id=$1 AND id<>$4 AND status='active' AND starts_on<=$3 AND ends_on>=$2::date+1 UNION ALL SELECT LEAST(ends_on,$3)+1,-1::bigint FROM placements WHERE room_id=$1 AND id<>$4 AND status='active' AND starts_on<=$3 AND ends_on>=$2::date+1), daily AS (SELECT day,sum(d) d FROM events GROUP BY day), counts AS (SELECT sum(d) OVER(ORDER BY day) AS n FROM daily) SELECT COALESCE(max(n),0) AS max FROM counts`,
      [roomId, endsOn, requestedEnd, placementId],
    );
    return Number(r[0].max);
  }
  async extendPlacement(id: string, requestedEnd: string) {
    await this.manager.query(
      `UPDATE placements SET ends_on=$1,version=version+1 WHERE id=$2`,
      [requestedEnd, id],
    );
  }
  async releaseDateNotStarted(startsOn: string, date: string) {
    const r = await this.manager.query(`SELECT $1::date>$2::date AS value`, [
      startsOn,
      date,
    ]);
    return !!r[0].value;
  }
  async hasFutureTasks(id: string) {
    const r = await this.manager.query(
      `SELECT count(*)::int AS n FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled') AND ends_at>now()`,
      [id],
    );
    return Number(r[0].n) > 0;
  }
  async releasePlacement(id: string, date: string) {
    await this.manager.query(
      `UPDATE placements SET ends_on=LEAST(ends_on,$1),version=version+1 WHERE id=$2`,
      [date, id],
    );
  }
  async setCycleStatus(id: string, status: string) {
    await this.manager.query(
      `UPDATE cycles SET status=$1,version=version+1,updated_at=now() WHERE id=$2`,
      [status, id],
    );
  }
  async incrementCycleVersion(id: string) {
    await this.manager.query(
      `UPDATE cycles SET version=version+1,updated_at=now() WHERE id=$1`,
      [id],
    );
  }
  async decideRequest(
    id: string,
    status: string,
    doctorId: string,
    note: string,
  ) {
    await this.manager.query(
      `UPDATE cycle_requests SET status=$1,decided_by=$2,decision_note=$3,decided_at=now() WHERE id=$4`,
      [status, doctorId, note, id],
    );
  }
  async notifyNurse(d: {
    id: string;
    nurseId: string;
    cycleId: string;
    message: string;
  }) {
    await this.manager.query(
      `INSERT INTO notifications(id,user_id,cycle_id,message) VALUES($1,$2,$3,$4)`,
      [d.id, d.nurseId, d.cycleId, d.message],
    );
  }
}
