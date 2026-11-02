import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPaths } from '../../scripts/ci-changes.mjs';

test('runs only the frontend checks for frontend source paths', () => {
  assert.deepEqual(classifyPaths(['apps/web/src/routes/+page.svelte']), {
    full: false, web: true, api: false, contracts: false
  });
});

test('root npm manifests check API, frontend, and generated types', () => {
  for (const path of ['package.json', 'package-lock.json']) {
    assert.deepEqual(classifyPaths([path]), {
      full: false, web: true, api: true, contracts: true
    });
  }
  assert.deepEqual(classifyPaths(['apps/web/package.json']), {
    full: false, web: true, api: false, contracts: true
  });
});

test('runs API checks for NestJS, migrations, API test, and workspace paths', () => {
  assert.deepEqual(classifyPaths([
    'apps/api/src/main.ts',
    'apps/api/src/database/migrations/0001_initial.sql',
    'tests/api/test_tasks.py',
    'apps/api/package.json'
  ]), { full: false, web: false, api: true, contracts: false });
});

test('runs frontend and contract drift checks when the contract changes', () => {
  assert.deepEqual(classifyPaths(['contracts/openapi.json']), {
    full: false, web: true, api: false, contracts: true
  });
  assert.deepEqual(classifyPaths(['apps/web/src/lib/generated/api.d.ts']), {
    full: false, web: true, api: false, contracts: true
  });
});

test('skips only recognized documentation paths', () => {
  assert.deepEqual(classifyPaths(['README.md', 'docs/planning/guide.pdf']), {
    full: false, web: false, api: false, contracts: false
  });
});

test('workflow, classifier, unknown, and malformed paths fail closed to all checks', () => {
  for (const path of [
    '.github/workflows/ci.yml',
    'scripts/ci-changes.mjs',
    'src/shared/config.ts',
    '../outside.txt',
    'apps\\web\\file.ts'
  ]) {
    assert.deepEqual(classifyPaths([path]), {
      full: true, web: true, api: true, contracts: true
    }, path);
  }
});

test('deleted paths use the same conservative classification', () => {
  assert.equal(classifyPaths(['apps/api/src/removed.rs']).api, true);
  assert.equal(classifyPaths(['docs/removed.md']).full, false);
  assert.equal(classifyPaths(['retired/removed.ts']).full, true);
});

test('an empty diff fails closed', () => {
  assert.deepEqual(classifyPaths([]), { full: true, web: true, api: true, contracts: true });
});
