const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CyclesUseCases } = require('../../dist/application/cycles/cycles.use-cases');
const nurse = { id: 'nurse', role: 'PERAWAT' };
const input = { patientId: 'patient', doctorId: 'doctor', placementId: null };
function service(overrides = {}, placements = {}) {
  const calls = [];
  const store = {
    canReadPatient: async () => true, activeDoctor: async () => true,
    lockPatient: async () => { calls.push('lock'); return true; },
    hasActiveCycle: async () => { calls.push('check'); return false; },
    nextId: async () => 'CY-001',
    createCycle: async value => calls.push(value), ...overrides,
  };
  return { calls, useCases: new CyclesUseCases(store, { run: work => work({ cycles: store, placements, patients: { canRead: async () => true } }) }) };
}
test('only nurses can list creation candidates', async () => {
  const { useCases } = service({ creationCandidates: async () => [{ id: 'patient' }] });
  assert.deepEqual(await useCases.creationCandidates(nurse), { items: [{ id: 'patient' }] });
  await assert.rejects(useCases.creationCandidates({ role: 'DOKTER' }), { code: 'FORBIDDEN' });
});
test('creation checks active recap after locking the patient and rejects a duplicate without writing', async () => {
  const { useCases, calls } = service({ hasActiveCycle: async () => { calls.push('check'); return true; } });
  await assert.rejects(useCases.create(nurse, input), error => error.code === 'CONFLICT' && /rekap aktif/.test(error.message));
  assert.deepEqual(calls, ['lock', 'check']);
});
test('a placement owned by another patient has an actionable validation error', async () => {
  const { useCases, calls } = service({ placementRoom: async () => undefined });
  await assert.rejects(useCases.create(nurse, { ...input, placementId: 'other-patient-placement' }), error => error.code === 'VALIDATION_FAILED' && /tidak sesuai/.test(error.message));
  assert.deepEqual(calls, ['lock', 'check']);
});
test('a registered patient without placement can start a pending recap', async () => {
  const { useCases, calls } = service();
  const result = await useCases.create(nurse, input);
  assert.equal(result.id, 'CY-001');
  assert.equal(result.status, 'pending');
  assert.equal(result.placementId, null);
  assert.deepEqual(calls.slice(0, 2), ['lock', 'check']);
  assert.equal(calls[2].patientId, input.patientId);
});

test('an existing valid placement creates an assigned cycle without starting care', async () => {
  const { useCases, calls } = service({ placementRoom: async () => 'room', lockRoom: async () => {}, activePlacement: async () => true });
  const result = await useCases.create(nurse, { ...input, placementId: 'placement' });
  assert.equal(result.status, 'assigned');
  assert.equal(result.placementId, 'placement');
  assert.equal(calls[2].status, 'assigned');
  assert.equal(result.version, 1);
});

test('a placement cancelled or released before submission cannot create a cycle', async () => {
  const { useCases, calls } = service({ placementRoom: async () => 'room', lockRoom: async () => {}, activePlacement: async () => false });
  await assert.rejects(useCases.create(nurse, { ...input, placementId: 'inactive-placement' }), { code: 'CONFLICT' });
  assert.deepEqual(calls, ['lock', 'check']);
});

test('creation rejects invalid roles, doctor, and ambiguous placement input before writing', async () => {
  const { useCases, calls } = service({ activeDoctor: async () => false });
  for (const role of ['DOKTER', 'ADMISI'])
    await assert.rejects(useCases.create({ ...nurse, role }, input), { code: 'FORBIDDEN' });
  await assert.rejects(useCases.create(nurse, input), { code: 'VALIDATION_FAILED' });
  await assert.rejects(useCases.create(nurse, { ...input, placementId: 'placement', newPlacement: { roomId: 'room' } }), { code: 'VALIDATION_FAILED' });
  assert.deepEqual(calls, []);
});

test('new placement uses the shared capacity and date rules before creating a cycle', async () => {
  const { useCases, calls } = service({}, {
    patientExistsForUpdate: async () => true,
    canPlacePatient: async () => true,
    roomForCreate: async () => ({ id: 'room', capacity: 1, status: 'available' }),
    patientOverlap: async () => false,
    peakOccupancy: async () => 1,
    create: async () => assert.fail('full room must not be written'),
  });
  await assert.rejects(useCases.create(nurse, { ...input, newPlacement: { roomId: 'room', startsOn: '2026-11-20', endsOn: '2026-11-19' } }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(useCases.create(nurse, { ...input, newPlacement: { roomId: 'room', startsOn: '2026-11-20', endsOn: '2026-11-21' } }), error => error.code === 'CONFLICT' && /Pilih ruang lain atau sesuaikan tanggal/.test(error.message));
  assert.ok(calls.every(value => typeof value === 'string'));
});

test('matching request replays the original result; changed input conflicts without writes', async () => {
  const result = { id: 'CY-001', patientId: 'patient', doctorId: 'doctor', placementId: null, nurseId: 'nurse', status: 'pending', version: 1 };
  let previous;
  const { useCases, calls } = service({
    creationForRequest: async () => previous,
    saveCreationRequest: async (nurseId, requestId, payload, saved) => { previous = { payload, result: saved }; },
  });
  const retry = { ...input, requestId: 'a02e78e8-99ec-4922-a314-b9d633e3bb43' };
  assert.deepEqual(await useCases.create(nurse, retry), result);
  assert.deepEqual(await useCases.create(nurse, retry), result);
  await assert.rejects(useCases.create(nurse, { ...retry, doctorId: 'other' }), { code: 'CONFLICT' });
  assert.equal(calls.filter(value => typeof value === 'object').length, 1);
});

test('nested placement DTO rejects malformed or incomplete input and invalid retry IDs', async () => {
  require('reflect-metadata');
  const { plainToInstance } = require('class-transformer');
  const { validateSync } = require('class-validator');
  const { CreateCycleDto } = require('../../dist/presentation/http/cycles/dto/cycle.dto');
  const options = { whitelist: true, forbidNonWhitelisted: true };
  for (const newPlacement of ['room', [], {}, { roomId: 'room', startsOn: '2026-02-30', endsOn: '2026-03-01' }, { roomId: 'room', startsOn: '2026-11-20', endsOn: '2026-11-21', patientId: 'other' }])
    assert.ok(validateSync(plainToInstance(CreateCycleDto, { ...input, newPlacement }), options).length);
  for (const requestId of [null, 'not-a-uuid'])
    assert.ok(validateSync(plainToInstance(CreateCycleDto, { ...input, requestId }), options).length);
});
