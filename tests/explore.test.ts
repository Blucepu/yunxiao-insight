import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildDataFromSnapshot, writeWebData } from "../src/explore/build.ts";
import { buildExploreData } from "../src/explore/data.ts";
import { DAY_MS } from "../src/lib/dates.ts";
import type { OverallStats, ProjectRecord, SprintRecord } from "../src/lib/types.ts";
import { enrichItems } from "../src/lib/domain.ts";
import { buildOverallStats } from "../src/lib/stats.ts";
import { makeConfig, makeItem, makeProject, makeRuntime, makeSnapshot, NOW } from "./fixtures.ts";

const config = makeConfig();

function sample(): {
  data: ReturnType<typeof buildExploreData>;
  stats: OverallStats;
  projects: ProjectRecord[];
} {
  const projects = [makeProject("p1", "APM_IM"), makeProject("p2", "角色系统")];
  const sprints: Record<string, SprintRecord[]> = {
    p1: [
      {
        id: "s1",
        name: "Sprint 1",
        status: "DOING",
        startDate: NOW - 7 * DAY_MS,
        endDate: NOW + 7 * DAY_MS,
      },
    ],
  };
  const parent = makeItem(
    {
      id: "1",
      serialNumber: "APM-1",
      subject: "父项：登录改造",
      categoryId: "Req",
      stageId: "2",
      updatedAt: NOW - 2 * DAY_MS,
      planEndAt: NOW + 2 * DAY_MS,
      priority: "P1",
      labels: ["核心", "登录"],
      sprint: { id: "s1", name: "Sprint 1" },
    },
    NOW,
  );
  const childDone = makeItem(
    {
      id: "2",
      serialNumber: "APM-2",
      subject: "子项：接口",
      projectId: "p1",
      categoryId: "Task",
      stageId: "4",
      statusChangedAt: NOW - DAY_MS,
      updatedAt: NOW - DAY_MS,
      createdAt: NOW - 2 * DAY_MS,
      sprint: { id: "s1", name: "Sprint 1" },
    },
    NOW,
  );
  childDone.parentId = "1";
  const elsewhere = makeItem(
    {
      id: "4",
      serialNumber: "ROLE-1",
      subject: "角色权限调整",
      projectId: "p2",
      projectName: "角色系统",
      categoryId: "Bug",
      stageId: "1",
      assignee: null,
      updatedAt: NOW - 30 * DAY_MS,
      planEndAt: null,
    },
    NOW,
  );

  const items = enrichItems([parent, childDone, elsewhere], config, NOW);
  const stats = buildOverallStats(projects, items, sprints, config, NOW);
  const data = buildExploreData(stats, {
    generatedAt: NOW,
    fetchedAt: NOW,
    errors: ["拉取 p3 失败"],
    excludedProjects: ["测试项目"],
    refreshCommand: "bun run src/cli.ts sync",
  });
  return { data, stats, projects };
}

describe("buildExploreData", () => {
  it("构建项目、迭代、父子关联与聚合", () => {
    const { data, stats } = sample();
    expect(data.meta.itemCount).toBe(3);
    expect(data.meta.projectCount).toBe(2);
    expect(data.meta.counts).toEqual(stats.counts);
    expect(data.projects.map((project) => project.name)).toEqual(["APM_IM", "角色系统"]);
    expect(data.sprints.s1?.name).toBe("Sprint 1");

    const parent = data.items.find((item) => item.id === "1");
    expect(parent?.childTotal).toBe(1);
    expect(parent?.dueSoon).toBe(true);
    expect(parent?.labels).toEqual(["核心", "登录"]);

    const child = data.items.find((item) => item.id === "2");
    expect(child?.parentSerial).toBe("APM-1");

    const other = data.items.find((item) => item.id === "4");
    expect(other?.unassigned).toBe(true);
    expect(other?.stale).toBe(true);
  });

  it("public 视图省略错误、排除项目与刷新命令", () => {
    const { stats } = sample();
    const data = buildExploreData(stats, {
      generatedAt: NOW,
      fetchedAt: NOW,
      errors: ["token 无效"],
      excludedProjects: ["测试项目"],
      refreshCommand: "bun run src/cli.ts sync",
      publicView: true,
    });
    expect(data.meta.publicView).toBe(true);
    expect(data.meta.errors).toEqual([]);
    expect(data.meta.excludedProjects).toEqual([]);
    expect(data.meta.refreshCommand).toBe("");
  });

  it("页面数据里不出现运行时凭证", () => {
    const { data } = sample();
    const json = JSON.stringify(data);
    expect(json).not.toContain("test-token");
    expect(json).not.toContain("org-test");
    if (config.organizationId) expect(json).not.toContain(config.organizationId);
    if (config.apiBaseUrl) expect(json).not.toContain(config.apiBaseUrl);
  });
});

describe("buildDataFromSnapshot", () => {
  it("范围 = 已同步 ∩ 未排除的项目", () => {
    const projects = [makeProject("p1", "APM_IM"), makeProject("p2", "测试项目")];
    const items = [makeItem({ id: "1" }, NOW), makeItem({ id: "2", projectId: "p2", projectName: "测试项目" }, NOW)];
    const snapshot = makeSnapshot(projects, items, { syncedProjectIds: ["p1", "p2"] });
    const runtime = makeRuntime(tmpdir(), { excludeProjects: ["测试项目"] });
    const data = buildDataFromSnapshot(runtime, snapshot);
    expect(data.items.map((item) => item.id)).toEqual(["1"]);
    expect(data.meta.excludedProjects).toEqual(["测试项目"]);
    const json = JSON.stringify(data);
    expect(json).not.toContain("test-token");
    expect(json).not.toContain("org-test");
  });
});

describe("writeWebData", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "yunxiao-ws-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("页面未构建时跳过", () => {
    const root = resolve(workspace, "a", "yunxiao-insight");
    mkdirSync(root, { recursive: true });
    const { data } = sample();
    expect(writeWebData(root, data)).toBeNull();
  });

  it("优先写同级 yunxiao-search/dist", () => {
    const root = resolve(workspace, "b", "yunxiao-insight");
    const searchDist = resolve(workspace, "b", "yunxiao-search", "dist");
    mkdirSync(searchDist, { recursive: true });
    writeFileSync(resolve(searchDist, "index.html"), "<html></html>", "utf8");
    // 本仓库 dist 也存在时，仍优先写 yunxiao-search
    mkdirSync(resolve(root, "dist"), { recursive: true });
    writeFileSync(resolve(root, "dist", "index.html"), "<html></html>", "utf8");

    const { data } = sample();
    const file = writeWebData(root, data);
    expect(file).toBe(resolve(searchDist, "data.json"));
    expect(JSON.parse(readFileSync(file!, "utf8")).meta.itemCount).toBe(3);
    expect(existsSync(resolve(root, "dist", "data.json"))).toBe(false);
  });

  it("回退写本仓库 dist", () => {
    const root = resolve(workspace, "c", "yunxiao-insight");
    mkdirSync(resolve(root, "dist"), { recursive: true });
    writeFileSync(resolve(root, "dist", "index.html"), "<html></html>", "utf8");
    const { data } = sample();
    const file = writeWebData(root, data);
    expect(file).toBe(resolve(root, "dist", "data.json"));
    expect(existsSync(file!)).toBe(true);
  });
});
