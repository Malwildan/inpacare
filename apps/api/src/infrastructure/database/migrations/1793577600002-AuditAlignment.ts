import { MigrationInterface, QueryRunner } from "typeorm";

export class AuditAlignment1793577600002 implements MigrationInterface {
  name = "AuditAlignment1793577600002";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE invoices ADD COLUMN claim_result varchar(120);
      UPDATE invoices SET claim_result='Terverifikasi (data lama)' WHERE claim_verified;
      CREATE TABLE cycle_history (
        id varchar(36) PRIMARY KEY,
        cycle_id varchar(36) NOT NULL REFERENCES cycles(id),
        actor_id varchar(36) NOT NULL REFERENCES users(id),
        action text NOT NULL,
        reason text NOT NULL CHECK (length(btrim(reason)) > 0),
        before_data jsonb NOT NULL,
        after_data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX cycle_history_cycle ON cycle_history(cycle_id,created_at,id);
    `);
  }
  async down(): Promise<void> {
    throw new Error("Audit alignment retains verification results and history; use a forward fix or verified backup.");
  }
}
