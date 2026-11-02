import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";
import { canReadPatient, id } from "../../common/domain";
import {
  CancelPlacementDto,
  CreatePlacementDto,
  DateRangeDto,
  UpdatePlacementDto,
} from "./dto/placement.dto";

export function validatePlacementSpan(start: string, end: string) {
  const valid = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return (
      d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() + 1 === +m[2] &&
      d.getUTCDate() === +m[3]
    );
  };
  const a = Date.parse(`${start}T00:00:00Z`),
    b = Date.parse(`${end}T00:00:00Z`);
  if (!valid(start) || !valid(end))
    throw AppError.validation(
      "Tanggal penempatan harus berupa tanggal kalender yang valid.",
    );
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a)
    throw AppError.validation(
      "Tanggal selesai tidak boleh sebelum tanggal masuk.",
    );
  const days = (b - a) / 86400000;
  if (days > 365)
    throw AppError.validation("Rentang penempatan maksimal satu tahun.");
  return days;
}
@Injectable()
export class AssignRuanganService {
  constructor(private readonly ds: DataSource) {}
  async occupancy(actor: Actor, q: DateRangeDto) {
    const days = validatePlacementSpan(q.from, q.to);
    if (days > 30)
      throw AppError.validation("Rentang kalender maksimal 31 hari.");
    const rows = await this.ds.query(
      `SELECT jsonb_build_object('id',p.id,'patientId',p.patient_id,'patientName',pt.name,'medicalRecordNo',pt.medical_record_no,'roomId',p.room_id,'roomName',r.name,'roomClass',r.room_class,'startsOn',p.starts_on,'endsOn',p.ends_on,'status',p.status,'version',p.version) value FROM placements p JOIN patients pt ON pt.id=p.patient_id JOIN rooms r ON r.id=p.room_id WHERE p.status='active' AND p.starts_on<=$2 AND p.ends_on >= $1 AND ($3::text IS NULL OR p.room_id=$3) AND ($4<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.patient_id AND c.doctor_id=$5)) ORDER BY r.name,p.starts_on,pt.name LIMIT 500`,
      [q.from, q.to, q.roomId ?? null, actor.role, actor.id],
    );
    return { items: rows.map((x: any) => x.value), from: q.from, to: q.to };
  }
  async create(actor: Actor, d: CreatePlacementDto) {
    validatePlacementSpan(d.startsOn, d.endsOn);
    const created = await this.ds.transaction(async (m) => {
      await canReadPatient(m, actor, d.patientId);
      const patient = await m.query(
        "SELECT id FROM patients WHERE id=$1 FOR UPDATE",
        [d.patientId],
      );
      if (!patient[0]) throw AppError.notFound();
      const room = await m.query(
        "SELECT id,capacity,status FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [d.roomId],
      );
      if (!room[0]) throw AppError.notFound();
      if (room[0].status !== "available")
        throw AppError.conflict("Ruangan tidak tersedia untuk penempatan.");
      const overlap = await m.query(
        "SELECT EXISTS(SELECT 1 FROM placements WHERE patient_id=$1 AND status='active' AND starts_on<=$3 AND ends_on >= $2) value",
        [d.patientId, d.startsOn, d.endsOn],
      );
      if (overlap[0].value)
        throw AppError.conflict(
          "Pasien sudah memiliki penempatan pada rentang tanggal tersebut.",
        );
      const peak = await m.query(
        `SELECT COALESCE(max(n),0)::int n FROM (SELECT count(p.id) n FROM generate_series($2::date,$3::date,interval '1 day') g(day) LEFT JOIN placements p ON p.room_id=$1 AND p.status='active' AND p.starts_on<=g.day::date AND p.ends_on>=g.day::date GROUP BY g.day) q`,
        [d.roomId, d.startsOn, d.endsOn],
      );
      if (peak[0].n >= room[0].capacity)
        throw AppError.conflict(
          "Kapasitas ruangan tidak mencukupi pada sebagian rentang tanggal.",
        );
      const placementId = id();
      await m.query(
        `INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,status,created_by) VALUES($1,$2,$3,$4,$5,'active',$6)`,
        [placementId, d.patientId, d.roomId, d.startsOn, d.endsOn, actor.id],
      );
      return placementId;
    });
    const found = await this.ds.query(
      `SELECT id,patient_id AS "patientId",room_id AS "roomId",starts_on::text AS "startsOn",ends_on::text AS "endsOn",status,version FROM placements WHERE id=$1`,
      [created],
    );
    return found[0];
  }
  async update(actor: Actor, placementId: string, d: UpdatePlacementDto) {
    validatePlacementSpan(d.startsOn, d.endsOn);
    return this.ds.transaction(async (m) => {
      const linked = await m.query(
        "SELECT patient_id,room_id FROM placements WHERE id=$1",
        [placementId],
      );
      if (!linked[0]) throw AppError.notFound();
      await canReadPatient(m, actor, linked[0].patient_id);
      await m.query("SELECT id FROM patients WHERE id=$1 FOR UPDATE", [
        linked[0].patient_id,
      ]);
      const roomIds = [...new Set([linked[0].room_id, d.roomId])].sort();
      const rooms = await m.query(
        "SELECT id,capacity,status FROM rooms WHERE id=ANY($1::text[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE",
        [roomIds],
      );
      if (rooms.length !== roomIds.length) throw AppError.notFound();
      const current = await m.query(
        "SELECT * FROM placements WHERE id=$1 FOR UPDATE",
        [placementId],
      );
      if (!current[0]) throw AppError.notFound();
      if (current[0].version !== d.expectedVersion)
        throw AppError.conflict(
          "Penempatan berubah; muat ulang sebelum menyimpan.",
        );
      if (current[0].status !== "active")
        throw AppError.conflict(
          "Penempatan yang dibatalkan tidak dapat diubah.",
        );
      if (current[0].patient_id !== d.patientId)
        throw AppError.validation(
          "Pasien pada penempatan tidak dapat diganti; buat penempatan baru.",
        );
      const cycles = await m.query(
        "SELECT id,status FROM cycles WHERE placement_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE",
        [placementId],
      );
      const tasks = await m.query(
        "SELECT id,starts_at,ends_at,deleted_at FROM tasks WHERE placement_id=$1 ORDER BY id FOR UPDATE",
        [placementId],
      );
      if (rooms.find((r: any) => r.id === d.roomId)?.status !== "available")
        throw AppError.conflict("Ruangan tidak tersedia untuk penempatan.");
      const overlaps = await m.query(
        `SELECT EXISTS(SELECT 1 FROM placements WHERE id<>$1 AND status='active' AND patient_id=$2 AND starts_on<=$4 AND ends_on >= $3) patient_overlap`,
        [placementId, current[0].patient_id, d.startsOn, d.endsOn],
      );
      if (overlaps[0].patient_overlap)
        throw AppError.conflict(
          "Pasien sudah memiliki penempatan pada rentang tanggal tersebut.",
        );
      const peak = await m.query(
        `SELECT COALESCE(max(n),0)::int n FROM (SELECT count(p.id) n FROM generate_series($2::date,$3::date,interval '1 day') g(day) LEFT JOIN placements p ON p.room_id=$1 AND p.id<>$4 AND p.status='active' AND p.starts_on<=g.day::date AND p.ends_on>=g.day::date GROUP BY g.day) q`,
        [d.roomId, d.startsOn, d.endsOn, placementId],
      );
      if (peak[0].n >= rooms.find((r: any) => r.id === d.roomId).capacity)
        throw AppError.conflict(
          "Kapasitas ruangan tidak mencukupi pada sebagian rentang tanggal.",
        );
      const jakartaDate = (v: Date | string) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(v));
      if (
        cycles.some((c: any) => c.status !== "released") ||
        (d.roomId !== current[0].room_id && tasks.length > 0) ||
        tasks.some(
          (t: any) =>
            !t.deleted_at &&
            (jakartaDate(t.starts_at) < d.startsOn ||
              jakartaDate(t.ends_at) > d.endsOn),
        )
      )
        throw AppError.conflict(
          "Rentang baru tidak boleh memutus siklus atau jadwal tugas yang tersimpan.",
        );
      await m.query(
        "UPDATE placements SET room_id=$2,starts_on=$3,ends_on=$4,version=version+1 WHERE id=$1",
        [placementId, d.roomId, d.startsOn, d.endsOn],
      );
      return {
        id: placementId,
        patientId: current[0].patient_id,
        roomId: d.roomId,
        startsOn: d.startsOn,
        endsOn: d.endsOn,
        status: "active",
        version: d.expectedVersion + 1,
      };
    });
  }
  async cancel(actor: Actor, placementId: string, d: CancelPlacementDto) {
    return this.ds.transaction(async (m) => {
      const rel = await m.query(
        "SELECT patient_id,room_id FROM placements WHERE id=$1",
        [placementId],
      );
      if (!rel[0]) throw AppError.notFound();
      await canReadPatient(m, actor, rel[0].patient_id);
      await m.query("SELECT id FROM patients WHERE id=$1 FOR UPDATE", [
        rel[0].patient_id,
      ]);
      await m.query("SELECT id FROM rooms WHERE id=$1 ORDER BY id FOR UPDATE", [
        rel[0].room_id,
      ]);
      const p = await m.query(
        "SELECT * FROM placements WHERE id=$1 FOR UPDATE",
        [placementId],
      );
      if (!p[0]) throw AppError.notFound();
      if (p[0].version !== d.expectedVersion)
        throw AppError.conflict(
          "Penempatan berubah; muat ulang sebelum membatalkan.",
        );
      if (p[0].status !== "active")
        throw AppError.conflict("Penempatan sudah dibatalkan.");
      await m.query(
        "SELECT id FROM cycles WHERE placement_id=$1 ORDER BY id FOR UPDATE",
        [placementId],
      );
      await m.query(
        "SELECT id FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE",
        [placementId],
      );
      const active = await m.query(
        `SELECT EXISTS(SELECT 1 FROM cycles WHERE placement_id=$1 AND deleted_at IS NULL AND status<>'released') OR EXISTS(SELECT 1 FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL AND status IN ('todo','in_progress')) blocked`,
        [placementId],
      );
      if (active[0].blocked)
        throw AppError.conflict(
          "Penempatan dengan siklus atau tugas aktif tidak dapat dibatalkan.",
        );
      await m.query(
        `UPDATE placements SET status='cancelled',version=version+1 WHERE id=$1`,
        [placementId],
      );
      return {
        id: placementId,
        status: "cancelled",
        version: d.expectedVersion + 1,
      };
    });
  }
}
