import { addDays, formatDate, toTimestamp } from "./dates.ts";
import type {
  Member,
  ProjectRecord,
  SprintRecord,
  YunxiaoProject,
  YunxiaoWorkitem,
} from "./types.ts";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_PAGE_WINDOW = 10_000;
const MAX_PER_PAGE = 200;

export class YunxiaoApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;

  constructor(status: number, method: string, path: string, message: string) {
    super(message);
    this.name = "YunxiaoApiError";
    this.status = status;
    this.method = method;
    this.path = path;
  }
}

export interface ClientOptions {
  baseUrl: string;
  token: string;
  organizationId: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export interface PullWorkitemsOptions {
  categories?: string[];
  conditions?: unknown[];
  perPage?: number;
  onProgress?: (fetched: number, total: number) => void;
  onNotice?: (message: string) => void;
}

export interface PullWorkitemsResult {
  items: YunxiaoWorkitem[];
  total: number;
}

interface SearchPage {
  items: YunxiaoWorkitem[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorHint(status: number): string {
  switch (status) {
    case 400:
      return "请求参数错误";
    case 401:
      return "token 无效或已过期";
    case 403:
      return "没有权限（token 权限不足或组织不匹配）";
    case 404:
      return "资源不存在（检查 orgId / spaceId / 接口路径）";
    case 429:
      return "请求过于频繁，已被限流";
    default:
      return "请求失败";
  }
}

function parseErrorDetail(text: string): string {
  try {
    const json = JSON.parse(text) as {
      errorMessage?: string;
      errorMsg?: string;
      message?: string;
      requestId?: string;
    };
    return json.errorMessage ?? json.errorMsg ?? json.message ?? text;
  } catch {
    return text;
  }
}

/** 把云效的日期条件拼成 filter 对象 */
export function gmtCreateFilter(from: string, to: string): unknown {
  return {
    fieldIdentifier: "gmtCreate",
    operator: "BETWEEN",
    value: [from],
    toValue: to,
    className: "dateTime",
    format: "input",
  };
}

function dateText(time: number): string {
  return `${formatDate(time)} 00:00:00`;
}

function dateEndText(time: number): string {
  return `${formatDate(time)} 23:59:59`;
}

export class YunxiaoClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly organizationId: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private requestCount = 0;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.organizationId = options.organizationId;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get requests(): number {
    return this.requestCount;
  }

  private orgPath(path: string): string {
    return `/oapi/v1/projex/organizations/${this.organizationId}${path}`;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    retries = this.retries,
  ): Promise<{ data: T; headers: Headers }> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      this.requestCount += 1;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            "x-yunxiao-token": this.token,
            "Content-Type": "application/json",
            "User-Agent": "yunxiao-insight/0.1.0",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new YunxiaoApiError(
          0,
          method,
          path,
          `[yunxiao] ${method} ${path} 网络请求失败：${(error as Error).message}`,
        );
      }

      if (response.ok) {
        if (response.status === 204) {
          return { data: undefined as T, headers: response.headers };
        }
        const text = await response.text();
        if (!text) return { data: undefined as T, headers: response.headers };
        try {
          return { data: JSON.parse(text) as T, headers: response.headers };
        } catch {
          return { data: text as T, headers: response.headers };
        }
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "");
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt;
        await sleep(wait);
        continue;
      }

      const text = await response.text().catch(() => "");
      const detail = parseErrorDetail(text);
      throw new YunxiaoApiError(
        response.status,
        method,
        path,
        `[yunxiao] ${method} ${path} -> ${response.status} ${errorHint(response.status)}：${detail}`,
      );
    }

    throw new YunxiaoApiError(
      0,
      method,
      path,
      `[yunxiao] ${method} ${path} 重试 ${retries} 次后仍失败：${String(lastError)}`,
    );
  }

  /** 列出组织内所有项目（自动翻页） */
  async listProjects(): Promise<ProjectRecord[]> {
    const perPage = MAX_PER_PAGE;
    const all: ProjectRecord[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const { data, headers } = await this.request<YunxiaoProject[]>(
        "POST",
        this.orgPath("/projects:search"),
        { page, perPage, orderBy: "gmtCreate", sort: "desc" },
      );
      const items = Array.isArray(data) ? data : [];
      totalPages = Number(headers.get("x-total-pages") ?? "1");
      for (const project of items) {
        all.push({
          id: project.id,
          name: project.name,
          description: project.description,
          customCode: project.customCode,
          logicalStatus: project.logicalStatus ?? null,
          statusName: project.status?.name,
          gmtCreate: toTimestamp(project.gmtCreate),
          gmtModified: toTimestamp(project.gmtModified),
        });
      }
      if (items.length === 0 || page >= totalPages) break;
      page += 1;
    }

    // 去重 + 稳定排序（名称）
    const byId = new Map<string, ProjectRecord>();
    for (const project of all) byId.set(project.id, project);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  async listSprints(spaceId: string): Promise<SprintRecord[]> {
    const { data } = await this.request<unknown>("GET", this.orgPath(`/projects/${spaceId}/sprints`));
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as { sprints?: unknown[] })?.sprints)
        ? ((data as { sprints: unknown[] }).sprints as unknown[])
        : [];
    return items.map((raw) => {
      const sprint = raw as Record<string, unknown>;
      return {
        id: String(sprint.id ?? ""),
        name: String(sprint.name ?? ""),
        status: typeof sprint.status === "string" ? sprint.status : undefined,
        startDate: toTimestamp(sprint.startDate),
        endDate: toTimestamp(sprint.endDate),
        capacityHours:
          typeof sprint.capacityHours === "number" && Number.isFinite(sprint.capacityHours)
            ? sprint.capacityHours
            : null,
        locked: sprint.locked === true,
        description: typeof sprint.description === "string" ? sprint.description : undefined,
        owners: Array.isArray(sprint.owners)
          ? (sprint.owners as Array<{ id?: unknown; name?: unknown }>).map((owner) => ({
              id: String(owner.id ?? ""),
              name: String(owner.name ?? ""),
            }))
          : undefined,
      };
    });
  }

  async listMembers(spaceId: string): Promise<Member[]> {
    const { data } = await this.request<unknown>("GET", this.orgPath(`/projects/${spaceId}/members`));
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as { members?: unknown[] })?.members)
        ? ((data as { members: unknown[] }).members as unknown[])
        : [];
    return items.map((raw) => {
      const member = raw as Record<string, unknown>;
      return {
        userId: String(member.userId ?? member.id ?? ""),
        userName: String(member.userName ?? member.name ?? ""),
        roleName: typeof member.roleName === "string" ? member.roleName : undefined,
      };
    });
  }

  /** 搜索单页工作项 */
  async searchWorkitems(
    spaceId: string,
    page: number,
    perPage: number,
    categories: string[],
    conditions?: unknown[],
  ): Promise<SearchPage> {
    const safePerPage = Math.min(Math.max(1, perPage), MAX_PER_PAGE);
    const body: Record<string, unknown> = {
      spaceId,
      spaceType: "Project",
      category: categories.join(","),
      page,
      perPage: safePerPage,
      orderBy: "gmtCreate",
      sort: "asc",
    };
    if (conditions?.length) {
      body.conditions = JSON.stringify({ conditionGroups: [conditions] });
    }

    const { data, headers } = await this.request<YunxiaoWorkitem[]>(
      "POST",
      this.orgPath("/workitems:search"),
      body,
    );

    return {
      items: Array.isArray(data) ? data : [],
      total: Number(headers.get("x-total") ?? "0"),
      totalPages: Number(headers.get("x-total-pages") ?? "1"),
      page,
      perPage: safePerPage,
    };
  }

  /**
   * 拉取一个项目的全部工作项。
   * 云效限制 page * perPage <= 10000；超限时按 gmtCreate 递归二分时间窗口。
   */
  async pullAllWorkitems(spaceId: string, options: PullWorkitemsOptions = {}): Promise<PullWorkitemsResult> {
    const categories = options.categories?.length ? options.categories : ["Req", "Bug", "Task", "Risk"];
    const perPage = Math.min(Math.max(1, options.perPage ?? MAX_PER_PAGE), MAX_PER_PAGE);
    const baseConditions = options.conditions ?? [];

    const byId = new Map<string, YunxiaoWorkitem>();
    let reportedTotal = 0;

    const addItems = (items: YunxiaoWorkitem[]): void => {
      for (const item of items) byId.set(item.id, item);
      options.onProgress?.(byId.size, Math.max(reportedTotal, byId.size));
    };

    const pullPages = async (conditions: unknown[], firstPage?: SearchPage): Promise<void> => {
      const first =
        firstPage ?? (await this.searchWorkitems(spaceId, 1, perPage, categories, conditions));
      reportedTotal = Math.max(reportedTotal, first.total);
      addItems(first.items);
      let page = 1;
      let totalPages = first.totalPages;
      while (page < totalPages) {
        page += 1;
        if (page * perPage > MAX_PAGE_WINDOW) break;
        const next = await this.searchWorkitems(spaceId, page, perPage, categories, conditions);
        totalPages = next.totalPages;
        addItems(next.items);
        if (next.items.length === 0) break;
      }
    };

    const pullRange = async (from: number, to: number, depth: number): Promise<void> => {
      const conditions = [...baseConditions, gmtCreateFilter(dateText(from), dateEndText(to))];
      const first = await this.searchWorkitems(spaceId, 1, perPage, categories, conditions);
      reportedTotal = Math.max(reportedTotal, first.total);

      if (first.total <= MAX_PAGE_WINDOW) {
        await pullPages(conditions, first);
        return;
      }

      const spanDays = Math.floor((to - from) / 86_400_000);
      if (depth >= 10 || spanDays <= 1) {
        options.onNotice?.(
          `[yunxiao] 时间窗口 ${formatDate(from)} ~ ${formatDate(to)} 仍有 ${first.total} 条，` +
            `超过分页上限，已拉取前 ${MAX_PAGE_WINDOW} 条；建议用更细的时间范围查询`,
        );
        await pullPages(conditions, first);
        return;
      }

      const mid = Math.floor((from + to) / 2);
      options.onNotice?.(
        `[yunxiao] ${formatDate(from)} ~ ${formatDate(to)} 共 ${first.total} 条，按创建时间分段拉取`,
      );
      await pullRange(from, mid, depth + 1);
      await pullRange(addDays(mid, 1), to, depth + 1);
    };

    const totalProbe = await this.searchWorkitems(spaceId, 1, perPage, categories, baseConditions);
    reportedTotal = totalProbe.total;

    if (totalProbe.total <= MAX_PAGE_WINDOW) {
      await pullPages(baseConditions, totalProbe);
    } else {
      options.onNotice?.(
        `[yunxiao] 工作项总数 ${totalProbe.total} 超过 10000 条分页窗口，按创建时间分段拉取`,
      );
      // 从 2010-01-01 到明天，覆盖绝大多数组织数据
      const from = new Date("2010-01-01T00:00:00").getTime();
      const to = addDays(Date.now(), 1);
      await pullRange(from, to, 0);
    }

    return { items: [...byId.values()], total: reportedTotal };
  }
}

/** 兼容旧调用：直接构造一个客户端 */
export function createClient(runtime: {
  apiBaseUrl: string;
  token: string;
  organizationId: string;
}): YunxiaoClient {
  return new YunxiaoClient({
    baseUrl: runtime.apiBaseUrl,
    token: runtime.token,
    organizationId: runtime.organizationId,
  });
}
