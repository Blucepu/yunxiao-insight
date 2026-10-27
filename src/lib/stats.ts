import { DAY_MS, formatMonthDay, startOfWeek } from "./dates.ts";
import { comparePriority, compareRisk, isRiskItem } from "./domain.ts";
import { isDone, isOpen, normalizeCategory, STAGE_ORDER } from "./stage.ts";
import type {
  AssigneeStat,
  CategoryStat,
  CycleStat,
  EnrichedItem,
  InsightConfig,
  MemberStat,
  OverallStats,
  ProjectRecord,
  ProjectStats,
  SprintRecord,
  SprintStat,
  StageCounts,
  StageGroup,
  TrendPoint,
} from "./types.ts";

const CATEGORY_ORDER = ["Req", "Bug", "Task", "Risk"];

export function emptyCounts(): StageCounts {
  return { todo: 0, doing: 0, verify: 0, done: 0, canceled: 0, unknown: 0 };
}

export function countStages(items: EnrichedItem[]): StageCounts {
  const counts = emptyCounts();
  for (const item of items) counts[item.stage] += 1;
  return counts;
}

export function sumCounts(list: StageCounts[]): StageCounts {
  const total = emptyCounts();
  for (const counts of list) {
    for (const stage of STAGE_ORDER) total[stage] += counts[stage];
  }
  return total;
}

export function rate(done: number, total: number): number {
  if (total <= 0) return 0;
  return done / total;
}

export function openCount(counts: StageCounts): number {
  return counts.todo + counts.doing + counts.verify + counts.unknown;
}

export function effectiveTotalOf(counts: StageCounts): number {
  return counts.todo + counts.doing + counts.verify + counts.done + counts.unknown;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeTrend(items: EnrichedItem[], weeks: number, now = Date.now()): TrendPoint[] {
  const count = Math.max(1, Math.round(weeks));
  const currentWeek = new Date(startOfWeek(now));
  const points: TrendPoint[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const startDate = new Date(currentWeek);
    startDate.setDate(startDate.getDate() - index * 7);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    const start = startDate.getTime();
    const end = endDate.getTime();

    let created = 0;
    let completed = 0;
    for (const item of items) {
      if (item.createdAt !== null && item.createdAt >= start && item.createdAt < end) created += 1;
      if (
        item.stage === "done" &&
        item.completedAt !== null &&
        item.completedAt >= start &&
        item.completedAt < end
      ) {
        completed += 1;
      }
    }

    points.push({
      start,
      end,
      label: formatMonthDay(start),
      created,
      completed,
    });
  }

  return points;
}

export function computeCycle(items: EnrichedItem[], recentDays: number, now = Date.now()): CycleStat {
  const cutoff = now - Math.max(1, recentDays) * DAY_MS;
  const allDone = items.filter(
    (item) => item.stage === "done" && item.cycleDays !== null && item.cycleDays >= 0,
  );
  const recent = allDone.filter((item) => (item.completedAt ?? 0) >= cutoff);
  const sampleItems = recent.length ? recent : allDone;
  if (!sampleItems.length) return { avg: null, median: null, sample: 0 };

  const values = sampleItems.map((item) => item.cycleDays ?? 0).sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0
      ? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2
      : (values[middle] ?? 0);

  return {
    avg: round1(sum / values.length),
    median: round1(median),
    sample: values.length,
  };
}

function byUpdatedAsc(a: EnrichedItem, b: EnrichedItem): number {
  return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
}

export function compareActive(a: EnrichedItem, b: EnrichedItem): number {
  const risk = compareRisk(a, b);
  if (risk !== 0) return risk;
  const priority = comparePriority(a, b);
  if (priority !== 0) return priority;
  const dueA = a.planEndAt ?? Number.MAX_SAFE_INTEGER;
  const dueB = b.planEndAt ?? Number.MAX_SAFE_INTEGER;
  if (dueA !== dueB) return dueA - dueB;
  return byUpdatedAsc(a, b);
}

function compareCompletedDesc(a: EnrichedItem, b: EnrichedItem): number {
  return (b.completedAt ?? 0) - (a.completedAt ?? 0);
}

function buildCategoryStats(items: EnrichedItem[]): CategoryStat[] {
  const groups = new Map<string, EnrichedItem[]>();
  for (const item of items) {
    const category = normalizeCategory(item.categoryId);
    const list = groups.get(category);
    if (list) list.push(item);
    else groups.set(category, [item]);
  }

  const categories = [...groups.entries()].sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a[0]);
    const indexB = CATEGORY_ORDER.indexOf(b[0]);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });

  return categories.map(([category, list]) => {
    const counts = countStages(list);
    const effective = effectiveTotalOf(counts);
    return {
      category,
      label: list[0]?.categoryLabel ?? category,
      total: list.length,
      counts,
      completionRate: rate(counts.done, effective),
    };
  });
}

function buildAssigneeStats(items: EnrichedItem[]): AssigneeStat[] {
  const groups = new Map<string, { name: string; items: EnrichedItem[] }>();
  for (const item of items) {
    const key = item.assignedTo?.id || "__unassigned__";
    const name = item.assignedTo?.name || "未分配";
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { name, items: [item] });
  }

  const result: AssigneeStat[] = [];
  for (const [key, group] of groups) {
    const counts = countStages(group.items);
    const open = openCount(counts);
    const effective = effectiveTotalOf(counts);
    result.push({
      key,
      name: group.name,
      total: group.items.length,
      counts,
      completionRate: rate(counts.done, effective),
      open,
      overdue: group.items.filter((item) => item.overdue).length,
      stale: group.items.filter((item) => item.stale).length,
      active: group.items.filter((item) => isOpen(item.stage)).sort(compareActive),
      recentDone: group.items.filter((item) => isDone(item.stage)).sort(compareCompletedDesc),
    });
  }

  return result.sort((a, b) => {
    if (a.key === "__unassigned__") return 1;
    if (b.key === "__unassigned__") return -1;
    if (b.open !== a.open) return b.open - a.open;
    return b.total - a.total;
  });
}

function buildSprintStats(items: EnrichedItem[], sprints: SprintRecord[], now: number): SprintStat[] {
  const sprintMap = new Map(sprints.map((sprint) => [sprint.id, sprint]));
  const groups = new Map<string, EnrichedItem[]>();
  for (const item of items) {
    const key = item.sprint?.id || "__none__";
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const result: SprintStat[] = [];
  for (const [key, group] of groups) {
    const meta = sprintMap.get(key);
    const counts = countStages(group);
    const effective = effectiveTotalOf(counts);
    const open = openCount(counts);
    const endAt = meta?.endDate ?? null;
    const overdue = endAt !== null && now > endAt ? open : 0;
    result.push({
      id: key,
      name: meta?.name ?? group[0]?.sprint?.name ?? "无迭代",
      status: meta?.status ?? "—",
      startAt: meta?.startDate ?? null,
      endAt,
      total: group.length,
      counts,
      completionRate: rate(counts.done, effective),
      open,
      overdue,
    });
  }

  return result.sort((a, b) => {
    if (a.id === "__none__") return 1;
    if (b.id === "__none__") return -1;
    if (a.endAt !== null && b.endAt !== null && a.endAt !== b.endAt) return a.endAt - b.endAt;
    if (a.endAt === null && b.endAt !== null) return 1;
    if (a.endAt !== null && b.endAt === null) return -1;
    return b.total - a.total;
  });
}

export function buildProjectStats(
  project: ProjectRecord,
  items: EnrichedItem[],
  sprints: SprintRecord[],
  config: InsightConfig,
  now = Date.now(),
): ProjectStats {
  const counts = countStages(items);
  const effectiveTotal = effectiveTotalOf(counts);
  const weekStart = startOfWeek(now);
  const thisWeekCompleted = items.filter(
    (item) => item.stage === "done" && item.completedAt !== null && item.completedAt >= weekStart,
  ).length;
  const thisWeekCreated = items.filter(
    (item) => item.createdAt !== null && item.createdAt >= weekStart,
  ).length;

  let lastActivityAt: number | null = null;
  for (const item of items) {
    if (item.updatedAt !== null && (lastActivityAt === null || item.updatedAt > lastActivityAt)) {
      lastActivityAt = item.updatedAt;
    }
  }

  return {
    project,
    items,
    total: items.length,
    counts,
    effectiveTotal,
    completionRate: rate(counts.done, effectiveTotal),
    startRate: rate(counts.doing + counts.verify + counts.done, effectiveTotal),
    open: openCount(counts),
    overdue: items.filter((item) => item.overdue).length,
    stale: items.filter((item) => item.stale).length,
    unassigned: items.filter((item) => item.unassigned).length,
    byCategory: buildCategoryStats(items),
    byAssignee: buildAssigneeStats(items),
    bySprint: buildSprintStats(items, sprints, now),
    trend: computeTrend(items, config.trendWeeks, now),
    cycle: computeCycle(items, config.recentDays, now),
    risks: items.filter(isRiskItem).sort(compareRisk),
    thisWeekCreated,
    thisWeekCompleted,
    lastActivityAt,
  };
}

export function buildMemberStats(
  items: EnrichedItem[],
  config: InsightConfig,
  now = Date.now(),
): MemberStat[] {
  const weekStart = startOfWeek(now);
  const recentCutoff = now - Math.max(1, config.recentDays) * DAY_MS;
  const groups = new Map<string, { name: string; items: EnrichedItem[] }>();

  for (const item of items) {
    if (!item.assignedTo?.name) continue;
    const key = item.assignedTo.id || `name:${item.assignedTo.name}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { name: item.assignedTo.name, items: [item] });
  }

  const result: MemberStat[] = [];
  for (const [key, group] of groups) {
    const counts = countStages(group.items);
    const open = openCount(counts);
    const effective = effectiveTotalOf(counts);
    const doneItems = group.items.filter((item) => isDone(item.stage)).sort(compareCompletedDesc);
    const recentDone = doneItems.filter((item) => (item.completedAt ?? 0) >= recentCutoff);
    result.push({
      key,
      name: group.name,
      projectIds: [...new Set(group.items.map((item) => item.projectId))],
      total: group.items.length,
      counts,
      completionRate: rate(counts.done, effective),
      open,
      overdue: group.items.filter((item) => item.overdue).length,
      stale: group.items.filter((item) => item.stale).length,
      thisWeekCompleted: group.items.filter(
        (item) => item.stage === "done" && item.completedAt !== null && item.completedAt >= weekStart,
      ).length,
      active: group.items.filter((item) => isOpen(item.stage)).sort(compareActive),
      recentDone: (recentDone.length ? recentDone : doneItems).slice(0, 20),
    });
  }

  return result.sort((a, b) => {
    if (b.open !== a.open) return b.open - a.open;
    return b.total - a.total;
  });
}

export function buildOverallStats(
  projects: ProjectRecord[],
  items: EnrichedItem[],
  sprints: Record<string, SprintRecord[]>,
  config: InsightConfig,
  now = Date.now(),
): OverallStats {
  const projectStats = projects.map((project) => {
    const projectItems = items.filter((item) => item.projectId === project.id);
    return buildProjectStats(project, projectItems, sprints[project.id] ?? [], config, now);
  });

  const counts = countStages(items);
  const effectiveTotal = effectiveTotalOf(counts);
  const weekStart = startOfWeek(now);

  return {
    generatedAt: now,
    organizationId: "",
    projectCount: projects.length,
    total: items.length,
    counts,
    effectiveTotal,
    completionRate: rate(counts.done, effectiveTotal),
    open: openCount(counts),
    overdue: items.filter((item) => item.overdue).length,
    stale: items.filter((item) => item.stale).length,
    unassigned: items.filter((item) => item.unassigned).length,
    thisWeekCreated: items.filter((item) => item.createdAt !== null && item.createdAt >= weekStart).length,
    thisWeekCompleted: items.filter(
      (item) => item.stage === "done" && item.completedAt !== null && item.completedAt >= weekStart,
    ).length,
    cycle: computeCycle(items, config.recentDays, now),
    trend: computeTrend(items, config.trendWeeks, now),
    projects: projectStats.sort((a, b) => b.total - a.total),
    members: buildMemberStats(items, config, now),
    risks: items.filter(isRiskItem).sort(compareRisk),
    items,
  };
}
