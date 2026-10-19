/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "path";
import { defineConfig, loadEnv } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    root: projectRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": projectRoot,
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.VITE_DEV_API_PROXY_TARGET || "http://localhost:5800",
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== "true",
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // 项目在 OneDrive 中文路径下，编辑工具写源码时会先建临时目录再改名；原生文件监听
      // 命中这些瞬时路径会抛 EBUSY 并让 dev server 直接退出，因此改用轮询监听。
      watch:
        process.env.DISABLE_HMR === "true"
          ? null
          : {
              usePolling: true,
              interval: 600,
              binaryInterval: 1200,
            },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          main: path.resolve(projectRoot, "index.html"),
          digitalTutor: path.resolve(projectRoot, "digital-tutor.html"),
          /* 知识图谱两页走 public/（队长这一版），由 Vite 原样拷贝，无需登记成构建入口 */
        },
        output: {
          manualChunks(id) {
            const moduleId = id.replace(/\\/g, "/");
            if (!moduleId.includes("/node_modules/")) return undefined;
            if (/\/node_modules\/(?:react|react-dom|react-is|scheduler)\//.test(moduleId))
              return "react-vendor";
            if (
              /\/node_modules\/(?:recharts|react-smooth|victory-vendor|decimal.js-light|tiny-invariant)\//.test(
                moduleId,
              )
            )
              return "charts-vendor";
            if (/\/node_modules\/(?:d3|d3-[^/]+)\//.test(moduleId)) return "d3-vendor";
            if (moduleId.includes("/node_modules/motion/")) return "motion-vendor";
            if (moduleId.includes("/node_modules/lucide-react/")) return "icons-vendor";
            return undefined;
          },
        },
      },
    },
  };
});
