import { EntityManager } from "typeorm";
import { Actor } from "../../../../domain/auth/actor";
import { DomainError } from "../../../../domain/shared/domain-error";
import {
  TaskLock,
  TaskRecord,
  TaskStore,
} from "../../../../application/tasks/tugas-store.port";
const coordinator = (a: Actor) => a.role === "PERAWAT" && a.coordinator;
const TASK_ROW = `SELECT t.id,t.title,t.description,t.notes,t.created_by AS "createdById",creator.name AS "createdByName",t.patient_id AS "patientId",p.name AS "patientName",p.medical_record_no AS "medicalRecordNo",t.room_id AS "roomId",r.name AS "roomName",t.pic_id AS "picId",u.name AS "picName",t.priority,t.status,t.starts_at AS "startsAt",t.ends_at AS "endsAt",t.version FROM tasks t JOIN patients p ON p.id=t.patient_id JOIN rooms r ON r.id=t.room_id JOIN users u ON u.id=t.pic_id JOIN users creator ON creator.id=t.created_by`;
export class TypeOrmTaskStore implements TaskStore {
  constructor(private readonly manager: EntityManager) {}
  async lockBoard() {
    await this.manager.query("SELECT pg_advisory_xact_lock(7231923)");
  }
  async movePosition(taskId: string, actor: Actor, status: string, beforeTaskId: string | null) {
    if (beforeTaskId === taskId) throw DomainError.validation("Posisi tugas tidak valid.");
    if (beforeTaskId !== null) {
      const anchor = await this.manager.query("SELECT id FROM tasks WHERE id=$1 AND deleted_at IS NULL AND status=$2 AND ($3 OR pic_id=$4)", [beforeTaskId, status, coordinator(actor), actor.id]);
      if (!anchor.length) throw DomainError.notFound();
    }
    const [current] = await this.manager.query(`SELECT t.status, (SELECT n.id FROM tasks n WHERE n.deleted_at IS NULL AND n.status=t.status AND (n.board_position,n.id)>(t.board_position,t.id) ORDER BY n.board_position,n.id LIMIT 1) AS successor FROM tasks t WHERE t.id=$1`, [taskId]);
    if (current.status === status && current.successor === beforeTaskId) return false;
    await this.manager.query(`UPDATE tasks SET board_position = CASE WHEN $3::text IS NULL THEN COALESCE((SELECT max(board_position)+1 FROM tasks WHERE status=$2 AND deleted_at IS NULL AND id<>$1),1) ELSE COALESCE((SELECT (a.board_position + p.board_position)*0.5 FROM tasks a JOIN LATERAL (SELECT board_position FROM tasks WHERE status=$2 AND deleted_at IS NULL AND id<>$1 AND (board_position,id)<(a.board_position,a.id) ORDER BY board_position DESC,id DESC LIMIT 1) p ON true WHERE a.id=$3), (SELECT board_position-1 FROM tasks WHERE id=$3)) END WHERE id=$1`, [taskId, status, beforeTaskId]);
    return true;
  }
  async list(
    actor: Actor,
    q: {
      order?: "board";
      search: string;
      status: string | null;
      priority: string | null;
      roomId: string | null;
      patientId: string | null;
      picId: string | null;
      from: string | null;
      to: string | null;
      limit: number;
      offset: number;
    },
  ) {
    const params = [
      coordinator(actor),
      actor.id,
      q.search,
      q.status,
      q.priority,
      q.roomId,
      q.patientId,
      q.picId,
      q.from,
      q.to,
      q.limit,
      q.offset,
    ];
    const baseWhere = `t.deleted_at IS NULL AND ($1 OR t.pic_id=$2) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR t.title ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%') AND ($5::text IS NULL OR t.priority=$5) AND ($6::text IS NULL OR t.room_id=$6) AND ($7::text IS NULL OR t.patient_id=$7) AND ($8::text IS NULL OR t.pic_id=$8) AND ($9::date IS NULL OR (t.starts_at AT TIME ZONE 'Asia/Jakarta')::date >= $9) AND ($10::date IS NULL OR (t.starts_at AT TIME ZONE 'Asia/Jakarta')::date <= $10)`;
    const where = `${baseWhere} AND ($4::text IS NULL OR t.status=$4)`;
    const items = (await this.manager.query(
      `${TASK_ROW} WHERE ${where} ORDER BY ${q.order === "board" ? "t.board_position,t.id" : "t.starts_at,t.id"} LIMIT $11 OFFSET $12`,
      params,
    )) as TaskRecord[];
    const totals = await this.manager.query(
      `SELECT count(*) FILTER(WHERE $4::text IS NULL OR t.status=$4)::int total,count(*) FILTER(WHERE t.status='todo')::int todo,count(*) FILTER(WHERE t.status='in_progress')::int in_progress,count(*) FILTER(WHERE t.status='done')::int done,count(*) FILTER(WHERE t.status='cancelled')::int cancelled FROM tasks t JOIN patients p ON p.id=t.patient_id WHERE ${baseWhere}`,
      params.slice(0, 10),
    );
    return {
      items,
      total: totals[0].total,
      counts: {
        todo: totals[0].todo,
        in_progress: totals[0].in_progress,
        done: totals[0].done,
        cancelled: totals[0].cancelled,
      },
    };
  }
  async detail(taskId: string, actor: Actor, includeDeleted = false) {
    const r = await this.manager.query(
      `${TASK_ROW} WHERE t.id=$1 AND ($2 OR t.pic_id=$3) AND (t.deleted_at IS NULL OR $4)`,
      [taskId, coordinator(actor), actor.id, includeDeleted],
    );
    if (!r[0]) throw DomainError.notFound();
    return r[0] as TaskRecord;
  }
  async lockTask(taskId: string): Promise<TaskLock> {
    const [rel] = await this.manager.query(
      "SELECT patient_id,room_id,placement_id FROM tasks WHERE id=$1",
      [taskId],
    );
    if (!rel) throw DomainError.notFound();
    const [patient] = await this.manager.query(
      "SELECT id FROM patients WHERE id=$1 FOR UPDATE",
      [rel.patient_id],
    );
    if (!patient) throw DomainError.notFound();
    const [room] = await this.manager.query(
      "SELECT id FROM rooms WHERE id=$1 ORDER BY id FOR UPDATE",
      [rel.room_id],
    );
    if (!room) throw DomainError.notFound();
    const [placement] = await this.manager.query(
      "SELECT id,patient_id,room_id,starts_on::text AS starts_on,ends_on::text AS ends_on,status FROM placements WHERE id=$1 FOR UPDATE",
      [rel.placement_id],
    );
    if (!placement) throw DomainError.notFound();
    if (
      placement.patient_id !== rel.patient_id ||
      placement.room_id !== rel.room_id
    )
      throw DomainError.conflict(
        "Penempatan berubah; muat ulang sebelum menyimpan tugas.",
      );
    await this.manager.query(
      "SELECT id FROM cycles WHERE placement_id=$1 ORDER BY id FOR UPDATE",
      [rel.placement_id],
    );
    const [task] = await this.manager.query(
      "SELECT * FROM tasks WHERE id=$1 FOR UPDATE",
      [taskId],
    );
    if (!task) throw DomainError.notFound();
    return { task, placement };
  }
  async requireActivePic(picId: string) {
    const nurses = await this.manager.query(
      `SELECT u.id FROM nurses n JOIN users u ON u.id=n.user_id WHERE n.user_id=$1 AND n.active AND u.active AND u.role='PERAWAT' FOR SHARE OF n,u`,
      [picId],
    );
    if (!nurses.length)
      throw DomainError.validation("PIC harus perawat aktif.");
  }
  async patientExistsForUpdate(patientId: string) {
    const r = await this.manager.query(
      "SELECT id FROM patients WHERE id=$1 FOR UPDATE",
      [patientId],
    );
    return !!r[0];
  }
  async placementRoom(placementId: string): Promise<string | undefined> {
    const r = await this.manager.query(
      "SELECT room_id FROM placements WHERE id=$1",
      [placementId],
    );
    return r[0]?.room_id;
  }
  async lockRoom(roomId: string) {
    await this.manager.query(
      "SELECT id FROM rooms WHERE id=$1 ORDER BY id FOR UPDATE",
      [roomId],
    );
  }
  async activePlacement(
    placementId: string,
    patientId: string,
    starts: Date,
    ends: Date,
  ) {
    const r = await this.manager.query(
      `SELECT * FROM placements WHERE id=$1 AND patient_id=$2 AND status='active' AND starts_on<=(($3::timestamptz AT TIME ZONE 'Asia/Jakarta')::date) AND ends_on>=(($4::timestamptz AT TIME ZONE 'Asia/Jakarta')::date) FOR UPDATE`,
      [placementId, patientId, starts, ends],
    );
    return r[0] ? { roomId: r[0].room_id as string } : undefined;
  }
  async lockReleasedCycles(placementId: string) {
    const cycles = await this.manager.query(
      "SELECT id FROM cycles WHERE placement_id=$1 AND deleted_at IS NULL AND status='released' ORDER BY id FOR UPDATE",
      [placementId],
    );
    return cycles.length > 0;
  }
  async createTask(d: {
    id: string;
    patientId: string;
    roomId: string;
    placementId: string;
    picId: string;
    actorId: string;
    title: string;
    description: string;
    notes: string;
    startsAt: Date;
    endsAt: Date;
    priority: string;
  }) {
    await this.manager.query(
      `INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,description,notes,starts_at,ends_at,priority,board_position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(SELECT COALESCE(max(board_position)+1,1) FROM tasks WHERE status='todo' AND deleted_at IS NULL))`,
      [
        d.id,
        d.patientId,
        d.roomId,
        d.placementId,
        d.picId,
        d.actorId,
        d.title,
        d.description,
        d.notes,
        d.startsAt,
        d.endsAt,
        d.priority,
      ],
    );
  }
  async createSnapshot(taskId: string, historyId: string, actorId: string) {
    await this.manager.query(
      `INSERT INTO task_history(id,task_id,actor_id,action,after_data) SELECT $1,t.id,$3,'created',to_jsonb(t)-'board_position' FROM tasks t WHERE t.id=$2`,
      [historyId, taskId, actorId],
    );
  }
  async updateTask(
    taskId: string,
    d: {
      title: string;
      description: string;
      notes: string;
      priority: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
    },
  ) {
    await this.manager.query(
      "UPDATE tasks SET title=$2,description=$3,notes=$4,priority=$5,starts_at=$6,ends_at=$7,status=$8,version=version+1,updated_at=now() WHERE id=$1",
      [
        taskId,
        d.title,
        d.description,
        d.notes,
        d.priority,
        d.startsAt,
        d.endsAt,
        d.status,
      ],
    );
  }
  async historyChange(d: {
    id: string;
    taskId: string;
    actorId: string;
    action: string;
    reason: string | null;
    before: unknown;
    after: unknown;
  }) {
    if (d.action === "reordered")
      await this.manager.query(`INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`, [d.id,d.taskId,d.actorId,d.action,d.reason,JSON.stringify(d.before),JSON.stringify(d.after)]);
    else if (d.action === "updated")
      await this.manager.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'updated',$4,$5::jsonb,$6::jsonb)`,
        [
          d.id,
          d.taskId,
          d.actorId,
          d.reason,
          JSON.stringify(d.before),
          JSON.stringify(d.after),
        ],
      );
    else if (d.action === "deleted")
      await this.manager.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'deleted',$4,$5::jsonb,$6::jsonb)`,
        [
          d.id,
          d.taskId,
          d.actorId,
          d.reason,
          JSON.stringify(d.before),
          JSON.stringify(d.after),
        ],
      );
    else if (d.action === "reassigned")
      await this.manager.query(
        `INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'reassigned',$4,$5::jsonb,$6::jsonb)`,
        [
          d.id,
          d.taskId,
          d.actorId,
          d.reason,
          JSON.stringify(d.before),
          JSON.stringify(d.after),
        ],
      );
  }
  async removeTask(taskId: string) {
    await this.manager.query(
      "UPDATE tasks SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1",
      [taskId],
    );
  }
  async reassignTask(taskId: string, picId: string) {
    await this.manager.query(
      "UPDATE tasks SET pic_id=$2,version=version+1,updated_at=now() WHERE id=$1",
      [taskId, picId],
    );
  }
  async history(taskId: string, actor: Actor) {
    return this.manager.query(
      `SELECT h.id,h.actor_id AS "actorId",u.name AS "actorName",h.action,h.reason,h.before_data AS before,h.after_data AS after,h.created_at AS "createdAt" FROM task_history h JOIN users u ON u.id=h.actor_id JOIN tasks t ON t.id=h.task_id WHERE h.task_id=$1 AND ($2 OR (t.pic_id=$3 AND t.deleted_at IS NULL)) ORDER BY h.created_at,h.id LIMIT 500`,
      [taskId, coordinator(actor), actor.id],
    );
  }
}
