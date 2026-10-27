import { defineConfig } from "vitest/config";

// 与 vite.config.ts 分离：测试从仓库根目录跑，只收集 tests/。
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
