import { MigrationInterface, QueryRunner } from "typeorm";

export class PlacementHistory1793577600006 implements MigrationInterface {
  name = "PlacementHistory1793577600006";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE placement_history (
      id varchar(36) PRIMARY KEY,
      placement_id varchar(36) NOT NULL REFERENCES placements(id),
      actor_id varchar(36) NOT NULL REFERENCES users(id),
      action text NOT NULL CHECK (action IN ('updated','cancelled')),
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      before_data jsonb NOT NULL,
      after_data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX placement_history_placement ON placement_history(placement_id,created_at,id);`);
  }
  async down(): Promise<void> {
    throw new Error("Placement history requires a forward fix or verified backup.");
  }
}
