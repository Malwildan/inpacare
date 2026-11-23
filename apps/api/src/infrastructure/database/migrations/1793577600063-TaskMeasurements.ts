import { MigrationInterface, QueryRunner } from "typeorm";

export class TaskMeasurements1793577600063 implements MigrationInterface {
  name = "TaskMeasurements1793577600063";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE tasks ADD COLUMN type text NOT NULL DEFAULT 'regular',
        ADD COLUMN cycle_id varchar(36),
        ADD CONSTRAINT tasks_measurement_context CHECK (
          type = 'regular' OR (type = 'measurement' AND cycle_id IS NOT NULL)
        ),
        ADD CONSTRAINT tasks_cycle_patient FOREIGN KEY (cycle_id, patient_id) REFERENCES cycles(id, patient_id),
        ADD CONSTRAINT tasks_id_cycle_patient UNIQUE (id, cycle_id, patient_id);
      ALTER TABLE observations ADD COLUMN task_id varchar(36) UNIQUE,
        ADD COLUMN task_completion_hash text,
        ADD CONSTRAINT observations_task_context CHECK (
          (task_id IS NULL AND task_completion_hash IS NULL)
          OR (task_id IS NOT NULL AND cycle_id IS NOT NULL AND task_completion_hash IS NOT NULL)
        ),
        ADD CONSTRAINT observations_task_cycle_patient FOREIGN KEY (task_id, cycle_id, patient_id)
          REFERENCES tasks(id, cycle_id, patient_id);
    `);
  }

  async down(): Promise<void> {
    throw new Error("Task measurements require a forward fix or verified backup.");
  }
}
