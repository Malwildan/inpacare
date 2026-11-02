const test = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const contract = require('../../../contracts/openapi.json');
const base = process.env.INPACARE_TEST_URL;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

test('live JSON responses conform to OpenAPI, including restricted admissions projections', { skip: base ? false : 'INPACARE_TEST_URL is required' }, async () => {
  const origin = new URL(base).origin;
  async function validate(method, route, client, body) {
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    if (client) { headers.Cookie = client.cookie; headers['x-csrf-token'] = client.csrf; }
    const response = await fetch(`${base}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const value = response.status === 204 ? undefined : await response.json();
    const path = Object.keys(contract.paths).sort((a,b) => (a.match(/\{/g)||[]).length - (b.match(/\{/g)||[]).length).find(candidate => {
      const pattern = candidate.replace('/api/v1', '').replace(/\{[^}]+\}/g, '[^/]+');
      return new RegExp(`^${pattern}$`).test(route.split('?')[0]) && contract.paths[candidate][method.toLowerCase()];
    });
    assert.ok(path, `undocumented ${method} ${route}`);
    const schema = contract.paths[path][method.toLowerCase()].responses[response.status]?.content?.['application/json']?.schema;
    if (value !== undefined) {
      assert.ok(schema, `${method} ${route} status ${response.status} is undocumented`);
      const check = ajv.compile({ ...schema, components: contract.components });
      assert.ok(check(value), `${method} ${route}: ${JSON.stringify(check.errors?.slice(0, 5))}`);
    }
    assert.ok(response.status < 400, `${method} ${route} failed: ${response.status}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { value, response };
  }
  const clients = {};
  for (const username of ['rina', 'dina', 'hendra', 'admisi']) {
    const { value, response } = await validate('POST', '/session', null, { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' });
    clients[username] = { cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: value.user.csrfToken };
  }
  const failures = [];
  for (const [username, route] of [
    ['rina','/session'], ['rina','/reference'], ['rina','/patients'], ['rina','/patients/PT-001/context'], ['rina','/staff'],
    ['rina','/rooms'], ['rina','/rooms/RG-001'], ['rina','/tasks?limit=5'], ['rina','/tasks/TK-001'], ['rina','/tasks/TK-001/history'],
    ['dina','/cycles'], ['dina','/cycles/dashboard'], ['dina','/cycles/CY-003'],
    ['hendra','/medical-records'], ['hendra','/medical-records/MR-001'],
    ['admisi','/medical-records'], ['admisi','/medical-records/MR-001'],
    ['admisi','/invoices'], ['admisi','/invoices/INV-001'], ['admisi','/invoices/patients/PT-001/context'], ['dina','/notifications'],
  ]) { try { await validate('GET', route, clients[username]); } catch (error) { failures.push(error.message); } }
  assert.deepEqual(failures, []);
  const { value: room } = await validate('POST', '/rooms', clients.dina, { name: `Contract ${Date.now()}`, roomClass: 'Uji', capacity: 1, dailyRate: '0' });
  await validate('DELETE', `/rooms/${room.id}`, clients.dina, { expectedVersion: room.version });
});
