const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { before, after, test } = require("node:test");
const { Client } = require("pg");

const adminUrl = process.env.INPACARE_TEST_DATABASE_ADMIN_URL;
const enabled = Boolean(adminUrl);
let databaseName;
let previousDatabaseUrl;
let ds;
let taskService;
let cyclesService;
const nurse = {
  id: "atomic-nurse",
  username: "atomic_nurse",
  name: "Atomic Nurse",
  role: "PERAWAT",
  coordinator: true,
  csrfToken: "",
};
const doctor = {
  id: "atomic-doctor",
  username: "atomic_doctor",
  name: "Atomic Doctor",
  role: "DOKTER",
  coordinator: false,
  csrfToken: "",
};
const newId = () => crypto.randomUUID();
const day = (offset = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

function checkedAdminUrl() {
  let parsed;
  try {
    parsed = new URL(adminUrl);
  } catch {
    throw new Error(
      "INPACARE_TEST_DATABASE_ADMIN_URL must be an explicit local PostgreSQL maintenance URL",
    );
  }
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname !== "/postgres" ||
    parsed.username !== "nest_test"
  ) {
    throw new Error(
      "Atomicity tests only allow nest_test on local PostgreSQL database /postgres",
    );
  }
  return parsed;
}

async function scenario(kind) {
  const patientId = newId();
  const placementId = newId();
  const cycleId = newId();
  const requestId = newId();
  const roomId = "atomic-room";
  const startsOn = day(-2);
  const endsOn = day(10);
  const requestedEnd = kind === "extend" ? day(13) : null;
  await ds.query(
    `INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs) VALUES($1,$2,'Atomic Patient',$3,'L',false)`,
    [patientId, `AT-${patientId.slice(0, 8)}`, day(-9000)],
  );
  await ds.query(
    `INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,status,created_by) VALUES($1,$2,$3,$4,$5,'active',$6)`,
    [placementId, patientId, roomId, startsOn, endsOn, nurse.id],
  );
  await ds.query(
    `INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id,status) VALUES($1,$2,$3,$4,$5,'in_care')`,
    [cycleId, patientId, placementId, doctor.id, nurse.id],
  );
  await ds.query(
    `INSERT INTO cycle_requests(id,cycle_id,kind,requested_end,reason,requested_by,previous_status) VALUES($1,$2,$3,$4,'Atomic test',$5,'in_care')`,
    [requestId, cycleId, kind, requestedEnd, nurse.id],
  );
  return {
    patientId,
    placementId,
    cycleId,
    requestId,
    roomId,
    endsOn,
    requestedEnd,
  };
}

before(async () => {
  if (!enabled) return;
  const admin = checkedAdminUrl();
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  databaseName = `nest_atomic_${crypto.randomBytes(6).toString("hex")}`;
  try {
    await client.query(`CREATE DATABASE "${databaseName}" OWNER nest_test`);
  } finally {
    await client.end();
  }
  previousDatabaseUrl = process.env.DATABASE_URL;
  admin.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = admin.toString();
  require("reflect-metadata");
  const { createDataSource } = require("../dist/database/entities.js");
  const { TugasService } = require("../dist/modules/tasks/tugas.service.js");
  const { CyclesService } = require("../dist/modules/cycles/cycles.service.js");
  ds = createDataSource();
  await ds.initialize();
  await ds.runMigrations({ transaction: "all" });
  await ds.query(
    `INSERT INTO users(id,username,name,role,coordinator,password_hash) VALUES($1,'atomic_nurse','Atomic Nurse','PERAWAT',true,'test-only'),($2,'atomic_doctor','Atomic Doctor','DOKTER',false,'test-only')`,
    [nurse.id, doctor.id],
  );
  await ds.query(
    `INSERT INTO nurses(id,user_id,active,name) VALUES($1,$2,true,'Atomic Nurse')`,
    [newId(), nurse.id],
  );
  await ds.query(
    `INSERT INTO doctors(id,user_id,specialty,name) VALUES($1,$2,'Test','Atomic Doctor')`,
    [newId(), doctor.id],
  );
  await ds.query(
    `INSERT INTO rooms(id,name,room_class,capacity,status,pic_id,daily_rate) VALUES($1,'Atomic Test Room','Test',4,'available',$2,'0.00')`,
    ["atomic-room", nurse.id],
  );
  taskService = new TugasService(ds);
  cyclesService = new CyclesService(ds);
});

after(async () => {
  if (ds?.isInitialized) await ds.destroy();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (!databaseName) return;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await client.end();
  }
});

test(
  "task insert rolls back when its transactional task_history insert fails",
  { skip: !enabled },
  async () => {
    const fixture = await scenario("release");
    const marker = `atomic-history-${newId()}`;
    await ds.query(
      `CREATE FUNCTION fail_atomic_task_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'atomicity test task_history failure'; END $$`,
    );
    await ds.query(
      `CREATE TRIGGER atomic_task_history_failure BEFORE INSERT ON task_history FOR EACH ROW EXECUTE FUNCTION fail_atomic_task_history()`,
    );
    try {
      const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const endsAt = new Date(Date.now() + 90 * 60_000).toISOString();
      await assert.rejects(
        taskService.create(nurse, {
          patientId: fixture.patientId,
          placementId: fixture.placementId,
          picId: nurse.id,
          title: marker,
          priority: "normal",
          startsAt,
          endsAt,
        }),
        /atomicity test task_history failure/,
      );
      const [row] = await ds.query(
        `SELECT count(*)::int AS n FROM tasks WHERE title=$1`,
        [marker],
      );
      assert.equal(
        row.n,
        0,
        "the task row must roll back with history failure",
      );
    } finally {
      await ds.query(
        "DROP TRIGGER IF EXISTS atomic_task_history_failure ON task_history",
      );
      await ds.query("DROP FUNCTION IF EXISTS fail_atomic_task_history()");
    }
  },
);

test(
  "approval, placement update, and request decision roll back when notification insert fails",
  { skip: !enabled },
  async () => {
    const fixture = await scenario("extend");
    await ds.query(
      `CREATE FUNCTION fail_atomic_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'atomicity test notification failure'; END $$`,
    );
    await ds.query(
      `CREATE TRIGGER atomic_notification_failure BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_atomic_notification()`,
    );
    try {
      await assert.rejects(
        cyclesService.decide(doctor, fixture.cycleId, fixture.requestId, {
          decision: "approve",
          note: "Atomic approval",
          expectedVersion: 1,
        }),
        /atomicity test notification failure/,
      );
      const [cycle] = await ds.query(
        `SELECT status,version FROM cycles WHERE id=$1`,
        [fixture.cycleId],
      );
      const [placement] = await ds.query(
        `SELECT ends_on::text AS ends_on FROM placements WHERE id=$1`,
        [fixture.placementId],
      );
      const [request] = await ds.query(
        `SELECT status FROM cycle_requests WHERE id=$1`,
        [fixture.requestId],
      );
      const [notices] = await ds.query(
        `SELECT count(*)::int AS n FROM notifications WHERE cycle_id=$1`,
        [fixture.cycleId],
      );
      assert.deepEqual(cycle, { status: "in_care", version: 1 });
      assert.equal(placement.ends_on, fixture.endsOn);
      assert.equal(request.status, "pending");
      assert.equal(notices.n, 0);
    } finally {
      await ds.query(
        "DROP TRIGGER IF EXISTS atomic_notification_failure ON notifications",
      );
      await ds.query("DROP FUNCTION IF EXISTS fail_atomic_notification()");
    }
  },
);

test(
  "competing approvals with one expected version commit exactly once",
  { skip: !enabled },
  async () => {
    const fixture = await scenario("extend");
    const results = await Promise.allSettled([
      cyclesService.decide(doctor, fixture.cycleId, fixture.requestId, {
        decision: "approve",
        note: "Decision A",
        expectedVersion: 1,
      }),
      cyclesService.decide(doctor, fixture.cycleId, fixture.requestId, {
        decision: "approve",
        note: "Decision B",
        expectedVersion: 1,
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const [cycle] = await ds.query(
      `SELECT status,version FROM cycles WHERE id=$1`,
      [fixture.cycleId],
    );
    const [request] = await ds.query(
      `SELECT status FROM cycle_requests WHERE id=$1`,
      [fixture.requestId],
    );
    const [notices] = await ds.query(
      `SELECT count(*)::int AS n FROM notifications WHERE cycle_id=$1`,
      [fixture.cycleId],
    );
    assert.deepEqual(cycle, { status: "extend", version: 2 });
    assert.equal(request.status, "approved");
    assert.equal(notices.n, 1);
  },
);

test(
  "release racing with task creation leaves either a live task or a released placement, never both",
  { skip: !enabled },
  async () => {
    const fixture = await scenario("release");
    const marker = `atomic-release-${newId()}`;
    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 90 * 60_000).toISOString();
    const results = await Promise.allSettled([
      cyclesService.decide(doctor, fixture.cycleId, fixture.requestId, {
        decision: "approve",
        note: "Release",
        expectedVersion: 1,
      }),
      taskService.create(nurse, {
        patientId: fixture.patientId,
        placementId: fixture.placementId,
        picId: nurse.id,
        title: marker,
        priority: "normal",
        startsAt,
        endsAt,
      }),
    ]);
    const [cycle] = await ds.query(`SELECT status FROM cycles WHERE id=$1`, [
      fixture.cycleId,
    ]);
    const [task] = await ds.query(
      `SELECT count(*)::int AS n FROM tasks WHERE title=$1 AND deleted_at IS NULL`,
      [marker],
    );
    const [request] = await ds.query(
      `SELECT status FROM cycle_requests WHERE id=$1`,
      [fixture.requestId],
    );
    if (cycle.status === "released") {
      assert.equal(task.n, 0);
      assert.equal(request.status, "approved");
    } else {
      assert.equal(cycle.status, "in_care");
      assert.equal(task.n, 1);
      assert.equal(request.status, "pending");
    }
    assert.ok(results.some((r) => r.status === "fulfilled"));
  },
);

const validationError = pattern => error => error.getStatus?.() === 422 && pattern.test(error.getResponse().error.message);

test("task edits recheck active PIC and placement, and creation history retains the full snapshot", { skip: !enabled }, async () => {
  const f = await scenario("release");
  const task = await taskService.create(nurse, {
    patientId: f.patientId, placementId: f.placementId, picId: nurse.id,
    title: "Audit snapshot", description: "Initial description", notes: "Initial note", priority: "high",
    startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 60000).toISOString(),
  });
  assert.equal(task.createdById, nurse.id);
  assert.equal(task.createdByName, nurse.name);
  const history = await taskService.history(nurse, task.id);
  assert.equal(history.items[0].before, null);
  const snapshot = history.items[0].after;
  for (const field of ["id", "title", "description", "notes", "priority", "patient_id", "room_id", "created_by", "starts_at", "ends_at", "version"]) assert.ok(field in snapshot, field);
  assert.equal(snapshot.title, "Audit snapshot");
  assert.equal(snapshot.notes, "Initial note");
  for (const table of ["nurses", "users"]) {
    const key = table === "nurses" ? "user_id" : "id";
    await ds.query(`UPDATE ${table} SET active=false WHERE ${key}=$1`, [nurse.id]);
    try { await assert.rejects(taskService.update(nurse, task.id, { expectedVersion: 1, notes: "Must not persist" }), validationError(/PIC harus perawat aktif/)); }
    finally { await ds.query(`UPDATE ${table} SET active=true WHERE ${key}=$1`, [nurse.id]); }
  }
  await ds.query("UPDATE placements SET status='cancelled' WHERE id=$1", [f.placementId]);
  await assert.rejects(taskService.update(nurse, task.id, { expectedVersion: 1, notes: "Must not persist" }), validationError(/Penempatan pasien tidak aktif/));
  await ds.query("UPDATE placements SET status='active',ends_on=starts_on WHERE id=$1", [f.placementId]);
  await assert.rejects(taskService.update(nurse, task.id, { expectedVersion: 1, notes: "Must not persist" }), validationError(/rentang penempatan/));
  const [unchanged] = await ds.query("SELECT version,notes FROM tasks WHERE id=$1", [task.id]);
  assert.deepEqual(unchanged, { version: 1, notes: "Initial note" });
  assert.equal((await taskService.history(nurse, task.id)).total, 1);
});

test("clinical correction requires a meaningful reason and preserves the submitted audit explanation", { skip: !enabled }, async () => {
  const f = await scenario("release");
  const { RekamMedisService } = require("../dist/modules/medical-records/rekam-medis.service.js");
  const service = new RekamMedisService(ds);
  const input = { patientId: f.patientId, recordDate: day(), complaint: "Synthetic", diagnosis: "Before", treatment: "Synthetic" };
  const record = await service.create(doctor, input);
  await assert.rejects(service.update(doctor, record.id, { ...input, diagnosis: "After", expectedVersion: 1, reason: "  " }), validationError(/Alasan koreksi/));
  await service.update(doctor, record.id, { ...input, diagnosis: "After", expectedVersion: 1, reason: "  Correct source entry  " });
  const [history] = await ds.query("SELECT actor_id,reason,before_data,after_data FROM medical_history WHERE entity_id=$1 AND action='updated'", [record.id]);
  assert.equal(history.actor_id, doctor.id);
  assert.equal(history.reason, "Correct source entry");
  assert.equal(history.before_data.diagnosis, "Before");
  assert.equal(history.after_data.diagnosis, "After");
});

test("cycle deletion retains reason, actor and snapshots atomically with archival", { skip: !enabled }, async () => {
  const f = await scenario("release");
  await ds.query("DELETE FROM cycle_requests WHERE cycle_id=$1", [f.cycleId]);
  await ds.query("UPDATE cycles SET status='pending' WHERE id=$1", [f.cycleId]);
  await assert.rejects(cyclesService.remove(nurse, f.cycleId, { expectedVersion: 1, reason: "  " }), validationError(/Alasan penghapusan/));
  await ds.query("CREATE FUNCTION fail_cycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cycle audit failure'; END $$");
  await ds.query("CREATE TRIGGER fail_cycle_audit BEFORE INSERT ON cycle_history FOR EACH ROW EXECUTE FUNCTION fail_cycle_audit()");
  try {
    await assert.rejects(cyclesService.remove(nurse, f.cycleId, { expectedVersion: 1, reason: "Duplicate recap" }), /cycle audit failure/);
    const [row] = await ds.query("SELECT version,deleted_at FROM cycles WHERE id=$1", [f.cycleId]);
    assert.deepEqual(row, { version: 1, deleted_at: null });
  } finally {
    await ds.query("DROP TRIGGER fail_cycle_audit ON cycle_history");
    await ds.query("DROP FUNCTION fail_cycle_audit()");
  }
  await cyclesService.remove(nurse, f.cycleId, { expectedVersion: 1, reason: "  Duplicate recap  " });
  const [audit] = await ds.query("SELECT * FROM cycle_history WHERE cycle_id=$1", [f.cycleId]);
  assert.equal(audit.actor_id, nurse.id);
  assert.equal(audit.reason, "Duplicate recap");
  assert.equal(audit.before_data.deleted_at, null);
  assert.ok(audit.after_data.deleted_at);
  assert.equal(audit.after_data.version, 2);
});

test("claim results distinguish unreviewed, rejected and approved and retain negative decision attribution", { skip: !enabled }, async () => {
  const f = await scenario("release");
  const admisi = { ...nurse, id: newId(), role: "ADMISI", coordinator: false };
  await ds.query("INSERT INTO users(id,username,name,role,password_hash) VALUES($1,$2,'Audit Admissions','ADMISI','test-only')", [admisi.id, `audit_${admisi.id}`]);
  await ds.query("UPDATE patients SET bpjs=true WHERE id=$1", [f.patientId]);
  const { TagihanService } = require("../dist/modules/billing/tagihan.service.js");
  const service = new TagihanService(ds);
  const invoice = await service.create(admisi, { patientId: f.patientId, coveredAmount: "0", lines: [{ description: "Synthetic service", quantity: 1, unitPrice: "10.00" }] });
  assert.equal((await service.detail(admisi, invoice.id)).claimResult, null);
  await assert.rejects(service.verifyClaim(admisi, invoice.id, { expectedVersion: 1, verified: false, result: "  ", reason: "Review" }), validationError(/Hasil verifikasi/));
  await service.verifyClaim(admisi, invoice.id, { expectedVersion: 1, verified: false, result: "  Ditolak  ", reason: "Documents incomplete" });
  const [rejected] = await ds.query("SELECT claim_result,claim_verified,claim_verified_by,claim_verified_at FROM invoices WHERE id=$1", [invoice.id]);
  assert.equal(rejected.claim_result, "Ditolak");
  assert.equal(rejected.claim_verified, false);
  assert.equal(rejected.claim_verified_by, admisi.id);
  assert.ok(rejected.claim_verified_at);
  await service.verifyClaim(admisi, invoice.id, { expectedVersion: 2, verified: true, result: "Disetujui", reason: "Revised documents reviewed" });
  const detail = await service.detail(admisi, invoice.id);
  assert.equal(detail.claimResult, "Disetujui");
  assert.equal(detail.claimVerified, true);
  const rejectedAudit = detail.history.find(h => h.action === "claim_verification" && h.after.claimResult === "Ditolak");
  assert.equal(rejectedAudit.before.claimResult, null);
});

test("adoption upgrades an existing Nest schema without inventing negative claim results", { skip: !enabled }, async () => {
  const name = `nest_upgrade_${crypto.randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  let legacy;
  try {
    await admin.query(`CREATE DATABASE "${name}" OWNER nest_test`);
    const url = checkedAdminUrl(); url.pathname = `/${name}`;
    const { DataSource } = require("typeorm");
    legacy = new DataSource({ ...ds.options, url: url.toString(), migrations: ds.options.migrations.slice(0, 2) });
    await legacy.initialize();
    await legacy.runMigrations({ transaction: "all" });
    await legacy.query("INSERT INTO users(id,username,name,role,password_hash) VALUES('legacy-adm','legacy_adm','Legacy synthetic','ADMISI','test-only')");
    await legacy.query("INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs) VALUES('legacy-patient','LEGACY-TEST','Legacy synthetic','1980-01-01','L',true)");
    for (const [id, verified] of [["legacy-approved", true], ["legacy-unknown", false]]) {
      await legacy.query("INSERT INTO invoices(id,patient_id,created_by,bpjs_snapshot,total_amount,covered_amount,payable_amount,claim_verified) VALUES($1,'legacy-patient','legacy-adm',true,10,0,10,$2)", [id, verified]);
    }
    const { spawnSync } = require("node:child_process");
    const path = require("node:path");
    const result = spawnSync(process.execPath, [path.resolve(__dirname,"../dist/database/cli.js"), "adopt"], { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const rows = await legacy.query("SELECT id,claim_result,total_amount::text FROM invoices ORDER BY id");
    assert.deepEqual(rows, [
      { id: "legacy-approved", claim_result: "Terverifikasi (data lama)", total_amount: "10.00" },
      { id: "legacy-unknown", claim_result: null, total_amount: "10.00" },
    ]);
    assert.equal((await legacy.query("SELECT count(*)::int n FROM migrations"))[0].n, 3);
  } finally {
    if (legacy?.isInitialized) await legacy.destroy();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
