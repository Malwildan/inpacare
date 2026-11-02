import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { Actor } from "../../common/auth";
import { AppError } from "../../common/errors";
import { canReadPatient, id } from "../../common/domain";
import {
  CreateTaskDto,
  ReasonDto,
  ReassignTaskDto,
  TaskFilterDto,
  UpdateTaskDto,
} from "./dto/task.dto";

export function parseTaskInstant(value: string, label: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value))
    throw AppError.validation(
      `${label} harus berformat waktu ISO 8601 dengan zona waktu.`,
    );
  return d;
}
const coordinator = (a: Actor) => a.role === "PERAWAT" && a.coordinator;
@Injectable()
export class TugasService {
  constructor(private readonly ds: DataSource) {}
  private async requireActivePic(m: EntityManager, picId: string) {
    const nurses = await m.query(
      `SELECT u.id FROM nurses n JOIN users u ON u.id=n.user_id WHERE n.user_id=$1 AND n.active AND u.active AND u.role='PERAWAT' FOR SHARE OF n,u`,
      [picId],
    );
    if (!nurses.length) throw AppError.validation("PIC harus perawat aktif.");
  }
  private async row(
    m: EntityManager,
    taskId: string,
    actor: Actor,
    includeDeleted = false,
  ) {
    const r = await m.query(
      `SELECT t.id,t.title,t.description,t.notes,t.created_by AS "createdById",creator.name AS "createdByName",t.patient_id AS "patientId",p.name AS "patientName",p.medical_record_no AS "medicalRecordNo",t.room_id AS "roomId",r.name AS "roomName",t.pic_id AS "picId",u.name AS "picName",t.priority,t.status,t.starts_at AS "startsAt",t.ends_at AS "endsAt",t.version FROM tasks t JOIN patients p ON p.id=t.patient_id JOIN rooms r ON r.id=t.room_id JOIN users u ON u.id=t.pic_id JOIN users creator ON creator.id=t.created_by WHERE t.id=$1 AND ($2 OR t.pic_id=$3) AND (t.deleted_at IS NULL OR $4)`,
      [taskId, coordinator(actor), actor.id, includeDeleted],
    );
    if (!r[0]) throw AppError.notFound();
    return r[0];
  }
  private async lockTask(m: EntityManager, taskId: string) {
    const [rel] = await m.query(
      "SELECT patient_id,room_id,placement_id FROM tasks WHERE id=$1",
      [taskId],
    );
    if (!rel) throw AppError.notFound();
    const [patient] = await m.query(
      "SELECT id FROM patients WHERE id=$1 FOR UPDATE",
      [rel.patient_id],
    );
    if (!patient) throw AppError.notFound();
    const [room] = await m.query(
      "SELECT id FROM rooms WHERE id=$1 ORDER BY id FOR UPDATE",
      [rel.room_id],
    );
    if (!room) throw AppError.notFound();
    const [placement] = await m.query(
      "SELECT id,patient_id,room_id,starts_on::text AS starts_on,ends_on::text AS ends_on,status FROM placements WHERE id=$1 FOR UPDATE",
      [rel.placement_id],
    );
    if (!placement) throw AppError.notFound();
    if (
      placement.patient_id !== rel.patient_id ||
      placement.room_id !== rel.room_id
    )
      throw AppError.conflict(
        "Penempatan berubah; muat ulang sebelum menyimpan tugas.",
      );
    await m.query(
      "SELECT id FROM cycles WHERE placement_id=$1 ORDER BY id FOR UPDATE",
      [rel.placement_id],
    );
    const [task] = await m.query("SELECT * FROM tasks WHERE id=$1 FOR UPDATE", [
      taskId,
    ]);
    if (!task) throw AppError.notFound();
    return { task, placement };
  }
  async list(actor: Actor, q: TaskFilterDto) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    if (q.from && q.to && q.to < q.from)
      throw AppError.validation("Rentang tanggal tidak valid.");
    const params = [
      coordinator(actor),
      actor.id,
      (q.search ?? "").trim(),
      q.status ?? null,
      q.priority ?? null,
      q.roomId ?? null,
      q.patientId ?? null,
      q.picId ?? null,
      q.from ?? null,
      q.to ?? null,
      Math.min(q.limit ?? 50, 100),
      Math.min(q.offset ?? 0, 100000),
    ];
    const baseWhere = `t.deleted_at IS NULL AND ($1 OR t.pic_id=$2) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR t.title ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%') AND ($5::text IS NULL OR t.priority=$5) AND ($6::text IS NULL OR t.room_id=$6) AND ($7::text IS NULL OR t.patient_id=$7) AND ($8::text IS NULL OR t.pic_id=$8) AND ($9::date IS NULL OR (t.starts_at AT TIME ZONE 'Asia/Jakarta')::date >= $9) AND ($10::date IS NULL OR (t.starts_at AT TIME ZONE 'Asia/Jakarta')::date <= $10)`;
    const where = `${baseWhere} AND ($4::text IS NULL OR t.status=$4)`;
    const items = await this.ds.query(
      `SELECT t.id,t.title,t.description,t.notes,t.created_by AS "createdById",creator.name AS "createdByName",t.patient_id AS "patientId",p.name AS "patientName",p.medical_record_no AS "medicalRecordNo",t.room_id AS "roomId",r.name AS "roomName",t.pic_id AS "picId",u.name AS "picName",t.priority,t.status,t.starts_at AS "startsAt",t.ends_at AS "endsAt",t.version FROM tasks t JOIN patients p ON p.id=t.patient_id JOIN rooms r ON r.id=t.room_id JOIN users u ON u.id=t.pic_id JOIN users creator ON creator.id=t.created_by WHERE ${where} ORDER BY t.starts_at,t.id LIMIT $11 OFFSET $12`,
      params,
    );
    const totals = await this.ds.query(
      `SELECT count(*) FILTER(WHERE $4::text IS NULL OR t.status=$4)::int total,count(*) FILTER(WHERE t.status='todo')::int todo,count(*) FILTER(WHERE t.status='in_progress')::int in_progress,count(*) FILTER(WHERE t.status='done')::int done,count(*) FILTER(WHERE t.status='cancelled')::int cancelled FROM tasks t JOIN patients p ON p.id=t.patient_id WHERE ${baseWhere}`,
      params.slice(0, 10),
    );
    const counts = {
      todo: totals[0].todo,
      in_progress: totals[0].in_progress,
      done: totals[0].done,
      cancelled: totals[0].cancelled,
    };
    return { items, total: totals[0].total, counts };
  }
  async create(actor: Actor, d: CreateTaskDto) {
    if (!coordinator(actor)) throw AppError.forbidden();
    const title = d.title.trim();
    if (!title) throw AppError.validation("Judul wajib diisi.");
    const starts = parseTaskInstant(d.startsAt, "Waktu mulai"),
      ends = parseTaskInstant(d.endsAt, "Waktu selesai");
    if (ends < starts)
      throw AppError.validation(
        "Waktu selesai tidak boleh sebelum waktu mulai.",
      );
    const taskId = id();
    await this.ds.transaction(async (m) => {
      const pr = await m.query(
        "SELECT id FROM patients WHERE id=$1 FOR UPDATE",
        [d.patientId],
      );
      if (!pr[0]) throw AppError.notFound();
      await canReadPatient(m, actor, d.patientId);
      const roomRel = await m.query(
        "SELECT room_id FROM placements WHERE id=$1",
        [d.placementId],
      );
      if (!roomRel[0])
        throw AppError.validation(
          "Pilih penempatan aktif yang mencakup seluruh waktu tugas.",
        );
      await m.query("SELECT id FROM rooms WHERE id=$1 ORDER BY id FOR UPDATE", [
        roomRel[0].room_id,
      ]);
      const p = await m.query(
        `SELECT * FROM placements WHERE id=$1 AND patient_id=$2 AND status='active' AND starts_on<=(($3::timestamptz AT TIME ZONE 'Asia/Jakarta')::date) AND ends_on>=(($4::timestamptz AT TIME ZONE 'Asia/Jakarta')::date) FOR UPDATE`,
        [d.placementId, d.patientId, starts, ends],
      );
      if (!p[0])
        throw AppError.validation(
          "Pilih penempatan aktif yang mencakup seluruh waktu tugas.",
        );
      if (p[0].room_id !== roomRel[0].room_id)
        throw AppError.conflict(
          "Penempatan berubah; muat ulang sebelum membuat tugas.",
        );
      const cycles = await m.query(
        "SELECT id FROM cycles WHERE placement_id=$1 AND deleted_at IS NULL AND status='released' ORDER BY id FOR UPDATE",
        [d.placementId],
      );
      if (cycles.length)
        throw AppError.validation(
          "Penempatan ini sudah dirilis dan tidak dapat menerima tugas baru.",
        );
      await this.requireActivePic(m, d.picId);
      await m.query(
        `INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,description,notes,starts_at,ends_at,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          taskId,
          d.patientId,
          p[0].room_id,
          d.placementId,
          d.picId,
          actor.id,
          title,
          d.description?.trim() ?? "",
          d.notes?.trim() ?? "",
          starts,
          ends,
          d.priority,
        ],
      );
      await m.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,after_data) SELECT $1,t.id,$3,'created',to_jsonb(t) FROM tasks t WHERE t.id=$2`,
        [id(), taskId, actor.id],
      );
    });
    return this.row(this.ds.manager, taskId, actor);
  }
  detail(actor: Actor, taskId: string) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    return this.row(this.ds.manager, taskId, actor);
  }
  async update(actor: Actor, taskId: string, d: UpdateTaskDto) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    return this.ds.transaction(async (m) => {
      const { task: t, placement } = await this.lockTask(m, taskId);
      if (t.deleted_at || (!coordinator(actor) && t.pic_id !== actor.id))
        throw AppError.notFound();
      if (t.version !== d.expectedVersion)
        throw AppError.conflict("Tugas berubah. Muat ulang sebelum menyimpan.");
      if (placement.status !== "active")
        throw AppError.validation("Penempatan pasien tidak aktif.");
      await this.requireActivePic(m, t.pic_id);
      const admin = coordinator(actor);
      if (
        !admin &&
        (d.title !== undefined ||
          d.description !== undefined ||
          d.priority !== undefined ||
          d.startsAt !== undefined ||
          d.endsAt !== undefined)
      )
        throw AppError.forbidden();
      if (d.title !== undefined && !d.title.trim())
        throw AppError.validation("Judul wajib diisi.");
      if (
        Object.keys(d).filter((k) => k !== "expectedVersion" && k !== "reason")
          .length === 0
      )
        throw AppError.validation("Tidak ada perubahan tugas.");
      const status = d.status ?? t.status;
      const allowed =
        d.status === undefined ||
        (t.status === "todo" && d.status === "in_progress") ||
        (t.status === "in_progress" && d.status === "done") ||
        (admin &&
          d.status === "cancelled" &&
          ["todo", "in_progress"].includes(t.status));
      if (!allowed)
        throw AppError.validation("Perubahan status tugas tidak diizinkan.");
      if (d.status === "cancelled" && (!admin || !d.reason?.trim()))
        throw AppError.validation("Pembatalan memerlukan alasan koordinator.");
      const start = d.startsAt
          ? parseTaskInstant(d.startsAt, "Waktu mulai")
          : new Date(t.starts_at),
        end = d.endsAt
          ? parseTaskInstant(d.endsAt, "Waktu selesai")
          : new Date(t.ends_at);
      if (end < start)
        throw AppError.validation(
          "Waktu selesai tidak boleh sebelum waktu mulai.",
        );
      const fmt = (v: Date) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(v);
      if (fmt(start) < placement.starts_on || fmt(end) > placement.ends_on)
        throw AppError.validation(
          "Jadwal tugas harus berada dalam rentang penempatan.",
        );
      const next = {
        title: d.title?.trim() ?? t.title,
        description: d.description?.trim() ?? t.description,
        notes: d.notes ?? t.notes,
        priority: d.priority ?? t.priority,
        starts_at: start,
        ends_at: end,
        status,
      };
      const before = {
        title: t.title,
        description: t.description,
        notes: t.notes,
        priority: t.priority,
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        status: t.status,
        version: t.version,
      };
      await m.query(
        "UPDATE tasks SET title=$2,description=$3,notes=$4,priority=$5,starts_at=$6,ends_at=$7,status=$8,version=version+1,updated_at=now() WHERE id=$1",
        [
          taskId,
          next.title,
          next.description,
          next.notes,
          next.priority,
          next.starts_at,
          next.ends_at,
          next.status,
        ],
      );
      await m.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'updated',$4,$5::jsonb,$6::jsonb)`,
        [
          id(),
          taskId,
          actor.id,
          d.reason?.trim() || null,
          JSON.stringify(before),
          JSON.stringify({ ...next, version: t.version + 1 }),
        ],
      );
      return this.row(m, taskId, actor);
    });
  }
  async remove(actor: Actor, taskId: string, d: ReasonDto) {
    if (!coordinator(actor)) throw AppError.forbidden();
    if (!d.reason.trim()) throw AppError.validation("Alasan wajib diisi.");
    return this.ds.transaction(async (m) => {
      const { task: t } = await this.lockTask(m, taskId);
      if (t.deleted_at) throw AppError.notFound();
      if (t.version !== d.expectedVersion)
        throw AppError.conflict("Tugas berubah. Muat ulang sebelum menghapus.");
      await m.query(
        "UPDATE tasks SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1",
        [taskId],
      );
      await m.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'deleted',$4,$5::jsonb,$6::jsonb)`,
        [
          id(),
          taskId,
          actor.id,
          d.reason.trim(),
          JSON.stringify({
            title: t.title,
            status: t.status,
            version: t.version,
          }),
          JSON.stringify({ deleted: true, version: t.version + 1 }),
        ],
      );
      return { deleted: true };
    });
  }
  async reassign(actor: Actor, taskId: string, d: ReassignTaskDto) {
    if (!coordinator(actor)) throw AppError.forbidden();
    if (!d.reason.trim())
      throw AppError.validation("Alasan pengalihan wajib diisi.");
    if (d.picId === actor.id)
      throw AppError.validation(
        "Koordinator tidak dapat ditetapkan sebagai PIC.",
      );
    return this.ds.transaction(async (m) => {
      const { task: t } = await this.lockTask(m, taskId);
      if (t.deleted_at) throw AppError.notFound();
      if (t.version !== d.expectedVersion)
        throw AppError.conflict(
          "Tugas berubah. Muat ulang sebelum mengalihkan.",
        );
      if (["done", "cancelled"].includes(t.status))
        throw AppError.validation(
          "Tugas selesai atau dibatalkan tidak dapat dialihkan.",
        );
      await this.requireActivePic(m, d.picId);
      await m.query(
        "UPDATE tasks SET pic_id=$2,version=version+1,updated_at=now() WHERE id=$1",
        [taskId, d.picId],
      );
      await m.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'reassigned',$4,$5::jsonb,$6::jsonb)`,
        [
          id(),
          taskId,
          actor.id,
          d.reason.trim(),
          JSON.stringify({ picId: t.pic_id, version: t.version }),
          JSON.stringify({ picId: d.picId, version: t.version + 1 }),
        ],
      );
      return this.row(m, taskId, actor);
    });
  }
  async history(actor: Actor, taskId: string) {
    if (actor.role !== "PERAWAT") throw AppError.forbidden();
    await this.row(this.ds.manager, taskId, actor, true);
    const items = await this.ds.query(
      `SELECT h.id,h.actor_id AS "actorId",u.name AS "actorName",h.action,h.reason,h.before_data AS before,h.after_data AS after,h.created_at AS "createdAt" FROM task_history h JOIN users u ON u.id=h.actor_id JOIN tasks t ON t.id=h.task_id WHERE h.task_id=$1 AND ($2 OR (t.pic_id=$3 AND t.deleted_at IS NULL)) ORDER BY h.created_at,h.id LIMIT 500`,
      [taskId, coordinator(actor), actor.id],
    );
    return { items, total: items.length };
  }
}
