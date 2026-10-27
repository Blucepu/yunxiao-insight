import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expandHome, loadEnvFile, projectRoot } from "./env.ts";
import type { InsightConfig, Runtime, StageGroup } from "./types.ts";

export const STAGE_GROUPS: StageGroup[] = ["todo", "doing", "verify", "done", "canceled", "unknown"];

export const DEFAULT_CONFIG: InsightConfig = {
  organizationId: "",
  apiBaseUrl: "https://openapi-rdc.aliyuncs.com",
  cacheTtlMinutes: 30,
  staleDays: 14,
  trendWeeks: 12,
  recentDays: 30,
  categories: ["Req", "Bug", "Task", "Risk"],
  excludeProjects: [],
  projectAliases: {},
  stageGroups: {
    "1": "todo",
    "2": "doing",
    "3": "verify",
    "4": "done",
    "5": "canceled",
    "6": "todo",
    "7": "doing",
    "11": "doing",
    "12": "doing",
  },
  statusGroups: {},
  workitemUrlTemplate:
    "https://devops.aliyun.com/projex/project/{spaceId}/{categoryPath}/{id}",
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

function asStageRecord(value: unknown): Record<string, StageGroup> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, StageGroup> = {};
  for (const [key, group] of Object.entries(value as Record<string, unknown>)) {
    if (typeof group === "string" && STAGE_GROUPS.includes(group as StageGroup)) {
      result[key] = group as StageGroup;
    }
  }
  return result;
}

function asAliasRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, target] of Object.entries(value as Record<string, unknown>)) {
    if (typeof target === "string" && target.trim()) result[key] = target.trim();
  }
  return result;
}

/** 合并用户配置与默认值，容忍缺省字段 */
export function mergeConfig(raw: Partial<InsightConfig> | null | undefined): InsightConfig {
  const input = raw ?? {};
  return {
    organizationId: asString(input.organizationId, DEFAULT_CONFIG.organizationId),
    apiBaseUrl: asString(input.apiBaseUrl, DEFAULT_CONFIG.apiBaseUrl),
    cacheTtlMinutes: asNumber(input.cacheTtlMinutes, DEFAULT_CONFIG.cacheTtlMinutes, 0),
    staleDays: asNumber(input.staleDays, DEFAULT_CONFIG.staleDays, 1),
    trendWeeks: Math.round(asNumber(input.trendWeeks, DEFAULT_CONFIG.trendWeeks, 4)),
    recentDays: asNumber(input.recentDays, DEFAULT_CONFIG.recentDays, 1),
    categories: asStringArray(input.categories, DEFAULT_CONFIG.categories),
    excludeProjects: asStringArray(input.excludeProjects, DEFAULT_CONFIG.excludeProjects),
    projectAliases: asAliasRecord(input.projectAliases),
    stageGroups: { ...DEFAULT_CONFIG.stageGroups, ...asStageRecord(input.stageGroups) },
    statusGroups: asStageRecord(input.statusGroups),
    workitemUrlTemplate: asString(input.workitemUrlTemplate, DEFAULT_CONFIG.workitemUrlTemplate),
  };
}

export function configPath(root = projectRoot()): string {
  return process.env.YUNXIAO_INSIGHT_CONFIG
    ? resolve(expandHome(process.env.YUNXIAO_INSIGHT_CONFIG))
    : resolve(root, "config.json");
}

export function loadConfig(root = projectRoot()): InsightConfig {
  const file = configPath(root);
  if (!existsSync(file)) {
    throw new Error(
      `[yunxiao-insight] 找不到配置文件 ${file}\n` +
        `  请复制 config.example.json 为 config.json，并填写 organizationId`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`[yunxiao-insight] 配置文件不是合法 JSON（${file}）：${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`[yunxiao-insight] 配置文件格式错误（${file}）：根节点必须是对象`);
  }
  return mergeConfig(parsed as Partial<InsightConfig>);
}

/** 读取 .env.local + config.json，解析出运行所需的凭证 */
export function loadRuntime(root = projectRoot()): Runtime {
  loadEnvFile(root);
  const config = loadConfig(root);
  const organizationId = (process.env.YUNXIAO_ORGANIZATION_ID ?? config.organizationId).trim();
  const token = (process.env.YUNXIAO_TOKEN ?? "").trim();
  const apiBaseUrl = (process.env.YUNXIAO_OPEN_API ?? config.apiBaseUrl).trim();

  if (!organizationId) {
    throw new Error(
      "[yunxiao-insight] 缺少组织 id：请在 .env.local 设置 YUNXIAO_ORGANIZATION_ID，或在 config.json 填写 organizationId",
    );
  }
  if (!token) {
    throw new Error(
      "[yunxiao-insight] 缺少访问令牌：请在 .env.local 设置 YUNXIAO_TOKEN\n" +
        "  令牌获取：https://devops.aliyun.com/settings/personal-access-tokens",
    );
  }

  return {
    root,
    config: { ...config, organizationId, apiBaseUrl },
    organizationId,
    token,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
  };
}
