import { EntityManager } from "typeorm";
import { Actor } from "../../../../domain/auth/actor";
import {
  CurrentPlacement,
  PlacementStore,
} from "../../../../application/placements/placement-store.port";
export class TypeOrmPlacementStore implements PlacementStore {
  constructor(private readonly manager: EntityManager) {}
  async occupancy(
    actor: Actor,
    q: {
      from: string;
      to: string;
      roomId?: string;
    },
  ) {
    const rows = await this.manager.query(
      `SELECT jsonb_build_object('id',p.id,'patientId',p.patient_id,'patientName',pt.name,'medicalRecordNo',pt.medical_record_no,'roomId',p.room_id,'roomName',r.name,'roomClass',r.room_class,'startsOn',p.starts_on,'endsOn',p.ends_on,'status',p.status,'version',p.version) value FROM placements p JOIN patients pt ON pt.id=p.patient_id JOIN rooms r ON r.id=p.room_id WHERE p.status='active' AND p.starts_on<=$2 AND p.ends_on >= $1 AND ($3::text IS NULL OR p.room_id=$3) AND ($4<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.patient_id AND c.doctor_id=$5)) ORDER BY r.name,p.starts_on,pt.name LIMIT 500`,
      [q.from, q.to, q.roomId ?? null, actor.role, actor.id],
    );
    return rows.map((x: { value: unknown }) => x.value);
  }
  async patientExistsForUpdate(patientId: string) {
    const patient = await this.manager.query(
      "SELECT id FROM patients WHERE id=$1 FOR UPDATE",
      [patientId],
    );
    return !!patient[0];
  }
  async linked(placementId: string) {
    const r = await this.manager.query(
      "SELECT patient_id,room_id FROM placements WHERE id=$1",
      [placementId],
    );
    return r[0]
      ? { patientId: r[0].patient_id as string, roomId: r[0].room_id as string }
      : undefined;
  }
  async roomForCreate(roomId: string) {
    const r = await this.manager.query(
      "SELECT id,capacity,status FROM rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [roomId],
    );
    return r[0];
  }
  async roomForCancel(roomId: string) {
    await this.manager.query(
      "SELECT id FROM rooms WHERE id=$1 ORDER BY id FOR UPDATE",
      [roomId],
    );
  }
  async lockRooms(roomIds: string[]) {
    return this.manager.query(
      "SELECT id,capacity,status FROM rooms WHERE id=ANY($1::text[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE",
      [roomIds],
    );
  }
  async currentForUpdate(
    placementId: string,
  ): Promise<CurrentPlacement | undefined> {
    const r = await this.manager.query(
      "SELECT * FROM placements WHERE id=$1 FOR UPDATE",
      [placementId],
    );
    return r[0];
  }
  async lockCyclesForUpdate(placementId: string, includeDeleted = false) {
    return this.manager.query(
      includeDeleted
        ? "SELECT id,status FROM cycles WHERE placement_id=$1 ORDER BY id FOR UPDATE"
        : "SELECT id,status FROM cycles WHERE placement_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE",
      [placementId],
    );
  }
  async lockTasksForUpdate(placementId: string, includeDeleted = false) {
    return this.manager.query(
      includeDeleted
        ? "SELECT id,starts_at,ends_at,deleted_at FROM tasks WHERE placement_id=$1 ORDER BY id FOR UPDATE"
        : "SELECT id FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE",
      [placementId],
    );
  }
  async patientOverlap(
    patientId: string,
    start: string,
    end: string,
    excludeId?: string,
  ) {
    if (excludeId) {
      const r = await this.manager.query(
        `SELECT EXISTS(SELECT 1 FROM placements WHERE id<>$1 AND status='active' AND patient_id=$2 AND starts_on<=$4 AND ends_on >= $3) patient_overlap`,
        [excludeId, patientId, start, end],
      );
      return !!r[0].patient_overlap;
    }
    const r = await this.manager.query(
      "SELECT EXISTS(SELECT 1 FROM placements WHERE patient_id=$1 AND status='active' AND starts_on<=$3 AND ends_on >= $2) value",
      [patientId, start, end],
    );
    return !!r[0].value;
  }
  async peakOccupancy(
    roomId: string,
    start: string,
    end: string,
    excludeId?: string,
  ) {
    if (excludeId) {
      const r = await this.manager.query(
        `SELECT COALESCE(max(n),0)::int n FROM (SELECT count(p.id) n FROM generate_series($2::date,$3::date,interval '1 day') g(day) LEFT JOIN placements p ON p.room_id=$1 AND p.id<>$4 AND p.status='active' AND p.starts_on<=g.day::date AND p.ends_on>=g.day::date GROUP BY g.day) q`,
        [roomId, start, end, excludeId],
      );
      return r[0].n;
    }
    const r = await this.manager.query(
      `SELECT COALESCE(max(n),0)::int n FROM (SELECT count(p.id) n FROM generate_series($2::date,$3::date,interval '1 day') g(day) LEFT JOIN placements p ON p.room_id=$1 AND p.status='active' AND p.starts_on<=g.day::date AND p.ends_on>=g.day::date GROUP BY g.day) q`,
      [roomId, start, end],
    );
    return r[0].n;
  }
  async create(d: {
    id: string;
    patientId: string;
    roomId: string;
    startsOn: string;
    endsOn: string;
    actorId: string;
  }) {
    await this.manager.query(
      `INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,status,created_by) VALUES($1,$2,$3,$4,$5,'active',$6)`,
      [d.id, d.patientId, d.roomId, d.startsOn, d.endsOn, d.actorId],
    );
  }
  async byId(placementId: string) {
    const found = await this.manager.query(
      `SELECT id,patient_id AS "patientId",room_id AS "roomId",starts_on::text AS "startsOn",ends_on::text AS "endsOn",status,version FROM placements WHERE id=$1`,
      [placementId],
    );
    return found[0];
  }
  async update(
    placementId: string,
    roomId: string,
    startsOn: string,
    endsOn: string,
  ) {
    await this.manager.query(
      "UPDATE placements SET room_id=$2,starts_on=$3,ends_on=$4,version=version+1 WHERE id=$1",
      [placementId, roomId, startsOn, endsOn],
    );
  }
  async cancellationBlocked(placementId: string) {
    const active = await this.manager.query(
      `SELECT EXISTS(SELECT 1 FROM cycles WHERE placement_id=$1 AND deleted_at IS NULL AND status<>'released') OR EXISTS(SELECT 1 FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL AND status IN ('todo','in_progress')) blocked`,
      [placementId],
    );
    return !!active[0].blocked;
  }
  async cancel(placementId: string) {
    await this.manager.query(
      `UPDATE placements SET status='cancelled',version=version+1 WHERE id=$1`,
      [placementId],
    );
  }
}
