const { rmSync } = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
if (path.dirname(output) !== root || path.basename(output) !== "dist") throw new Error("Unexpected API build output path");
// A moved source file must not leave a second, stale implementation in the release.
rmSync(output, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc")], { cwd: root, stdio: "inherit" });
require("./copy-assets.cjs");
