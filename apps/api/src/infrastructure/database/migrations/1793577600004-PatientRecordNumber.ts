import { MigrationInterface, QueryRunner } from "typeorm";

export class PatientRecordNumber1793577600004 implements MigrationInterface {
  name = "PatientRecordNumber1793577600004";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`LOCK TABLE patients IN SHARE ROW EXCLUSIVE MODE;
      CREATE SEQUENCE patient_medical_record_no_seq;
      WITH existing AS (
        SELECT substring(medical_record_no FROM '^RM-([0-9]+)$')::numeric AS number
        FROM patients WHERE medical_record_no ~ '^RM-[0-9]+$'
      )
      SELECT setval('patient_medical_record_no_seq',GREATEST(COALESCE(MAX(number),0),1)::bigint,
        COALESCE(MAX(number),0)>0)
      FROM existing WHERE number<=9223372036854775807;`);
  }

  async down(): Promise<void> { throw new Error("Patient record numbering requires a forward fix or verified backup."); }
}
