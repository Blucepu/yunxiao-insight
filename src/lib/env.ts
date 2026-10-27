import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** 项目根目录（src/lib -> 项目根） */
export function projectRoot(): string {
  return resolve(MODULE_DIR, "..", "..");
}

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  return input;
}

/**
 * 解析 .env 文件。支持：
 *   KEY=value
 *   export KEY=value
 *   KEY="value" / KEY='value'
 *   # 注释、空行
 * 已存在的环境变量优先，不会被文件覆盖。
 */
export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** 加载项目根目录下的 .env.local（环境变量优先） */
export function loadEnvFile(root = projectRoot(), filename = ".env.local"): string {
  const file = resolve(root, filename);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return file;
  }
  const values = parseEnvFile(text);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return file;
}
