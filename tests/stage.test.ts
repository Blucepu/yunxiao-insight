import { describe, expect, it } from "vitest";
import { makeConfig, makeItem, NOW } from "./fixtures.ts";
import {
  categoryLabel,
  categoryPath,
  normalizeCategory,
  normalizeStageGroup,
  resolveStage,
  stageFromStatusName,
} from "../src/lib/stage.ts";

describe("阶段判定", () => {
  const config = makeConfig();

  it("按 statusStageId 映射阶段", () => {
    expect(resolveStage(makeItem({ id: "1", stageId: "1" }), config)).toBe("todo");
    expect(resolveStage(makeItem({ id: "2", stageId: "2" }), config)).toBe("doing");
    expect(resolveStage(makeItem({ id: "3", stageId: "3" }), config)).toBe("verify");
    expect(resolveStage(makeItem({ id: "4", stageId: "4" }), config)).toBe("done");
    expect(resolveStage(makeItem({ id: "5", stageId: "5" }), config)).toBe("canceled");
  });

  it("statusGroups 优先于 statusStageId", () => {
    const withOverride = makeConfig({ statusGroups: { 无法重现: "canceled" } });
    const item = makeItem({ id: "x", stageId: "3", statusName: "无法重现" });
    expect(resolveStage(item, withOverride)).toBe("canceled");
  });

  it("未知 statusStageId 时按状态名兜底", () => {
    expect(
      resolveStage(makeItem({ id: "x", stageId: "99", statusName: "开发中" }), config),
    ).toBe("doing");
    expect(
      resolveStage(makeItem({ id: "y", stageId: "99", statusName: "待验收" }), config),
    ).toBe("verify");
    expect(
      resolveStage(makeItem({ id: "z", stageId: null, statusName: "不存在状态" }), config),
    ).toBe("unknown");
  });

  it("stageFromStatusName 中文关键词", () => {
    expect(stageFromStatusName("已取消")).toBe("canceled");
    expect(stageFromStatusName("已完成")).toBe("done");
    expect(stageFromStatusName("待验证")).toBe("verify");
    expect(stageFromStatusName("待处理")).toBe("todo");
    expect(stageFromStatusName("测试中")).toBe("doing");
  });

  it("normalizeStageGroup 支持中文与英文", () => {
    expect(normalizeStageGroup("进行中")).toBe("doing");
    expect(normalizeStageGroup("done")).toBe("done");
    expect(normalizeStageGroup("不存在")).toBeNull();
  });
});

describe("类别", () => {
  it("中文 / 英文互相转换", () => {
    expect(normalizeCategory("需求")).toBe("Req");
    expect(normalizeCategory("bug")).toBe("Bug");
    expect(categoryLabel("Task")).toBe("任务");
    expect(categoryPath("Req")).toBe("req");
    expect(categoryLabel("Custom")).toBe("Custom");
  });
});

describe("工作项时间字段", () => {
  it("使用固定 NOW 时计划完成时间可解析", () => {
    const item = makeItem(
      { id: "x", stageId: "2", planEndAt: NOW - 3 * 86_400_000 },
      NOW,
    );
    expect(item.customFieldValues?.some((field) => field.fieldName === "计划完成时间")).toBe(true);
  });
});
