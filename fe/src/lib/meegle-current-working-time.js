import { parsePlatformTimestamp } from "./formatters.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

function parseTimestamp(value) {
  const timestamp = parsePlatformTimestamp(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getMeegleCurrentWorkingDurationMs(item, nowTime = Date.now()) {
  if (!item?.currentNodeStartTime || item.membershipRemovedAt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.itemFinishTime || "")) return null;

  const startTime = parseTimestamp(item.currentNodeStartTime);
  const endTime = item.itemFinishTime ? parseTimestamp(item.itemFinishTime) : parseTimestamp(nowTime);
  if (startTime === null || endTime === null || endTime < startTime) return null;
  return endTime - startTime;
}

export function formatMeegleCurrentWorkingTime(item, nowTime = Date.now()) {
  const durationMs = getMeegleCurrentWorkingDurationMs(item, nowTime);
  if (durationMs === null) return "";

  const totalMinutes = Math.floor(durationMs / MINUTE_MS);
  if (totalMinutes < 1) return "不足 1 分钟";

  const days = Math.floor(totalMinutes / DAY_MINUTES);
  const hours = Math.floor((totalMinutes % DAY_MINUTES) / HOUR_MINUTES);
  const minutes = totalMinutes % HOUR_MINUTES;
  if (days) return hours ? `${days}天 ${hours}小时` : `${days}天`;
  if (hours) return minutes ? `${hours}小时 ${minutes}分钟` : `${hours}小时`;
  return `${minutes}分钟`;
}
