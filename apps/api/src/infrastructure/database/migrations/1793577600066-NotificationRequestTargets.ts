import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationRequestTargets1793577600066 implements MigrationInterface {
  name = "NotificationRequestTargets1793577600066";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE notifications
      ADD COLUMN request_id varchar(36),
      ADD CONSTRAINT notifications_request_requires_cycle CHECK (request_id IS NULL OR cycle_id IS NOT NULL)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE notifications DROP COLUMN request_id");
  }
}
