import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../apps/api/src/', import.meta.url);
const output = new URL('../apps/web/src/lib/shared/http/public-errors.generated.ts', import.meta.url);
const codes = { validation: 'VALIDATION_FAILED', conflict: 'CONFLICT' };
const messages = new Map();

// Only literal copy from domain errors and explicit DTO messages is public.
function add(code, message) {
    if (!code || !message) return;
    if (!messages.has(code)) messages.set(code, new Set());
    messages.get(code).add(message);
}

for (const path of readdirSync(root, { recursive: true }).filter(path => path.endsWith('.ts'))) {
    const source = ts.createSourceFile(path, readFileSync(new URL(path, root), 'utf8'), ts.ScriptTarget.Latest, true);
    const literal = node => node && ts.isStringLiteral(node) ? node.text : undefined;
    function visit(node) {
        if (ts.isNewExpression(node) && node.expression.getText(source) === 'DomainError') {
            add(literal(node.arguments?.[0]), literal(node.arguments?.[1]));
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText(source) === 'DomainError') {
            add(codes[node.expression.name.text], literal(node.arguments[0]));
        }
        if (path.endsWith('domain-error.ts') && ts.isMethodDeclaration(node)) {
            add(codes[node.name.getText(source)], literal(node.parameters[0]?.initializer));
        }
        if (path.endsWith('.dto.ts') && ts.isPropertyAssignment(node) && node.name.getText(source) === 'message') {
            add('VALIDATION_FAILED', literal(node.initializer));
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
}

const result = Object.fromEntries([...messages.keys()].sort().map(code => [code, [...messages.get(code)].sort()]));
const contents = '// Dibuat oleh scripts/generate-public-errors.mjs. Sunting pesan pada sumbernya.\n' +
    'export const publicErrors: Record<string, readonly string[]> = ' + JSON.stringify(result, null, 4) + ';\n';
if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== contents) {
        console.error('Jalankan node scripts/generate-public-errors.mjs untuk memperbarui pesan API.');
        process.exitCode = 1;
    }
} else {
    writeFileSync(output, contents);
}
