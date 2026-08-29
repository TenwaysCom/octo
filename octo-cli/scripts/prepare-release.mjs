#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(requiredArg(args, "base-url"));
const outputDir = resolve(packageRoot, args.get("output-dir") ?? "release");
const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const version = parseVersion(packageJson.version);
const tarballName = `octo-cli-${version}.tgz`;
const tarballPath = resolve(outputDir, tarballName);
const manifestPath = resolve(outputDir, "latest.json");

await mkdir(outputDir, { recursive: true, mode: 0o755 });
execFileSync("pnpm", ["pack", "--out", tarballPath], { cwd: packageRoot, stdio: "inherit" });
const contents = await readFile(tarballPath);
const metadata = await stat(tarballPath);
const manifest = {
  schemaVersion: 1,
  package: "@tenways/octo-cli",
  version,
  publishedAt: new Date().toISOString(),
  artifact: {
    url: new URL(tarballName, baseUrl).toString(),
    sha256: createHash("sha256").update(contents).digest("hex"),
    size: metadata.size,
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
process.stdout.write(`${JSON.stringify({ tarballPath, manifestPath, manifest }, null, 2)}\n`);

function parseArgs(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") continue;
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const name = value.slice(2);
    const argument = values[index + 1];
    if (!argument || argument.startsWith("--")) throw new Error(`Flag --${name} requires a value.`);
    result.set(name, argument);
    index += 1;
  }
  return result;
}

function requiredArg(args, name) {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`Missing required flag --${name}.`);
  return value;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("--base-url must be an absolute HTTPS URL without credentials, query, or fragment.");
  }
  return url.pathname.endsWith("/") ? url : new URL(`${url.pathname}/`, url);
}

function parseVersion(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error("package.json version must be a stable semantic version.");
  }
  return value;
}
