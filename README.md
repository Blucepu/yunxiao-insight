# yunxiao-insight

云效（Yunxiao）数据管线 CLI：只读拉取组织内工作项 → 本地快照 → 产出页面数据 `data.json`。
配套的页面应用在同级仓库 **yunxiao-search**（全局搜索 + 数据表格 + 周报汇总，可传 OSS）。

- **只读接入**：只调用云效 OpenAPI 的项目与工作项查询接口，不修改任何数据。
- **两个命令**：`sync`（拉数据 + 刷新页面 data.json）、`serve`（本地实时模式）。
- **安全边界**：token 只在 `.env.local` / 本机进程内；`data.json` 不含 token、组织 id、API 地址。

## 快速开始

要求：[Bun](https://bun.sh/) 1.2+。

```bash
cd yunxiao-insight
bun install
cp config.example.json config.json   # 填 organizationId
cp .env.example .env.local           # 填 YUNXIAO_TOKEN；chmod 600 .env.local

# 构建页面（同级 yunxiao-search 仓库）
cd ../yunxiao-search && bun install && bun run build && cd -

# 拉数据（会同时把 data.json 写进 ../yunxiao-search/dist/）
bun run src/cli.ts sync

# 本地实时模式
bun run src/cli.ts serve --open
```

令牌获取：<https://devops.aliyun.com/settings/personal-access-tokens>；组织 id 可从
`https://devops.aliyun.com/organization/<id>` 获取。

## 命令

```bash
bun run src/cli.ts sync                    # 刷新全部（应用 excludeProjects），并更新页面 data.json
bun run src/cli.ts sync --project APM_IM   # 只增量刷新指定项目
bun run src/cli.ts sync --all              # 含配置排除的项目
bun run src/cli.ts serve [--port 4173] [--host 0.0.0.0] [--min-refresh 60] [--open]   # 实时模式
```

- `serve` 托管 `../yunxiao-search/dist` 并提供 `/api/data`（`?refresh=1` 时先同步云效）。
  token 不出本机；请勿把此服务暴露到公网。
- **局域网分享**：默认绑定 `0.0.0.0`，启动后会打印 `http://<本机IP>:4173`，直接发给同网段同事即可
  （同网段即信任，无访问控制）；`--host 127.0.0.1` 可收回仅本机。`/api` 已开启 CORS，
  OSS 上的静态页面也可以通过 `dist/config.js` 的 `apiBase` 回连这台机器取实时数据。
- 页面改动后在 yunxiao-search 里 `bun run build`，`serve` 无需重启。

## OSS 部署

把 `../yunxiao-search/dist/` 整目录上传为静态网站；页面每 30 秒轮询同目录 `data.json`。
之后更新数据只需：本地 `bun run src/cli.ts sync` → 重新上传 `dist/data.json`。
产物不含凭证，但含工作项明细，请用 bucket 私有 / 签名 URL / 内网网关控制访问。

如需让 OSS 访客也能实时取数：云效 OpenAPI 不支持浏览器跨域直调（无 CORS 头），
可把本仓库的 `serve` 逻辑部署为云函数代理，然后在 `dist/config.js` 里填 `apiBase`
即可，无需重新构建页面（详见 yunxiao-search/README.md）。

## 配置

配置优先级：环境变量 > `.env.local` > `config.json` > 内置默认值。主要字段：

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| `organizationId` | 云效组织 id | 空 |
| `apiBaseUrl` | OpenAPI 地址 | `https://openapi-rdc.aliyuncs.com` |
| `cacheTtlMinutes` | 快照复用时长（分钟） | `30` |
| `staleDays` | 停滞判定天数 | `14` |
| `categories` | 拉取的工作项类别 | `Req/Bug/Task/Risk` |
| `excludeProjects` | 默认排除的项目 | `[]` |
| `projectAliases` | 项目别名 | `{"apm-im":"APM_IM"}` |
| `stageGroups` | `statusStageId → 阶段` 覆盖 | 见 config.example.json |
| `statusGroups` | 状态名 → 阶段覆盖（优先级最高） | `{}` |
| `workitemUrlTemplate` | 工作项详情链接模板 | 云效 Projex 地址 |

环境变量：`YUNXIAO_ORGANIZATION_ID`、`YUNXIAO_TOKEN`、`YUNXIAO_OPEN_API`、`YUNXIAO_INSIGHT_DEBUG=1`。

## 指标口径

| 指标 | 定义 |
| --- | --- |
| 完成率 | 已完成 ÷（总数 − 已取消） |
| 逾期 | 计划完成时间早于今天，且未完成、未取消 |
| 停滞 | 超过 `staleDays` 天未更新，且未完成、未取消 |
| 未分配 | 未完成、未取消，且没有负责人 |
| 本周 | 以周一为一周起点 |
| 阶段 | `statusGroups`（状态名）→ `stageGroups`（statusStageId）→ 状态名关键词兜底 |

## 项目结构

```
src/
  cli.ts                 CLI 入口（sync / serve / help）
  commands/              sync.ts / serve.ts / help.ts
  explore/               页面数据契约与组装（不接触凭证）
    types.ts             data.json 的 Schema（页面应用 type-only import 它）
    data.ts              统计结果 → 页面数据
    build.ts             快照 → data.json（含写入页面 dist 的 writeWebData）
  lib/                   client / cache / sync / insight / stats / domain / stage / …
tests/                   Vitest 单元测试
```

## 开发与测试

```bash
bun run check        # 类型检查 + 单元测试
```

## 安全

- 项目只读，不调用任何写接口。
- `.env.local`、`data/` 已加入 `.gitignore`。
- `data.json` 已验证不含 token / 组织 id / API 地址；`explore/build.ts` 刻意不接收凭证对象，改动时保持这一边界。
