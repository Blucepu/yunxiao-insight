import { ensureSnapshot, syncedProjectIdsOf } from "./sync.ts";
import { isProjectExcluded, selectProjects } from "./projects.ts";
import { enrichItems } from "./domain.ts";
import { buildOverallStats } from "./stats.ts";
import type { ProjectCandidate } from "./prompt.ts";
import type { EnrichedItem, InsightConfig, OverallStats, ProjectRecord, Runtime, Snapshot } from "./types.ts";

export interface LoadOptions {
  projectSelectors?: string[];
  refresh?: boolean;
  offline?: boolean;
  onLog?: (message: string) => void;
  config?: InsightConfig;
}

export interface LoadedSelection {
  snapshot: Snapshot;
  projects: ProjectRecord[];
  fromCache: boolean;
  ageMs: number;
}

/** 获取快照 + 解析项目；所选项目尚未同步时自动增量补拉 */
export async function loadSelection(runtime: Runtime, options: LoadOptions = {}): Promise<LoadedSelection> {
  const config = options.config ?? runtime.config;
  const effectiveRuntime = { ...runtime, config };
  const selectors = options.projectSelectors ?? [];

  let result = await ensureSnapshot(effectiveRuntime, {
    projectSelectors: selectors,
    refresh: options.refresh,
    offline: options.offline,
    onLog: options.onLog,
  });

  let projects: ProjectRecord[];
  try {
    projects = selectProjects(result.snapshot.projects, selectors, config.excludeProjects, config.projectAliases);
  } catch (error) {
    if (options.offline) throw error;
    // 缓存可能来自上次的部分同步，项目列表不完整 → 强制全量刷新一次
    options.onLog?.("缓存中的项目列表不完整，重新拉取项目列表…");
    result = await ensureSnapshot(effectiveRuntime, {
      projectSelectors: [],
      refresh: true,
      onLog: options.onLog,
    });
    projects = selectProjects(result.snapshot.projects, selectors, config.excludeProjects, config.projectAliases);
  }

  const synced = new Set(syncedProjectIdsOf(result.snapshot));
  const missing = projects.filter((project) => !synced.has(project.id));
  if (missing.length) {
    const names = missing.map((project) => project.name).join("、");
    if (options.offline) {
      throw new Error(
        `[yunxiao-insight] 本地快照尚未包含这些项目的工作项：${names}；请先运行 sync --project ${names}`,
      );
    }
    options.onLog?.(`所选项目尚未同步，正在补拉：${names}`);
    result = await ensureSnapshot(effectiveRuntime, {
      projectSelectors: selectors,
      forceProjectIds: missing.map((project) => project.id),
      onLog: options.onLog,
    });
    projects = selectProjects(result.snapshot.projects, selectors, config.excludeProjects, config.projectAliases);
  }

  return {
    snapshot: result.snapshot,
    projects,
    fromCache: result.fromCache,
    ageMs: result.ageMs,
  };
}

export interface PreparedInsight {
  items: EnrichedItem[];
  stats: OverallStats;
  config: InsightConfig;
}

/**
 * 把项目元数据 + 本地快照整理成候选清单：
 * 是否已同步、缓存了多少条、是否被 excludeProjects 排除。
 */
export function projectCandidates(
  projects: ProjectRecord[],
  config: InsightConfig,
  snapshot: Snapshot | null,
): ProjectCandidate[] {
  const synced = new Set(snapshot ? syncedProjectIdsOf(snapshot) : []);
  const counts = new Map<string, number>();
  for (const item of snapshot?.items ?? []) {
    counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
  }
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    excluded: isProjectExcluded(project, config.excludeProjects, config.projectAliases),
    synced: synced.has(project.id),
    cachedItems: counts.get(project.id) ?? 0,
  }));
}

export function prepareInsight(
  snapshot: Snapshot,
  projects: ProjectRecord[],
  config: InsightConfig,
  now = Date.now(),
): PreparedInsight {
  const selectedIds = new Set(projects.map((project) => project.id));
  const items = enrichItems(
    snapshot.items.filter((item) => selectedIds.has(item.projectId)),
    config,
    now,
  );
  const sprints: Snapshot["sprints"] = {};
  for (const project of projects) {
    sprints[project.id] = snapshot.sprints[project.id] ?? [];
  }
  const stats = buildOverallStats(projects, items, sprints, config, now);
  stats.organizationId = snapshot.organizationId;
  return { items, stats, config };
}
