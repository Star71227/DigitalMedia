# 智课研伴 LearnMate 学生端

学生端是 LearnMate 主仓库中的纯 Vite 前端，与教师端共用根目录下的 `backend` 服务。

## 本地运行

1. 安装 Node.js 24 LTS。
2. 执行 `npm ci`。
3. 执行 `npm run dev`，默认访问 `http://localhost:5173`。

开发服务器会把同源 `/api` 请求代理到 `.env` 中的 `VITE_DEV_API_PROXY_TARGET`；默认目标为 `http://localhost:5800`。浏览器端只需要公开的 API 前缀，禁止在任何 `VITE_*` 变量中配置服务端密钥。

## 检查与构建

- 类型检查：`npm run lint`
- 正式构建：`npm run build`
- 预览构建：`npm run preview`

正式容器由 Nginx 提供静态文件，并把 `/api` 反向代理到 LearnMate 后端；本目录不包含业务后端、AI 密钥或数据库凭据。
