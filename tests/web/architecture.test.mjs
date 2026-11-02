import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkWebArchitecture } from '../../scripts/check-web-architecture.mjs';

function fixture(entries, check) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inpacare-web-architecture-'));
 try {
  for (const [name, body] of Object.entries(entries)) {
   const file = path.join(root, 'apps/web/src', name);
   fs.mkdirSync(path.dirname(file), { recursive: true });
   fs.writeFileSync(file, body);
  }
  check(feature => checkWebArchitecture(root, feature));
 } finally {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('inpacare-web-architecture-'));
  fs.rmSync(resolved, { recursive: true, force: true });
 }
}

test('accepts pure core, public cross-feature types and composition adapters', () => fixture({
 'lib/features/a/domain/model.ts': 'export type Model = string;',
 'lib/features/a/index.ts': "export type { Model } from './domain/model';",
 'lib/features/b/application/use-case.ts': "import type { Model } from '$lib/features/a';",
 'lib/features/a/infrastructure/http.ts': '',
 'lib/app/composition/a.ts': "import '$lib/features/a/infrastructure/http';"
}, run => assert.deepEqual(run(), [])));

test('rejects a relative private cross-feature reexport', () => fixture({
 'lib/features/a/infrastructure/private.ts': '',
 'lib/features/b/application/use-case.ts': "export { value } from '../../a/infrastructure/private';"
}, run => assert.match(run().join('\n'), /private cross-feature/)));

test('rejects outer-layer and framework imports from core', () => fixture({
 'lib/features/a/domain/model.ts': "import '../application/use-case'; import 'svelte';",
 'lib/features/a/application/use-case.ts': "import '../infrastructure/http';",
 'lib/features/a/infrastructure/http.ts': ''
}, run => { assert.match(run().join('\n'), /outer layer/); assert.match(run().join('\n'), /impure core/); }));

test('reads Svelte scripts and blocks transport and direct fetch in presentation', () => fixture({
 'lib/shared/http/client.ts': '',
 'lib/features/a/presentation/View.svelte': '<script lang="ts">import type { Client } from "$lib/shared/http/client"; fetch("/api/v1/tasks");</script>'
}, run => { assert.match(run().join('\n'), /presentation imports transport/); assert.match(run().join('\n'), /calls fetch/); }));

test('does not mistake comments or strings for imports', () => fixture({
 'lib/features/a/domain/model.ts': '// import "svelte";\nconst text = "import svelte from svelte";'
}, run => assert.deepEqual(run(), [])));

test('detects cycles through literal dynamic imports', () => fixture({
 'lib/features/a/domain/first.ts': "import('./second');",
 'lib/features/a/domain/second.ts': "import './first';"
}, run => assert.match(run().join('\n'), /dependency cycle:.*first.ts.*second.ts.*first.ts/)));

test('blocks shared-to-feature, non-composition adapters and thick routes', () => fixture({
 'lib/features/a/domain/model.ts': '',
 'lib/features/a/infrastructure/http.ts': '',
 'lib/shared/types.ts': "import '$lib/features/a/domain/model';",
 'lib/app/shell/state.ts': "import '$lib/features/a/infrastructure/http';",
 'routes/tasks/+page.server.ts': "import '$lib/features/a/infrastructure/http';"
}, run => { const errors=run().join('\n'); assert.match(errors,/shared imports/); assert.match(errors,/outside composition/); assert.match(errors,/route imports feature internals/); }));

test('scoped gate checks the requested feature while retaining cycle detection', () => fixture({
 'lib/features/a/domain/model.ts': "import 'svelte';",
 'lib/features/b/domain/model.ts': "import 'svelte';"
}, run => { const errors=run('a').join('\n'); assert.match(errors,/features\/a/); assert.doesNotMatch(errors,/features\/b/); }));


test('blocks direct network calls and self-barrel imports in core', () => fixture({
 'lib/features/a/index.ts': '',
 'lib/features/a/domain/model.ts': "import '$lib/features/a'; globalThis.fetch('/api/v1/tasks');"
}, run => { const errors=run().join('\n'); assert.match(errors,/core calls fetch/); assert.match(errors,/core imports its own public barrel/); }));
