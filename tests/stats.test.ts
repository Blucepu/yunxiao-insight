import { describe, expect, it } from "vitest";
import { DAY_MS } from "../src/lib/dates.ts";
import {
  buildMemberStats,
  buildOverallStats,
  buildProjectStats,
  computeCycle,
  computeTrend,
  countStages,
  effectiveTotalOf,
  rate,
} from "../src/lib/stats.ts";
import { makeConfig, makeEnriched, makeProject, NOW } from "./fixtures.ts";

const config = makeConfig();

const items = [
  makeEnriched({ id: "1", stageId: "1", statusName: "待处理", assignee: "张三" }, config, NOW),
  makeEnriched(
    {
      id: "2",
      stageId: "2",
      statusName: "处理中",
      assignee: "张三",
      planEndAt: NOW - 3 * DAY_MS,
      updatedAt: NOW - 20 * DAY_MS,
    },
    config,
    NOW,
  ),
  makeEnriched({ id: "3", stageId: "3", statusName: "待验收", assignee: "李四" }, config, NOW),
  makeEnriched(
    {
      id: "4",
      stageId: "4",
      statusName: "已完成",
      assignee: "李四",
      createdAt: NOW - 20 * DAY_MS,
      statusChangedAt: NOW - 2 * DAY_MS,
    },
    config,
    NOW,
  ),
  makeEnriched({ id: "5", stageId: "5", statusName: "已取消", assignee: "王五" }, config, NOW),
  makeEnriched(
    {
      id: "6",
      stageId: "2",
      statusName: "开发中",
      assignee: null,
      createdAt: NOW - 2 * DAY_MS,
      updatedAt: NOW - DAY_MS,
    },
    config,
    NOW,
  ),
];

describe("基础统计", () => {
  it("countStages 与有效总数", () => {
    const counts = countStages(items);
    expect(counts).toEqual({ todo: 1, doing: 2, verify: 1, done: 1, canceled: 1, unknown: 0 });
    expect(effectiveTotalOf(counts)).toBe(5);
    expect(rate(1, 5)).toBeCloseTo(0.2, 5);
    expect(rate(1, 0)).toBe(0);
  });

  it("周趋势按周一桶统计新增与完成", () => {
    const trend = computeTrend(items, 4, NOW);
    expect(trend).toHaveLength(4);
    expect(trend.map((point) => point.label)).toEqual(["10-05", "10-12", "10-19", "10-26"]);
    const last = trend[trend.length - 1];
    expect(last?.created).toBe(1);
    expect(last?.completed).toBe(1);
    expect(trend[1]?.created).toBe(4);
    expect(trend[2]?.created).toBe(0);
  });

  it("完成周期取平均与中位数", () => {
    const cycle = computeCycle(items, 30, NOW);
    expect(cycle.sample).toBe(1);
    expect(cycle.avg).toBe(18);
    expect(cycle.median).toBe(18);

    const second = makeEnriched(
      {
        id: "7",
        stageId: "4",
        statusName: "已完成",
        createdAt: NOW - 10 * DAY_MS,
        statusChangedAt: NOW - 6 * DAY_MS,
      },
      config,
      NOW,
    );
    const combined = computeCycle([...items, second], 30, NOW);
    expect(combined.sample).toBe(2);
    expect(combined.avg).toBe(11);
    expect(combined.median).toBe(11);
  });
});

describe("项目统计", () => {
  const project = makeProject("p1", "APM_IM");
  const stats = buildProjectStats(project, items, [], config, NOW);

  it("完成率排除已取消", () => {
    expect(stats.total).toBe(6);
    expect(stats.effectiveTotal).toBe(5);
    expect(stats.completionRate).toBeCloseTo(0.2, 5);
    expect(stats.startRate).toBeCloseTo(0.8, 5);
  });

  it("风险、逾期与未分配", () => {
    expect(stats.open).toBe(4);
    expect(stats.overdue).toBe(1);
    expect(stats.stale).toBe(1);
    expect(stats.unassigned).toBe(1);
    expect(stats.risks).toHaveLength(2);
    expect(stats.risks[0]?.id).toBe("2");
  });

  it("维度统计：类别 / 成员 / 迭代", () => {
    expect(stats.byCategory).toHaveLength(1);
    expect(stats.byCategory[0]?.label).toBe("需求");
    expect(stats.byCategory[0]?.completionRate).toBeCloseTo(0.2, 5);

    expect(stats.byAssignee.map((member) => member.name)).toEqual(["张三", "李四", "王五", "未分配"]);
    const zhang = stats.byAssignee.find((member) => member.name === "张三");
    expect(zhang?.open).toBe(2);
    expect(zhang?.overdue).toBe(1);
    expect(zhang?.stale).toBe(1);

    expect(stats.bySprint).toHaveLength(1);
    expect(stats.bySprint[0]?.id).toBe("__none__");
    expect(stats.bySprint[0]?.name).toBe("无迭代");
  });

  it("本周新增 / 完成", () => {
    expect(stats.thisWeekCreated).toBe(1);
    expect(stats.thisWeekCompleted).toBe(1);
  });
});

describe("成员与总体统计", () => {
  it("成员统计排除未分配并排序", () => {
    const members = buildMemberStats(items, config, NOW);
    expect(members.map((member) => member.name)).toEqual(["张三", "李四", "王五"]);
    expect(members[0]?.open).toBe(2);
    expect(members[1]?.completionRate).toBeCloseTo(0.5, 5);
    expect(members[2]?.counts.canceled).toBe(1);
  });

  it("总体统计汇总项目与风险", () => {
    const project = makeProject("p1", "APM_IM");
    const overall = buildOverallStats([project], items, {}, config, NOW);
    expect(overall.projectCount).toBe(1);
    expect(overall.total).toBe(6);
    expect(overall.effectiveTotal).toBe(5);
    expect(overall.completionRate).toBeCloseTo(0.2, 5);
    expect(overall.projects).toHaveLength(1);
    expect(overall.members).toHaveLength(3);
    expect(overall.risks).toHaveLength(2);
    expect(overall.trend).toHaveLength(config.trendWeeks);
  });
});
