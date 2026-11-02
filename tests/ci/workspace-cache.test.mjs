import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('installed dependency caches include root and every npm workspace', () => {
  const root = new URL('../../', import.meta.url);
  const { workspaces } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const workflow = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');
  const caches = workflow.split(/(?=^      - )/m)
    .filter(step => step.startsWith('      - uses: actions/cache@') && /^          key: npm-/m.test(step));
  assert.ok(caches.length > 0, 'expected installed dependency cache steps');
  const keys = [];
  for (const step of caches) {
    const paths = step.match(/^          path: \|\r?\n((?:            [^\r\n]+\r?\n)+)/m)?.[1]
      .trim().split(/\r?\n/).map(path => path.trim());
    for (const path of ['node_modules', ...workspaces.map(workspace => `${workspace}/node_modules`)]) {
      assert.ok(paths?.includes(path), `installed dependency cache omits ${path}; a cache hit skips npm ci`);
    }
    const key = step.match(/^          key: (.+)/m)?.[1];
    assert.ok(Number(key?.match(/^npm-v(\d+)-/)?.[1]) >= 2, 'invalidate the incomplete v1 dependency caches');
    keys.push(key);
  }
  assert.equal(new Set(keys).size, 1, 'shared dependency caches must use the same layout and key');
});
