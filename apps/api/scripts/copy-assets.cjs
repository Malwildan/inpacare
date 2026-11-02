const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const root = resolve(__dirname, "..");
const source = resolve(root, "src/infrastructure/database/migrations");
const destination = resolve(root, "dist/infrastructure/database/migrations");
mkdirSync(destination, { recursive: true });
if (existsSync(source)) {
  for (const file of require("node:fs").readdirSync(source)) {
    if (file.endsWith(".sql"))
      cpSync(`${source}/${file}`, `${destination}/${file}`);
  }
}
