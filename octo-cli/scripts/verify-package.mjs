#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = execFileSync("pnpm", ["pack", "--dry-run", "--json"], {
  cwd: packageRoot,
  encoding: "utf8",
});
const result = JSON.parse(output);
const pack = Array.isArray(result) ? result[0] : result;
if (!pack || typeof pack !== "object" || !Array.isArray(pack.files)) {
  throw new Error("pnpm pack did not return a package file list.");
}

const files = pack.files.map(({ path }) => path).filter((path) => typeof path === "string");
const required = ["package.json", "README.md", "USAGE.md", "dist/src/index.js", "dist/src/upgrade.js"];
const forbidden = files.filter((path) => path.startsWith("dist/test/") || path.startsWith("scripts/") || path.startsWith("docs/"));
const missing = required.filter((path) => !files.includes(path));
if (missing.length || forbidden.length) {
  throw new Error(`Unexpected package contents. Missing: ${missing.join(", ") || "none"}; forbidden: ${forbidden.join(", ") || "none"}.`);
}
process.stdout.write(`${JSON.stringify({ ok: true, filename: pack.filename, files }, null, 2)}\n`);
