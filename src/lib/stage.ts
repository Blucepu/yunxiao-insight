import type { InsightConfig, StageGroup, YunxiaoWorkitem } from "./types.ts";

export const STAGE_ORDER: StageGroup[] = ["todo", "doing", "verify", "done", "canceled", "unknown"];

export const STAGE_LABEL: Record<StageGroup, string> = {
  todo: "未开始",
  doing: "进行中",
  verify: "待验收",
  done: "已完成",
  canceled: "已取消",
  unknown: "未知",
};

/** 用于堆叠条/图例的颜色（与 HTML 主题一致） */
export const STAGE_COLOR: Record<StageGroup, string> = {
  todo: "#94a3b8",
  doing: "#3b82f6",
  verify: "#f59e0b",
  done: "#10b981",
  canceled: "#cbd5e1",
  unknown: "#ef4444",
};

export const STAGE_BG: Record<StageGroup, string> = {
  todo: "#f1f5f9",
  doing: "#eff6ff",
  verify: "#fffbeb",
  done: "#ecfdf5",
  canceled: "#f8fafc",
  unknown: "#fef2f2",
};

const CATEGORY_LABEL: Record<string, string> = {
  Req: "需求",
  Bug: "缺陷",
  Task: "任务",
  Risk: "风险",
};

const CATEGORY_PATH: Record<string, string> = {
  Req: "req",
  Bug: "bug",
  Task: "task",
  Risk: "risk",
};

const CATEGORY_ALIASES: Record<string, string> = {
  需求: "Req",
  缺陷: "Bug",
  任务: "Task",
  风险: "Risk",
  req: "Req",
  bug: "Bug",
  task: "Task",
  risk: "Risk",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "其他";
  return CATEGORY_LABEL[category] ?? category;
}

export function categoryPath(category: string | null | undefined): string {
  if (!category) return "workitem";
  return CATEGORY_PATH[category] ?? category.toLowerCase();
}

/** 把用户输入的中文/英文类别统一成云效 categoryId */
export function normalizeCategory(input: string): string {
  const key = input.trim();
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[key.toLowerCase()] ?? key;
}

export function normalizeStageGroup(value: string): StageGroup | null {
  const key = value.trim();
  if (STAGE_ORDER.includes(key as StageGroup)) return key as StageGroup;
  for (const [group, label] of Object.entries(STAGE_LABEL) as Array<[StageGroup, string]>) {
    if (label === key) return group;
  }
  return null;
}

/** 按状态名兜底判断阶段（当 statusStageId 未知或项目自定义阶段时） */
export function stageFromStatusName(name: string): StageGroup {
  const text = name.trim();
  if (!text) return "unknown";
  if (/(取消|无法重现|重复|不予处理|挂起|延期)/.test(text)) return "canceled";
  if (/(已完成|已关闭|已发布|已上线|已解决|完成)/.test(text)) return "done";
  if (/(待验收|验收|已修复|待验证|验证中|待回归|回归中)/.test(text)) return "verify";
  if (/(待处理|待确认|再次打开|重新打开|待评审|未开始|新建)/.test(text)) return "todo";
  if (/(处理中|开发中|测试中|进行中|设计中|待测试|评审中|开发|测试)/.test(text)) return "doing";
  return "unknown";
}

/**
 * 阶段判定优先级：
 *   1. config.statusGroups 按状态名覆盖（例如把「无法重现」算作已取消）
 *   2. config.stageGroups 按 statusStageId 映射（默认 1/6 未开始，2/7/11/12 进行中，3 待验收，4 已完成，5 已取消）
 *   3. 状态名兜底
 */
export function resolveStage(item: YunxiaoWorkitem, config: InsightConfig): StageGroup {
  const statusName = item.status?.displayName || item.status?.name || "";
  const override = statusName ? config.statusGroups[statusName] : undefined;
  if (override) return override;

  const stageId = item.statusStageId === null || item.statusStageId === undefined ? "" : String(item.statusStageId);
  const mapped = stageId ? config.stageGroups[stageId] : undefined;
  if (mapped) return mapped;

  return stageFromStatusName(statusName);
}

export function isDone(stage: StageGroup): boolean {
  return stage === "done";
}

export function isCanceled(stage: StageGroup): boolean {
  return stage === "canceled";
}

export function isOpen(stage: StageGroup): boolean {
  return stage === "todo" || stage === "doing" || stage === "verify" || stage === "unknown";
}
