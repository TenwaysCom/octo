#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function validateReleasePreflight(packageJson, tag) {
  const version = packageJson?.version;
  if (!isStableVersion(version)) {
    return failure("package.json version must be a stable semantic version.", { version: version ?? null });
  }
  if (tag === undefined) return { ok: true, data: { version } };
  if (tag !== `octo-cli-v${version}`) {
    return failure("Release tag does not match the package version.", {
      version,
      tag,
    }, `Use octo-cli-v${version}.`);
  }
  return { ok: true, data: { version, tag } };
}

function failure(message, observed, hint) {
  return {
    ok: false,
    error: { type: "release_preflight", message, observed, hint },
  };
}

function isStableVersion(value) {
  return typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

async function main() {
  const tag = parseTag(process.argv.slice(2));
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
  const result = validateReleasePreflight(packageJson, tag);
  (result.ok ? process.stdout : process.stderr).write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

function parseTag(args) {
  const values = args.filter((value) => value !== "--");
  if (values.length === 0) return undefined;
  if (values.length === 2 && values[0] === "--tag" && values[1]) return values[1];
  throw new Error("Expected no arguments or --tag octo-cli-vX.Y.Z.");
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(failure("Could not read release metadata.", { reason: error.message }))}\n`);
    process.exitCode = 1;
  });
}
