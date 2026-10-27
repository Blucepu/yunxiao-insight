import { DAY_MS } from "../lib/dates.ts";
import type { EnrichedItem, OverallStats, ProjectStats, StageGroup } from "../lib/types.ts";
import type {
  ExploreBuildOptions,
  ExploreChild,
  ExploreData,
  ExploreItem,
  ExploreProject,
  ExploreSprint,
} from "./types.ts";

const DUE_SOON_MS = 3 * DAY_MS;

function childSummary(children: EnrichedItem[]): {
  children: ExploreChild[];
  childTotal: number;
  childEffective: number;
  childDone: number;
  childRate: number;
} {
  const list: ExploreChild[] = children
    .map((child) => ({
      id: child.id,
      serial: child.serialNumber,
      subject: child.subject,
      stage: child.stage,
      stageLabel: child.stageLabel,
    }))
    .sort((a, b) => a.serial.localeCompare(b.serial, "zh-CN", { numeric: true }));

  const childTotal = children.length;
  const childDone = children.filter((child) => child.stage === "done").length;
  const childCanceled = children.filter((child) => child.stage === "canceled").length;
  const childEffective = childTotal - childCanceled;
  return {
    children: list,
    childTotal,
    childEffective,
    childDone,
    childRate: childEffective > 0 ? childDone / childEffective : 0,
  };
}

function buildItem(
  item: EnrichedItem,
  now: number,
  byId: Map<string, EnrichedItem>,
  childrenByParent: Map<string, EnrichedItem[]>,
): ExploreItem {
  const sprintId = item.sprint?.id ?? "";
  const open = item.stage !== "done" && item.stage !== "canceled";
  const dueSoon =
    open &&
    !item.overdue &&
    item.planEndAt !== null &&
    item.planEndAt >= now &&
    item.planEndAt - now <= DUE_SOON_MS;

  const child = childSummary(childrenByParent.get(item.id) ?? []);

  return {
    id: item.id,
    serial: item.serialNumber,
    subject: item.subject,
    projectId: item.projectId,
    projectName: item.projectName,
    category: item.categoryId,
    categoryLabel: item.categoryLabel,
    type: item.workitemType?.name ?? "",
    stage: item.stage,
    stageLabel: item.stageLabel,
    status: item.statusName,
    assignee: item.assignedTo?.name ?? "",
    creator: item.creator?.name ?? "",
    sprintId,
    sprintName: item.sprint?.name ?? "",
    priority: item.priority,
    severity: item.severity,
    labels: (item.labels ?? []).map((label) => label.name).filter(Boolean),
    planStartAt: item.planStartAt,
    planEndAt: item.planEndAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
    estimatedHours: item.estimatedHours,
    overdueDays: item.overdueDays,
    idleDays: item.idleDays,
    cycleDays: item.cycleDays,
    ageDays: item.ageDays,
    open,
    overdue: item.overdue,
    stale: item.stale,
    unassigned: item.unassigned,
    dueSoon,
    riskReasons: item.riskReasons,
    url: item.url,
    parentId: item.parentId ?? "",
    parentSerial: item.parentId ? (byId.get(item.parentId)?.serialNumber ?? "") : "",
    children: child.children,
    childTotal: child.childTotal,
    childEffective: child.childEffective,
    childDone: child.childDone,
    childRate: child.childRate,
  };
}

function buildProjects(stats: OverallStats): ExploreProject[] {
  return stats.projects.map((project: ProjectStats) => ({
    id: project.project.id,
    name: project.project.name,
    description: project.project.description ?? "",
    total: project.total,
    effective: project.effectiveTotal,
    done: project.counts.done,
    rate: project.completionRate,
    open: project.open,
    overdue: project.overdue,
    stale: project.stale,
    unassigned: project.unassigned,
    lastActivityAt: project.lastActivityAt,
  }));
}

function buildSprints(stats: OverallStats): Record<string, ExploreSprint> {
  const result: Record<string, ExploreSprint> = {};
  for (const project of stats.projects) {
    for (const sprint of project.bySprint) {
      if (sprint.id === "__none__") continue;
      // 迭代 id 理论上全局唯一；若不同项目复用 id，保留第一个，避免互相覆盖。
      if (result[sprint.id]) continue;
      const canceled = sprint.counts.canceled;
      result[sprint.id] = {
        id: sprint.id,
        projectId: project.project.id,
        name: sprint.name,
        status: sprint.status,
        startAt: sprint.startAt,
        endAt: sprint.endAt,
        total: sprint.total,
        effective: sprint.total - canceled,
        done: sprint.counts.done,
        rate: sprint.completionRate,
        open: sprint.open,
      };
    }
  }
  return result;
}

/**
 * 把统计结果整理成纯页面数据。
 *
 * 注意：这里刻意不接收 Runtime / InsightConfig，避免任何凭证或本地路径进入页面。
 */
export function buildExploreData(stats: OverallStats, options: ExploreBuildOptions): ExploreData {
  const now = options.generatedAt;
  const byId = new Map(stats.items.map((item) => [item.id, item]));
  const childrenByParent = new Map<string, EnrichedItem[]>();
  for (const item of stats.items) {
    if (!item.parentId) continue;
    const list = childrenByParent.get(item.parentId);
    if (list) list.push(item);
    else childrenByParent.set(item.parentId, [item]);
  }

  const items = stats.items
    .map((item) => buildItem(item, now, byId, childrenByParent))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const publicView = Boolean(options.publicView);

  return {
    meta: {
      version: 1,
      title: options.title || "云效工作项探索器",
      generatedAt: options.generatedAt,
      fetchedAt: options.fetchedAt,
      now,
      itemCount: stats.total,
      projectCount: stats.projectCount,
      counts: stats.counts,
      effectiveTotal: stats.effectiveTotal,
      completionRate: stats.completionRate,
      open: stats.open,
      overdue: stats.overdue,
      stale: stats.stale,
      unassigned: stats.unassigned,
      thisWeekCreated: stats.thisWeekCreated,
      thisWeekCompleted: stats.thisWeekCompleted,
      errors: publicView ? [] : (options.errors ?? []),
      excludedProjects: publicView ? [] : (options.excludedProjects ?? []),
      publicView,
      liveUrl: options.liveUrl ?? "",
      refreshCommand: publicView ? "" : (options.refreshCommand ?? ""),
    },
    projects: buildProjects(stats),
    sprints: buildSprints(stats),
    items,
  };
}

export type { StageGroup };
