/** 云效 OpenAPI DTO 与本地领域模型 */

export type StageGroup = "todo" | "doing" | "verify" | "done" | "canceled" | "unknown";

export type CategoryId = string;

export interface YunxiaoUser {
  id: string;
  name: string;
}

export interface YunxiaoStatus {
  id: string;
  name: string;
  nameEn?: string;
  displayName?: string;
}

export interface YunxiaoSprint {
  id: string;
  name: string;
}

export interface YunxiaoWorkitemType {
  id: string;
  name: string;
}

export interface CustomFieldValue {
  fieldId: string;
  fieldName: string;
  fieldFormat?: string;
  values: Array<{ identifier?: string; displayValue?: string }>;
}

export interface Attachment {
  fileIdentifier: string;
  fileName: string;
  fileSuffix?: string;
  size?: number;
  url?: string;
  gmtCreate?: number;
  creator?: string;
}

export interface Comment {
  id: string;
  content: string;
  contentFormat: string | null;
  parentId: string | null;
  top: boolean;
  user: { id: string; name: string } | null;
  gmtCreate: number | null;
  gmtModified: number | null;
}

/** SearchWorkitems 返回的工作项（不含正文/评论，报告场景不需要） */
export interface YunxiaoWorkitem {
  id: string;
  serialNumber: string;
  subject: string;
  categoryId: CategoryId;
  assignedTo: YunxiaoUser | null;
  creator: YunxiaoUser | null;
  modifier: YunxiaoUser | null;
  status: YunxiaoStatus | null;
  statusStageId: string | null;
  space: { id: string; name: string } | null;
  sprint: YunxiaoSprint | null;
  workitemType: YunxiaoWorkitemType | null;
  customFieldValues: CustomFieldValue[] | null;
  labels: Array<{ id: string; name: string; color?: string }> | null;
  gmtCreate: number | null;
  gmtModified: number | null;
  updateStatusAt: number | null;
  parentId: string | null;
  idPath?: string;
  logicalStatus?: string | null;
}

/** SearchProjects 返回的项目 */
export interface YunxiaoProject {
  id: string;
  name: string;
  description?: string;
  customCode?: string;
  logicalStatus?: string | null;
  status?: { id: string; name: string } | null;
  creator?: YunxiaoUser | null;
  modifier?: YunxiaoUser | null;
  gmtCreate?: number | null;
  gmtModified?: number | null;
}

export interface Member {
  userId: string;
  userName: string;
  roleName?: string;
  userAvatar?: string;
}

/** 迭代详情（SearchWorkitems 只返回 id/name，起止日期需要 ListSprints） */
export interface SprintRecord {
  id: string;
  name: string;
  status?: string;
  startDate?: number | null;
  endDate?: number | null;
  capacityHours?: number | null;
  locked?: boolean;
  description?: string;
  owners?: YunxiaoUser[];
}

/** 本地配置 */
export interface InsightConfig {
  organizationId: string;
  apiBaseUrl: string;
  cacheTtlMinutes: number;
  staleDays: number;
  trendWeeks: number;
  recentDays: number;
  categories: string[];
  excludeProjects: string[];
  projectAliases: Record<string, string>;
  stageGroups: Record<string, StageGroup>;
  statusGroups: Record<string, StageGroup>;
  workitemUrlTemplate: string;
}

export interface Runtime {
  root: string;
  config: InsightConfig;
  organizationId: string;
  token: string;
  apiBaseUrl: string;
}

/** 快照中的项目 */
export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  customCode?: string;
  logicalStatus?: string | null;
  statusName?: string;
  gmtCreate?: number | null;
  gmtModified?: number | null;
}

/** 快照中的工作项（附加所属项目） */
export interface ItemRecord extends YunxiaoWorkitem {
  projectId: string;
  projectName: string;
}

export interface SnapshotMeta {
  requestCount: number;
  durationMs: number;
}

export interface Snapshot {
  version: 2;
  organizationId: string;
  fetchedAt: number;
  projects: ProjectRecord[];
  items: ItemRecord[];
  sprints: Record<string, SprintRecord[]>;
  /** 已同步工作项的项目 id；缺失时视为 projects 全部已同步（兼容旧快照） */
  syncedProjectIds?: string[];
  errors: string[];
  meta: SnapshotMeta;
}

/** 报告/统计使用的增强工作项 */
export interface EnrichedItem extends ItemRecord {
  stage: StageGroup;
  stageLabel: string;
  statusName: string;
  priority: string;
  severity: string;
  planStartAt: number | null;
  planEndAt: number | null;
  estimatedHours: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  ageDays: number | null;
  idleDays: number | null;
  cycleDays: number | null;
  overdueDays: number;
  overdue: boolean;
  stale: boolean;
  unassigned: boolean;
  riskReasons: string[];
  categoryLabel: string;
  url: string;
}

export type StageCounts = Record<StageGroup, number>;

export interface TrendPoint {
  /** 周一 00:00 的时间戳 */
  start: number;
  /** 下一周周一 00:00 的时间戳（右开区间） */
  end: number;
  label: string;
  created: number;
  completed: number;
}

export interface CycleStat {
  avg: number | null;
  median: number | null;
  sample: number;
}

export interface CategoryStat {
  category: string;
  label: string;
  total: number;
  counts: StageCounts;
  completionRate: number;
}

export interface AssigneeStat {
  key: string;
  name: string;
  total: number;
  counts: StageCounts;
  completionRate: number;
  open: number;
  overdue: number;
  stale: number;
  active: EnrichedItem[];
  recentDone: EnrichedItem[];
}

export interface SprintStat {
  id: string;
  name: string;
  status: string;
  startAt: number | null;
  endAt: number | null;
  total: number;
  counts: StageCounts;
  completionRate: number;
  open: number;
  overdue: number;
}

export interface ProjectStats {
  project: ProjectRecord;
  items: EnrichedItem[];
  total: number;
  counts: StageCounts;
  effectiveTotal: number;
  completionRate: number;
  startRate: number;
  open: number;
  overdue: number;
  stale: number;
  unassigned: number;
  byCategory: CategoryStat[];
  byAssignee: AssigneeStat[];
  bySprint: SprintStat[];
  trend: TrendPoint[];
  cycle: CycleStat;
  risks: EnrichedItem[];
  thisWeekCreated: number;
  thisWeekCompleted: number;
  lastActivityAt: number | null;
}

export interface MemberStat {
  key: string;
  name: string;
  projectIds: string[];
  total: number;
  counts: StageCounts;
  completionRate: number;
  open: number;
  overdue: number;
  stale: number;
  thisWeekCompleted: number;
  active: EnrichedItem[];
  recentDone: EnrichedItem[];
}

export interface OverallStats {
  generatedAt: number;
  organizationId: string;
  projectCount: number;
  total: number;
  counts: StageCounts;
  effectiveTotal: number;
  completionRate: number;
  open: number;
  overdue: number;
  stale: number;
  unassigned: number;
  thisWeekCreated: number;
  thisWeekCompleted: number;
  cycle: CycleStat;
  trend: TrendPoint[];
  projects: ProjectStats[];
  members: MemberStat[];
  risks: EnrichedItem[];
  items: EnrichedItem[];
}
