export function normalizeTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const text = typeof value === "string" ? value.trim() : String(value);
  if (!text) return undefined;

  const numericValue = /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : undefined;
  const timestamp = numericValue === undefined
    ? new Date(text)
    : new Date(Math.abs(numericValue) < 100_000_000_000 ? numericValue * 1000 : numericValue);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}
