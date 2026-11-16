import { MigrationInterface, QueryRunner } from "typeorm";

export class CycleCreationRequests1793577600005 implements MigrationInterface {
  name = "CycleCreationRequests1793577600005";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE cycle_creation_requests (
      nurse_id text NOT NULL REFERENCES users(id),
      request_id uuid NOT NULL,
      payload text NOT NULL,
      result jsonb NOT NULL,
      PRIMARY KEY (nurse_id, request_id)
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE cycle_creation_requests");
  }
}
