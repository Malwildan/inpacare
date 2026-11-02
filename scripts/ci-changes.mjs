import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const isMarkdown = (path) => path.toLowerCase().endsWith('.md');

export function classifyPaths(paths) {
  const result = { full: false, web: false, api: false, contracts: false };

  if (paths.length === 0) return { full: true, web: true, api: true, contracts: true };

  for (const path of paths) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
      result.full = true;
      continue;
    }

    if (path.startsWith('docs/') || (path.split('/').length === 1 && isMarkdown(path))) continue;
    if (
      path.startsWith('.github/') ||
      path.startsWith('scripts/') ||
      path.startsWith('tests/ci/')
    ) {
      result.full = true;
      continue;
    }
    if (
      path.startsWith('contracts/') ||
      path === 'apps/web/src/lib/generated/api.d.ts'
    ) {
      result.web = true;
      result.contracts = true;
      continue;
    }
    if (
      path.startsWith('apps/api/') ||
      path.startsWith('tests/api/') ||
      path === 'Cargo.toml' ||
      path === 'Cargo.lock'
    ) {
      result.api = true;
      continue;
    }
    if (
      path === 'package.json' ||
      path === 'package-lock.json' ||
      path === 'apps/web/package.json'
    ) {
      result.web = true;
      result.contracts = true;
      continue;
    }
    if (path.startsWith('apps/web/')) {
      result.web = true;
      continue;
    }

    // An unrecognized path may affect a check; skip only known documentation.
    result.full = true;
  }

  if (result.full) {
    result.web = true;
    result.api = true;
    result.contracts = true;
  }
  return result;
}

function changedPaths(args) {
  if (args.length === 1 && args[0] === '--full') return null;
  if (args.length === 2 && args[0] === '--base' && args[1]) {
    const diff = spawnSync('git', ['diff', '--no-renames', '--name-only', '-z', `${args[1]}...HEAD`], {
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024
    });
    if (diff.error) throw diff.error;
    if (diff.status !== 0) throw new Error(`git diff failed with status ${diff.status}`);
    return diff.stdout.toString('utf8').split('\0').filter(Boolean);
  }
  if (args.length !== 0) throw new Error('Usage: ci-changes.mjs [--base <ref> | --full]');

  const content = readFileSync(0, 'utf8');
  if (content.length === 0) return [];
  return content.includes('\0')
    ? content.split('\0').filter(Boolean)
    : content.split(/\r?\n/).filter(Boolean);
}

function writeGitHubOutput(result) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  appendFileSync(output, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const paths = changedPaths(process.argv.slice(2));
    const result = paths === null
      ? { full: true, web: true, api: true, contracts: true }
      : classifyPaths(paths);
    writeGitHubOutput(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
