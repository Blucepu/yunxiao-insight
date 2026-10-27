import { describe, expect, it } from "vitest";
import { YunxiaoApiError, YunxiaoClient, gmtCreateFilter } from "../src/lib/client.ts";
import { makeItem } from "./fixtures.ts";

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeFetch(handler: (call: FetchCall) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return handler({ url, body });
  }) as typeof fetch;
}

function createClient(fetchImpl: typeof fetch, retries = 0): YunxiaoClient {
  return new YunxiaoClient({
    baseUrl: "https://api.example.com",
    token: "token",
    organizationId: "org",
    fetchImpl,
    retries,
  });
}

describe("项目接口", () => {
  it("分页拉取并去重排序", async () => {
    const pages: number[] = [];
    const fetchImpl = makeFetch(({ body }) => {
      const page = Number(body.page);
      pages.push(page);
      if (page === 1) {
        return jsonResponse([{ id: "b", name: "Beta" }], { "x-total-pages": "2" });
      }
      return jsonResponse([{ id: "a", name: "Alpha" }], { "x-total-pages": "2" });
    });
    const client = createClient(fetchImpl);
    const projects = await client.listProjects();
    expect(pages).toEqual([1, 2]);
    expect(projects.map((project) => project.name)).toEqual(["Alpha", "Beta"]);
    expect(client.requests).toBe(2);
  });
});

describe("工作项接口", () => {
  it("自动翻页并合并", async () => {
    const perPage = 10;
    const total = 25;
    const fetchImpl = makeFetch(({ body }) => {
      const page = Number(body.page);
      const start = (page - 1) * perPage;
      const count = Math.max(0, Math.min(perPage, total - start));
      const items = Array.from({ length: count }, (_, index) =>
        makeItem({ id: `i${start + index + 1}` }),
      );
      return jsonResponse(items, {
        "x-total": String(total),
        "x-total-pages": String(Math.ceil(total / perPage)),
      });
    });
    const client = createClient(fetchImpl);
    const result = await client.pullAllWorkitems("p1", { perPage, categories: ["Req"] });
    expect(result.items).toHaveLength(25);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(25);
    expect(result.total).toBe(25);
    expect(client.requests).toBe(3);
  });

  it("超过 10000 条时按创建时间分段拉取", async () => {
    const notices: string[] = [];
    let requests = 0;
    const fetchImpl = makeFetch(({ body }) => {
      requests += 1;
      const parsed = body.conditions
        ? (JSON.parse(String(body.conditions)) as {
            conditionGroups: Array<Array<Record<string, unknown>>>;
          })
        : null;
      const filters = parsed?.conditionGroups?.[0] ?? [];
      const gmt = filters.find((filter) => filter.fieldIdentifier === "gmtCreate") as
        | { value: [string]; toValue: string }
        | undefined;
      if (!gmt) {
        return jsonResponse([], { "x-total": "10001", "x-total-pages": "51" });
      }
      const from = new Date(gmt.value[0].replace(" ", "T")).getTime();
      const to = new Date(gmt.toValue.replace(" ", "T")).getTime();
      const spanDays = (to - from) / 86_400_000;
      if (spanDays > 4000) {
        return jsonResponse([], { "x-total": "10001", "x-total-pages": "51" });
      }
      return jsonResponse([makeItem({ id: "a" }), makeItem({ id: "b" })], {
        "x-total": "2",
        "x-total-pages": "1",
      });
    });
    const client = createClient(fetchImpl);
    const result = await client.pullAllWorkitems("p1", {
      onNotice: (message) => notices.push(message),
    });
    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.total).toBe(10001);
    expect(requests).toBe(4);
    expect(notices.some((message) => message.includes("按创建时间分段拉取"))).toBe(true);
  });
});

describe("错误处理", () => {
  it("401 给出 token 提示", async () => {
    const fetchImpl = makeFetch(
      () =>
        new Response(JSON.stringify({ errorMessage: "token 无效" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createClient(fetchImpl);
    const error = await client.listProjects().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(YunxiaoApiError);
    expect((error as Error).message).toMatch(/token 无效/);
  });

  it("gmtCreateFilter 结构符合云效条件格式", () => {
    const filter = gmtCreateFilter("2026-01-01 00:00:00", "2026-01-31 23:59:59") as Record<
      string,
      unknown
    >;
    expect(filter.fieldIdentifier).toBe("gmtCreate");
    expect(filter.operator).toBe("BETWEEN");
    expect(filter.value).toEqual(["2026-01-01 00:00:00"]);
    expect(filter.toValue).toBe("2026-01-31 23:59:59");
  });
});
