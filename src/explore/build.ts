// 由本地快照构建页面数据（ExploreData）的共享流程，explore 命令与 serve 命令共用。
//
// 安全边界：这里刻意不往 ExploreData 里放 token / 组织 id / API 地址，
// 页面产物（dist + data.json）可直接上传 OSS。

import { existsSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSelection, prepareInsight } from "../lib/insight.ts";
import type { InsightConfig, OverallStats, Runtime, Snapshot } from "../lib/types.ts";
import { isProjectExcluded } from "../lib/projects.ts";
import { syncedProjectIdsOf } from "../lib/sync.ts";
import { buildExploreData } from "./data.ts";
import type { ExploreData } from "./types.ts";

export interface BuildCurrentOptions {
  projectSelectors?: string[];
  refresh?: boolean;
  offline?: boolean;
  /** 包含 config.excludeProjects 中排除的项目 */
  includeAll?: boolean;
  publicView?: boolean;
  title?: string;
  onLog?: (message: string) => void;
}

export interface BuiltExplore {
  data: ExploreData;
  stats: OverallStats;
  fetchedAt: number;
  fromCache: boolean;
}

export async function buildCurrentExploreData(
  runtime: Runtime,
  options: BuildCurrentOptions = {},
): Promise<BuiltExplore> {
  const config: InsightConfig = options.includeAll
    ? { ...runtime.config, excludeProjects: [] }
    : runtime.config;

  const selection = await loadSelection(runtime, {
    projectSelectors: options.projectSelectors ?? [],
    refresh: options.refresh,
    offline: options.offline,
    config,
    onLog: options.onLog,
  });

  const now = Date.now();
  const { stats } = prepareInsight(selection.snapshot, selection.projects, config, now);

  const excludedProjects = options.includeAll
    ? []
    : [
        ...new Set(
          selection.snapshot.projects
            .filter((project) => isProjectExcluded(project, config.excludeProjects, config.projectAliases))
            .map((project) => project.name),
        ),
      ];

  const data = buildExploreData(stats, {
    title: options.title || "云效工作项",
    generatedAt: now,
    fetchedAt: selection.snapshot.fetchedAt,
    errors: selection.snapshot.errors,
    excludedProjects,
    publicView: options.publicView,
    liveUrl: "",
    refreshCommand: "bun run src/cli.ts sync",
  });

  return { data, stats, fetchedAt: selection.snapshot.fetchedAt, fromCache: selection.fromCache };
}

/** 页面构建产物目录：优先同级 yunxiao-search 仓库的 dist，其次本仓库 dist */
function resolveWebDist(root: string): string | null {
  const candidates = [resolve(root, "..", "yunxiao-search", "dist"), resolve(root, "dist")];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "index.html"))) return dir;
  }
  return null;
}

/**
 * 把页面数据写进页面构建产物目录的 data.json（页面轮询它实现 OSS 准实时）。
 * 页面尚未构建时跳过并返回 null。
 */
export function writeWebData(root: string, data: ExploreData): string | null {
  const dist = resolveWebDist(root);
  if (!dist) return null;
  const file = resolve(dist, "data.json");
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data)}\n`, "utf8");
  renameSync(temp, file);
  return file;
}

/**
 * 直接从已有快照构建页面数据（不触网、不补拉）。
 * 范围 = 已同步 ∩ 未排除的项目；sync 命令完成后用它刷新 dist/data.json。
 */
export function buildDataFromSnapshot(
  runtime: Runtime,
  snapshot: Snapshot,
  options: { includeAll?: boolean; title?: string } = {},
): ExploreData {
  const config: InsightConfig = options.includeAll
    ? { ...runtime.config, excludeProjects: [] }
    : runtime.config;
  const synced = new Set(syncedProjectIdsOf(snapshot));
  const projects = snapshot.projects.filter(
    (project) =>
      synced.has(project.id) &&
      !isProjectExcluded(project, config.excludeProjects, config.projectAliases),
  );
  const excludedProjects = options.includeAll
    ? []
    : [
        ...new Set(
          snapshot.projects
            .filter((project) => isProjectExcluded(project, config.excludeProjects, config.projectAliases))
            .map((project) => project.name),
        ),
      ];
  const now = Date.now();
  const { stats } = prepareInsight(snapshot, projects, config, now);
  return buildExploreData(stats, {
    title: options.title || "云效工作项",
    generatedAt: now,
    fetchedAt: snapshot.fetchedAt,
    errors: snapshot.errors,
    excludedProjects,
    liveUrl: "",
    refreshCommand: "bun run src/cli.ts sync",
  });
}
