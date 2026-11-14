import { MigrationInterface, QueryRunner } from "typeorm";

export class TaskBoardPosition1793577600003 implements MigrationInterface {
  name = "TaskBoardPosition1793577600003";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE tasks ADD COLUMN board_position numeric NOT NULL DEFAULT 0;
      WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY status ORDER BY starts_at,id) AS position FROM tasks)
      UPDATE tasks SET board_position=ranked.position FROM ranked WHERE tasks.id=ranked.id;
      CREATE INDEX tasks_board_position ON tasks(status,board_position,id) WHERE deleted_at IS NULL;`);
  }
  async down(): Promise<void> { throw new Error("Task ordering requires a forward fix or verified backup."); }
}
