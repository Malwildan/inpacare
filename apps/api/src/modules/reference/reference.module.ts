import { Controller, Get, Module, Param, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { DataSource } from "typeorm";
import { Actor, CurrentActor } from "../../common/auth";
import { canReadPatient } from "../../common/domain";

class PatientFilter {
  @IsOptional() @IsString() @MaxLength(200) q = "";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
const patientProjection = `jsonb_build_object('id',p.id,'name',p.name,'medicalRecordNo',p.medical_record_no,'birthDate',p.birth_date,'gender',p.gender,'bpjs',p.bpjs,'bpjsNumber',p.bpjs_number)`;
const patientScope = `($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$2))`;
@Controller()
export class ReferenceController {
  constructor(private readonly db: DataSource) {}
  @Get("patients")
  async patients(@CurrentActor() actor: Actor, @Query() filter: PatientFilter) {
    const args = [actor.role, actor.id, filter.q.trim()];
    const where = `${patientScope} AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%')`;
    const rows = await this.db.query(
      `SELECT ${patientProjection} AS value FROM patients p WHERE ${where} ORDER BY p.name,p.id LIMIT $4 OFFSET $5`,
      [...args, filter.limit, filter.offset],
    );
    const [count] = await this.db.query(
      `SELECT count(*)::int AS total FROM patients p WHERE ${where}`,
      args,
    );
    return {
      items: rows.map((r: { value: unknown }) => r.value),
      total: count.total,
    };
  }
  @Get("staff")
  async staff() {
    const items = await this.db.query(
      `SELECT u.id,u.name,u.role,u.coordinator,(u.active AND coalesce(n.active,true)) AS active FROM users u LEFT JOIN nurses n ON n.user_id=u.id WHERE u.active AND u.role IN ('DOKTER','PERAWAT') ORDER BY u.name,u.id LIMIT 100`,
    );
    return { items, total: items.length };
  }
  @Get("reference")
  async reference(@CurrentActor() actor: Actor) {
    const [patients, staff, rooms, placements] = await Promise.all([
      this.patients(actor, Object.assign(new PatientFilter(), { limit: 100 })),
      this.staff(),
      this.db.query(
        `SELECT id,name,room_class AS "roomClass",capacity,status,pic_id AS "picId",daily_rate::text AS "dailyRate",version FROM rooms WHERE deleted_at IS NULL ORDER BY name,id LIMIT 100`,
      ),
      this.db.query(
        `SELECT p.id,p.patient_id AS "patientId",pt.name AS "patientName",p.room_id AS "roomId",r.name AS "roomName",to_char(p.starts_on,'YYYY-MM-DD') AS "startsOn",to_char(p.ends_on,'YYYY-MM-DD') AS "endsOn",p.status,p.version FROM placements p JOIN patients pt ON pt.id=p.patient_id JOIN rooms r ON r.id=p.room_id WHERE p.status='active' AND NOT EXISTS(SELECT 1 FROM cycles c WHERE c.placement_id=p.id AND c.status='released') AND ($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.patient_id AND c.doctor_id=$2)) ORDER BY p.starts_on DESC,p.id LIMIT 100`,
        [actor.role, actor.id],
      ),
    ]);
    return { patients: patients.items, staff: staff.items, rooms, placements };
  }
  @Get("patients/:id/context")
  async context(@CurrentActor() actor: Actor, @Param("id") patientId: string) {
    await canReadPatient(this.db.manager, actor, patientId);
    const [[patient], placements, cycles] = await Promise.all([
      this.db.query(
        `SELECT ${patientProjection} AS value FROM patients p WHERE p.id=$1`,
        [patientId],
      ),
      this.db.query(
        `SELECT p.id,p.room_id AS "roomId",r.name AS "roomName",to_char(p.starts_on,'YYYY-MM-DD') AS "startsOn",to_char(p.ends_on,'YYYY-MM-DD') AS "endsOn",p.status FROM placements p JOIN rooms r ON r.id=p.room_id WHERE p.patient_id=$1 ORDER BY p.starts_on DESC,p.id LIMIT 50`,
        [patientId],
      ),
      this.db.query(
        `SELECT c.id,c.status,d.name AS "doctorName",n.name AS "nurseName",c.version FROM cycles c JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id WHERE c.patient_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at DESC,c.id LIMIT 30`,
        [patientId],
      ),
    ]);
    return { patient: patient.value, placements, cycles };
  }
}
@Module({ controllers: [ReferenceController] })
export class ReferenceModule {}
