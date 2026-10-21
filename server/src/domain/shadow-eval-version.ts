import { createHash } from "node:crypto";

// Hash only the public projection. Private Wiki excerpts and credentials never enter an Eval sample.
export function shadowEvalVersion(value: object): string {
  const { evalVersion: _ignored, ...output } = value as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(canonical(output))).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}
