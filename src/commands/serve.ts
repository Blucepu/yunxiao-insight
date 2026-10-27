// serve — 本地实时模式：托管 yunxiao-search 构建产物 + 持有 token 的实时数据 API。
//
// 安全边界：token 只存在本机进程内；/api/data 返回的是 buildExploreData 的产物，
// 不含 token / 组织 id / API 地址。此服务只应绑定本机使用，不要暴露到公网。

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { boolFlag, numFlag, strFlag } from "../lib/args.ts";
import { loadRuntime } from "../lib/config.ts";
import { log, setQuiet } from "../lib/log.ts";
import { buildCurrentExploreData } from "../explore/build.ts";
import type { ExploreData } from "../explore/types.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/** 页面构建产物目录：优先同级 yunxiao-search 仓库的 dist */
export function webDistDir(root: string): string {
  return resolve(root, "..", "yunxiao-search", "dist");
}

/** 局域网 IPv4 地址列表（用于启动提示） */
function lanAddresses(): string[] {
  const result: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === "IPv4" && !item.internal) result.push(item.address);
    }
  }
  return result;
}

/** 用系统默认程序打开 URL / 文件 */
function openTarget(target: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    // 打开失败不影响主流程
  });
  child.unref();
}

export async function runServe(flags: Record<string, string | boolean>): Promise<void> {
  setQuiet(boolFlag(flags, "quiet"));
  const runtime = loadRuntime();
  const dist = webDistDir(runtime.root);
  // 页面产物缺失只影响静态托管，/api 实时数据不受影响（页面可跑在 vite dev 或 OSS 上）
  const hasDist = existsSync(join(dist, "index.html"));
  if (!hasDist) {
    log(`未找到 ${dist}/index.html，仅提供 /api 数据接口（静态页面请在 yunxiao-search 运行 bun run build）`);
  }
  const port = numFlag(flags, "port", 4173);
  // 默认绑定所有网卡（局域网服务）；--host 127.0.0.1 可收回仅本机
  const host = strFlag(flags, "host") ?? "0.0.0.0";

  // 内存缓存 1 分钟：挡轮询等高频请求；refresh=1（页面刷新按钮）始终直达云效
  const MEMORY_TTL_MS = 60_000;
  let cache: ExploreData | null = null;
  let cacheAt = 0;
  let building: Promise<ExploreData> | null = null;

  const buildData = (refresh: boolean): Promise<ExploreData> => {
    if (!refresh && cache && Date.now() - cacheAt < MEMORY_TTL_MS) {
      return Promise.resolve(cache);
    }
    // 并发请求共享同一次同步
    if (building) return building;
    building = (async () => {
      const { data } = await buildCurrentExploreData(runtime, {
        refresh,
        title: "云效工作项",
        onLog: log,
      });
      cache = data;
      cacheAt = Date.now();
      return data;
    })().finally(() => {
      building = null;
    });
    return building;
  };

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // /api 允许跨域：config.js 的 apiBase 场景下页面与 API 不同源
      const apiHeaders = { "access-control-allow-origin": "*" };

      if (url.pathname === "/api/health") {
        return Response.json({ ok: true, mode: "live" }, { headers: apiHeaders });
      }

      if (url.pathname === "/api/data") {
        try {
          const refresh = url.searchParams.get("refresh") === "1";
          const data = await buildData(refresh);
          return Response.json(data, { headers: apiHeaders });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: message }, { status: 500, headers: apiHeaders });
        }
      }

      // 静态资源：页面构建产物，找不到的路径回退 index.html（SPA）；产物缺失时 404
      if (!hasDist) {
        return Response.json({ error: "页面产物不存在，仅提供 /api 数据接口" }, { status: 404 });
      }
      const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      let file = join(dist, path);
      if (!file.startsWith(dist + sep) && file !== dist) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        file = join(dist, "index.html");
      }
      return new Response(Bun.file(file), {
        headers: {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
          "cache-control": "no-cache",
        },
      });
    },
  });

  console.log(`本地实时模式已启动（绑定 ${host}）：`);
  console.log(`  · 本机：  http://localhost:${server.port}`);
  for (const address of lanAddresses()) {
    console.log(`  · 局域网：http://${address}:${server.port}   ← 分享给同事`);
  }
  if (hasDist) console.log(`  · 页面目录：${dist}`);
  console.log(`  · 轮询走 1 分钟内存缓存 + 5 分钟快照 TTL；页面「刷新」按钮直达云效（?refresh=1）`);
  console.log("  · Ctrl+C 停止；对外分享：把页面 dist/ 整目录传 OSS，sync 会同步刷新其中的 data.json");

  // 预拉一次数据，避免第一个访问者等待全量同步
  void buildData(false).catch((error: unknown) => {
    log(`预拉数据失败：${error instanceof Error ? error.message : String(error)}`);
  });

  if (boolFlag(flags, "open")) {
    openTarget(`http://localhost:${server.port}`);
  }

  // 保持进程存活
  await new Promise(() => {});
}
