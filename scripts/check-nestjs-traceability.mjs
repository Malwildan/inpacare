import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require('typescript');
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { ALL_ENTITIES } = require(path.join(root, 'apps/api/dist/infrastructure/database/entity-registry'));
const trace = JSON.parse(fs.readFileSync(path.join(root, 'docs/planning/NESTJS_TRACEABILITY.json'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/openapi.json'), 'utf8'));
const migrationDirectory = path.join(root, 'apps/api/src/infrastructure/database/migrations');
const migration = [
  fs.readFileSync(path.join(migrationDirectory, 'baseline.sql'), 'utf8'),
  ...fs.readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationDirectory, file), 'utf8')),
].join('\n');
const errors = [];
const fail = (message) => errors.push(message);
const expected = { entities: 17, attributes: 122, methods: 53, relationships: 30 };
const counts = {
  entities: trace.sourceEntities.length,
  attributes: trace.sourceEntities.reduce((sum, e) => sum + e.attributeMappings.length, 0),
  methods: trace.controllers.reduce((sum, c) => sum + c.methods.length, 0),
  relationships: trace.relationships.length,
};
for (const [key, value] of Object.entries(expected)) if (counts[key] !== value) fail(`${key} count expected ${value}, found ${counts[key]}`);

const parsedFiles = new Map();
function source(file) {
  if (!parsedFiles.has(file)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    parsedFiles.set(file, { text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) });
  }
  return parsedFiles.get(file);
}
function classMember(file, className, memberName) {
  const { ast } = source(file);
  let result = null;
  function visit(node, owner = '') {
    const cls = ts.isClassDeclaration(node) && node.name ? node.name.text : owner;
    if (cls === className && (ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) && node.name?.getText(ast).replace(/["']/g, '') === memberName) {
      result = {
        type: node.type?.getText(ast) || 'inferred',
        visibility: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) ? 'private' : node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public',
      };
    }
    for (const child of node.getChildren(ast)) visit(child, cls);
  }
  visit(ast);
  return result;
}
function hasSymbol(file, symbol) {
  const { ast } = source(file);
  let found = false;
  function visit(node, owner = '') {
    const cls = ts.isClassDeclaration(node) && node.name ? node.name.text : owner;
    if (ts.isMethodDeclaration(node) && `${cls}.${node.name.getText(ast).replace(/["']/g, '')}` === symbol) found = true;
    if (ts.isFunctionDeclaration(node) && node.name?.text === symbol) found = true;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === symbol) found = true;
    for (const child of node.getChildren(ast)) visit(child, cls);
  }
  visit(ast);
  return found;
}
function targetInfo(file, symbol) {
  const { ast } = source(file);
  const [className, memberName] = symbol.includes('.') ? symbol.split('.', 2) : ['', symbol];
  let result = null;
  const parameterSignature = (parameter) => {
    const optional = parameter.questionToken || parameter.initializer ? '?' : '';
    const type = parameter.type?.getText(ast) || (parameter.initializer ? `default(${parameter.initializer.getText(ast)})` : 'inferred');
    return `${parameter.name.getText(ast)}${optional}: ${type}`;
  };
  function visit(node, owner = '') {
    const cls = ts.isClassDeclaration(node) && node.name ? node.name.text : owner;
    if (className && cls === className && ts.isMethodDeclaration(node) && node.name.getText(ast).replace(/["']/g, '') === memberName) {
      const visibility = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) ? 'private' : node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public';
      result = { visibility, signature: `${symbol}(${node.parameters.map(parameterSignature).join(', ')}): ${node.type?.getText(ast) || 'inferred'}` };
    }
    if (!className && ts.isFunctionDeclaration(node) && node.name?.text === memberName) {
      const visibility = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ? 'exported' : 'module-private';
      result = { visibility, signature: `${symbol}(${node.parameters.map(parameterSignature).join(', ')}): ${node.type?.getText(ast) || 'inferred'}` };
    }
    if (!className && ts.isVariableDeclaration(node) && node.name.getText(ast) === memberName && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      const declaration = node.parent.parent;
      const visibility = declaration.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ? 'exported' : 'module-private';
      const fn = node.initializer;
      result = { visibility, signature: `${symbol}(${fn.parameters.map(parameterSignature).join(', ')}): ${fn.type?.getText(ast) || 'inferred'}` };
    }
    for (const child of node.getChildren(ast)) visit(child, cls);
  }
  visit(ast);
  return result;
}

function inspectPlaceholders(value, at = 'traceability') {
  if (Array.isArray(value)) return value.forEach((entry, i) => inspectPlaceholders(entry, `${at}[${i}]`));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /freeze_in_P0|freeze exact|TBD|unknown legacy tracked|preserve semantic constraints and report legacy exceptions|documented service\/repository\/validation mapping|not_run/i.test(value)) fail(`${at}: unresolved placeholder: ${value}`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('planned')) fail(`${at}.${key}: planned placeholder field remains`);
    if (key === 'status' && child === 'planned') fail(`${at}: planned status remains`);
    inspectPlaceholders(child, `${at}.${key}`);
  }
}
inspectPlaceholders(trace);
if (trace.planOnly !== false) fail('planOnly must be false after implementation mapping');

const ds = new DataSource({ type: 'postgres', url: 'postgres://traceability:offline@127.0.0.1/traceability', entities: [...ALL_ENTITIES] });
await ds.buildMetadatas();
const byTable = new Map(ds.entityMetadatas.map((m) => [m.tableName, m]));
const byClass = new Map(trace.sourceEntities.map((e) => [e.sourceClass, e]));
const metadata = (table) => byTable.get(table);

for (const entity of trace.sourceEntities) {
  const orm = metadata(entity.physicalTable);
  if (!orm) { fail(`${entity.sourceClass}: no compiled TypeORM entity for table ${entity.physicalTable}`); continue; }
  for (const row of entity.attributeMappings) {
    const at = `${entity.sourceClass}.${row.sourceAttribute}`;
    if (!row.mappingComplete || row.status === 'planned') fail(`${at}: mapping is not marked complete`);
    if (!row.actualMapping?.columns?.length) { fail(`${at}: no resolved physical/projection columns`); continue; }
    if (!row.actualMapping.sourceVisibility || !row.actualMapping.targetVisibility || !row.targetTypeNullabilityAndVisibility) fail(`${at}: missing source/target visibility and type/nullability record`);
    for (const column of row.actualMapping.columns) {
      const target = metadata(column.table);
      const actual = target?.columns.find((c) => c.databaseName === column.column);
      if (!actual) { fail(`${at}: unresolved physical column ${column.table}.${column.column}`); continue; }
      if (actual.type !== column.postgresType.split('(')[0]) fail(`${at}: stale PostgreSQL type for ${column.table}.${column.column}: trace says ${column.postgresType}, ORM says ${actual.type}`);
      if (actual.isNullable !== column.nullable) fail(`${at}: nullability drift for ${column.table}.${column.column}`);
      if (!column.tsDeclaredType || !column.tsVisibility) fail(`${at}: missing declared TypeScript type/visibility for ${column.ormProperty}`);
      const tsMember = classMember(entity.targetFile, entity.targetClass, column.ormProperty);
      if (tsMember && (tsMember.type !== column.tsDeclaredType || tsMember.visibility !== column.tsVisibility)) fail(`${at}: TypeScript declaration drift for ${entity.targetClass}.${column.ormProperty}`);
    }
    if (/NOT NULL/i.test(row.sourceConstraints) && row.actualMapping.columns.some((c) => c.nullable) && !row.actualMapping.deviations.some((d) => /nullable|NULL/i.test(d))) fail(`${at}: nullable target differs from source NOT NULL with no documented deviation`);
  }
}

for (const relation of trace.relationships) {
  const map = relation.actualMapping;
  const child = byClass.get(relation.sourceChild);
  const parent = byClass.get(relation.sourceParent);
  const childMeta = child && metadata(child.physicalTable);
  const parentMeta = parent && metadata(parent.physicalTable);
  const column = childMeta?.columns.find((c) => c.databaseName === map?.column);
  const [refTable, refColumn] = (map?.references || '').split('.');
  if (!map?.column || !map?.references || !column) { fail(`${relation.id}: missing actual FK column`); continue; }
  if (map.table !== child?.physicalTable) fail(`${relation.id}: child ${relation.sourceChild} maps to ${map.table}, expected ${child?.physicalTable}`);
  if (map.multiHop) {
    const intermediate = byClass.get(map.intermediateClass);
    if (refTable !== intermediate?.physicalTable) fail(`${relation.id}: immediate FK target ${refTable} does not match intermediate class ${map.intermediateClass}`);
    if (!metadata(refTable)?.columns.some((c) => c.databaseName === refColumn)) fail(`${relation.id}: immediate referenced column ${map.references} does not exist`);
    const [left, right] = map.multiHop.split(' -> ');
    const [leftTable, leftColumn] = left.split('.');
    const [rightTable, rightColumn] = right.split('.');
    if (!metadata(leftTable)?.columns.some((c) => c.databaseName === leftColumn)) fail(`${relation.id}: multi-hop column ${left} does not exist`);
    if (!metadata(rightTable)?.columns.some((c) => c.databaseName === rightColumn)) fail(`${relation.id}: multi-hop target ${right} does not exist`);
    if (rightTable !== parent?.physicalTable) fail(`${relation.id}: multi-hop ends at ${rightTable}, expected source parent table ${parent?.physicalTable}`);
    const [rightRefTable, rightRefColumn] = right.split('.');
    const [leftRefTable, leftRefColumn] = left.split('.');
    const hopFk = new RegExp(`${leftRefColumn}\\s+[^,\\n]*\\bREFERENCES\\s+${rightRefTable}\\s*\\(\\s*${rightRefColumn}\\s*\\)`, 'i');
    if (!hopFk.test(migration)) fail(`${relation.id}: multi-hop FK ${left} -> ${right} is absent from migration SQL`);
  } else {
    if (refTable !== parent?.physicalTable) fail(`${relation.id}: parent ${relation.sourceParent} maps to ${refTable}, expected ${parent?.physicalTable}`);
    if (!parentMeta?.columns.some((c) => c.databaseName === refColumn)) fail(`${relation.id}: referenced column ${map.references} does not exist`);
  }
  if (column.isNullable !== map.nullable) fail(`${relation.id}: recorded nullability differs from ORM metadata`);
  const rel = childMeta.relations.find((r) => r.joinColumns.some((j) => j.databaseName === map.column));
  if (rel && (rel.propertyName !== map.relationProperty || rel.relationType !== map.relationKind)) fail(`${relation.id}: recorded TypeORM relation metadata drift`);
  if (map.unique) {
    const pattern = new RegExp(`${map.column}\\s+[^,\\n]*\\bUNIQUE\\b`, 'i');
    if (!pattern.test(migration)) fail(`${relation.id}: unique FK claim is not present in checked-in migration SQL`);
  }
  const fkPattern = new RegExp(`${map.column}\\s+[^,\\n]*\\bREFERENCES\\s+${refTable}\\s*\\(\\s*${refColumn}\\s*\\)`, 'i');
  if (!fkPattern.test(migration)) fail(`${relation.id}: FK constraint is not present in checked-in migration SQL: ${map.table}.${map.column} -> ${map.references}`);
  if (!relation.mappingComplete || relation.status === 'planned') fail(`${relation.id}: mapping is not marked complete`);
  if (!relation.testReferences?.some((r) => r.file && r.test && r.coverage)) fail(`${relation.id}: missing honest grouped test reference`);
}

for (const controller of trace.controllers) for (const row of controller.methods) {
  const at = `${controller.sourceClass}.${row.sourceMethod}`;
  if (!row.mappingComplete || row.status === 'planned') fail(`${at}: method mapping is incomplete`);
  const target = row.methodMapping;
  if (!target?.targetFile || !target.targetSymbol || !target.targetSignature || !target.targetVisibility) fail(`${at}: missing target signature/visibility`);
  else {
    const actual = targetInfo(target.targetFile, target.targetSymbol);
    if (!actual) fail(`${at}: TypeScript target symbol not found: ${target.targetFile}#${target.targetSymbol}`);
    else {
      if (target.targetSignature !== actual.signature) fail(`${at}: recorded target signature drift for ${target.targetSymbol}; expected ${actual.signature}`);
      if (target.targetVisibility !== actual.visibility) fail(`${at}: recorded target visibility drift for ${target.targetSymbol}; expected ${actual.visibility}`);
    }
  }
  if (!row.signatureMapping || /freeze|TBD/i.test(row.signatureMapping)) fail(`${at}: signature mapping placeholder`);
  const explicitUiGap = typeof row.uiMapping?.uiGap === 'string' && row.uiMapping.uiGap.length > 0;
  if ((!row.uiMapping?.routeFamily?.length && !explicitUiGap) || !row.uiMapping?.handlerState || /freeze|TBD/i.test(row.uiMapping.handlerState)) fail(`${at}: UI route/handler mapping missing`);
  for (const reference of row.uiMapping?.routeFamily || []) {
    const [uiFile, handlerList = ''] = reference.split('#');
    if (!fs.existsSync(path.join(root, uiFile))) { fail(`${at}: UI file missing: ${uiFile}`); continue; }
    const text = fs.readFileSync(path.join(root, uiFile), 'utf8');
    for (const handler of handlerList.split(',').filter(Boolean)) {
      const handlerPattern = new RegExp(`(?:function|const|let|var)\\s+${handler}\\b`);
      if (!handlerPattern.test(text)) fail(`${at}: UI handler ${handler} not found in ${uiFile}`);
    }
  }
  for (const route of row.actualRouteOperations || []) {
    if (!contract.paths[route.path]?.[route.method.toLowerCase()]) fail(`${at}: route absent from OpenAPI: ${route.method} ${route.path}`);
  }
  if (!row.testReferences?.some((r) => r.file && r.test && r.coverage)) fail(`${at}: missing real suite/test reference with coverage limits`);
}

for (const operation of trace.technicalOperations) {
  const [file, symbol] = (operation.actualTargetSymbol || '').split('#');
  if (!file || !symbol || !hasSymbol(file, symbol)) fail(`${operation.operation}: technical target symbol is missing`);
  const [method, routePath] = operation.route.split(' ');
  if (!contract.paths[routePath]?.[method.toLowerCase()]) fail(`${operation.operation}: technical route is missing from OpenAPI`);
  if (!operation.testReferences?.some((r) => r.file && r.test && r.coverage)) fail(`${operation.operation}: test evidence reference/limits missing`);
}

for (const row of trace.baselineOperations) {
  if (row.status === 'planned' || !row.testReferences?.length) fail(`${row.id}: baseline operation has unresolved implementation/evidence`);
  if (!contract.paths[row.path]?.[row.method.toLowerCase()]) fail(`${row.id}: baseline operation absent from OpenAPI`);
}

for (const entity of trace.technicalEntities) {
  const meta = ds.entityMetadatas.find((item) => item.name === entity.targetClass && item.tableName === entity.physicalTable);
  if (!meta || entity.status === 'planned' || entity.actualColumnCount !== meta.columns.length) fail(`${entity.targetClass}: technical entity metadata mapping is unresolved`);
}
for (const gap of trace.gaps) {
  if (gap.status === 'planned' || !gap.testReferences?.some((r) => r.file && r.test && r.coverage)) fail(`${gap.id}: implementation gap still has placeholder status/evidence`);
  if (!gap.actualImplementationTargets?.length) fail(`${gap.id}: missing implementation targets`);
  for (const target of gap.actualImplementationTargets || []) if (!hasSymbol(target.file, target.symbol)) fail(`${gap.id}: implementation target missing ${target.file}#${target.symbol}`);
}

if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Traceability valid: ${counts.entities} entities, ${counts.attributes} attributes, ${counts.methods} methods, ${counts.relationships} relationships. Column/type/nullability/signature/route mappings resolve; behavior evidence is grouped and not row-level certification.`);
