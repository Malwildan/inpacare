const { cpSync, existsSync, mkdirSync } = require("node:fs");
const source = "src/database/migrations";
mkdirSync("dist/database/migrations", { recursive: true });
if (existsSync(source)) {
  for (const file of require("node:fs").readdirSync(source)) {
    if (file.endsWith(".sql"))
      cpSync(`${source}/${file}`, `dist/database/migrations/${file}`);
  }
}
