import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

test('native listener reports the packaged commit without caching and preserves app requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inpacare-native-web-'));
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  let child;
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'apps/web/build'), { recursive: true });
    await cp(new URL('../../scripts/native-web.mjs', import.meta.url), join(root, 'scripts/native-web.mjs'));
    await writeFile(join(root, 'apps/web/build/package.json'), '{"type":"module"}');
    await writeFile(join(root, 'apps/web/build/handler.js'),
      "export function handler(req,res) { res.end(req.headers['x-inpacare-protocol']); }");
    await writeFile(join(root, 'REVISION'), `${'a'.repeat(40)}\n`);
    child = spawn(process.execPath, [join(root, 'scripts/native-web.mjs')], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), HTTPS_PROXY_PORT: '' },
      stdio: 'ignore',
    });
    const url = `http://127.0.0.1:${port}`;
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { response = await fetch(`${url}/__version?cache-bust=1`); break; }
      catch { if (child.exitCode !== null) break; await setTimeout(50); }
    }
    assert.equal(response?.status, 200, 'native listener must become healthy');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { revision: 'a'.repeat(40), backend: 'nestjs' });
    const head = await fetch(`${url}/__version`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const page = await fetch(`${url}/login`, { headers: { 'x-inpacare-protocol': 'https' } });
    assert.equal(await page.text(), 'http', 'client headers cannot change the listener protocol');
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
});
