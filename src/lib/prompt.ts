import { createInterface } from "node:readline/promises";

/** 供交互选择与 `projects --list` 复用的项目候选 */
export interface ProjectCandidate {
  id: string;
  name: string;
  /** 是否被 config.excludeProjects 排除 */
  excluded: boolean;
  /** 本地快照中是否已同步工作项 */
  synced: boolean;
  /** 本地快照中缓存的工作项条数 */
  cachedItems: number;
}

export type ProjectChoice =
  | { kind: "select"; selectors: string[]; includeExcluded: boolean }
  | { kind: "all"; includeExcluded: boolean }
  | { kind: "cancel" };

export type ParseResult = ProjectChoice | { kind: "invalid"; message: string };

const CANCEL_WORDS = new Set(["q", "quit", "exit", "取消", "退出"]);

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * 解析交互输入（纯函数，便于测试）：
 * - 回车 → 全部（应用 excludeProjects）
 * - `all` / `*` → 全部（含已排除项目）
 * - `q` / `quit` / `exit` / `取消` → 取消
 * - 编号（逗号 / 空格分隔）→ 对应项目
 * - 其它文本 → 按项目名 / id / 唯一子串匹配
 */
export function parseProjectChoice(input: string, candidates: ProjectCandidate[]): ParseResult {
  const raw = input.trim();
  if (raw === "") return { kind: "all", includeExcluded: false };

  const lower = normalize(raw);
  if (raw === "*" || lower === "all") return { kind: "all", includeExcluded: true };
  if (CANCEL_WORDS.has(lower)) return { kind: "cancel" };

  const tokens = raw.split(/[\s,，、;；]+/).filter(Boolean);
  const selectors: string[] = [];

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const index = Number(token) - 1;
      const candidate = candidates[index];
      if (!candidate) {
        return { kind: "invalid", message: `编号 ${token} 超出范围（1-${candidates.length}）` };
      }
      selectors.push(candidate.id);
      continue;
    }
    const lowered = token.toLowerCase();
    const matches = candidates.filter(
      (candidate) =>
        candidate.id === token ||
        candidate.name === token ||
        candidate.name.toLowerCase() === lowered ||
        candidate.name.toLowerCase().includes(lowered),
    );
    if (matches.length === 0) {
      return { kind: "invalid", message: `找不到项目「${token}」` };
    }
    if (matches.length > 1) {
      return {
        kind: "invalid",
        message: `「${token}」匹配到多个项目：${matches.map((match) => match.name).join("、")}`,
      };
    }
    const match = matches[0];
    if (match) selectors.push(match.id);
  }

  if (selectors.length === 0) return { kind: "invalid", message: "未识别到任何项目" };
  return { kind: "select", selectors: [...new Set(selectors)], includeExcluded: true };
}

/** 项目的状态短标签，供列表与交互共用 */
export function candidateStatusLabel(candidate: ProjectCandidate): string {
  const parts: string[] = [];
  if (candidate.excluded) parts.push("已排除");
  parts.push(candidate.synced ? `已同步 ${candidate.cachedItems} 条` : "未同步");
  return parts.join(" · ");
}

/** 编号项目清单（`projects --list` 与交互提示共用） */
export function renderCandidateList(candidates: ProjectCandidate[]): string {
  if (candidates.length === 0) return "（没有可用的项目）";
  const width = String(candidates.length).length;
  return candidates
    .map(
      (candidate, index) =>
        `  ${String(index + 1).padStart(width)}. ${candidate.name}（${candidateStatusLabel(candidate)}）`,
    )
    .join("\n");
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** 仅 TTY 下调用的交互式项目选择；最多重试 3 次后抛错 */
export async function promptProjectSelection(
  candidates: ProjectCandidate[],
): Promise<ProjectChoice> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`可获取的项目：\n${renderCandidateList(candidates)}\n`);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let answer: string;
      try {
        answer = await rl.question(
          "选择项目编号（逗号分隔；回车=全部，all=全部含已排除，q=取消）> ",
        );
      } catch {
        // Ctrl+D / 输入流关闭 → 视为取消，避免抛出难以理解的错误
        return { kind: "cancel" };
      }
      const parsed = parseProjectChoice(answer, candidates);
      if (parsed.kind !== "invalid") return parsed;
      process.stdout.write(`⚠️ ${parsed.message}\n`);
    }
    throw new Error("[yunxiao-insight] 未能解析项目选择，已退出（可改用 --project / --all）");
  } finally {
    rl.close();
  }
}