export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

const BOOLEAN_FLAGS = new Set([
  "help",
  "refresh",
  "offline",
  "json",
  "open",
  "all",
  "quiet",
  "force",
  "version",
  "yes",
  "list",
  "public",
  "live",
  "build",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) break;
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const eq = key.indexOf("=");
    if (eq !== -1) {
      flags[key.slice(0, eq)] = key.slice(eq + 1);
      continue;
    }
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, flags, positional };
}

export function strFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function boolFlag(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}

export function hasFlag(flags: Record<string, string | boolean>, key: string): boolean {
  return key in flags;
}

export function numFlag(
  flags: Record<string, string | boolean>,
  key: string,
  fallback: number,
): number {
  const value = strFlag(flags, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function listFlag(
  flags: Record<string, string | boolean>,
  key: string,
  fallback: string[] = [],
): string[] {
  const value = strFlag(flags, key);
  if (value === undefined) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 支持 --project A,B 或 --project A --project B（后者会被解析成字符串，暂不支持重复） */
export function projectSelectors(flags: Record<string, string | boolean>): string[] {
  return listFlag(flags, "project");
}

export function requireString(
  flags: Record<string, string | boolean>,
  key: string,
  message: string,
): string {
  const value = strFlag(flags, key);
  if (!value) throw new Error(`[yunxiao-insight] ${message}`);
  return value;
}

export function positionalOrFlag(
  positional: string[],
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  return positional[0] ?? strFlag(flags, key);
}
