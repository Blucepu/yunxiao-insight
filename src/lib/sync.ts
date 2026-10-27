import { readSnapshot, snapshotAgeMs, isSnapshotFresh, writeSnapshot } from "./cache.ts";
import { createClient } from "./client.ts";
import { filterProjects, resolveProjectSelectors } from "./projects.ts";
import type { ItemRecord, ProjectRecord, Runtime, Snapshot, SprintRecord } from "./types.ts";

export interface SyncOptions {
  /** 只刷新这些项目 id；不传则刷新全部（应用 excludeProjects） */
  projectIds?: string[];
  existing?: Snapshot | null;
  onLog?: (message: string) => void;
}

export interface SyncResult {
  snapshot: Snapshot;
  cacheFile: string;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function sortItems(items: ItemRecord[]): ItemRecord[] {
  return [...items].sort((a, b) => {
    const project = a.projectName.localeCompare(b.projectName, "zh-CN");
    if (project !== 0) return project;
    return a.serialNumber.localeCompare(b.serialNumber, "zh-CN", { numeric: true });
  });
}

/** 全量/增量拉取并写入本地快照 */
export async function syncSnapshot(runtime: Runtime, options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const log = options.onLog ?? (() => {});
  const client = createClient(runtime);

  log("拉取项目列表…");
  const allProjects = await client.listProjects();

  let selected: ProjectRecord[];
  if (options.projectIds && options.projectIds.length) {
    const wanted = new Set(options.projectIds);
    selected = allProjects.filter((project) => wanted.has(project.id));
    const missing = [...wanted].filter((id) => !selected.some((project) => project.id === id));
    if (missing.length) {
      throw new Error(`[yunxiao-insight] 快照中没有这些项目：${missing.join("、")}`);
    }
  } else {
    selected = filterProjects(allProjects, runtime.config.excludeProjects, runtime.config.projectAliases);
  }

  const explicitSelection = Boolean(options.projectIds && options.projectIds.length);
  log(
    `共 ${allProjects.length} 个项目，本次刷新 ${selected.length} 个` +
      (!explicitSelection && selected.length !== allProjects.length ? "（已应用项目排除配置）" : ""),
  );

  const errors: string[] = [];
  const newItems: ItemRecord[] = [];
  const newSprints: Record<string, SprintRecord[]> = {};
  const newProjects: ProjectRecord[] = [];

  const results = await mapLimit(selected, 3, async (project) => {
    log(`[${project.name}] 拉取工作项…`);
    let items: ItemRecord[] = [];
    let itemsOk = true;
    try {
      const pulled = await client.pullAllWorkitems(project.id, {
        categories: runtime.config.categories,
        onNotice: (message) => log(`[${project.name}] ${message}`),
      });
      items = pulled.items.map((item) => ({
        ...item,
        projectId: project.id,
        projectName: project.name,
      }));
      log(`[${project.name}] 工作项 ${items.length} 条`);
    } catch (error) {
      itemsOk = false;
      const message = `[${project.name}] 工作项拉取失败：${(error as Error).message}`;
      errors.push(message);
      log(message);
    }

    let sprints: SprintRecord[] = [];
    let sprintsOk = true;
    try {
      sprints = await client.listSprints(project.id);
    } catch (error) {
      sprintsOk = false;
      const message = `[${project.name}] 迭代拉取失败：${(error as Error).message}`;
      errors.push(message);
      log(message);
    }

    return { project, items, sprints, itemsOk, sprintsOk };
  });

  for (const result of results) {
    newProjects.push(result.project);
    newItems.push(...result.items);
    newSprints[result.project.id] = result.sprints;
  }

  const partial = Boolean(options.projectIds && options.projectIds.length);
  const existing =
    partial && options.existing && options.existing.organizationId === runtime.organizationId
      ? options.existing
      : null;
  const selectedIds = new Set(selected.map((project) => project.id));
  const failedItemIds = new Set(
    results.filter((result) => !result.itemsOk).map((result) => result.project.id),
  );
  const syncedNow = results
    .filter((result) => result.itemsOk)
    .map((result) => result.project.id);

  let projects: ProjectRecord[];
  let items: ItemRecord[];
  let sprints: Record<string, SprintRecord[]>;
  let syncedIds: string[];

  if (existing) {
    const projectMap = new Map(existing.projects.map((project) => [project.id, project]));
    for (const project of allProjects) projectMap.set(project.id, project);
    for (const project of newProjects) projectMap.set(project.id, project);
    projects = [...projectMap.values()];

    items = sortItems([
      ...existing.items.filter(
        (item) => !selectedIds.has(item.projectId) || failedItemIds.has(item.projectId),
      ),
      ...newItems.filter((item) => !failedItemIds.has(item.projectId)),
    ]);
    sprints = { ...existing.sprints };
    for (const result of results) {
      if (result.sprintsOk) {
        sprints[result.project.id] = result.sprints;
      } else if (!sprints[result.project.id]) {
        sprints[result.project.id] = result.sprints;
      }
    }
    const previousSynced = existing.syncedProjectIds ?? existing.projects.map((project) => project.id);
    syncedIds = [
      ...new Set([
        ...previousSynced.filter((id) => projectMap.has(id)),
        ...syncedNow,
      ]),
    ];
  } else {
    projects = [...allProjects];
    items = sortItems(newItems.filter((item) => !failedItemIds.has(item.projectId)));
    sprints = newSprints;
    syncedIds = syncedNow;
  }

  projects = [...projects].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  const snapshot: Snapshot = {
    version: 2,
    organizationId: runtime.organizationId,
    fetchedAt: startedAt,
    projects,
    items,
    sprints,
    syncedProjectIds: syncedIds,
    errors,
    meta: {
      requestCount: client.requests,
      durationMs: Date.now() - startedAt,
    },
  };

  const cacheFile = writeSnapshot(runtime.root, snapshot);
  if (existing) {
    log(`增量快照已写入 ${cacheFile}（${newItems.length} 条更新，${items.length} 条总计）`);
  } else {
    log(
      `快照已写入 ${cacheFile}（${items.length} 条工作项，${syncedIds.length}/${projects.length} 个项目已同步）`,
    );
  }
  log(`完成于 ${startedIso}，耗时 ${Date.now() - startedAt} ms，请求 ${client.requests} 次`);

  return { snapshot, cacheFile };
}

export interface EnsureSnapshotOptions {
  projectSelectors?: string[];
  /** 强制增量刷新这些项目 id（即使缓存仍然新鲜） */
  forceProjectIds?: string[];
  refresh?: boolean;
  offline?: boolean;
  onLog?: (message: string) => void;
}

export interface EnsureSnapshotResult {
  snapshot: Snapshot;
  fromCache: boolean;
  ageMs: number;
}

/** 已同步工作项的项目 id；旧快照没有该字段时视为全部已同步 */
export function syncedProjectIdsOf(snapshot: Snapshot): string[] {
  return snapshot.syncedProjectIds ?? snapshot.projects.map((project) => project.id);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/**
 * 命令层获取快照：
 * - 有缓存且新鲜 → 直接用（指定项目尚未同步时只补拉缺失项目）
 * - 过期 / --refresh → 刷新（指定项目时增量刷新）
 * - --offline → 只用缓存
 */
export async function ensureSnapshot(
  runtime: Runtime,
  options: EnsureSnapshotOptions = {},
): Promise<EnsureSnapshotResult> {
  const log = options.onLog ?? (() => {});
  const cached = readSnapshot(runtime.root);
  const usableCache = cached && cached.organizationId === runtime.organizationId ? cached : null;

  if (options.offline) {
    if (!usableCache) {
      throw new Error("[yunxiao-insight] --offline 需要本地缓存，但 data/snapshot.json 不存在或已损坏");
    }
    const ageMs = snapshotAgeMs(usableCache);
    log(`离线模式：使用 ${ageMs === 0 ? "刚刚" : `${Math.floor(ageMs / 60_000)} 分钟前`}的快照`);
    return { snapshot: usableCache, fromCache: true, ageMs };
  }

  const selectors = (options.projectSelectors ?? []).map((selector) => selector.trim()).filter(Boolean);
  const forced = uniqueIds(options.forceProjectIds ?? []);

  let selectedIds: string[] | undefined;
  let resolutionFailed = false;
  if (usableCache && selectors.length) {
    try {
      selectedIds = resolveProjectSelectors(
        usableCache.projects,
        selectors,
        runtime.config.projectAliases,
      ).map((project) => project.id);
    } catch {
      // 缓存里找不到目标项目 → 需要刷新项目列表
      resolutionFailed = true;
    }
  }

  if (usableCache) {
    const synced = new Set(syncedProjectIdsOf(usableCache));
    const missing = (selectedIds ?? []).filter((id) => !synced.has(id));
    const incrementalIds = uniqueIds([...missing, ...forced]);

    if (!options.refresh && isSnapshotFresh(usableCache, runtime.config.cacheTtlMinutes)) {
      if (incrementalIds.length === 0) {
        const ageMs = snapshotAgeMs(usableCache);
        log(`使用本地缓存（${Math.floor(ageMs / 60_000)} 分钟前）；加 --refresh 可强制刷新`);
        return { snapshot: usableCache, fromCache: true, ageMs };
      }
      log(`本地缓存缺少 ${incrementalIds.length} 个项目的工作项，增量补拉…`);
      const { snapshot } = await syncSnapshot(runtime, {
        projectIds: incrementalIds,
        existing: usableCache,
        onLog: log,
      });
      return { snapshot, fromCache: false, ageMs: 0 };
    }

    if (selectors.length && !resolutionFailed) {
      const ids = uniqueIds([...(selectedIds ?? []), ...forced]);
      if (ids.length) {
        log(`缓存已过期，增量刷新 ${ids.length} 个项目…`);
        const { snapshot } = await syncSnapshot(runtime, {
          projectIds: ids,
          existing: usableCache,
          onLog: log,
        });
        return { snapshot, fromCache: false, ageMs: 0 };
      }
    }

    if (resolutionFailed) {
      log("缓存中未找到目标项目，刷新全部项目…");
    } else if (forced.length) {
      log(`增量刷新 ${forced.length} 个指定项目…`);
      const { snapshot } = await syncSnapshot(runtime, {
        projectIds: forced,
        existing: usableCache,
        onLog: log,
      });
      return { snapshot, fromCache: false, ageMs: 0 };
    } else {
      log(options.refresh ? "强制刷新全部项目…" : "缓存已过期，刷新全部项目…");
    }
  } else {
    log("首次运行，拉取全部项目…");
  }

  const { snapshot } = await syncSnapshot(runtime, {
    existing: usableCache,
    onLog: log,
  });

  return { snapshot, fromCache: false, ageMs: 0 };
}
