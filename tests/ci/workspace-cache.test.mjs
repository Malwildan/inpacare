import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('dependency caching never skips a clean lockfile install', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const jobs = workflow.split(/(?=^  [a-z][a-z-]+:\r?$)/m)
    .filter(job => /^      - run: npm ci\r?$/m.test(job));
  assert.ok(jobs.length > 0, 'expected npm installation jobs');
  for (const job of jobs) {
    assert.match(job, /node-version-file: \.nvmrc\r?\n          cache: npm/);
    assert.doesNotMatch(job, /cache-hit|actions\/cache@|node_modules/,
      'cache package downloads, never reuse installed or partially installed workspaces');
  }
});
