import { MigrationInterface, QueryRunner } from "typeorm";

export class EpisodeObservations1793577600062 implements MigrationInterface {
  name = "EpisodeObservations1793577600062";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE cycles ADD CONSTRAINT cycles_id_patient UNIQUE (id, patient_id);
      ALTER TABLE medical_records ADD COLUMN cycle_id varchar(36),
        ADD CONSTRAINT medical_records_id_patient UNIQUE (id, patient_id),
        ADD CONSTRAINT medical_records_id_cycle UNIQUE (id, cycle_id),
        ADD CONSTRAINT medical_records_cycle_patient FOREIGN KEY (cycle_id, patient_id) REFERENCES cycles(id, patient_id);
      ALTER TABLE observations ADD COLUMN patient_id varchar(36),
        ADD COLUMN cycle_id varchar(36),
        ALTER COLUMN record_id DROP NOT NULL;

      UPDATE observations o SET patient_id=m.patient_id FROM medical_records m WHERE m.id=o.record_id;

      -- A date shared by two episodes is ambiguous even if their doctors differ.
      -- Keep the original record link regardless of whether we can establish an episode.
      WITH episodes AS (
        SELECT c.id, c.patient_id, c.doctor_id, c.deleted_at,
          LEAST((c.created_at AT TIME ZONE 'Asia/Jakarta')::date, p.starts_on) AS starts_on,
          CASE WHEN c.status='released' THEN COALESCE(p.ends_on, (c.updated_at AT TIME ZONE 'Asia/Jakarta')::date)
            ELSE 'infinity'::date END AS ends_on
        FROM cycles c LEFT JOIN placements p ON p.id=c.placement_id AND p.patient_id=c.patient_id
      ), candidates AS (
        SELECT m.id AS record_id, e.id AS cycle_id,
          e.doctor_id=m.doctor_id AND e.deleted_at IS NULL AND NOT EXISTS (
            SELECT 1 FROM observations o WHERE o.record_id=m.id
              AND (o.observed_at AT TIME ZONE 'Asia/Jakarta')::date NOT BETWEEN e.starts_on AND e.ends_on
          ) AS eligible,
          count(*) OVER (PARTITION BY m.id) AS matches
        FROM medical_records m JOIN episodes e ON e.patient_id=m.patient_id
          AND m.record_date BETWEEN e.starts_on AND e.ends_on
      )
      UPDATE medical_records m SET cycle_id=c.cycle_id FROM candidates c
        WHERE m.id=c.record_id AND c.matches=1 AND c.eligible;

      UPDATE observations o SET cycle_id=m.cycle_id FROM medical_records m WHERE m.id=o.record_id;

      ALTER TABLE observations ALTER COLUMN patient_id SET NOT NULL,
        ADD CONSTRAINT observations_record_patient FOREIGN KEY (record_id, patient_id) REFERENCES medical_records(id, patient_id),
        ADD CONSTRAINT observations_record_cycle FOREIGN KEY (record_id, cycle_id) REFERENCES medical_records(id, cycle_id),
        ADD CONSTRAINT observations_cycle_patient FOREIGN KEY (cycle_id, patient_id) REFERENCES cycles(id, patient_id),
        ADD CONSTRAINT observations_context CHECK (cycle_id IS NOT NULL OR record_id IS NOT NULL);
      CREATE INDEX observations_cycle_observed ON observations(cycle_id, observed_at DESC) WHERE deleted_at IS NULL;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Episode observations require a forward fix or verified backup.");
  }
}
