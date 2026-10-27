import { formatDate, formatDateTime, formatMonthDay } from "./dates.ts";
import { STAGE_COLOR, STAGE_LABEL, STAGE_ORDER } from "./stage.ts";
import type { EnrichedItem, StageCounts, StageGroup } from "./types.ts";

const ANSI_RE = /\u001b\[[0-9;]*m/g;

const useColor =
  process.env.NO_COLOR !== undefined
    ? false
    : process.env.FORCE_COLOR !== undefined
      ? process.env.FORCE_COLOR !== "0"
      : Boolean(process.stdout.isTTY);

function paint(code: string, text: string): string {
  return useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export const color = {
  bold: (text: string) => paint("1", text),
  dim: (text: string) => paint("2", text),
  gray: (text: string) => paint("90", text),
  red: (text: string) => paint("31", text),
  green: (text: string) => paint("32", text),
  yellow: (text: string) => paint("33", text),
  blue: (text: string) => paint("34", text),
  magenta: (text: string) => paint("35", text),
  cyan: (text: string) => paint("36", text),
  white: (text: string) => paint("37", text),
};

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) return 0;
  // 控制字符
  if (code < 32) return 0;
  // 东亚宽字符 / 全角符号 / emoji 的大致范围
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    (code >= 0x2b00 && code <= 0x2bff) ||
    (code >= 0x1f000 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/** 终端显示宽度（中文/emoji 记 2） */
export function displayWidth(text: string): number {
  const plain = stripAnsi(text);
  let width = 0;
  for (const char of plain) width += charWidth(char);
  return width;
}

export function truncateText(text: string, maxWidth: number, ellipsis = "…"): string {
  if (maxWidth <= 0) return "";
  if (displayWidth(text) <= maxWidth) return text;
  const target = Math.max(0, maxWidth - displayWidth(ellipsis));
  let result = "";
  let width = 0;
  for (const char of text) {
    const next = width + charWidth(char);
    if (next > target) break;
    result += char;
    width = next;
  }
  return result + ellipsis;
}

function padText(text: string, width: number, align: "left" | "right" | "center" = "left"): string {
  const current = displayWidth(text);
  const gap = Math.max(0, width - current);
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + text + " ".repeat(gap - left);
  }
  return text + " ".repeat(gap);
}

export interface Column {
  header: string;
  align?: "left" | "right" | "center";
  maxWidth?: number;
}

export interface TableOptions {
  /** 列间空格数，默认 2 */
  gap?: number;
  /** 缩进 */
  indent?: string;
  /** 表头分隔线 */
  separator?: boolean;
}

export function renderTable(columns: Column[], rows: string[][], options: TableOptions = {}): string {
  const gap = options.gap ?? 2;
  const indent = options.indent ?? "";
  const widths = columns.map((column, index) => {
    let width = displayWidth(column.header);
    for (const row of rows) {
      const cell = row[index] ?? "";
      width = Math.max(width, displayWidth(cell));
    }
    if (column.maxWidth !== undefined) width = Math.min(width, column.maxWidth);
    return width;
  });

  const formatRow = (cells: string[]): string => {
    const parts = columns.map((column, index) => {
      const raw = cells[index] ?? "";
      const truncated =
        column.maxWidth !== undefined ? truncateText(raw, column.maxWidth) : raw;
      return padText(truncated, widths[index] ?? 0, column.align ?? "left");
    });
    return `${indent}${parts.join(" ".repeat(gap))}`.replace(/\s+$/u, "");
  };

  const header = formatRow(columns.map((column) => color.bold(column.header)));
  const lines = [header];
  if (options.separator !== false) {
    lines.push(
      `${indent}${widths.map((width) => color.gray("─".repeat(width))).join(" ".repeat(gap))}`,
    );
  }
  for (const row of rows) lines.push(formatRow(row));
  return lines.join("\n");
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRate(done: number, total: number, digits = 1): string {
  if (total <= 0) return "—";
  return formatPercent(done / total, digits);
}

export function formatDateTimeShort(time: number | null | undefined): string {
  if (time === null || time === undefined) return "—";
  const date = new Date(time);
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return formatMonthDay(time);
}

export function formatFullDate(time: number | null | undefined): string {
  return time === null || time === undefined ? "—" : formatDate(time);
}

export function formatFullDateTime(time: number | null | undefined): string {
  return time === null || time === undefined ? "—" : formatDateTime(time);
}

export function stageBadge(stage: StageGroup): string {
  const label = STAGE_LABEL[stage];
  switch (stage) {
    case "done":
      return color.green(label);
    case "doing":
      return color.blue(label);
    case "verify":
      return color.yellow(label);
    case "canceled":
      return color.gray(label);
    case "unknown":
      return color.red(label);
    case "todo":
    default:
      return color.white(label);
  }
}

export function priorityBadge(priority: string): string {
  if (/紧急|最高/i.test(priority)) return color.red(priority);
  if (/高/i.test(priority)) return color.yellow(priority);
  if (/低/i.test(priority)) return color.gray(priority);
  return priority;
}

const STAGE_CHAR: Record<StageGroup, string> = {
  todo: "░",
  doing: "▓",
  verify: "▒",
  done: "█",
  canceled: "·",
  unknown: "?",
};

/** 按数量比例生成状态堆叠条（带颜色） */
export function stackedBar(counts: StageCounts, width = 28): string {
  const total = STAGE_ORDER.reduce((sum, stage) => sum + counts[stage], 0);
  if (total <= 0) return color.gray("░".repeat(width));

  const raw = STAGE_ORDER.map((stage) => ({
    stage,
    value: (counts[stage] / total) * width,
  }));
  const allocated = raw.map((entry) => ({
    ...entry,
    size: Math.floor(entry.value),
    remainder: entry.value - Math.floor(entry.value),
  }));
  let used = allocated.reduce((sum, entry) => sum + entry.size, 0);
  const byRemainder = [...allocated].sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (used < width && byRemainder.length) {
    const entry = byRemainder[cursor % byRemainder.length];
    if (!entry) break;
    if (entry.value > 0) {
      entry.size += 1;
      used += 1;
    }
    cursor += 1;
    if (cursor > width * 2) break;
  }

  return allocated
    .map((entry) => {
      if (entry.size <= 0) return "";
      const char = STAGE_CHAR[entry.stage].repeat(entry.size);
      return useColor ? `\u001b[38;2;${hexToRgb(STAGE_COLOR[entry.stage])}m${char}\u001b[0m` : char;
    })
    .join("");
}

function hexToRgb(hex: string): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return "128;128;128";
  return `${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`;
}

/** 单色完成率进度条 */
export function progressBar(ratio: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  const bar = `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
  if (!useColor) return bar;
  const code = clamped >= 0.7 ? "32" : clamped >= 0.4 ? "36" : clamped >= 0.15 ? "33" : "90";
  return `\u001b[${code}m${bar}\u001b[0m`;
}

export function stageLegend(counts: StageCounts): string {
  return STAGE_ORDER.filter((stage) => counts[stage] > 0)
    .map((stage) => `${stageBadge(stage)} ${counts[stage]}`)
    .join("  ");
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function mdEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

export function mdTable(headers: string[], rows: string[][], align: Array<"left" | "right"> = []): string {
  const head = `| ${headers.map(mdEscape).join(" | ")} |`;
  const divider = `| ${headers
    .map((_, index) => (align[index] === "right" ? "---:" : "---"))
    .join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`);
  return [head, divider, ...body].join("\n");
}

export function itemRiskText(item: EnrichedItem): string {
  return item.riskReasons.length ? item.riskReasons.join(" · ") : "—";
}

export function stageColorHex(stage: StageGroup): string {
  return STAGE_COLOR[stage];
}
