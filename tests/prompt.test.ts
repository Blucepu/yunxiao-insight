import { describe, expect, it } from "vitest";
import { projectCandidates } from "../src/lib/insight.ts";
import {
  candidateStatusLabel,
  parseProjectChoice,
  renderCandidateList,
  type ProjectCandidate,
} from "../src/lib/prompt.ts";
import { makeConfig, makeItem, makeProject, makeSnapshot } from "./fixtures.ts";

function candidate(
  id: string,
  name: string,
  overrides: Partial<ProjectCandidate> = {},
): ProjectCandidate {
  return { id, name, excluded: false, synced: false, cachedItems: 0, ...overrides };
}

const candidates = [
  candidate("p1", "APM_IM", { synced: true, cachedItems: 727 }),
  candidate("p2", "角色系统", { synced: true, cachedItems: 95 }),
  candidate("p3", "测试项目", { excluded: true }),
];

describe("parseProjectChoice", () => {
  it("回车默认全部（应用排除项）", () => {
    expect(parseProjectChoice("", candidates)).toEqual({ kind: "all", includeExcluded: false });
  });

  it("all / * 表示全部含已排除项目", () => {
    expect(parseProjectChoice("all", candidates)).toEqual({ kind: "all", includeExcluded: true });
    expect(parseProjectChoice("*", candidates)).toEqual({ kind: "all", includeExcluded: true });
  });

  it("q / 取消 表示取消", () => {
    expect(parseProjectChoice("q", candidates).kind).toBe("cancel");
    expect(parseProjectChoice("取消", candidates).kind).toBe("cancel");
  });

  it("按编号选择（逗号 / 空格分隔）", () => {
    expect(parseProjectChoice("1,3", candidates)).toEqual({
      kind: "select",
      selectors: ["p1", "p3"],
      includeExcluded: true,
    });
    expect(parseProjectChoice("2 1", candidates)).toMatchObject({
      kind: "select",
      selectors: ["p2", "p1"],
    });
  });

  it("按名称 / 唯一子串选择", () => {
    expect(parseProjectChoice("APM", candidates)).toMatchObject({ kind: "select", selectors: ["p1"] });
    expect(parseProjectChoice("角色系统", candidates)).toMatchObject({
      kind: "select",
      selectors: ["p2"],
    });
  });

  it("编号越界与未知项目给出可读错误", () => {
    const outOfRange = parseProjectChoice("9", candidates);
    expect(outOfRange.kind).toBe("invalid");
    expect(outOfRange.kind === "invalid" && outOfRange.message).toMatch(/超出范围/);

    const missing = parseProjectChoice("不存在", candidates);
    expect(missing.kind).toBe("invalid");
    expect(missing.kind === "invalid" && missing.message).toMatch(/找不到项目/);
  });

  it("子串命中多个项目时提示更精确", () => {
    const ambiguous = parseProjectChoice("角色", [
      candidate("a", "角色系统"),
      candidate("b", "角色管理"),
    ]);
    expect(ambiguous.kind).toBe("invalid");
    expect(ambiguous.kind === "invalid" && ambiguous.message).toMatch(/匹配到多个项目/);
  });
});

describe("候选清单渲染", () => {
  it("标注已同步条数与已排除", () => {
    expect(candidateStatusLabel(candidates[0]!)).toBe("已同步 727 条");
    expect(candidateStatusLabel(candidates[2]!)).toBe("已排除 · 未同步");
  });

  it("renderCandidateList 生成编号列表", () => {
    const text = renderCandidateList(candidates);
    expect(text).toContain("1. APM_IM（已同步 727 条）");
    expect(text).toContain("3. 测试项目（已排除 · 未同步）");
    expect(text.split("\n")).toHaveLength(3);
  });

  it("空清单有兜底文案", () => {
    expect(renderCandidateList([])).toBe("（没有可用的项目）");
  });
});

describe("projectCandidates", () => {
  it("结合快照标注同步状态与条数，并识别排除项", () => {
    const snapshot = makeSnapshot(
      [makeProject("p1", "APM_IM"), makeProject("p2", "测试项目")],
      [
        makeItem({ id: "1", projectId: "p1", projectName: "APM_IM" }),
        makeItem({ id: "2", projectId: "p1", projectName: "APM_IM" }),
      ],
      { syncedProjectIds: ["p1"] },
    );
    const config = makeConfig({ excludeProjects: ["测试项目"] });
    const result = projectCandidates(snapshot.projects, config, snapshot);
    expect(result).toEqual([
      { id: "p1", name: "APM_IM", excluded: false, synced: true, cachedItems: 2 },
      { id: "p2", name: "测试项目", excluded: true, synced: false, cachedItems: 0 },
    ]);
  });

  it("没有快照时全部标记为未同步", () => {
    const result = projectCandidates([makeProject("p1", "APM_IM")], makeConfig(), null);
    expect(result[0]).toMatchObject({ synced: false, cachedItems: 0 });
  });
});