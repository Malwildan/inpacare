import { ALL_MIGRATIONS, createDataSource } from "./entity-registry";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { EntityManager } from "typeorm";

async function baselineSql(): Promise<string> {
  const paths = [
    resolve(__dirname, "migrations/baseline.sql"),
    resolve(process.cwd(), "apps/api/src/infrastructure/database/migrations/baseline.sql"),
    resolve(process.cwd(), "src/infrastructure/database/migrations/baseline.sql"),
  ];
  for (const path of paths) {
    try {
      return await readFile(path, "utf8");
    } catch {
      /* alternate packaged/source layout */
    }
  }
  throw new Error("Cannot find copied migrations/baseline.sql");
}

async function schemaFingerprint(
  manager: EntityManager,
  schema: string,
): Promise<string> {
  const tables = await manager.query(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname=$1 ORDER BY tablename`,
    [schema],
  );
  const columns = await manager.query(
    `SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position`,
    [schema],
  );
  const constraints = await manager.query(
    `SELECT rel.relname AS table_name,con.contype,pg_get_constraintdef(con.oid,true) AS definition FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE ns.nspname=$1 ORDER BY rel.relname,con.contype,definition`,
    [schema],
  );
  const indexes = await manager.query(
    `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname`,
    [schema],
  );
  return JSON.stringify({
    tables,
    columns,
    constraints: constraints.map((row: { definition: string }) => ({
      ...row,
      definition: row.definition.replaceAll(`${schema}.`, ""),
    })),
    indexes: indexes.map((row: { indexdef: string }) => ({
      ...row,
      indexdef: row.indexdef.replaceAll(`${schema}.`, ""),
    })),
  });
}

async function assertBaselineFingerprint(): Promise<void> {
  const ds = createDataSource();
  await ds.initialize();
  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const liveSchema = String(
    (await runner.query("SELECT current_schema() AS name"))[0].name,
  );
  const shadow = `baseline_fp_${randomBytes(8).toString("hex")}`;
  try {
    const sql = await baselineSql();
    await runner.query(`CREATE SCHEMA "${shadow}"`);
    await runner.query(`SET LOCAL search_path TO "${shadow}"`);
    await runner.query(sql);
    const expected = await schemaFingerprint(runner.manager, shadow);
    const actual = await schemaFingerprint(runner.manager, liveSchema);
    // SQLx history is retained and excluded from the application-schema fingerprint.
    const stripHistory = (value: string) => {
      const parsed = JSON.parse(value) as {
        tables: { name: string }[];
        columns: { table_name: string }[];
        constraints: { table_name: string }[];
        indexes: { tablename: string; indexdef: string }[];
      };
      const excluded = new Set(["_sqlx_migrations", "migrations"]);
      return JSON.stringify({
        tables: parsed.tables.filter((x) => !excluded.has(x.name)),
        columns: parsed.columns.filter((x) => !excluded.has(x.table_name)),
        constraints: parsed.constraints.filter(
          (x) => !excluded.has(x.table_name),
        ),
        indexes: parsed.indexes
          .filter((x) => !excluded.has(x.tablename))
          .map((x) => ({
            ...x,
            indexdef: x.indexdef
              .replaceAll(`${shadow}.`, "")
              .replaceAll(`${liveSchema}.`, ""),
          })),
      });
    };
    if (stripHistory(expected) !== stripHistory(actual))
      throw new Error(
        "Baseline schema fingerprint mismatch (tables, columns, defaults, constraints, or indexes differ); no migration was marked.",
      );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await ds.destroy();
  }
}

async function adopt(): Promise<void> {
  const ds = createDataSource();
  await ds.initialize();
  const lock = ds.createQueryRunner();
  await lock.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(7231902)");
    await ds.query(
      "CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL)",
    );
    const rows: Array<{ name: string }> = await ds.query(
      "SELECT name FROM migrations ORDER BY id",
    );
    const baseline = rows.filter(
      (row) => row.name === "Baseline1793577600000",
    ).length;
    const delta = rows.filter(
      (row) => row.name === "RebuildDelta1793577600001",
    ).length;
    const known = ALL_MIGRATIONS.map((Migration) => new Migration().name);
    if (
      baseline > 1 ||
      delta > 1 ||
      rows.some((row, i) => row.name !== known[i])
    )
      throw new Error(
        "Unexpected or duplicate TypeORM migration history; no baseline was marked.",
      );
    if (delta === 1 && baseline !== 1)
      throw new Error(
        "Additive migration is present without a baseline marker; refusing adoption.",
      );
    if (baseline === 0 && rows.length !== 0)
      throw new Error(
        "Migration history is not empty; refusing to fake-mark the baseline.",
      );
    if (delta === 1 && baseline === 1) {
      await ds.runMigrations({ transaction: "all" });
      return;
    }
    await assertBaselineFingerprint();
    if (baseline === 0)
      await ds.query("INSERT INTO migrations(timestamp,name) VALUES($1,$2)", [
        1793577600000,
        "Baseline1793577600000",
      ]);
    if (delta === 0) await ds.runMigrations({ transaction: "all" });
  } finally {
    try {
      await lock.query("SELECT pg_advisory_unlock(7231902)");
    } finally {
      await lock.release();
      await ds.destroy();
    }
  }
}

async function migrate(): Promise<void> {
  const ds = createDataSource();
  await ds.initialize();
  const lock = ds.createQueryRunner();
  await lock.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(7231902)");
    await ds.runMigrations({ transaction: "all" });
  } finally {
    try {
      await lock.query("SELECT pg_advisory_unlock(7231902)");
    } finally {
      await lock.release();
      await ds.destroy();
    }
  }
}
const command = process.argv[2];
const run =
  command === "adopt"
    ? adopt
    : command === "migrate"
      ? migrate
      : command === "seed"
        ? () => import("./seed")
        : undefined;
if (!run) {
  console.error("Usage: node dist/database/cli.js <adopt|migrate|seed>");
  process.exitCode = 2;
} else
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
