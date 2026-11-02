const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const sourceRoot = path.resolve(__dirname, "../../src");
function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith(".ts") ? [file] : [];
  });
}
test("core layers have no framework, persistence or HTTP dependency", () => {
  for (const layer of ["domain", "application", "infrastructure", "presentation"]) {
    const members = files(path.join(sourceRoot, layer));
    assert.ok(members.length, `${layer} must contain its implementation`);
    for (const file of members) {
      const body = fs.readFileSync(file, "utf8");
      const ast = ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true);
      const check = specifier => {
        if (!specifier.startsWith(".")) {
          if (["domain", "application"].includes(layer))
            assert.ok(!/^(@nestjs\/|(?:typeorm|express|class-validator|class-transformer|argon2|pg)(?:\/|$))/.test(specifier), `${file}: core imports ${specifier}`);
          return;
        }
        const target = path.relative(sourceRoot, path.resolve(path.dirname(file), specifier)).replaceAll("\\", "/");
        const targetLayer = target.split("/")[0];
        const allowed = { domain: ["domain"], application: ["domain", "application"], infrastructure: ["domain", "application", "infrastructure"], presentation: ["domain", "application", "presentation"] }[layer];
        assert.ok(allowed.includes(targetLayer), `${file}: ${layer} imports ${target}`);
      };
      const visit = node => {
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) check(node.argument.literal.text);
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(ast);
      if (["domain", "application", "presentation"].includes(layer))
        assert.ok(!/\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/i.test(body), `${file}: SQL belongs to infrastructure`);
    }
  }
});
test("retired modules and common directories contain no implementation", () => {
  for (const directory of ["modules", "common"]) assert.deepEqual(files(path.join(sourceRoot, directory)), [], `${directory} must be removed after the refactor`);
  assert.deepEqual(files(path.join(sourceRoot, "database")).map(file => path.basename(file)), ["cli.ts"], "only the stable CLI entry point remains outside infrastructure");
});
