# AGENTS.md

本仓库是 `yunxiao-insight`：复用云效（Yunxiao）token、只读拉取工作项、产出页面数据 `data.json` 的 Bun + TypeScript CLI。

**页面应用在同级仓库 `../yunxiao-search`**（React SPA：全局搜索 + 数据表格 + 抽屉详情 + 周报汇总）。本仓库只管数据；页面 UI 改动去 yunxiao-search。

## 在本仓库工作时

- 用户提到「项目进度 / 完成率 / 全局搜索 / 谁在干什么 / 逾期 / 停滞」时，加载技能
  `yunxiao-insight`（见 `.opencode/skills/yunxiao-insight/SKILL.md`），按其流程执行。
- CLI 只有两个命令：`sync`（刷新快照 + 写页面 `dist/data.json`）与 `serve`（本地实时模式，托管 yunxiao-search 的 dist + 实时 API）。
- 页面数据契约在 `src/explore/types.ts`；yunxiao-search 以 type-only 方式 import 它，改动字段时两边一起改。
- 常用路径：`bun run src/cli.ts sync` → `bun run src/cli.ts serve --open`。

## 底线

- 只读：不调用任何云效写接口。
- 不回显 `.env.local` / token；`data.json` 不得包含 token、组织 id、API 地址（`explore/build.ts` 刻意不接收凭证对象，保持这一边界）。
- 不手工编辑 `data/` 下的产物，交给 CLI 生成。
- 不擅自 `--refresh`（消耗接口配额）；优先缓存。
- 改动代码后运行 `bun run check`（类型检查 + 单元测试）。
