const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Client } = require('pg');

const adminUrl = process.env.INPACARE_TEST_DATABASE_ADMIN_URL;

test('placement permissions, history, capacity and cycle consistency', { skip: !adminUrl }, async t => {
  const admin = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(admin.hostname));
  assert.equal(admin.pathname, '/postgres');
  assert.equal(admin.username, 'nest_test');
  const databaseName = `nest_placements_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const maintenance = new Client({ connectionString: admin.toString() });
  const previousUrl = process.env.DATABASE_URL;
  let ds, app;
  await maintenance.connect();
  try {
    await maintenance.query(`CREATE DATABASE "${databaseName}" OWNER nest_test`);
    admin.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = admin.toString();
    require('reflect-metadata');
    const { createDataSource } = require('../../dist/infrastructure/database/entity-registry');
    const { createUseCases } = require('../../dist/composition/create-use-cases');
    ds = createDataSource();
    await ds.initialize();
    await ds.runMigrations({ transaction: 'all' });
    const password = 'Placement-test-only!2026';
    const hash = await require('argon2').hash(password);
    const nurse = { id: 'nurse', role: 'PERAWAT', coordinator: false };
    const coordinator = { id: 'coordinator', role: 'PERAWAT', coordinator: true };
    const doctor = { id: 'doctor', role: 'DOKTER', coordinator: false };
    for (const actor of [nurse, coordinator, doctor, { id: 'admissions', role: 'ADMISI', coordinator: false }]) {
      await ds.query('INSERT INTO users(id,username,name,role,coordinator,password_hash) VALUES($1::text,$1::text,$1::text,$2,$3,$4)', [actor.id, actor.role, actor.coordinator, hash]);
      if (actor.role === 'PERAWAT') await ds.query('INSERT INTO nurses(id,user_id,active,name) VALUES($1::text,$1::text,true,$1::text)', [actor.id]);
    }
    await ds.query("INSERT INTO doctors(id,user_id,specialty,name) VALUES('doctor','doctor','Test','Doctor')");
    const useCases = createUseCases(ds);
    app = await require('../../dist/main').createApp();
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const sessions = {};
    async function request(actor, method, path, body) {
      const session = sessions[actor];
      const response = await fetch(`${base}/api/v1${path}`, {
        method, headers: { 'Content-Type': 'application/json', Origin: base,
          ...(session ? { Cookie: session.cookie, 'x-csrf-token': session.csrf } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, value: await response.json(), response };
    }
    for (const actor of ['nurse', 'coordinator', 'doctor', 'admissions']) {
      const login = await request(null, 'POST', '/session', { username: actor, password });
      assert.equal(login.status, 200);
      sessions[actor] = { cookie: login.response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: login.value.user.csrfToken };
    }
    async function patient() {
      const id = randomUUID();
      await ds.query("INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs) VALUES($1::text,$1::text,$1::text,'2000-01-01','L',false)", [id]);
      return id;
    }
    async function room(capacity = 1) {
      const id = randomUUID();
      await ds.query("INSERT INTO rooms(id,name,room_class,capacity,status,daily_rate) VALUES($1::text,$1::text,'Test',$2,'available',0)", [id, capacity]);
      return id;
    }
    const dates = { startsOn: '2030-01-01', endsOn: '2030-01-05' };
    async function placement(actor = 'nurse', roomId, patientId) {
      const input = { patientId: patientId || await patient(), roomId: roomId || await room(), ...dates };
      const result = await request(actor, 'POST', '/placements', input);
      assert.equal(result.status, 201, JSON.stringify(result.value));
      return result.value;
    }
    const patch = (p, changes = {}) => ({ patientId: p.patientId, roomId: p.roomId, startsOn: p.startsOn, endsOn: p.endsOn, expectedVersion: p.version, reason: 'Operational correction', ...changes });
    const history = async id => (await request('coordinator', 'GET', `/placements/${id}/history`)).value.items;

    await t.test('nurses and coordinators create; other roles and ordinary nurses cannot mutate or read history', async () => {
      const p = await placement();
      await placement('coordinator');
      for (const actor of ['doctor', 'admissions']) {
        assert.equal((await request(actor, 'POST', '/placements', patch(p))).status, 403);
      }
      for (const actor of ['nurse', 'doctor', 'admissions']) {
        assert.equal((await request(actor, 'PATCH', `/placements/${p.id}`, patch(p))).status, 403);
        assert.equal((await request(actor, 'DELETE', `/placements/${p.id}`, { expectedVersion: 1, reason: 'Cancel' })).status, 403);
        assert.equal((await request(actor, 'GET', `/placements/${p.id}/history`)).status, 403);
        assert.equal((await request(actor, 'GET', '/occupancy?from=2030-01-01&to=2030-01-07&includeCancelled=true')).status, 403);
      }
      for (const reason of [undefined, '', '   ', 'x'.repeat(2001)]) {
        assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { reason }))).status, 422);
        assert.equal((await request('coordinator', 'DELETE', `/placements/${p.id}`, { expectedVersion: 1, reason })).status, 422);
      }
      assert.deepEqual(await history(p.id), []);
      assert.equal((await request('coordinator', 'GET', '/occupancy?from=2030-01-01&to=2030-01-07&includeCancelled=invalid')).status, 422);
    });

    await t.test('coordinator changes and cancellation persist actor, time, reason and exact snapshots', async () => {
      const p = await placement();
      const target = await room();
      const moved = await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { roomId: target, endsOn: '2030-01-06', reason: '  Move to available room  ' }));
      assert.equal(moved.status, 200);
      assert.equal(moved.value.version, 2);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p))).status, 409);
      assert.equal((await request('coordinator', 'DELETE', `/placements/${p.id}`, { expectedVersion: 2, reason: 'Admission cancelled' })).status, 200);
      const entries = await history(p.id);
      assert.equal(entries.length, 2);
      assert.equal(entries[0].actorId, coordinator.id);
      assert.equal(entries[0].actorName, coordinator.id);
      assert.ok(Number.isFinite(Date.parse(entries[0].createdAt)));
      assert.equal(entries[0].reason, 'Move to available room');
      assert.deepEqual(entries[0].before, { id: p.id, patient_id: p.patientId, room_id: p.roomId, starts_on: p.startsOn, ends_on: p.endsOn, status: 'active', version: 1 });
      assert.equal(entries[0].after.room_id, target);
      assert.equal(entries[0].after.ends_on, '2030-01-06');
      assert.equal(entries[1].before.version, 2);
      assert.equal(entries[1].after.version, 3);
      assert.equal(entries[1].after.status, 'cancelled');
      const ordinary = await request('nurse', 'GET', '/occupancy?from=2030-01-01&to=2030-01-07');
      assert.ok(!ordinary.value.items.some(item => item.id === p.id));
      const management = await request('coordinator', 'GET', '/occupancy?from=2030-01-01&to=2030-01-07&includeCancelled=true');
      assert.equal(management.value.items.find(item => item.id === p.id).status, 'cancelled');
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { expectedVersion: 3 }))).status, 409);
    });

    await t.test('room capacity and patient overlap are rechecked for creates and changes', async () => {
      const fullRoom = await room();
      const attempts = await Promise.all([patient(), patient()]);
      const saved = await Promise.all(attempts.map(patientId => request('nurse', 'POST', '/placements', { patientId, roomId: fullRoom, ...dates })));
      assert.deepEqual(saved.map(r => r.status).sort(), [201, 409]);
      const existing = saved.find(r => r.status === 201).value;
      assert.equal((await request('nurse', 'POST', '/placements', { patientId: existing.patientId, roomId: await room(), ...dates })).status, 409);
      const p = await placement();
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { roomId: fullRoom }))).status, 409);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { patientId: await patient() }))).status, 422);
      assert.deepEqual(await history(p.id), []);
      const later = await request('nurse', 'POST', '/placements', { patientId: p.patientId, roomId: await room(), startsOn: '2030-01-10', endsOn: '2030-01-12' });
      assert.equal(later.status, 201);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { endsOn: '2030-01-10' }))).status, 409);
      assert.equal((await request('nurse', 'POST', '/placements', { patientId: randomUUID(), roomId: p.roomId, ...dates })).status, 404);
    });

    await t.test('simultaneous coordinator edits permit one version and one history entry', async () => {
      const p = await placement();
      const saved = await Promise.all(['2030-01-06', '2030-01-07'].map(endsOn => request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { endsOn }))));
      assert.deepEqual(saved.map(r => r.status).sort(), [200, 409]);
      assert.equal((await history(p.id)).length, 1);
    });

    await t.test('initial placement respects responsibility for an active cycle', async () => {
      const patientId = await patient();
      const cycle = await useCases.cycles.create(coordinator, { patientId, doctorId: doctor.id });
      const input = { patientId, roomId: await room(), ...dates };
      assert.equal((await request('nurse', 'POST', '/placements', input)).status, 403);
      assert.equal((await request('coordinator', 'POST', '/placements', input)).status, 201);
      const ownPatient = await patient();
      await useCases.cycles.create(nurse, { patientId: ownPatient, doctorId: doctor.id });
      assert.equal((await request('nurse', 'POST', '/placements', { ...input, patientId: ownPatient, roomId: await room() })).status, 201);
      assert.equal((await useCases.cycles.detail(coordinator, cycle.id)).status, 'pending');
    });

    await t.test('room moves preserve cycle linkage; dates and active cancellation follow doctor decisions', async () => {
      const p = await placement();
      const cycle = await useCases.cycles.create(nurse, { patientId: p.patientId, placementId: p.id, doctorId: doctor.id });
      assert.equal(cycle.status, 'assigned');
      await useCases.cycles.change(nurse, cycle.id, { status: 'in_care', expectedVersion: cycle.version });
      const pending = await useCases.cycles.request(nurse, cycle.id, { kind: 'extend', requestedEnd: '2030-01-07', reason: 'Continue care' });
      for (const endsOn of ['2030-01-04', '2030-01-07']) {
        const rejected = await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { endsOn }));
        assert.equal(rejected.status, 409);
        assert.match(rejected.value.error.message, /dokter/);
      }
      assert.equal((await request('coordinator', 'DELETE', `/placements/${p.id}`, { expectedVersion: 1, reason: 'Cancel active care' })).status, 409);
      const target = await room();
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { roomId: target }))).status, 200);
      let detail = await useCases.cycles.detail(nurse, cycle.id);
      assert.equal(detail.placementId, p.id);
      assert.equal(detail.room, target);
      assert.equal(detail.status, 'in_care');
      assert.equal(detail.requests[0].status, 'pending');
      await useCases.cycles.decide(doctor, cycle.id, pending.id, { decision: 'approve', note: 'Approved', expectedVersion: detail.version });
      const [updated] = await ds.query('SELECT room_id,ends_on::text AS ends_on,version FROM placements WHERE id=$1', [p.id]);
      assert.equal(updated.ends_on, '2030-01-07');
      assert.equal(updated.room_id, target);
      detail = await useCases.cycles.detail(nurse, cycle.id);
      assert.equal(detail.status, 'extend');
      assert.equal(detail.placementId, p.id);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { roomId: target, endsOn: '2030-01-08', expectedVersion: updated.version }))).status, 409);
    });

    await t.test('released cycle dates cannot be reopened through the calendar', async () => {
      const p = await placement();
      await ds.query("INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id,status) VALUES($1,$2,$3,'doctor','nurse','released')", [randomUUID(), p.patientId, p.id]);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { endsOn: '2030-01-06' }))).status, 409);
      assert.deepEqual(await history(p.id), []);
    });

    await t.test('task dependencies block cancellation, moves and shortened periods', async () => {
      const p = await placement();
      await ds.query("INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,starts_at,ends_at,priority) VALUES($1,$2,$3,$4,'nurse','coordinator','Dependency','2030-01-05T01:00:00Z','2030-01-05T02:00:00Z','normal')", [randomUUID(), p.patientId, p.roomId, p.id]);
      assert.equal((await request('coordinator', 'DELETE', `/placements/${p.id}`, { expectedVersion: 1, reason: 'Cancel' })).status, 409);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { roomId: await room() }))).status, 409);
      assert.equal((await request('coordinator', 'PATCH', `/placements/${p.id}`, patch(p, { endsOn: '2030-01-04' }))).status, 409);
      assert.deepEqual(await history(p.id), []);
    });

    await t.test('failed history insert rolls back both update and cancellation', async () => {
      const p = await placement();
      await ds.query("CREATE FUNCTION reject_placement_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$; CREATE TRIGGER reject_history BEFORE INSERT ON placement_history FOR EACH ROW EXECUTE FUNCTION reject_placement_history()");
      try {
        for (const action of [() => useCases.placements.update(coordinator, p.id, patch(p, { endsOn: '2030-01-06' })), () => useCases.placements.cancel(coordinator, p.id, { expectedVersion: 1, reason: 'Cancel' })]) {
          await assert.rejects(action(), /Synthetic audit failure/);
          const [current] = await ds.query('SELECT version,status,ends_on::text AS ends_on FROM placements WHERE id=$1', [p.id]);
          assert.deepEqual(current, { version: 1, status: 'active', ends_on: p.endsOn });
        }
      } finally { await ds.query('DROP TRIGGER reject_history ON placement_history; DROP FUNCTION reject_placement_history()'); }
      assert.deepEqual(await history(p.id), []);
    });
  } finally {
    if (app) await app.close();
    if (ds?.isInitialized) await ds.destroy();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await maintenance.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await maintenance.end();
  }
});
