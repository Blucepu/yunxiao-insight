import { describe, expect, it } from "vitest";
import {
  filterProjects,
  isProjectExcluded,
  resolveProjectSelectors,
  selectProjects,
} from "../src/lib/projects.ts";
import { makeProject } from "./fixtures.ts";

const projects = [
  makeProject("p1", "APM_IM"),
  makeProject("p2", "角色系统"),
  makeProject("p3", "测试项目"),
  makeProject("p4", "APM_IM 海外"),
  makeProject("p5", "官网升级迭代", { customCode: "SITE" }),
];

describe("项目选择", () => {
  it("按 id / 名称 / 唯一子串匹配", () => {
    expect(resolveProjectSelectors(projects, ["p2"]).map((p) => p.name)).toEqual(["角色系统"]);
    expect(resolveProjectSelectors(projects, ["测试项目"]).map((p) => p.name)).toEqual(["测试项目"]);
    expect(resolveProjectSelectors(projects, ["角色"]).map((p) => p.name)).toEqual(["角色系统"]);
    expect(resolveProjectSelectors(projects, ["SITE"]).map((p) => p.name)).toEqual(["官网升级迭代"]);
  });

  it("支持配置别名", () => {
    const aliases = { "apm-im": "APM_IM" };
    expect(resolveProjectSelectors(projects, ["apm-im"], aliases).map((p) => p.name)).toEqual([
      "APM_IM",
    ]);
  });

  it("子串匹配到多个项目时报错", () => {
    expect(() => resolveProjectSelectors(projects, ["APM"])).toThrow(/匹配到多个/);
  });

  it("找不到项目时列出可用项目", () => {
    expect(() => resolveProjectSelectors(projects, ["不存在"])).toThrow(/找不到项目/);
    expect(() => resolveProjectSelectors(projects, ["不存在"])).toThrow(/APM_IM/);
  });

  it("all / 空选择返回全部", () => {
    expect(resolveProjectSelectors(projects, [])).toHaveLength(5);
    expect(resolveProjectSelectors(projects, ["all"])).toHaveLength(5);
  });
});

describe("项目排除", () => {
  it("默认排除配置中的项目", () => {
    const selected = selectProjects(projects, [], ["测试项目"]);
    expect(selected.map((p) => p.name)).not.toContain("测试项目");
    expect(selected).toHaveLength(4);
  });

  it("显式指定时覆盖排除配置", () => {
    const selected = selectProjects(projects, ["测试项目"], ["测试项目"]);
    expect(selected.map((p) => p.name)).toEqual(["测试项目"]);
  });

  it("isProjectExcluded / filterProjects", () => {
    expect(isProjectExcluded(projects[2]!, ["测试项目"])).toBe(true);
    expect(isProjectExcluded(projects[0]!, ["测试项目"])).toBe(false);
    expect(filterProjects(projects, ["测试项目"])).toHaveLength(4);
  });
});
