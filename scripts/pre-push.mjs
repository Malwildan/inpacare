import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { classifyPaths } from './ci-changes.mjs';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}

function check(command, args) {
  console.log(`pre-push: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    // npm is a .cmd launcher on Windows; all its arguments below are constants.
    shell: process.platform === 'win32' && command === 'npm'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed; push stopped`);
}

try {
  const paths = [];
  let hasBranch = false;
  const updates = readFileSync(0, 'utf8').trim();
  for (const line of updates ? updates.split(/\r?\n/) : []) {
    const [localRef, localSha, , remoteSha] = line.split(/\s+/);
    if (!localRef || !/^[a-f0-9]{40,64}$/.test(localSha ?? '') ||
        !/^[a-f0-9]{40,64}$/.test(remoteSha ?? '')) {
      throw new Error('Invalid Git push update');
    }
    if (/^0+$/.test(localSha) || !localRef.startsWith('refs/heads/')) continue;
    hasBranch = true;
    // shortcut: validate the checked-out branch only; use isolated checkouts if multi-branch pushes are needed.
    if (git(['rev-parse', 'HEAD']).trim() !== localSha) {
      throw new Error('Check out the branch being pushed; push branches separately so each tip is checked');
    }
    let base = remoteSha;
    if (/^0+$/.test(base)) {
      const mergeBase = spawnSync('git', ['merge-base', 'origin/main', localSha], { encoding: 'utf8' });
      base = mergeBase.status === 0 ? mergeBase.stdout.trim() : git(['hash-object', '-t', 'tree', '--stdin']).trim();
    }
    git(['diff', '--check', base, localSha]);
    paths.push(...git(['diff', '--no-renames', '--name-only', '-z', base, localSha]).split('\0').filter(Boolean));
  }

  if (hasBranch) {
    if (git(['status', '--porcelain', '--untracked-files=no']).trim()) {
      throw new Error('Commit or stash tracked changes so checks validate the pushed code');
    }
    const affected = classifyPaths(paths);
    if (affected.full) check(process.execPath, ['--test', 'tests/ci/*.test.mjs']);
    if (affected.web) check('npm', ['run', 'check']);
    if (affected.contracts) {
      check('npm', ['run', 'types:api']);
      git(['diff', '--exit-code', '--', 'apps/web/src/lib/generated/api.d.ts']);
    }
    if (affected.api) {
      check('npm', ['run', 'check:api']);
      check('npm', ['run', 'build:api']);
      check('npm', ['run', 'test:api:unit']);
    }
  }
} catch (error) {
  console.error(`pre-push: ${error.message}`);
  process.exitCode = 1;
}
