const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CyclesUseCases } = require('../../dist/application/cycles/cycles.use-cases');
const nurse = { id: 'nurse', role: 'PERAWAT' };
const input = { patientId: 'patient', doctorId: 'doctor', placementId: null };
function service(overrides = {}) {
  const calls = [];
  const store = {
    canReadPatient: async () => true, activeDoctor: async () => true,
    lockPatient: async () => { calls.push('lock'); return true; },
    hasActiveCycle: async () => { calls.push('check'); return false; },
    nextId: async () => 'CY-001',
    createCycle: async value => calls.push(value), ...overrides,
  };
  return { calls, useCases: new CyclesUseCases(store, { run: work => work({ cycles: store }) }) };
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
