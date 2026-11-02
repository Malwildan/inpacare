import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { canReadPatient, id, today } from "../../common/domain";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";
import {
  ChangeCycleDto,
  CreateCycleDto,
  CycleListQueryDto,
  CycleRequestDto,
  DecideCycleRequestDto,
  DeleteCycleDto,
} from "./dto/cycle.dto";

export const cycleTransitionAllowed = (current: string, next: string) =>
  (current === "pending" && next === "assigned") ||
  (current === "assigned" && next === "in_care");

@Injectable()
export class CyclesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  private scope(actor: Actor) {
    if (!["DOKTER", "PERAWAT"].includes(actor.role)) throw AppError.forbidden();
  }

  async list(actor: Actor, filters: CycleListQueryDto = {}) {
    this.scope(actor);
    if (
      filters.status &&
      ![
        "pending",
        "assigned",
        "in_care",
        "extend",
        "released",
        "pending_approval",
      ].includes(filters.status)
    )
      throw AppError.validation("Status siklus tidak valid.");
    const search = filters.search?.trim() ?? "";
    const rows = await this.db.query(
      `SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'roomId',pl.room_id,'doctorId',c.doctor_id,'doctorName',d.name,'nurseId',c.nurse_id,'nurseName',n.name,'status',c.status,'pendingApproval',EXISTS(SELECT 1 FROM cycle_requests q WHERE q.cycle_id=c.id AND q.status='pending'),'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'note',q.decision_note,'createdAt',q.created_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by WHERE q.cycle_id=c.id),'[]'::jsonb)) AS item FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.deleted_at IS NULL AND (($1='DOKTER' AND c.doctor_id=$2) OR ($1='PERAWAT' AND c.nurse_id=$2)) AND ($3::text IS NULL OR c.patient_id=$3) AND ($4::text IS NULL OR pl.room_id=$4) AND ($5::text IS NULL OR ($5='pending_approval' AND EXISTS(SELECT 1 FROM cycle_requests q WHERE q.cycle_id=c.id AND q.status='pending')) OR c.status=$5) AND ($6='' OR p.name ILIKE '%'||$6||'%' OR p.medical_record_no ILIKE '%'||$6||'%' OR r.name ILIKE '%'||$6||'%') ORDER BY c.created_at DESC,c.id LIMIT 100`,
      [
        actor.role,
        actor.id,
        filters.patientId ?? null,
        filters.roomId ?? null,
        filters.status ?? null,
        search,
      ],
    );
    const items = rows.map((r: { item: unknown }) => r.item);
    return { items, total: items.length };
  }

  async detail(actor: Actor, cycleId: string) {
    this.scope(actor);
    const rows = await this.db.query(
      `SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'doctorId',c.doctor_id,'doctorName',d.name,'nurseId',c.nurse_id,'nurseName',n.name,'status',c.status,'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'decidedBy',du.name,'note',q.decision_note,'createdAt',q.created_at,'decidedAt',q.decided_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by LEFT JOIN users du ON du.id=q.decided_by WHERE q.cycle_id=c.id),'[]'::jsonb)) AS item FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.id=$1 AND c.deleted_at IS NULL AND (($2='DOKTER' AND c.doctor_id=$3) OR ($2='PERAWAT' AND c.nurse_id=$3))`,
      [cycleId, actor.role, actor.id],
    );
    if (!rows.length) throw AppError.notFound();
    return rows[0].item;
  }

  async requestDetail(actor: Actor, cycleId: string, requestId: string) {
    await this.detail(actor, cycleId);
    const rows = await this.db.query(
      `SELECT jsonb_build_object('id',q.id,'cycleId',q.cycle_id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',u.name,'status',q.status,'decidedBy',du.name,'note',q.decision_note,'createdAt',q.created_at,'decidedAt',q.decided_at) AS item FROM cycle_requests q JOIN users u ON u.id=q.requested_by LEFT JOIN users du ON du.id=q.decided_by WHERE q.id=$1 AND q.cycle_id=$2`,
      [requestId, cycleId],
    );
    if (!rows.length) throw AppError.notFound();
    return rows[0].item;
  }

  async create(actor: Actor, input: CreateCycleDto) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    await canReadPatient(this.db.manager, actor, input.patientId);
    const doctors = await this.db.query(
      `SELECT id FROM users WHERE id=$1 AND role='DOKTER' AND active`,
      [input.doctorId],
    );
    if (!doctors.length) throw AppError.validation("Pilih dokter aktif.");
    const cycleId = id();
    await this.db.transaction(async (m) => {
      await m.query(`SELECT id FROM patients WHERE id=$1 FOR UPDATE`, [
        input.patientId,
      ]);
      let placementId: string | null = input.placementId || null;
      if (placementId) {
        const [ref] = await m.query(
          `SELECT room_id FROM placements WHERE id=$1 AND patient_id=$2`,
          [placementId, input.patientId],
        );
        if (!ref) throw AppError.notFound();
        await m.query(`SELECT id FROM rooms WHERE id=$1 FOR UPDATE`, [
          ref.room_id,
        ]);
        const placement = await m.query(
          `SELECT id FROM placements p WHERE p.id=$1 AND p.patient_id=$2 AND p.status='active' AND NOT EXISTS(SELECT 1 FROM cycles c WHERE c.placement_id=p.id AND c.status='released') FOR UPDATE`,
          [placementId, input.patientId],
        );
        if (!placement.length)
          throw AppError.conflict("Penempatan tidak lagi aktif.");
      }
      await m.query(
        `INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id) VALUES($1,$2,$3,$4,$5)`,
        [cycleId, input.patientId, placementId, input.doctorId, actor.id],
      );
    });
    return {
      id: cycleId,
      patientId: input.patientId,
      placementId: input.placementId ?? null,
      doctorId: input.doctorId,
      nurseId: actor.id,
      status: "pending",
      version: 1,
    };
  }

  async change(actor: Actor, cycleId: string, input: ChangeCycleDto) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    return this.db.transaction(async (m) => {
      const seed = await m.query(
        `SELECT patient_id,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL`,
        [cycleId, actor.id],
      );
      if (!seed.length) throw AppError.notFound();
      await m.query(`SELECT id FROM patients WHERE id=$1 FOR UPDATE`, [
        seed[0].patient_id,
      ]);
      const targetPlacement =
        input.placementId === undefined
          ? seed[0].placement_id
          : input.placementId || null;
      if (targetPlacement) {
        const [ref] = await m.query(
          `SELECT room_id FROM placements WHERE id=$1 AND patient_id=$2`,
          [targetPlacement, seed[0].patient_id],
        );
        if (!ref) throw AppError.validation("Penempatan pasien tidak cocok.");
        await m.query(`SELECT id FROM rooms WHERE id=$1 FOR UPDATE`, [
          ref.room_id,
        ]);
        const pl = await m.query(
          `SELECT id FROM placements p WHERE p.id=$1 AND p.patient_id=$2 AND p.status='active' AND NOT EXISTS(SELECT 1 FROM cycles c WHERE c.placement_id=p.id AND c.status='released') FOR UPDATE`,
          [targetPlacement, seed[0].patient_id],
        );
        if (!pl.length) throw AppError.conflict("Penempatan tidak lagi aktif.");
      }
      const rows = await m.query(
        `SELECT status,version,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [cycleId, actor.id],
      );
      if (!rows.length) throw AppError.notFound();
      const c = rows[0];
      if (Number(c.version) !== input.expectedVersion)
        throw AppError.conflict(
          "Siklus telah berubah. Muat ulang lalu coba lagi.",
        );
      let status = c.status as string;
      if (input.placementId && c.status !== "pending")
        throw AppError.conflict(
          "Penempatan hanya dapat dikaitkan pada rekap pending.",
        );
      if (input.status) {
        if (!cycleTransitionAllowed(status, input.status))
          throw AppError.conflict("Transisi siklus tidak diizinkan.");
        if (!targetPlacement)
          throw AppError.conflict("Rekap belum memiliki penempatan.");
        status = input.status;
      }
      await m.query(
        `UPDATE cycles SET placement_id=$1,status=$2,version=version+1,updated_at=now() WHERE id=$3`,
        [targetPlacement, status, cycleId],
      );
      return {
        ok: true,
        status,
        placementId: targetPlacement,
        version: input.expectedVersion + 1,
      };
    });
  }

  async remove(actor: Actor, cycleId: string, input: DeleteCycleDto) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    return this.db.transaction(async (m) => {
      const seed = await m.query(
        `SELECT patient_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL`,
        [cycleId, actor.id],
      );
      if (!seed.length) throw AppError.notFound();
      await m.query(`SELECT id FROM patients WHERE id=$1 FOR UPDATE`, [
        seed[0].patient_id,
      ]);
      const [c] = await m.query(
        `SELECT version,status FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [cycleId, actor.id],
      );
      if (!c) throw AppError.notFound();
      if (Number(c.version) !== input.expectedVersion)
        throw AppError.conflict();
      if (c.status !== "pending")
        throw AppError.conflict("Hanya rekap pending yang dapat dihapus.");
      const pending = await m.query(
        `SELECT id FROM cycle_requests WHERE cycle_id=$1 AND status='pending'`,
        [cycleId],
      );
      if (pending.length)
        throw AppError.conflict(
          "Tutup permintaan yang masih menunggu sebelum menghapus rekap.",
        );
      await m.query(
        `UPDATE cycles SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1`,
        [cycleId],
      );
      return { id: cycleId, deleted: true, version: input.expectedVersion + 1 };
    });
  }

  async request(actor: Actor, cycleId: string, input: CycleRequestDto) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    if (!input.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    if ((input.kind === "extend") !== !!input.requestedEnd)
      throw AppError.validation(
        "Isi tanggal baru hanya untuk permintaan perpanjangan.",
      );
    const reqId = id();
    await this.db.transaction(async (m) => {
      const [cycleSeed] = await m.query(
        `SELECT patient_id,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL`,
        [cycleId, actor.id],
      );
      if (!cycleSeed) throw AppError.notFound();
      await m.query(`SELECT id FROM patients WHERE id=$1 FOR UPDATE`, [
        cycleSeed.patient_id,
      ]);
      if (cycleSeed.placement_id) {
        const [ref] = await m.query(
          `SELECT room_id FROM placements WHERE id=$1`,
          [cycleSeed.placement_id],
        );
        if (ref)
          await m.query(`SELECT id FROM rooms WHERE id=$1 FOR UPDATE`, [
            ref.room_id,
          ]);
        await m.query(`SELECT id FROM placements WHERE id=$1 FOR UPDATE`, [
          cycleSeed.placement_id,
        ]);
      }
      const [cycle] = await m.query(
        `SELECT patient_id,placement_id,status FROM cycles WHERE id=$1 AND nurse_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [cycleId, actor.id],
      );
      if (!cycle) throw AppError.notFound();
      if (!cycle.placement_id)
        throw AppError.conflict("Siklus belum memiliki penempatan.");
      if (!["in_care", "extend"].includes(cycle.status))
        throw AppError.conflict(
          "Permintaan hanya tersedia pada siklus dalam perawatan.",
        );
      await m.query(
        `INSERT INTO cycle_requests(id,cycle_id,kind,requested_end,reason,requested_by,previous_status) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          reqId,
          cycleId,
          input.kind,
          input.requestedEnd ?? null,
          input.reason.trim(),
          actor.id,
          cycle.status,
        ],
      );
    });
    return {
      id: reqId,
      cycleId,
      kind: input.kind,
      requestedEnd: input.requestedEnd ?? null,
      status: "pending",
    };
  }

  async decide(
    actor: Actor,
    cycleId: string,
    requestId: string,
    input: DecideCycleRequestDto,
  ) {
    if (actor.role !== "DOKTER") throw AppError.forbidden();
    if (!input.note.trim())
      throw AppError.validation("Catatan keputusan wajib diisi.");
    return this.db.transaction(async (m) => {
      const [seed] = await m.query(
        `SELECT c.patient_id,c.placement_id,c.doctor_id,c.nurse_id,q.kind,q.requested_end,q.status AS request_status FROM cycles c JOIN cycle_requests q ON q.cycle_id=c.id WHERE c.id=$1 AND q.id=$2 AND c.deleted_at IS NULL`,
        [cycleId, requestId],
      );
      if (
        !seed ||
        seed.doctor_id !== actor.id ||
        seed.request_status !== "pending"
      )
        throw AppError.notFound();
      await m.query(`SELECT id FROM patients WHERE id=$1 FOR UPDATE`, [
        seed.patient_id,
      ]);
      let roomId: string | null = null;
      if (seed.placement_id) {
        const [ref] = await m.query(
          `SELECT room_id FROM placements WHERE id=$1`,
          [seed.placement_id],
        );
        roomId = ref?.room_id ?? null;
      }
      if (roomId)
        await m.query(`SELECT id FROM rooms WHERE id=$1 FOR UPDATE`, [roomId]);
      if (seed.placement_id)
        await m.query(`SELECT id FROM placements WHERE id=$1 FOR UPDATE`, [
          seed.placement_id,
        ]);
      const [cycle] = await m.query(
        `SELECT version,status FROM cycles WHERE id=$1 FOR UPDATE`,
        [cycleId],
      );
      const [req] = await m.query(
        `SELECT * FROM cycle_requests WHERE id=$1 AND cycle_id=$2 FOR UPDATE`,
        [requestId, cycleId],
      );
      if (!req || req.status !== "pending") throw AppError.notFound();
      if (Number(cycle.version) !== input.expectedVersion)
        throw AppError.conflict(
          "Siklus telah berubah. Muat ulang lalu coba lagi.",
        );
      const beforeStatus = cycle.status;
      if (input.decision === "approve") {
        if (!seed.placement_id)
          throw AppError.conflict("Siklus belum memiliki penempatan.");
        if (!roomId) throw AppError.conflict("Penempatan tidak lagi tersedia.");
        const [room] = await m.query(
          `SELECT capacity,status FROM rooms WHERE id=$1`,
          [roomId],
        );
        if (!room) throw AppError.conflict("Ruang tidak lagi tersedia.");
        if (room.status !== "available")
          throw AppError.conflict("Ruang tidak menerima perubahan penempatan.");
        const [pl] = await m.query(
          `SELECT starts_on::text AS starts_on,ends_on::text AS ends_on,status FROM placements WHERE id=$1`,
          [seed.placement_id],
        );
        if (!pl || pl.status !== "active")
          throw AppError.conflict("Penempatan tidak lagi aktif.");
        if (seed.kind === "extend") {
          const [dateCheck] = await m.query(
            `SELECT ($1::date <= $2::date) AS invalid, ($1::date-$3::date)>365 AS too_long`,
            [seed.requested_end, pl.ends_on, pl.starts_on],
          );
          if (dateCheck.invalid)
            throw AppError.validation(
              "Tanggal akhir harus melewati jadwal yang berlaku.",
            );
          if (dateCheck.too_long)
            throw AppError.validation("Rentang penempatan maksimal 366 hari.");
          const [overlap] = await m.query(
            `SELECT EXISTS(SELECT 1 FROM placements WHERE patient_id=$1 AND id<>$2 AND status='active' AND starts_on<=$3 AND ends_on>$4) AS found`,
            [
              seed.patient_id,
              seed.placement_id,
              seed.requested_end,
              pl.ends_on,
            ],
          );
          if (overlap.found)
            throw AppError.conflict(
              "Pasien memiliki penempatan lain pada tanggal perpanjangan.",
            );
          const [occupancy] = await m.query(
            `WITH events AS (SELECT GREATEST(starts_on,$2::date+1)::date AS day,1::bigint AS d FROM placements WHERE room_id=$1 AND id<>$4 AND status='active' AND starts_on<=$3 AND ends_on>=$2::date+1 UNION ALL SELECT LEAST(ends_on,$3)+1,-1::bigint FROM placements WHERE room_id=$1 AND id<>$4 AND status='active' AND starts_on<=$3 AND ends_on>=$2::date+1), daily AS (SELECT day,sum(d) d FROM events GROUP BY day), counts AS (SELECT sum(d) OVER(ORDER BY day) AS n FROM daily) SELECT COALESCE(max(n),0) AS max FROM counts`,
            [roomId, pl.ends_on, seed.requested_end, seed.placement_id],
          );
          if (Number(occupancy.max) >= Number(room.capacity))
            throw AppError.conflict(
              "Ruang sudah penuh pada tanggal perpanjangan.",
            );
          await m.query(
            `UPDATE placements SET ends_on=$1,version=version+1 WHERE id=$2`,
            [seed.requested_end, seed.placement_id],
          );
          await m.query(
            `UPDATE cycles SET status='extend',version=version+1,updated_at=now() WHERE id=$1`,
            [cycleId],
          );
        } else {
          const [notStarted] = await m.query(
            `SELECT $1::date>$2::date AS value`,
            [pl.starts_on, today()],
          );
          if (notStarted.value)
            throw AppError.conflict(
              "Penempatan belum dimulai; pelepasan otomatis tidak tersedia.",
            );
          const [tasks] = await m.query(
            `SELECT count(*)::int AS n FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled') AND ends_at>now()`,
            [seed.placement_id],
          );
          if (tasks.n > 0)
            throw AppError.conflict(
              "Selesaikan atau batalkan tugas mendatang sebelum pelepasan.",
            );
          await m.query(
            `UPDATE placements SET ends_on=LEAST(ends_on,$1),version=version+1 WHERE id=$2`,
            [today(), seed.placement_id],
          );
          await m.query(
            `UPDATE cycles SET status='released',version=version+1,updated_at=now() WHERE id=$1`,
            [cycleId],
          );
        }
      } else
        await m.query(
          `UPDATE cycles SET version=version+1,updated_at=now() WHERE id=$1`,
          [cycleId],
        );
      const decisionStatus =
        input.decision === "approve" ? "approved" : "rejected";
      await m.query(
        `UPDATE cycle_requests SET status=$1,decided_by=$2,decision_note=$3,decided_at=now() WHERE id=$4`,
        [decisionStatus, actor.id, input.note.trim(), requestId],
      );
      await m.query(
        `INSERT INTO notifications(id,user_id,cycle_id,message) VALUES($1,$2,$3,$4)`,
        [
          id(),
          seed.nurse_id,
          cycleId,
          `Permintaan ${seed.kind} ${input.decision === "approve" ? "disetujui" : "ditolak"}.`,
        ],
      );
      return {
        ok: true,
        status: decisionStatus,
        cycleStatus:
          input.decision === "approve"
            ? seed.kind === "release"
              ? "released"
              : "extend"
            : beforeStatus,
        version: Number(input.expectedVersion) + 1,
      };
    });
  }
}
