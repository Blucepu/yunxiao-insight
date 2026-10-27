import { DEFAULT_CONFIG, mergeConfig } from "../src/lib/config.ts";
import { DAY_MS } from "../src/lib/dates.ts";
import { enrichItem } from "../src/lib/domain.ts";
import type {
  CustomFieldValue,
  EnrichedItem,
  InsightConfig,
  ItemRecord,
  ProjectRecord,
  Runtime,
  Snapshot,
} from "../src/lib/types.ts";

export const NOW = new Date(2026, 9, 28, 12, 0, 0).getTime();

export function makeConfig(overrides: Partial<InsightConfig> = {}): InsightConfig {
  return mergeConfig({ ...DEFAULT_CONFIG, ...overrides });
}

export function makeProject(
  id = "p1",
  name = "APM_IM",
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  return {
    id,
    name,
    description: "",
    customCode: "",
    logicalStatus: "NORMAL",
    gmtCreate: NOW - 365 * DAY_MS,
    gmtModified: NOW - DAY_MS,
    ...overrides,
  };
}

export interface ItemOptions {
  id: string;
  serialNumber?: string;
  subject?: string;
  categoryId?: string;
  projectId?: string;
  projectName?: string;
  stageId?: string | null;
  statusName?: string;
  assignee?: string | null;
  assigneeId?: string;
  sprint?: { id: string; name: string } | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  statusChangedAt?: number | null;
  planStartAt?: number | null;
  planEndAt?: number | null;
  priority?: string;
  fields?: Record<string, string>;
  labels?: string[];
  workitemType?: string;
}

function customFields(options: ItemOptions): CustomFieldValue[] {
  const fields: CustomFieldValue[] = [];
  const add = (fieldId: string, fieldName: string, fieldFormat: string, value: string): void => {
    fields.push({
      fieldId,
      fieldName,
      fieldFormat,
      values: [{ identifier: value, displayValue: value }],
    });
  };
  if (options.priority) add("priority", "优先级", "list", options.priority);
  if (options.planStartAt !== null && options.planStartAt !== undefined) {
    add("79", "计划开始时间", "date", "2026-10-01 00:00:00");
  }
  if (options.planEndAt !== null && options.planEndAt !== undefined) {
    const date = new Date(options.planEndAt);
    const text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 23:59:59`;
    add("80", "计划完成时间", "date", text);
  }
  for (const [name, value] of Object.entries(options.fields ?? {})) {
    add(name, name, "text", value);
  }
  return fields;
}

export function makeItem(options: ItemOptions, now = NOW): ItemRecord {
  const name = options.assignee === undefined ? "张三" : options.assignee;
  const createdAt = options.createdAt === undefined ? now - 10 * DAY_MS : options.createdAt;
  const updatedAt = options.updatedAt === undefined ? now - DAY_MS : options.updatedAt;
  return {
    id: options.id,
    serialNumber: options.serialNumber ?? `TEST-${options.id}`,
    subject: options.subject ?? `工作项 ${options.id}`,
    categoryId: options.categoryId ?? "Req",
    assignedTo: name === null ? null : { id: options.assigneeId ?? `user-${name}`, name },
    creator: { id: "creator", name: "创建人" },
    modifier: { id: "modifier", name: "修改人" },
    status: {
      id: "status-1",
      name: options.statusName ?? "处理中",
      displayName: options.statusName ?? "处理中",
    },
    statusStageId: options.stageId === undefined ? "2" : options.stageId,
    space: { id: options.projectId ?? "p1", name: options.projectName ?? "APM_IM" },
    sprint: options.sprint ?? null,
    workitemType: { id: "type", name: options.workitemType ?? "需求" },
    customFieldValues: customFields(options),
    labels: (options.labels ?? []).map((label, index) => ({ id: `label-${index}`, name: label })),
    gmtCreate: createdAt,
    gmtModified: updatedAt,
    updateStatusAt: options.statusChangedAt ?? null,
    parentId: null,
    projectId: options.projectId ?? "p1",
    projectName: options.projectName ?? "APM_IM",
  };
}

export function makeEnriched(
  options: ItemOptions,
  config: InsightConfig = makeConfig(),
  now = NOW,
): EnrichedItem {
  return enrichItem(makeItem(options, now), config, now);
}

export function makeSnapshot(
  projects: ProjectRecord[],
  items: ItemRecord[],
  overrides: Partial<Snapshot> = {},
): Snapshot {
  return {
    version: 2,
    organizationId: "org-test",
    fetchedAt: NOW,
    projects,
    items,
    sprints: {},
    errors: [],
    meta: { requestCount: 1, durationMs: 10 },
    ...overrides,
  };
}

export function makeRuntime(root: string, overrides: Partial<InsightConfig> = {}): Runtime {
  const config = makeConfig(overrides);
  return {
    root,
    config,
    organizationId: "org-test",
    token: "test-token",
    apiBaseUrl: "https://openapi.example.com",
  };
}
