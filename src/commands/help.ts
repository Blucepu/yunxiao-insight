export const VERSION = "0.2.0";

export const COMMANDS = ["sync", "serve", "help"];

const GLOBAL_OPTIONS = `通用选项：
  --project <名称>   限定项目，逗号分隔；支持项目名 / id / 唯一子串
  --all              包含 config.excludeProjects 中排除的项目
  --refresh          忽略缓存，重新拉取
  --json             输出 JSON（便于 jq 等工具处理）
  --quiet            隐藏进度日志
  -h, --help         查看帮助`;

const WORKFLOW = `典型流程：
  cd ../yunxiao-search && bun run build   # 构建页面应用（首次 / 页面代码变更后）
  bun run src/cli.ts sync                 # 拉取快照，同时刷新页面 dist/data.json
  bun run src/cli.ts serve --open         # 本地实时模式：页面内点「实时搜索」即同步云效

OSS 部署：把 ../yunxiao-search/dist 整目录上传；之后每次 sync 都会刷新其中的
data.json，只需重新上传该文件。

指标口径：
  完成率 = 已完成 ÷（总数 − 已取消）
  逾期   = 计划完成时间早于今天且未完成、未取消
  停滞   = 超过 staleDays 天未更新且未完成、未取消
  风险   = 逾期 / 停滞 / 未分配 / 3 天内到期`;

export function globalHelp(): string {
  return `云效工作项 · 数据管线 CLI · v${VERSION}

页面应用在同级仓库 yunxiao-search；本仓库只负责拿数据与本地实时服务。

用法：
  bun run src/cli.ts <命令> [选项]

命令：
  sync       刷新本地数据快照 + 页面 dist/data.json（可只刷新指定项目）
  serve      本地实时模式：托管页面 + 实时数据 API（token 不出本机）
  help       查看帮助

${GLOBAL_OPTIONS}

${WORKFLOW}`;
}

export function commandHelp(command: string): string {
  switch (command) {
    case "sync":
      return `sync — 刷新本地数据快照 + 页面 dist/data.json

用法：
  bun run src/cli.ts sync [选项]

选项：
  --project <名称>   只增量刷新指定项目（逗号分隔）
  --all              包含 config.excludeProjects 中排除的项目
  --yes              跳过交互选择（非交互环境等价于默认全部）
  --json             输出 JSON 摘要
  --quiet            隐藏进度日志

说明：
  快照保存在 data/snapshot.json，默认 30 分钟内复用（config.cacheTtlMinutes）。
  全量刷新会替换全部项目数据；指定项目时只替换这些项目的数据。
  同步成功后会自动重建页面数据并写入页面构建产物目录的 data.json
  （优先 ../yunxiao-search/dist，其次 ./dist；页面未构建则跳过）。
  在终端（TTY）中运行且未指定 --project/--all 时，会列出项目让你选择；
  AI / CI 等非交互环境保持默认静默，不会等待输入。`;

    case "serve":
      return `serve — 本地实时模式

用法：
  bun run src/cli.ts serve [选项]

选项：
  --port <端口>        监听端口，默认 4173
  --host <地址>        绑定地址，默认 0.0.0.0（局域网可达）；127.0.0.1 = 仅本机
  --open               启动后用默认浏览器打开
  --quiet              隐藏进度日志

说明：
  托管同级 yunxiao-search 仓库的页面构建产物（dist/），
  并提供实时数据 API：
    GET /api/health   模式探测
    GET /api/data     当前数据（?refresh=1 时先同步云效，间隔 ≥60 秒）
  页面代码变更后需在 yunxiao-search 里重新 bun run build。
  默认绑定 0.0.0.0，同事可直接访问 http://<本机IP>:4173（同网段即信任，
  无访问控制；/api 已开启 CORS，可供 OSS 页面通过 config.js 的 apiBase 回连）。
  token 只存在本机进程内，接口返回的数据不含任何凭证。
  页面内点击「实时搜索」或搜索框回车即触发同步（无间隔限制，并发请求自动合并）。
  请勿把此服务暴露到公网；对外分享请上传 yunxiao-search/dist 到 OSS。`;

    case "help":
    default:
      return globalHelp();
  }
}
