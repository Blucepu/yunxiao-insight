import { describe, expect, it } from "vitest";
import {
  displayWidth,
  formatPercent,
  formatRate,
  itemRiskText,
  mdTable,
  progressBar,
  renderTable,
  stageBadge,
  stripAnsi,
  toCsv,
  truncateText,
} from "../src/lib/format.ts";
import { makeEnriched } from "./fixtures.ts";

describe("终端宽度", () => {
  it("中文与全角字符按 2 计算", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("中文")).toBe(4);
    expect(displayWidth("中文abc")).toBe(7);
    expect(displayWidth("✅")).toBe(2);
  });

  it("忽略 ANSI 颜色码", () => {
    expect(stripAnsi("\u001b[31m红色\u001b[0m")).toBe("红色");
    expect(displayWidth("\u001b[31m红色\u001b[0m")).toBe(4);
  });

  it("按显示宽度截断", () => {
    const text = truncateText("中文标题很长abc", 8);
    expect(displayWidth(text)).toBeLessThanOrEqual(8);
    expect(text.endsWith("…")).toBe(true);
    expect(truncateText("短", 8)).toBe("短");
  });
});

describe("表格渲染", () => {
  it("表头与中文对齐", () => {
    const table = renderTable(
      [
        { header: "项目", maxWidth: 6 },
        { header: "数量", align: "right" },
      ],
      [
        ["APM_IM", "12"],
        ["角色系统", "3"],
      ],
    );
    const lines = table.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("项目");
    for (const line of lines) {
      expect(displayWidth(line)).toBeGreaterThan(0);
    }
  });

  it("进度条宽度固定", () => {
    const bar = stripAnsi(progressBar(0.5, 20));
    expect(bar).toHaveLength(20);
    expect(bar.startsWith("█")).toBe(true);
    expect(bar.endsWith("░")).toBe(true);
  });
});

describe("格式与转义", () => {
  it("百分比", () => {
    expect(formatPercent(0.256, 1)).toBe("25.6%");
    expect(formatRate(1, 4)).toBe("25.0%");
    expect(formatRate(1, 0)).toBe("—");
  });

  it("CSV 转义引号与逗号", () => {
    expect(toCsv(["a", "b"], [['x,"y"', "换行\n内容"]])).toBe(
      'a,b\n"x,""y""","换行\n内容"',
    );
  });

  it("Markdown 表格转义竖线", () => {
    const table = mdTable(["项目", "说明"], [["APM|IM", "a\nb"]]);
    expect(table).toContain("APM\\|IM");
    expect(table).toContain("a b");
    expect(table.split("\n")[1]).toBe("| --- | --- |");
  });

  it("阶段与风险文本", () => {
    const item = makeEnriched({ id: "1" });
    expect(stageBadge("done")).toContain("已完成");
    expect(itemRiskText(item)).toBe("—");
  });
});
