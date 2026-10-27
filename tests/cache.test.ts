import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  formatCacheAge,
  isSnapshotFresh,
  readSnapshot,
  snapshotPath,
  writeSnapshot,
} from "../src/lib/cache.ts";
import { makeProject, makeSnapshot, NOW } from "./fixtures.ts";

const root = mkdtempSync(resolve(tmpdir(), "yunxiao-insight-cache-"));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("本地快照缓存", () => {
  it("写入后可读取", () => {
    const snapshot = makeSnapshot([makeProject()], [], { fetchedAt: NOW });
    const file = writeSnapshot(root, snapshot);
    expect(file).toBe(snapshotPath(root));
    const loaded = readSnapshot(root);
    expect(loaded?.organizationId).toBe("org-test");
    expect(loaded?.projects).toHaveLength(1);
    expect(loaded?.items).toHaveLength(0);
  });

  it("原子写入不留下临时文件", () => {
    const files = readdirSync(resolve(root, "data"));
    expect(files.filter((file) => file.endsWith(".tmp"))).toHaveLength(0);
  });

  it("TTL 判断", () => {
    const snapshot = makeSnapshot([], [], { fetchedAt: NOW });
    expect(isSnapshotFresh(snapshot, 30, NOW + 10 * 60_000)).toBe(true);
    expect(isSnapshotFresh(snapshot, 30, NOW + 31 * 60_000)).toBe(false);
    expect(isSnapshotFresh(snapshot, 0, NOW)).toBe(false);
  });

  it("缓存年龄文本", () => {
    expect(formatCacheAge(30_000)).toBe("刚刚");
    expect(formatCacheAge(5 * 60_000)).toBe("5 分钟前");
    expect(formatCacheAge(3 * 60 * 60_000)).toBe("3 小时前");
    expect(formatCacheAge(2 * 24 * 60 * 60_000)).toBe("2 天前");
  });

  it("损坏的缓存返回 null", () => {
    const other = mkdtempSync(resolve(tmpdir(), "yunxiao-insight-broken-"));
    try {
      mkdirSync(resolve(other, "data"), { recursive: true });
      writeFileSync(resolve(other, "data", "snapshot.json"), "{broken", "utf8");
      expect(readSnapshot(other)).toBeNull();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});
