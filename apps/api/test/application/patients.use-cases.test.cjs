const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PatientsUseCases } = require('../../dist/application/patients/patients.use-cases');
const { TypeOrmPatientStore } = require('../../dist/infrastructure/database/repositories/patients/typeorm-patient.store');

const input = { name: 'Pasien Sintetis', birthDate: '2000-02-29', gender: 'P', bpjs: false };
const admisi = { id: 'admission', role: 'ADMISI', coordinator: false };
function fixture() {
  const written = [];
  const service = new PatientsUseCases({ create: async patient => { written.push(patient); return { ...patient, medicalRecordNo: 'RM-04230' }; } });
  return { written, service };
}

test('registration denies doctors, nurses and nurse coordinators before writing', async () => {
  const { service, written } = fixture();
  for (const actor of [{ role: 'DOKTER' }, { role: 'PERAWAT' }, { role: 'PERAWAT', coordinator: true }])
    await assert.rejects(service.create(actor, input), { code: 'FORBIDDEN' });
  assert.equal(written.length, 0);
});

test('admissions registration returns the generated number and ignores caller-supplied identifiers', async () => {
  const { service, written } = fixture();
  const result = await service.create(admisi, { ...input, name: ' Pasien Sintetis ', medicalRecordNo: ' RM-TEST-001 ', address: ' Alamat uji ', bpjs: true, bpjsNumber: '0001234567890' });
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.name, input.name);
  assert.equal(result.medicalRecordNo, 'RM-04230');
  assert.equal('medicalRecordNo' in written[0], false);
  assert.equal(result.address, 'Alamat uji');
  assert.equal(result.bpjsNumber, '0001234567890');
  assert.equal(written.length, 1);
});

test('invalid identity, future or impossible birthdays and inconsistent BPJS never write', async () => {
  const { service, written } = fixture();
  for (const fields of [
    { name: '  ' }, { name: 'x'.repeat(201) },
    { birthDate: '2001-02-29' }, { birthDate: '9999-01-01' }, { birthDate: '2000-02-29T00:00:00Z' },
    { gender: 'invalid' }, { bpjs: 'true' }, { bpjs: true }, { bpjs: true, bpjsNumber: '123' },
    { bpjs: false, bpjsNumber: '0001234567890' }, { address: 'x'.repeat(1001) },
  ]) await assert.rejects(service.create(admisi, { ...input, ...fields }), { code: 'VALIDATION_FAILED' });
  assert.equal(written.length, 0);
});

test('registration does not hide database errors', async () => {
  const failure = new Error('database unavailable');
  const unavailable = new TypeOrmPatientStore({ query: async () => { throw failure; } });
  await assert.rejects(unavailable.create({ ...input, id: 'test' }), error => error === failure);
});
