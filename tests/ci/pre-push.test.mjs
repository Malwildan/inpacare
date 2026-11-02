import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hook = fileURLToPath(new URL('../../scripts/pre-push.mjs', import.meta.url));
const zero = '0'.repeat(40);
// Git hooks export repository variables; never let a fixture use the real checkout.
const env = { ...process.env };
for (const key of spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout.trim().split('\n')) {
  delete env[key.trim()];
}

test('push hook validates new branches, deletions, dirty trees and wrong commits', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'inpacare-push-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = () => {
    git('add', 'README.md');
    git('-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid', 'commit', '-m', 'docs');
    return git('rev-parse', 'HEAD');
  };
  const push = (local, remote) => spawnSync(process.execPath, [hook], {
    cwd,
    env,
    input: `refs/heads/test ${local} refs/heads/test ${remote}\n`,
    encoding: 'utf8'
  });
  git('init');
  writeFileSync(join(cwd, 'README.md'), 'Initial docs\n');
  const base = commit();
  git('update-ref', 'refs/remotes/origin/main', base);
  writeFileSync(join(cwd, 'README.md'), 'Updated docs\n');
  const head = commit();
  assert.equal(push(head, base).status, 0, 'docs-only update should pass');
  assert.equal(push(head, zero).status, 0, 'new branch should compare with main');
  assert.equal(push(zero, base).status, 0, 'deleting a branch should not run checks');
  assert.match(push(base, head).stderr, /Check out the branch/);
  const multiple = spawnSync(process.execPath, [hook], {
    cwd, env, encoding: 'utf8',
    input: `refs/heads/test ${head} refs/heads/test ${base}\nrefs/heads/other ${base} refs/heads/other ${head}\n`
  });
  assert.notEqual(multiple.status, 0);
  assert.match(multiple.stderr, /push branches separately/);
  writeFileSync(join(cwd, 'README.md'), 'Dirty tracked docs\n');
  assert.match(push(head, base).stderr, /Commit or stash/);
  writeFileSync(join(cwd, 'README.md'), 'Trailing whitespace \n');
  const bad = commit();
  assert.notEqual(push(bad, head).status, 0, 'whitespace errors must block the push');
});

test('malformed update input blocks the push', () => {
  const result = spawnSync(process.execPath, [hook], { input: 'invalid\n', encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid Git push update/);
});
