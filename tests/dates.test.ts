import { describe, expect, it } from "vitest";
import {
  dayDiff,
  formatDate,
  formatDays,
  parseDateEnd,
  parseDateStart,
  startOfDay,
  startOfWeek,
  toTimestamp,
} from "../src/lib/dates.ts";

describe("toTimestamp", () => {
  it("解析云效日期字符串", () => {
    expect(toTimestamp("2026-10-27 23:59:59")).toBe(
      new Date("2026-10-27T23:59:59").getTime(),
    );
  });

  it("解析毫秒与秒级时间戳", () => {
    expect(toTimestamp(1_760_000_000_000)).toBe(1_760_000_000_000);
    expect(toTimestamp(1_760_000_000)).toBe(1_760_000_000_000);
    expect(toTimestamp("1760000000000")).toBe(1_760_000_000_000);
  });

  it("空值返回 null", () => {
    expect(toTimestamp(null)).toBeNull();
    expect(toTimestamp(undefined)).toBeNull();
    expect(toTimestamp("")).toBeNull();
    expect(toTimestamp("EMPTY_VALUE")).toBeNull();
    expect(toTimestamp(0)).toBeNull();
    expect(toTimestamp("not-a-date")).toBeNull();
  });
});

describe("周与日期", () => {
  it("周一作为一周开始", () => {
    const sunday = new Date(2026, 9, 25, 18, 0, 0).getTime();
    expect(startOfWeek(sunday)).toBe(new Date(2026, 9, 19, 0, 0, 0).getTime());

    const monday = new Date(2026, 9, 26, 0, 0, 0).getTime();
    expect(startOfWeek(monday)).toBe(monday);
  });

  it("startOfDay 清零时分秒", () => {
    const time = new Date(2026, 9, 28, 15, 30, 45).getTime();
    expect(startOfDay(time)).toBe(new Date(2026, 9, 28, 0, 0, 0).getTime());
  });

  it("dayDiff 向下取整", () => {
    const start = new Date(2026, 9, 1, 12, 0, 0).getTime();
    const end = new Date(2026, 9, 3, 11, 0, 0).getTime();
    expect(dayDiff(end, start)).toBe(1);
  });

  it("parseDateStart / parseDateEnd 覆盖整天", () => {
    expect(parseDateStart("2026-10-28")).toBe(new Date(2026, 9, 28, 0, 0, 0).getTime());
    expect(parseDateEnd("2026-10-28")).toBe(new Date(2026, 9, 28, 23, 59, 59).getTime());
  });
});

describe("展示格式", () => {
  it("formatDate 补零", () => {
    expect(formatDate(new Date(2026, 0, 5, 8, 0, 0).getTime())).toBe("2026-01-05");
    expect(formatDate(null)).toBe("—");
  });

  it("formatDays 输出可读文本", () => {
    expect(formatDays(0.5)).toBe("<1 天");
    expect(formatDays(3.2)).toBe("3.2 天");
    expect(formatDays(60)).toBe("2 个月");
    expect(formatDays(null)).toBe("—");
  });
});
