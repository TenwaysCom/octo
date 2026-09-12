const MEEGLE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MEEGLE_UPDATED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export function normalizeMeegleDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numericTimestamp = parseUnixTimestamp(value);
  if (numericTimestamp !== undefined) return formatUtcDate(numericTimestamp);
  const text = String(value).trim();
  const dateText = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!dateText || !isValidUtcDate(dateText)) return undefined;
  return dateText;
}

export function normalizeMeegleSourceUpdatedAt(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numericTimestamp = parseUnixTimestamp(value);
  if (numericTimestamp !== undefined) return formatMeegleSourceUpdatedAt(numericTimestamp);
  const text = String(value).trim();
  const rawMatch = MEEGLE_UPDATED_AT_PATTERN.exec(text);
  if (rawMatch) {
    return isValidUtcDateTimeParts(rawMatch.slice(1).map(Number)) ? text : undefined;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? undefined : formatMeegleSourceUpdatedAt(timestamp);
}

export function parseMeegleSourceTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  const rawMatch = MEEGLE_UPDATED_AT_PATTERN.exec(text);
  if (rawMatch) {
    const parts = rawMatch.slice(1).map(Number);
    return isValidUtcDateTimeParts(parts) ? Date.UTC(...toUtcConstructorParts(parts)) : undefined;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

export function formatMeegleSourceUpdatedAt(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Meegle source timestamp");
  return `${date.getUTCFullYear()}-${twoDigits(date.getUTCMonth() + 1)}-${twoDigits(date.getUTCDate())} `
    + `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}:${twoDigits(date.getUTCSeconds())}`;
}

export function formatMeegleMqlDateTime(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Meegle MQL datetime");
  return date.toISOString();
}

function isValidUtcDate(value: string): boolean {
  const match = MEEGLE_DATE_PATTERN.exec(value);
  if (!match) return false;
  return isValidUtcDateTimeParts([...match.slice(1).map(Number), 0, 0, 0]);
}

function isValidUtcDateTimeParts(parts: number[]): boolean {
  if (parts.length !== 6) return false;
  const [year, month, day, hour, minute, second] = parts;
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const timestamp = Date.UTC(...toUtcConstructorParts(parts));
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

function toUtcConstructorParts(parts: number[]): [number, number, number, number, number, number] {
  return [parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]];
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function parseUnixTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value.trim()))) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const timestamp = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return Number.isNaN(new Date(timestamp).getTime()) ? undefined : timestamp;
}

function formatUtcDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${twoDigits(date.getUTCMonth() + 1)}-${twoDigits(date.getUTCDate())}`;
}
