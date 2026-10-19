/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    preview: {
      host: "127.0.0.1",
      port: 5176,
      strictPort: true,
      // The local preview uses the teacher origin already allowed by the backend.
      proxy: {
        "/api": {
          target: env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:5800",
          changeOrigin: true,
          headers: { Origin: "http://127.0.0.1:5174" },
        },
      },
    },
    server: {
      port: 5174,
      proxy: {
        "/api": { target: env.VITE_DEV_API_PROXY_TARGET || "http://localhost:5800", changeOrigin: true },
      },
      watch: {
        // 项目放在 OneDrive 中文路径下，且编辑工具写源码时会先建临时目录再改名。
        // 原生文件系统监听命中这些瞬时路径会抛 EBUSY，导致整个 dev server 崩溃退出。
        // 轮询监听不做 inotify/ReadDirectoryChanges 注册，可规避该问题。
        usePolling: true,
        interval: 600,
        binaryInterval: 1200,
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
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
            if (moduleId.includes("/node_modules/lucide-react/")) return "icons-vendor";
            return undefined;
          },
        },
      },
    },
  };
});
