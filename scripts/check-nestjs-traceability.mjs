import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require('typescript');
const trace = JSON.parse(fs.readFileSync(path.join(root, 'docs/planning/NESTJS_TRACEABILITY.json'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/openapi.json'), 'utf8'));
const fail = [];
const count = (arr) => arr.reduce((n, x) => n + x, 0);
const attrs = trace.sourceEntities.reduce((n, e) => n + e.attributeMappings.length, 0);
const methods = trace.controllers.reduce((n, c) => n + c.methods.length, 0);
if (trace.sourceEntities.length !== 17 || methods !== 53 || attrs !== 122 || trace.relationships.length !== 30) {
  fail.push(`coverage counts expected entities/methods/attributes/relationships 17/53/122/30; got ${trace.sourceEntities.length}/${methods}/${attrs}/${trace.relationships.length}`);
}

function symbols(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  const source = ts.createSourceFile(file, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = new Set();
  function walk(node, owner = '') {
    if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
      const cls = ts.isClassDeclaration(node) ? node.name.text : '';
      if (cls) found.add(`${cls}`);
      for (const member of node.members || []) if ((ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)) && member.name) {
        const name = member.name.getText(source).replace(/^['"]|['"]$/g, '');
        found.add(`${cls}.${name}`);
      }
      if (ts.isFunctionDeclaration(node)) found.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) found.add(node.name.text);
    for (const child of node.getChildren(source)) walk(child, owner);
  }
  walk(source);
  return found;
}

for (const controller of trace.controllers) for (const row of controller.methods) {
  if (row.status === 'planned' || !row.actualTargetSymbols?.length) fail.push(`${controller.sourceClass}.${row.sourceMethod}: missing actual symbol mapping`);
  for (const target of row.actualTargetSymbols || []) {
    const found = symbols(target.file);
    if (!found) fail.push(`${controller.sourceClass}.${row.sourceMethod}: missing file ${target.file}`);
    else if (!found.has(target.symbol.split('#').at(-1))) fail.push(`${controller.sourceClass}.${row.sourceMethod}: missing symbol ${target.file}#${target.symbol}`);
  }
  for (const [, verb, route] of row.plannedOperation.matchAll(/(GET|POST|PATCH|DELETE) (\/[^\s]+)/g)) {
    const routePath = `/api/v1${route}`.replace(/:([\w]+)/g, '{$1}');
    if (!contract.paths[routePath]?.[verb.toLowerCase()]) fail.push(`${controller.sourceClass}.${row.sourceMethod}: route not in contract: ${verb} ${routePath}`);
  }
}
for (const entity of trace.sourceEntities) for (const row of entity.attributeMappings) {
  if (!row.actualMapping?.target || row.status === 'planned') fail.push(`${entity.sourceClass}.${row.sourceAttribute}: missing target mapping`);
}
for (const row of trace.relationships) if (!row.actualMapping?.foreignKey || row.status === 'planned') fail.push(`${row.id}: missing relationship mapping`);
if (fail.length) { console.error(fail.join('\n')); process.exitCode = 1; }
else console.log(`Traceability inventory valid: ${trace.sourceEntities.length} source entities, ${attrs} attributes, ${methods} methods, ${trace.relationships.length} relationships. Evidence remains pending.`);
