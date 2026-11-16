const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Client } = require('pg');

const adminUrl = process.env.INPACARE_TEST_DATABASE_ADMIN_URL;

for (const legacy of [false, true]) {
  test(`patient numbering on ${legacy ? 'an existing database' : 'a fresh database'} preserves records and concurrent allocations`, {
    skip: !adminUrl,
    timeout: 120_000,
  }, async () => {
    const url = new URL(adminUrl);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.equal(url.username, 'nest_test');
    assert.equal(url.pathname, '/postgres');
    const database = `nest_patient_${randomUUID().replaceAll('-', '').slice(0, 18)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const previousUrl = process.env.DATABASE_URL;
    let ds;
    try {
      await admin.query(`CREATE DATABASE "${database}" OWNER nest_test`);
      url.pathname = `/${database}`;
      process.env.DATABASE_URL = url.toString();
      require('reflect-metadata');
      const { createDataSource, ALL_MIGRATIONS } = require('../../dist/infrastructure/database/entity-registry');
      const { createUseCases } = require('../../dist/composition/create-use-cases');
      ds = createDataSource();
      const numberingIndex = ALL_MIGRATIONS.findIndex(Migration => new Migration().name === 'PatientRecordNumber1793577600004');
      assert.ok(numberingIndex > 0);
      ds.setOptions({ migrations: ALL_MIGRATIONS.slice(0, numberingIndex) });
      await ds.initialize();
      await ds.runMigrations({ transaction: 'all' });
      const numbers = legacy ? ['RM-00042', 'RM-99999', 'LEGACY-42', 'RM-999999999999999999999999'] : [];
      for (const [index, number] of numbers.entries()) {
        await ds.query("INSERT INTO patients(id,medical_record_no,name,birth_date,gender) VALUES($1,$2,'Legacy patient','1980-01-01','L')", [`legacy-${index}`, number]);
      }
      await ds.destroy();
      ds = createDataSource();
      await ds.initialize();
      await ds.runMigrations({ transaction: 'all' });
      const patients = createUseCases(ds).patients;
      const actor = { id: 'synthetic-admissions', role: 'ADMISI', coordinator: false };
      const input = { name: 'Synthetic generated patient', birthDate: '2000-02-29', gender: 'P', bpjs: false };
      const created = await Promise.all(Array.from({ length: 16 }, (_, index) => patients.create(actor, { ...input, name: `${input.name} ${index}` })));
      const start = legacy ? 100000 : 1;
      assert.deepEqual(created.map(patient => patient.medicalRecordNo).sort(),
        Array.from({ length: 16 }, (_, index) => `RM-${String(start + index).padStart(5, '0')}`).sort());
      assert.equal(new Set(created.map(patient => patient.id)).size, 16);
      const beforeReconnect = await ds.query('SELECT id,medical_record_no FROM patients ORDER BY id');
      assert.deepEqual(beforeReconnect.filter(patient => patient.id.startsWith('legacy-')).map(patient => patient.medical_record_no), numbers);
      await ds.destroy();
      ds = createDataSource();
      await ds.initialize();
      const next = await createUseCases(ds).patients.create(actor, input);
      assert.equal(next.medicalRecordNo, `RM-${String(start + 16).padStart(5, '0')}`);
      assert.deepEqual(await ds.query('SELECT id,medical_record_no FROM patients WHERE id<>$1 ORDER BY id', [next.id]), beforeReconnect);
    } finally {
      if (ds?.isInitialized) await ds.destroy();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  });
}
