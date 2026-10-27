import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Snapshot } from "./types.ts";

export const SNAPSHOT_VERSION = 2;

export function cacheDir(root: string): string {
  return resolve(root, "data");
}

export function snapshotPath(root: string): string {
  return resolve(cacheDir(root), "snapshot.json");
}

export function readSnapshot(root: string): Snapshot | null {
  const file = snapshotPath(root);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
    if (!parsed || parsed.version !== SNAPSHOT_VERSION) return null;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 原子写入，避免中途中断导致缓存损坏 */
export function writeSnapshot(root: string, snapshot: Snapshot): string {
  const dir = cacheDir(root);
  mkdirSync(dir, { recursive: true });
  const file = snapshotPath(root);
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(snapshot)}\n`, "utf8");
  renameSync(temp, file);
  return file;
}

export function snapshotAgeMs(snapshot: Snapshot, now = Date.now()): number {
  return Math.max(0, now - snapshot.fetchedAt);
}

export function isSnapshotFresh(snapshot: Snapshot, ttlMinutes: number, now = Date.now()): boolean {
  if (ttlMinutes <= 0) return false;
  return snapshotAgeMs(snapshot, now) <= ttlMinutes * 60_000;
}

export function formatCacheAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
