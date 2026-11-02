import { MigrationInterface, QueryRunner } from "typeorm";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export class Baseline1793577600000 implements MigrationInterface {
  name = "Baseline1793577600000";
  async up(queryRunner: QueryRunner): Promise<void> {
    const paths = [
      resolve(__dirname, "baseline.sql"),
      resolve(process.cwd(), "apps/api/src/database/migrations/baseline.sql"),
      resolve(process.cwd(), "src/database/migrations/baseline.sql"),
    ];
    let sql: string | undefined;
    for (const path of paths) {
      try {
        sql = await readFile(path, "utf8");
        break;
      } catch {
        /* try source layout */
      }
    }
    if (!sql)
      throw new Error("Cannot find copied database/migrations/baseline.sql");
    await queryRunner.query(sql);
  }
  async down(): Promise<void> {
    throw new Error("Baseline rollback requires restoring a verified backup.");
  }
}
