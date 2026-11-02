import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const normalize = value => value.replaceAll('\\', '/');
const filesUnder = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)]) : [];
function dependencies(text, file) {
  if (file.endsWith('.svelte')) text = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  const ast = ts.createSourceFile(file + '.ts', text, ts.ScriptTarget.Latest, true);
  const imports = [];
  let directFetch = false;
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) imports.push(node.arguments[0].text);
      if ((ts.isIdentifier(node.expression) && node.expression.text === 'fetch') || (ts.isPropertyAccessExpression(node.expression) && ['window','globalThis'].includes(node.expression.expression.getText(ast)) && node.expression.name.text === 'fetch')) directFetch = true;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) imports.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { imports, directFetch };
}
function resolve(src, importer, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('$lib/')) return null;
  let base = spec.startsWith('$lib/') ? path.join(src, 'lib', spec.slice(5)) : path.resolve(path.dirname(importer), spec);
  const candidates = [base, ...['.ts','.js','.mjs','.svelte','.d.ts'].map(ext => base + ext), ...['index.ts','index.js'].map(name => path.join(base, name))];
  if (base.endsWith('.js')) candidates.push(base.slice(0,-3)+'.ts');
  return candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) ?? base;
}
export function checkWebArchitecture(root = process.cwd(), feature) {
  const src = path.join(root, 'apps/web/src');
  const files = filesUnder(src).filter(file => /\.(ts|js|mjs|svelte)$/.test(file) && !file.endsWith('.test.ts') && !file.includes(`${path.sep}generated${path.sep}`));
  const edges = new Map();
  const errors = [];
  const layer = name => name.match(/^lib\/features\/([^/]+)\/(domain|application|infrastructure|presentation)\//);
  for (const file of files) {
    const from = normalize(path.relative(src, file));
    const selected = !feature || from.startsWith(`lib/features/${feature}/`) || /^lib\/(app|shared)\//.test(from);
    const info = dependencies(fs.readFileSync(file,'utf8'), file);
    edges.set(file, []);
    const a = layer(from);
    if (selected && a && ['domain','application'].includes(a[2]) && info.directFetch) errors.push(`${from}: core calls fetch directly`);
    if (selected && a?.[2] === 'presentation' && info.directFetch) errors.push(`${from}: presentation calls fetch directly`);
    for (const spec of info.imports) {
      const target = resolve(src, file, spec);
      const to = target ? normalize(path.relative(src, target)) : spec;
      if (target && fs.existsSync(target)) edges.get(file).push(target);
      if (!selected) continue;
      const fail = message => errors.push(`${from}: ${message} (${spec})`);
      const targetFeature = to.match(/^lib\/features\/([^/]+)\//)?.[1];
      const publicFeature = targetFeature && to === `lib/features/${targetFeature}/index.ts`;
      const b = layer(to);
      if (a && publicFeature && a[1] === targetFeature && ['domain','application'].includes(a[2])) fail('core imports its own public barrel');
      if (a && targetFeature && a[1] !== targetFeature && !publicFeature) fail('private cross-feature import');
      if (a && to.startsWith('lib/app/')) fail('feature imports application composition');
      if (a && b && a[1] === b[1]) {
        const allowed = { domain:['domain'], application:['application','domain'], infrastructure:['infrastructure','application','domain'], presentation:['presentation','application','domain'] };
        if (!allowed[a[2]].includes(b[2])) fail('outer layer import');
      }
      if (a && ['domain','application'].includes(a[2])) {
        if (!target || /^lib\/(generated|shared\/(http|ui|presentation))\//.test(to)) fail('impure core dependency');
      }
      if (a?.[2] === 'presentation' && /^lib\/(generated|shared\/http)\//.test(to)) fail('presentation imports transport');
      if (a?.[2] === 'infrastructure' && b?.[2] === 'presentation') fail('infrastructure imports presentation');
      if (from.startsWith('lib/shared/') && /^lib\/(features|app)\//.test(to)) fail('shared imports application feature');
      if (from.startsWith('lib/app/') && b?.[2] === 'infrastructure' && !from.startsWith('lib/app/composition/')) fail('adapter import outside composition');
      if (from.startsWith('routes/') && !from.endsWith('+server.ts')) {
        if (b && b[2] !== 'presentation') fail('route imports feature internals');
        if (/^lib\/(generated|shared\/http)\//.test(to) || to === 'lib/api.ts' || to === 'lib/types.ts') fail('route imports legacy transport/types');
      }
    }
  }
  const visiting = new Set(), done = new Set();
  function visit(file, stack=[]) {
    if (visiting.has(file)) { errors.push(`dependency cycle: ${[...stack,file].map(x => normalize(path.relative(src,x))).join(' -> ')}`); return; }
    if (done.has(file)) return;
    visiting.add(file);
    for (const next of edges.get(file) ?? []) visit(next,[...stack,file]);
    visiting.delete(file); done.add(file);
  }
  for (const file of edges.keys()) visit(file);
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const position = process.argv.indexOf('--feature');
  if (position >= 0 && !process.argv[position+1]) throw new Error('--feature needs a feature name');
  const errors = checkWebArchitecture(process.cwd(), position >= 0 ? process.argv[position+1] : undefined);
  console.log(errors.join('\n') || 'Web architecture OK');
  if (errors.length) process.exitCode = 1;
}
