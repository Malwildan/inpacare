import { MigrationInterface, QueryRunner } from "typeorm";

export class ContextualTasks1793577601064 implements MigrationInterface {
  name = "ContextualTasks1793577601064";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX tasks_cycle_schedule ON tasks(cycle_id,starts_at,id)
        WHERE cycle_id IS NOT NULL AND deleted_at IS NULL;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Contextual tasks require a forward fix or verified backup.");
  }
}
