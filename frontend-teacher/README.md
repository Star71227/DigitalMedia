# 寻笺 LearnMate 教师端

教师端已作为 LearnMate 主仓库中的纯 Vite 前端运行，与学生端共用 `backend`。

## 配置与运行

1. 安装 Node.js 24 LTS，并按需复制 `.env.example`。
2. 执行 `npm ci`。
3. 执行 `npm run dev`，默认访问 `http://localhost:5174`；类型检查：`npm run lint`；构建：`npm run build`。

开发服务器将同源 `/api` 代理到 `VITE_DEV_API_PROXY_TARGET`（默认 `http://localhost:5800`）。正式容器由 Nginx 提供静态文件和同源 API 代理；禁止在任何 `VITE_*` 变量中配置服务端密钥。

教师与管理员均通过 LearnMate 的 `/api/auth/login` 登录。教师账号由后端 `DEMO_PASSWORD` 或正式账号管理流程创建；本目录不保存密码、Gemini 密钥或业务后端。

页面只读取真实教师 API。系统尚未接入的实时监考、真实代码沙箱和复杂题库导入不会在界面中伪装为可用能力。
