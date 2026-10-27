export const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 把云效常见的多种时间格式统一成毫秒时间戳：
 * - 毫秒 / 秒级数字
 * - "2026-10-27 23:59:59"
 * - ISO 字符串
 * - "EMPTY_VALUE"、空串、null → null
 */
export function toTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "EMPTY_VALUE") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const text = String(value).trim();
  if (!text || text === "EMPTY_VALUE") return null;
  if (/^\d+$/.test(text)) {
    const num = Number(text);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num < 1e12 ? Math.round(num * 1000) : num;
  }
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 周一为一周开始 */
export function startOfWeek(time: number): number {
  const date = new Date(startOfDay(time));
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date.getTime();
}

export function addDays(time: number, days: number): number {
  return time + days * DAY_MS;
}

export function formatDate(time: number | null | undefined): string {
  if (time === null || time === undefined) return "—";
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatMonthDay(time: number | null | undefined): string {
  if (time === null || time === undefined) return "—";
  const d = new Date(time);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(time: number | null | undefined): string {
  if (time === null || time === undefined) return "—";
  const d = new Date(time);
  return `${formatDate(time)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isoDate(time: number): string {
  return formatDate(time);
}

export function isoDateTime(time: number): string {
  return new Date(time).toISOString();
}

/** 整数天差（向下取整，可为负） */
export function dayDiff(later: number, earlier: number): number {
  return Math.floor((later - earlier) / DAY_MS);
}

/** 把天数格式化为友好文本 */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return "—";
  if (days < 1) return "<1 天";
  if (days < 30) return `${Math.round(days * 10) / 10} 天`;
  return `${Math.round((days / 30) * 10) / 10} 个月`;
}

/** 距今多久（用于缓存时间、最近更新） */
export function relativeTime(time: number | null | undefined, now = Date.now()): string {
  if (time === null || time === undefined) return "—";
  const diff = now - time;
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

/** 日期字符串（YYYY-MM-DD）→ 当天 00:00 时间戳 */
export function parseDateStart(text: string): number | null {
  const ts = toTimestamp(`${text.trim()} 00:00:00`);
  return ts === null ? null : startOfDay(ts);
}

/** 日期字符串（YYYY-MM-DD）→ 当天 23:59:59.999 时间戳 */
export function parseDateEnd(text: string): number | null {
  const ts = toTimestamp(`${text.trim()} 23:59:59`);
  return ts === null ? null : ts;
}

export function nowTime(): number {
  return Date.now();
}
