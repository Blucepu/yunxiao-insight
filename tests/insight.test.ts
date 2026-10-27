import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeSnapshot } from "../src/lib/cache.ts";
import { loadSelection } from "../src/lib/insight.ts";
import { syncedProjectIdsOf } from "../src/lib/sync.ts";
import { makeProject, makeRuntime, makeSnapshot, NOW } from "./fixtures.ts";

const root = mkdtempSync(resolve(tmpdir(), "yunxiao-insight-insight-"));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("已同步项目标记", () => {
  it("优先使用 syncedProjectIds", () => {
    const snapshot = makeSnapshot([makeProject("p1"), makeProject("p2", "角色系统")], [], {
      syncedProjectIds: ["p1"],
    });
    expect(syncedProjectIdsOf(snapshot)).toEqual(["p1"]);
  });

  it("旧快照缺少字段时视为全部已同步", () => {
    const snapshot = makeSnapshot([makeProject("p1"), makeProject("p2", "角色系统")], []);
    expect(syncedProjectIdsOf(snapshot)).toEqual(["p1", "p2"]);
  });
});

describe("loadSelection 离线", () => {
  writeSnapshot(
    root,
    makeSnapshot([makeProject("p1"), makeProject("p2", "角色系统")], [], {
      fetchedAt: NOW,
      syncedProjectIds: ["p1"],
    }),
  );
  const runtime = makeRuntime(root);

  it("已同步项目可以直接使用缓存", async () => {
    const selection = await loadSelection(runtime, {
      projectSelectors: ["p1"],
      offline: true,
    });
    expect(selection.fromCache).toBe(true);
    expect(selection.projects.map((project) => project.id)).toEqual(["p1"]);
  });

  it("未同步项目给出明确错误", async () => {
    await expect(
      loadSelection(runtime, { projectSelectors: ["角色系统"], offline: true }),
    ).rejects.toThrow(/尚未包含这些项目的工作项：角色系统/);
  });
});
