import { boolFlag, projectSelectors } from "../lib/args.ts";
import { readSnapshot } from "../lib/cache.ts";
import { createClient } from "../lib/client.ts";
import { loadRuntime } from "../lib/config.ts";
import { formatDate } from "../lib/dates.ts";
import { renderTable } from "../lib/format.ts";
import { projectCandidates } from "../lib/insight.ts";
import { log, setQuiet } from "../lib/log.ts";
import { isInteractive, promptProjectSelection } from "../lib/prompt.ts";
import { selectProjects } from "../lib/projects.ts";
import { syncSnapshot, syncedProjectIdsOf } from "../lib/sync.ts";
import { buildDataFromSnapshot, writeWebData } from "../explore/build.ts";
import type { ProjectRecord, Runtime } from "../lib/types.ts";

export async function runSync(flags: Record<string, string | boolean>): Promise<void> {
  setQuiet(boolFlag(flags, "quiet"));
  if (boolFlag(flags, "offline")) {
    throw new Error("[yunxiao-insight] sync 命令需要联网，不能与 --offline 同时使用");
  }
  const runtime = loadRuntime();
  let selectors = projectSelectors(flags);
  let includeAll = boolFlag(flags, "all");

  const existing = readSnapshot(runtime.root);
  const usableExisting =
    existing && existing.organizationId === runtime.organizationId ? existing : null;

  const client = createClient(runtime);
  let projectList: ProjectRecord[] | null = null;
  const listOnce = async (): Promise<ProjectRecord[]> => {
    if (!projectList) {
      log("拉取项目列表…");
      projectList = await client.listProjects();
    }
    return projectList;
  };

  // 仅 TTY 且未显式指定时才交互选择，避免影响 AI / CI
  const wantPrompt =
    isInteractive() &&
    selectors.length === 0 &&
    !includeAll &&
    !boolFlag(flags, "yes") &&
    !boolFlag(flags, "json");

  if (wantPrompt) {
    const candidates = projectCandidates(await listOnce(), runtime.config, usableExisting);
    const choice = await promptProjectSelection(candidates);
    if (choice.kind === "cancel") {
      console.log("已取消，未做任何改动。");
      return;
    }
    if (choice.kind === "all") includeAll = true;
    else selectors = choice.selectors;
  }

  let projectIds: string[] | undefined;
  if (selectors.length) {
    const projects = await listOnce();
    const selected = selectProjects(projects, selectors, [], runtime.config.projectAliases);
    projectIds = selected.map((project) => project.id);
    if (projectIds.length === 0) {
      throw new Error("[yunxiao-insight] 没有匹配到要同步的项目");
    }
    log(`将增量刷新：${selected.map((project) => project.name).join("、")}`);
  }

  const effectiveRuntime: Runtime = includeAll
    ? { ...runtime, config: { ...runtime.config, excludeProjects: [] } }
    : runtime;

  const { snapshot, cacheFile } = await syncSnapshot(effectiveRuntime, {
    projectIds,
    existing: usableExisting,
    onLog: log,
  });

  // 同步成功后刷新页面数据 dist/data.json（dist 不存在时跳过）
  const webData = writeWebData(
    runtime.root,
    buildDataFromSnapshot(runtime, snapshot, { includeAll }),
  );
  if (webData) log(`页面数据已更新：${webData}`);

  if (boolFlag(flags, "json")) {
    console.log(
      JSON.stringify(
        {
          cacheFile,
          fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
          organizationId: snapshot.organizationId,
          includeAll,
          projects: snapshot.projects.length,
          syncedProjects: syncedProjectIdsOf(snapshot).length,
          items: snapshot.items.length,
          errors: snapshot.errors,
          meta: snapshot.meta,
        },
        null,
        2,
      ),
    );
    return;
  }

  const synced = new Set(syncedProjectIdsOf(snapshot));
  const counts = new Map<string, number>();
  for (const item of snapshot.items) {
    counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
  }
  const rows = snapshot.projects
    .filter((project) => synced.has(project.id))
    .map((project) => [project.name, String(counts.get(project.id) ?? 0)])
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const pending = snapshot.projects
    .filter((project) => !synced.has(project.id))
    .map((project) => project.name);

  console.log("");
  console.log(
    renderTable(
      [
        { header: "项目", maxWidth: 32 },
        { header: "工作项", align: "right" },
      ],
      rows,
    ),
  );
  console.log("");
  console.log(
    `快照已就绪：已同步 ${synced.size}/${snapshot.projects.length} 个项目 · ${snapshot.items.length} 条工作项 · 抓取于 ${formatDate(snapshot.fetchedAt)} · 缓存 ${cacheFile}`,
  );
  if (includeAll) {
    console.log("本次已包含配置中排除的项目（--all）。");
  }
  if (pending.length) {
    console.log(
      `未纳入统计：${pending.join("、")}（多为 config.excludeProjects 排除项；显式 --project 指定时会按需补拉）`,
    );
  }
  if (snapshot.errors.length) {
    console.log(`有 ${snapshot.errors.length} 条拉取错误：`);
    for (const error of snapshot.errors.slice(0, 10)) console.log(`  - ${error}`);
    if (snapshot.errors.length > 10) console.log(`  … 其余 ${snapshot.errors.length - 10} 条见快照文件`);
  }
}