import type { StageCounts, StageGroup } from "../lib/types.ts";

/** 页面侧的项目概览（只保留展示需要的字段） */
export interface ExploreProject {
  id: string;
  name: string;
  description: string;
  total: number;
  effective: number;
  done: number;
  rate: number;
  open: number;
  overdue: number;
  stale: number;
  unassigned: number;
  lastActivityAt: number | null;
}

/** 页面侧的迭代概览 */
export interface ExploreSprint {
  id: string;
  projectId: string;
  name: string;
  status: string;
  startAt: number | null;
  endAt: number | null;
  total: number;
  effective: number;
  done: number;
  rate: number;
  open: number;
}

/** 详情面板里展示的子项摘要 */
export interface ExploreChild {
  id: string;
  serial: string;
  subject: string;
  stage: StageGroup;
  stageLabel: string;
}

/**
 * 全局搜索页面的工作项。
 *
 * 这里是「页面数据边界」：不包含 token、组织 id、接口地址等任何运行时凭证信息，
 * 只保留工作项本身与聚合结果，方便把 HTML / data.json 直接放到 OSS。
 */
export interface ExploreItem {
  id: string;
  serial: string;
  subject: string;
  projectId: string;
  projectName: string;
  category: string;
  categoryLabel: string;
  type: string;
  stage: StageGroup;
  stageLabel: string;
  status: string;
  assignee: string;
  creator: string;
  sprintId: string;
  sprintName: string;
  priority: string;
  severity: string;
  labels: string[];
  planStartAt: number | null;
  planEndAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  estimatedHours: number | null;
  overdueDays: number;
  idleDays: number | null;
  cycleDays: number | null;
  ageDays: number | null;
  open: boolean;
  overdue: boolean;
  stale: boolean;
  unassigned: boolean;
  dueSoon: boolean;
  riskReasons: string[];
  url: string;
  parentId: string;
  parentSerial: string;
  children: ExploreChild[];
  childTotal: number;
  childEffective: number;
  childDone: number;
  childRate: number;
}

export interface ExploreMeta {
  version: 1;
  title: string;
  generatedAt: number;
  fetchedAt: number;
  /** 页面内所有「本周 / 逾期」等相对时间都以该时点计算 */
  now: number;
  itemCount: number;
  projectCount: number;
  counts: StageCounts;
  effectiveTotal: number;
  completionRate: number;
  open: number;
  overdue: number;
  stale: number;
  unassigned: number;
  thisWeekCreated: number;
  thisWeekCompleted: number;
  errors: string[];
  excludedProjects: string[];
  publicView: boolean;
  /** 非空时，页面会定时拉取同目录下的 data.json（OSS 静态部署的「准实时」模式） */
  liveUrl: string;
  /** 只用于页面提示，不包含 token / 本地绝对路径 */
  refreshCommand: string;
}

export interface ExploreData {
  meta: ExploreMeta;
  projects: ExploreProject[];
  sprints: Record<string, ExploreSprint>;
  items: ExploreItem[];
}

export interface ExploreBuildOptions {
  title?: string;
  generatedAt: number;
  fetchedAt: number;
  errors?: string[];
  excludedProjects?: string[];
  publicView?: boolean;
  liveUrl?: string;
  refreshCommand?: string;
}
