import type { ProjectRecord } from "./types.ts";

/** 把用户输入的项目选择器解析成项目 id 列表 */
export function resolveProjectSelectors(
  projects: ProjectRecord[],
  selectors: string[],
  aliases: Record<string, string> = {},
): ProjectRecord[] {
  const cleaned = selectors.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0 || cleaned.some((s) => s.toLowerCase() === "all" || s === "*")) {
    return [...projects];
  }

  const selected = new Map<string, ProjectRecord>();
  const resolveOne = (raw: string): ProjectRecord[] => {
    const input = raw.trim();
    if (!input) return [];

    const aliasTarget = aliases[input] ?? aliases[input.toLowerCase()];
    const candidates = aliasTarget ? [aliasTarget, input] : [input];

    for (const candidate of candidates) {
      const exact = projects.filter(
        (p) => p.id === candidate || p.name === candidate || p.name.toLowerCase() === candidate.toLowerCase(),
      );
      if (exact.length) return exact;
    }

    // 唯一子串匹配（方便输入 APM、角色）
    const contains = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(input.toLowerCase()) ||
        p.id.toLowerCase().includes(input.toLowerCase()) ||
        (p.customCode ?? "").toLowerCase() === input.toLowerCase(),
    );
    const unique = new Map(contains.map((p) => [p.id, p]));
    return [...unique.values()];
  };

  const missing: string[] = [];
  for (const selector of cleaned) {
    const matches = resolveOne(selector);
    if (matches.length === 0) {
      missing.push(selector);
      continue;
    }
    if (matches.length > 1) {
      throw new Error(
        `[yunxiao-insight] 项目「${selector}」匹配到多个结果：${matches.map((p) => p.name).join("、")}，请写得更精确`,
      );
    }
    const match = matches[0];
    if (match) selected.set(match.id, match);
  }

  if (missing.length) {
    const available = projects.map((p) => p.name).join("、");
    throw new Error(
      `[yunxiao-insight] 找不到项目：${missing.join("、")}\n  可用项目：${available}`,
    );
  }

  return [...selected.values()];
}

/** 配置里的 excludeProjects 支持项目名 / id / 唯一子串 */
export function isProjectExcluded(
  project: ProjectRecord,
  excludeProjects: string[],
  aliases: Record<string, string> = {},
): boolean {
  if (!excludeProjects.length) return false;
  for (const raw of excludeProjects) {
    const input = raw.trim();
    if (!input) continue;
    const aliasTarget = aliases[input] ?? aliases[input.toLowerCase()];
    const candidates = aliasTarget ? [aliasTarget, input] : [input];
    for (const candidate of candidates) {
      if (
        project.id === candidate ||
        project.name === candidate ||
        project.name.toLowerCase() === candidate.toLowerCase()
      ) {
        return true;
      }
    }
  }
  return false;
}

export function filterProjects(
  projects: ProjectRecord[],
  excludeProjects: string[],
  aliases: Record<string, string> = {},
): ProjectRecord[] {
  return projects.filter((p) => !isProjectExcluded(p, excludeProjects, aliases));
}

export function projectNameById(projects: ProjectRecord[]): Map<string, string> {
  return new Map(projects.map((p) => [p.id, p.name]));
}

/**
 * 命令层的项目选择：
 * - 不传 / all → 全部项目，但应用 config.excludeProjects
 * - 显式指定 → 以用户为准（即使该项目在 excludeProjects 里）
 */
export function selectProjects(
  projects: ProjectRecord[],
  selectors: string[],
  excludeProjects: string[] = [],
  aliases: Record<string, string> = {},
): ProjectRecord[] {
  const explicit = selectors.map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== "all" && s !== "*");
  if (explicit.length === 0) return filterProjects(projects, excludeProjects, aliases);
  return resolveProjectSelectors(projects, explicit, aliases);
}
