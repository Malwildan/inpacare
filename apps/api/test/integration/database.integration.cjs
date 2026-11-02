"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("pg");
const { test } = require("node:test");

const ADMIN_URL = process.env.INPACARE_TEST_DATABASE_ADMIN_URL;
const API_DIR = path.resolve(__dirname, "../..");
const CLI = path.join(API_DIR, "dist", "infrastructure", "database", "cli.js");
const BASELINE = path.join(
  API_DIR,
  "src",
  "infrastructure",
  "database",
  "migrations",
  "baseline.sql",
);
const createdDatabases = new Set();
const openedClients = new Set();

function databaseUrl(name) {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabase(admin, prefix = "nest_dbcheck_") {
  const name = `${prefix}${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  await admin.query(`CREATE DATABASE "${name}" OWNER nest_test`);
  createdDatabases.add(name);
  return name;
}

async function connect(database) {
  const client = new Client({ connectionString: databaseUrl(database) });
  await client.connect();
  openedClients.add(client);
  return client;
}

function runCli(command, database, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, command], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, DATABASE_URL: databaseUrl(database), ...extraEnv },
  });
}

function assertCliSucceeded(result, operation) {
  assert.equal(
    result.error,
    undefined,
    `${operation} process error: ${result.error?.message}`,
  );
  assert.equal(
    result.status,
    0,
    `${operation} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

async function counts(client) {
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM users) users,
    (SELECT count(*)::int FROM patients) patients,
    (SELECT count(*)::int FROM rooms) rooms,
    (SELECT count(*)::int FROM room_items) room_items,
    (SELECT count(*)::int FROM placements) placements,
    (SELECT count(*)::int FROM cycles) cycles,
    (SELECT count(*)::int FROM medical_records) medical_records,
    (SELECT count(*)::int FROM observations) observations,
    (SELECT count(*)::int FROM vital_signs) vital_signs,
    (SELECT count(*)::int FROM tasks) tasks,
    (SELECT count(*)::int FROM task_history) task_history,
    (SELECT count(*)::int FROM invoices) invoices,
    (SELECT count(*)::int FROM invoice_lines) invoice_lines,
    (SELECT count(*)::int FROM invoice_history) invoice_history`);
  return result.rows[0];
}

function checkedAdminUrl() {
  if (!ADMIN_URL)
    throw new Error(
      "INPACARE_TEST_DATABASE_ADMIN_URL is required for database integration tests",
    );
  let parsed;
  try {
    parsed = new URL(ADMIN_URL);
  } catch {
    throw new Error(
      "INPACARE_TEST_DATABASE_ADMIN_URL must be a local PostgreSQL maintenance URL",
    );
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname !== "/postgres" ||
    decodeURIComponent(parsed.username) !== "nest_test"
  )
    throw new Error(
      "Database integration tests only allow nest_test on a local PostgreSQL /postgres maintenance database",
    );
  return parsed;
}

test(
  "database lifecycle: fresh migration, adoption, drift refusal, seed and ORM behavior",
  {
    timeout: 240_000,
    skip: ADMIN_URL
      ? false
      : "INPACARE_TEST_DATABASE_ADMIN_URL is not configured; PostgreSQL integration not run",
  },
  async () => {
    checkedAdminUrl();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const tempCwd = await mkdtemp(path.join(os.tmpdir(), "nest-dbcheck-cli-"));
    try {
      // Fresh install and packaged migration asset: run from outside the repository so only dist assets can satisfy baseline.sql.
      const freshDb = await createDatabase(admin);
      const fresh = runCli("migrate", freshDb, tempCwd);
      assertCliSucceeded(fresh, "fresh migration");
      let client = await connect(freshDb);
      let history = await client.query(
        "SELECT name FROM migrations ORDER BY timestamp",
      );
      assert.deepEqual(
        history.rows.map((row) => row.name),
        ["Baseline1793577600000", "RebuildDelta1793577600001", "AuditAlignment1793577600002"],
      );
      const deltaFields = await client.query(
        `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND ((table_name='cycles' AND column_name='deleted_at') OR (table_name='invoices' AND column_name='claim_verified') OR (table_name='invoice_lines' AND column_name='room_item_id')) ORDER BY table_name,column_name`,
      );
      assert.equal(deltaFields.rowCount, 3);
      await client.end();

      const password = "Integration-Demo-Passphrase-26";
      const seeded = runCli("seed", freshDb, tempCwd, {
        SEED_DEMO_PASSWORD: password,
      });
      assertCliSucceeded(seeded, "demo seed");
      client = await connect(freshDb);
      assert.deepEqual(await counts(client), {
        users: 6,
        patients: 12,
        rooms: 5,
        room_items: 15,
        placements: 8,
        cycles: 8,
        medical_records: 8,
        observations: 8,
        vital_signs: 8,
        tasks: 200,
        task_history: 200,
        invoices: 4,
        invoice_lines: 4,
        invoice_history: 4,
      });
      await client.end();

      // A second seed must be rejected, and its all-table empty check is protected by the advisory transaction lock.
      const refusedSeed = runCli("seed", freshDb, tempCwd, {
        SEED_DEMO_PASSWORD: password,
      });
      assert.equal(
        refusedSeed.status,
        1,
        `second seed unexpectedly succeeded: ${refusedSeed.stdout}`,
      );
      assert.match(refusedSeed.stderr, /Refusing to seed/);

      process.env.DATABASE_URL = databaseUrl(freshDb);
      const { createDataSource } = require(
        path.join(API_DIR, "dist", "infrastructure", "database", "entity-registry.js"),
      );
      const { Pengguna } = require(
        path.join(
          API_DIR,
          "dist",
          "infrastructure",
          "database",
          "entities",
          "auth",
          "pengguna.orm-entity.js",
        ),
      );
      const { RuangInap } = require(
        path.join(
          API_DIR,
          "dist",
          "infrastructure",
          "database",
          "entities",
          "rooms",
          "ruang-inap.orm-entity.js",
        ),
      );
      const { Pasien } = require(
        path.join(
          API_DIR,
          "dist",
          "infrastructure",
          "database",
          "entities",
          "patients",
          "pasien.orm-entity.js",
        ),
      );
      const { RekapPasien } = require(
        path.join(
          API_DIR,
          "dist",
          "infrastructure",
          "database",
          "entities",
          "cycles",
          "rekap-pasien.orm-entity.js",
        ),
      );
      const dataSource = createDataSource();
      await dataSource.initialize();
      try {
        const userRepo = dataSource.getRepository(Pengguna);
        const user = await userRepo.findOneByOrFail({ id: "USR-COORD" });
        assert.match(user.passwordHash, /^\$argon2id\$/);
        assert.equal(user.name, "Rina Saputra");
        user.passwordHash = "argon-hash-rotated";
        await userRepo.save(user);
        assert.equal(
          (await userRepo.findOneByOrFail({ id: user.id })).passwordHash,
          "argon-hash-rotated",
        );

        const room = await dataSource
          .getRepository(RuangInap)
          .findOneByOrFail({ id: "RG-001" });
        assert.equal(room.dailyRate, "450000.00");
        assert.equal(room.deletedAt ?? null, null);
        const patient = await dataSource
          .getRepository(Pasien)
          .findOneByOrFail({ id: "PT-001" });
        assert.match(String(patient.birthDate), /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(patient.address ?? null, null);

        const cycleRepo = dataSource.getRepository(RekapPasien);
        let cycle = await cycleRepo.findOneOrFail({
          where: { id: "CY-001" },
          relations: { doctorProfile: true, nurseProfile: true },
        });
        assert.equal(cycle.doctorProfile?.id, "DOC-3");
        assert.equal(cycle.nurseProfile?.id, "NRS-1");
        cycle.doctorId = "USR-DOCTOR-2";
        await cycleRepo.save(cycle);
        cycle = await cycleRepo.findOneOrFail({
          where: { id: "CY-001" },
          relations: { doctorProfile: true, nurseProfile: true },
        });
        assert.equal(cycle.doctorProfile?.id, "DOC-4");

        await dataSource.query(
          `INSERT INTO patients(id,medical_record_no,name,birth_date,gender) VALUES('PT-TRIGGER','RM-TRIGGER','Trigger Patient','1980-01-02','L')`,
        );
        const createdCycle = cycleRepo.create({
          id: "CY-TRIGGER",
          patientId: "PT-TRIGGER",
          doctorId: "USR-DOCTOR-1",
          nurseId: "USR-NURSE-2",
          status: "pending",
          version: 1,
        });
        await cycleRepo.save(createdCycle);
        const triggerCycle = await cycleRepo.findOneOrFail({
          where: { id: "CY-TRIGGER" },
          relations: { doctorProfile: true, nurseProfile: true },
        });
        assert.equal(triggerCycle.doctorProfile?.id, "DOC-3");
        assert.equal(triggerCycle.nurseProfile?.id, "NRS-2");
        triggerCycle.deletedAt = new Date();
        await cycleRepo.save(triggerCycle);
        const reusedPatientCycle = cycleRepo.create({
          id: "CY-TRIGGER-2",
          patientId: "PT-TRIGGER",
          doctorId: "USR-DOCTOR-1",
          nurseId: "USR-NURSE-2",
          status: "pending",
          version: 1,
        });
        await cycleRepo.save(reusedPatientCycle);
        assert.ok(await cycleRepo.findOneBy({ id: "CY-TRIGGER-2" }));
        await assert.rejects(
          dataSource.query(
            `INSERT INTO rooms(id,name,room_class,capacity,pic_id,daily_rate) VALUES('RG-INVALID','Invalid PIC room','Kelas I',1,'USR-ADMISI',0)`,
          ),
          /No nurse profile/,
        );

        await assert.rejects(
          dataSource.transaction(async (manager) => {
            await manager.query(
              `INSERT INTO users(id,username,name,role,password_hash) VALUES('ROLLBACK-ONLY','rollback','Rollback User','ADMISI','hash')`,
            );
            throw new Error("force rollback");
          }),
          /force rollback/,
        );
        assert.equal(await userRepo.findOneBy({ id: "ROLLBACK-ONLY" }), null);
      } finally {
        await dataSource.destroy();
        delete process.env.DATABASE_URL;
      }

      // Build a legacy baseline with SQLx history and records whose identifiers and secrets must survive adoption.
      const adoptDb = await createDatabase(admin);
      client = await connect(adoptDb);
      const baselineSql = require("node:fs").readFileSync(BASELINE, "utf8");
      await client.query(baselineSql);
      await client.query(
        `CREATE TABLE _sqlx_migrations(version bigint PRIMARY KEY,description text NOT NULL,installed_on timestamptz NOT NULL DEFAULT now(),success boolean NOT NULL,checksum bytea NOT NULL,execution_time bigint NOT NULL)`,
      );
      await client.query(
        `INSERT INTO _sqlx_migrations(version,description,success,checksum,execution_time) VALUES(1,'initial',true,decode('0102','hex'),9)`,
      );
      await client.query(`INSERT INTO users(id,username,name,role,password_hash) VALUES
      ('LEGACY-DR','legacy-dr','Legacy Doctor','DOKTER','legacy-password-hash'),
      ('LEGACY-NR','legacy-nr','Legacy Nurse','PERAWAT','legacy-nurse-hash'),
      ('LEGACY-ADMISI','legacy-admisi','Legacy Admissions','ADMISI','legacy-admissions-hash')`);
      await client.query(
        `INSERT INTO doctors(id,user_id,specialty) VALUES('DOC-LEGACY','LEGACY-DR','Internal')`,
      );
      await client.query(
        `INSERT INTO nurses(id,user_id) VALUES('NRS-LEGACY','LEGACY-NR')`,
      );
      await client.query(
        `INSERT INTO patients(id,medical_record_no,name,birth_date,gender) VALUES('PT-LEGACY','RM-LEGACY','Legacy Patient','1970-02-03','L')`,
      );
      await client.query(
        `INSERT INTO rooms(id,name,room_class,capacity,pic_id,daily_rate) VALUES('RG-LEGACY','Legacy Room','Kelas I',1,'LEGACY-NR',1234.50),('RG-UNMAPPED','Legacy Unmapped Room','Kelas I',1,'LEGACY-ADMISI',0)`,
      );
      await client.query(
        `INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,created_by) VALUES('PL-LEGACY','PT-LEGACY','RG-LEGACY','2026-01-01','2026-01-02','LEGACY-DR')`,
      );
      await client.query(
        `INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id,status) VALUES('CY-LEGACY','PT-LEGACY','PL-LEGACY','LEGACY-DR','LEGACY-NR','in_care')`,
      );
      await client.query(
        `INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment) VALUES('MR-LEGACY','PT-LEGACY','LEGACY-DR','complaint','diagnosis','treatment')`,
      );
      await client.query(
        `INSERT INTO observations(id,record_id,nurse_id,symptoms,observed_at) VALUES('OB-LEGACY','MR-LEGACY','LEGACY-NR','legacy symptom','2026-01-01T00:00:00Z')`,
      );
      await client.query(
        `INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,starts_at,ends_at,priority) VALUES('TK-LEGACY','PT-LEGACY','RG-LEGACY','PL-LEGACY','LEGACY-NR','LEGACY-DR','legacy task','2026-01-01T00:00:00Z','2026-01-01T01:00:00Z','normal')`,
      );
      const before = await client.query(
        `SELECT u.id,u.password_hash,p.birth_date::text AS birth_date,r.daily_rate::text AS daily_rate,c.doctor_id,c.nurse_id,t.id AS task_id FROM users u CROSS JOIN patients p CROSS JOIN rooms r CROSS JOIN cycles c CROSS JOIN tasks t WHERE u.id='LEGACY-DR' AND p.id='PT-LEGACY' AND r.id='RG-LEGACY' AND c.id='CY-LEGACY' AND t.id='TK-LEGACY'`,
      );
      assert.equal(before.rowCount, 1);
      await client.end();

      const adopted = runCli("adopt", adoptDb, tempCwd);
      assertCliSucceeded(adopted, "baseline adoption");
      client = await connect(adoptDb);
      const after = await client.query(
        `SELECT u.id,u.password_hash,p.birth_date::text AS birth_date,r.daily_rate::text AS daily_rate,c.doctor_id,c.nurse_id,t.id AS task_id,r.pic_nurse_id AS room_pic_nurse_id,c.doctor_profile_id,c.nurse_profile_id,m.doctor_profile_id,t.pic_nurse_id AS task_pic_nurse_id FROM users u CROSS JOIN patients p CROSS JOIN rooms r CROSS JOIN cycles c CROSS JOIN tasks t CROSS JOIN medical_records m WHERE u.id='LEGACY-DR' AND p.id='PT-LEGACY' AND r.id='RG-LEGACY' AND c.id='CY-LEGACY' AND t.id='TK-LEGACY' AND m.id='MR-LEGACY'`,
      );
      assert.equal(after.rowCount, 1);
      for (const field of [
        "id",
        "password_hash",
        "birth_date",
        "daily_rate",
        "doctor_id",
        "nurse_id",
        "task_id",
      ])
        assert.equal(after.rows[0][field], before.rows[0][field]);
      assert.equal(after.rows[0].room_pic_nurse_id, "NRS-LEGACY");
      const unmapped = await client.query(
        `SELECT pic_nurse_id FROM rooms WHERE id='RG-UNMAPPED'`,
      );
      assert.equal(unmapped.rows[0].pic_nurse_id, null);
      await client.query(
        `UPDATE rooms SET name='Legacy Unmapped Room Renamed' WHERE id='RG-UNMAPPED'`,
      );
      assert.equal(
        (
          await client.query(
            `SELECT pic_nurse_id FROM rooms WHERE id='RG-UNMAPPED'`,
          )
        ).rows[0].pic_nurse_id,
        null,
      );
      assert.equal(after.rows[0].doctor_profile_id, "DOC-LEGACY");
      assert.equal(after.rows[0].nurse_profile_id, "NRS-LEGACY");
      assert.equal(after.rows[0].task_pic_nurse_id, "NRS-LEGACY");
      assert.equal(after.rows[0].doctor_profile_id, "DOC-LEGACY");
      const sqlx = await client.query(
        "SELECT version,description,success,encode(checksum,'hex') checksum,execution_time FROM _sqlx_migrations",
      );
      assert.deepEqual(sqlx.rows, [
        {
          version: "1",
          description: "initial",
          success: true,
          checksum: "0102",
          execution_time: "9",
        },
      ]);
      const migrationRows = await client.query(
        "SELECT name FROM migrations ORDER BY timestamp",
      );
      assert.deepEqual(
        migrationRows.rows.map((row) => row.name),
        ["Baseline1793577600000", "RebuildDelta1793577600001", "AuditAlignment1793577600002"],
      );
      const repeatedAdopt = runCli("adopt", adoptDb, tempCwd);
      assertCliSucceeded(repeatedAdopt, "repeat baseline adoption");
      await client.end();

      // Any drift rejects adoption before either baseline or additive migration is marked.
      const driftDb = await createDatabase(admin);
      client = await connect(driftDb);
      await client.query(baselineSql);
      await client.query("ALTER TABLE users ADD COLUMN drift_marker text");
      await client.end();
      const drift = runCli("adopt", driftDb, tempCwd);
      assert.equal(
        drift.status,
        1,
        `drifted schema unexpectedly adopted: ${drift.stdout}`,
      );
      assert.match(drift.stderr, /Baseline schema fingerprint mismatch/);
      client = await connect(driftDb);
      const markers = await client.query(
        `SELECT count(*)::int AS n FROM migrations WHERE name IN ('Baseline1793577600000','RebuildDelta1793577600001')`,
      );
      assert.equal(markers.rows[0].n, 0);
      await client.end();
    } finally {
      for (const client of openedClients) {
        try {
          await client.end();
        } catch {
          /* already closed */
        }
      }
      for (const name of createdDatabases) {
        if (!/^nest_dbcheck_[a-f0-9]{18}$/.test(name)) continue;
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
      await admin.end();
      await rm(tempCwd, { recursive: true, force: true });
    }
  },
);
