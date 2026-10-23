/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      react: path.resolve("node_modules/react"),
      "react-dom": path.resolve("node_modules/react-dom"),
      /* 教师端源码经 alias 用本仓 react,但其 node_modules 里的 @gsap/react 是 CJS,
         运行时 require('react') 会从自身路径解析出教师端第二份 react,触发
         Invalid hook call。统一指向本仓拷贝,require 落回本仓 react。 */
      "@gsap/react": path.resolve("node_modules/@gsap/react"),
    },
    dedupe: ["react", "react-dom"],
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    clearMocks: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
