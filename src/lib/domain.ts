import { DAY_MS, toTimestamp } from "./dates.ts";
import { categoryLabel, categoryPath, isDone, isOpen, normalizeCategory, resolveStage, STAGE_LABEL } from "./stage.ts";
import type {
  CustomFieldValue,
  EnrichedItem,
  InsightConfig,
  ItemRecord,
  YunxiaoWorkitem,
} from "./types.ts";

const PLAN_START_FIELDS = ["计划开始时间", "开始时间", "计划开始"];
const PLAN_END_FIELDS = ["计划完成时间", "计划结束时间", "截止时间", "期望完成时间", "完成时间"];
const PRIORITY_FIELDS = ["优先级", "Priority"];
const SEVERITY_FIELDS = ["严重程度", "Severity"];
const HOURS_FIELDS = ["预计工时", "预计工时汇总", "预估工时"];

function valuesOf(field: CustomFieldValue): string[] {
  return (field.values ?? [])
    .map((value) => value.displayValue ?? value.identifier ?? "")
    .map((value) => String(value).trim())
    .filter((value) => value !== "" && value !== "EMPTY_VALUE");
}

export function extractFieldValue(item: YunxiaoWorkitem, names: string[]): string | null {
  for (const field of item.customFieldValues ?? []) {
    if (!names.includes(field.fieldName)) continue;
    const values = valuesOf(field);
    if (values.length) return values.join(", ");
  }
  return null;
}

function extractTimestamp(item: YunxiaoWorkitem, names: string[]): number | null {
  const value = extractFieldValue(item, names);
  return value ? toTimestamp(value) : null;
}

function extractHours(item: YunxiaoWorkitem): number | null {
  for (const name of HOURS_FIELDS) {
    const value = extractFieldValue(item, [name]);
    if (!value) continue;
    const num = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return null;
}

export function priorityRank(priority: string): number {
  if (/紧急|最高|P0|blocker/i.test(priority)) return 4;
  if (/高|P1/i.test(priority)) return 3;
  if (/中|P2/i.test(priority)) return 2;
  if (/低|P3/i.test(priority)) return 1;
  return 0;
}

export function severityRank(severity: string): number {
  if (/致命|严重|blocker|critical/i.test(severity)) return 4;
  if (/高|major/i.test(severity)) return 3;
  if (/中|normal/i.test(severity)) return 2;
  if (/低|minor|轻微/i.test(severity)) return 1;
  return 0;
}

function buildUrl(config: InsightConfig, item: YunxiaoWorkitem, spaceId: string): string {
  if (!config.workitemUrlTemplate) return "";
  const category = normalizeCategory(item.categoryId);
  return config.workitemUrlTemplate
    .replaceAll("{spaceId}", encodeURIComponent(spaceId))
    .replaceAll("{projectId}", encodeURIComponent(spaceId))
    .replaceAll("{id}", encodeURIComponent(item.id))
    .replaceAll("{serial}", encodeURIComponent(item.serialNumber))
    .replaceAll("{category}", encodeURIComponent(category))
    .replaceAll("{categoryPath}", encodeURIComponent(categoryPath(category)));
}

export function enrichItem(item: ItemRecord, config: InsightConfig, now = Date.now()): EnrichedItem {
  const stage = resolveStage(item, config);
  const statusName = item.status?.displayName || item.status?.name || "未知状态";
  const createdAt = toTimestamp(item.gmtCreate);
  const updatedAt = toTimestamp(item.gmtModified);
  const statusChangedAt = toTimestamp(item.updateStatusAt);
  const done = isDone(stage);
  const canceled = stage === "canceled";
  const open = isOpen(stage);

  const planStartAt = extractTimestamp(item, PLAN_START_FIELDS);
  const planEndAt = extractTimestamp(item, PLAN_END_FIELDS);
  const priority = extractFieldValue(item, PRIORITY_FIELDS) ?? "-";
  const severity = extractFieldValue(item, SEVERITY_FIELDS) ?? "-";

  const overdueDays =
    open && planEndAt !== null && now > planEndAt
      ? Math.max(1, Math.floor((now - planEndAt) / DAY_MS))
      : 0;
  const overdue = overdueDays > 0;
  const ageDays = createdAt === null ? null : Math.max(0, Math.floor((now - createdAt) / DAY_MS));
  const idleDays = updatedAt === null ? null : Math.max(0, Math.floor((now - updatedAt) / DAY_MS));
  const stale = open && idleDays !== null && idleDays >= config.staleDays;
  const unassigned = open && !item.assignedTo?.name;

  const completedAt = done ? (statusChangedAt ?? updatedAt) : null;
  const cycleDays =
    done && completedAt !== null && createdAt !== null && completedAt >= createdAt
      ? (completedAt - createdAt) / DAY_MS
      : null;

  const riskReasons: string[] = [];
  if (overdue) riskReasons.push(`逾期 ${overdueDays} 天`);
  if (stale) riskReasons.push(`停滞 ${idleDays} 天`);
  if (unassigned) riskReasons.push("未分配负责人");
  if (!overdue && planEndAt !== null && open && now <= planEndAt && planEndAt - now <= 3 * DAY_MS) {
    riskReasons.push("3 天内到期");
  }

  return {
    ...item,
    stage,
    stageLabel: STAGE_LABEL[stage],
    statusName,
    priority,
    severity,
    planStartAt,
    planEndAt,
    estimatedHours: extractHours(item),
    createdAt,
    updatedAt,
    completedAt,
    ageDays,
    idleDays,
    cycleDays,
    overdueDays,
    overdue,
    stale,
    unassigned,
    riskReasons,
    categoryLabel: categoryLabel(normalizeCategory(item.categoryId)),
    url: buildUrl(config, item, item.projectId),
  };
}

export function enrichItems(items: ItemRecord[], config: InsightConfig, now = Date.now()): EnrichedItem[] {
  return items.map((item) => enrichItem(item, config, now));
}

/** 风险项：逾期 / 停滞 / 未分配 */
export function isRiskItem(item: EnrichedItem): boolean {
  return item.overdue || item.stale || item.unassigned;
}

export function riskScore(item: EnrichedItem): number {
  const overdue = item.overdueDays * 100;
  const stale = item.stale ? Math.min(item.idleDays ?? 0, 120) * 2 : 0;
  const unassigned = item.unassigned ? 25 : 0;
  return overdue + stale + unassigned + priorityRank(item.priority) * 3 + severityRank(item.severity);
}

export function compareRisk(a: EnrichedItem, b: EnrichedItem): number {
  const score = riskScore(b) - riskScore(a);
  if (score !== 0) return score;
  return (b.idleDays ?? 0) - (a.idleDays ?? 0);
}

export function comparePriority(a: EnrichedItem, b: EnrichedItem): number {
  const priority = priorityRank(b.priority) - priorityRank(a.priority);
  if (priority !== 0) return priority;
  return (b.severity === a.severity ? 0 : severityRank(b.severity) - severityRank(a.severity));
}
