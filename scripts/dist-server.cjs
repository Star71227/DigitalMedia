#!/usr/bin/env node
/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/*
 * 智课研伴 LearnMate — 本地静态服务（学生端 / 教师端各起一个）
 *
 * 行为与部署用的 nginx.conf 对齐：
 *   - /healthz 直接回 200 ok（健康探针）
 *   - /api/*   反向代理到本机后端（保留方法、请求头与请求体，SSE 流式回复直接透传）
 *   - 其余路径：命中真实文件就按 MIME 返回；否则回退 index.html（前端是 SPA）
 *   - 带内容哈希的静态资源长缓存；index.html 与知识图谱/知识点详情页不缓存
 *
 * 用法：node static-server.cjs <student|teacher> <distDir> <port> <backendPort> [logFile]
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const [client, distArg, portArg, backendPortArg, logArg] = process.argv.slice(2);
if (!["student", "teacher"].includes(client)) {
  console.error("用法: node static-server.cjs <student|teacher> <distDir> <port> <backendPort> [logFile]");
  process.exit(2);
}
const distRoot = path.resolve(distArg);
const port = Number(portArg);
const backendPort = Number(backendPortArg);
if (!Number.isInteger(port) || !Number.isInteger(backendPort)) {
  console.error("端口必须是整数");
  process.exit(2);
}
if (!fs.existsSync(distRoot)) {
  console.error(`前端构建产物不存在：${distRoot}`);
  process.exit(3);
}

const logStream = logArg ? fs.createWriteStream(path.resolve(logArg), { flags: "a" }) : null;
function log(message) {
  const line = `${new Date().toISOString()} [${client}] ${message}\n`;
  if (logStream) logStream.write(line);
  else process.stdout.write(line);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
/* 带哈希的构建产物可以长缓存；页面与数据文件必须每次校验 */
const IMMUTABLE = /-[A-Za-z0-9_]{8,}\.(?:js|mjs|css|woff2?|ttf|otf)$/;

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body === undefined) res.end();
  else res.end(body);
}

function serveFile(req, res, absolutePath, { noStore }) {
  const stat = fs.statSync(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "X-Content-Type-Options": "nosniff",
    "X-LearnMate-Client": client,
    "Cache-Control": noStore
      ? "no-store"
      : IMMUTABLE.test(absolutePath)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
  };
  if (req.method === "HEAD") return send(res, 200, headers);
  res.writeHead(200, headers);
  const stream = fs.createReadStream(absolutePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

function proxyApi(req, res) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: backendPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${backendPort}`, "x-forwarded-proto": "http" },
    },
    (upstreamRes) => {
      const headers = { ...upstreamRes.headers };
      delete headers["x-powered-by"];
      res.writeHead(upstreamRes.statusCode || 502, headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.setTimeout(180000, () => upstream.destroy(new Error("upstream timeout")));
  upstream.on("error", (error) => {
    log(`代理 /api 失败：${error.message}`);
    if (!res.headersSent) {
      send(
        res,
        502,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({
          error: "后端服务未就绪，请先运行「一键启动智课研伴」。",
          detail: String(error.message).slice(0, 160),
        }),
      );
    } else {
      res.destroy();
    }
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    return send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "bad request");
  }

  if (url.pathname === "/healthz") {
    return send(res, 200, { "Content-Type": "text/plain; charset=utf-8" }, "ok\n");
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return proxyApi(req, res);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, { "Content-Type": "text/plain; charset=utf-8" }, "method not allowed");
  }

  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "bad path");
  }
  const candidate = path.resolve(distRoot, `.${decoded}`);
  if (candidate !== distRoot && !candidate.startsWith(distRoot + path.sep)) {
    return send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "forbidden");
  }

  const isPage = path.extname(candidate).toLowerCase() === ".html" || path.extname(candidate) === "";
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return serveFile(req, res, candidate, { noStore: isPage });
  }
  /* SPA 回退：未知路径一律交给 index.html，由前端路由处理 */
  return serveFile(req, res, path.join(distRoot, "index.html"), { noStore: true });
});

server.on("error", (error) => {
  log(`启动失败：${error.message}`);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`收到 ${signal}，退出`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
server.listen(port, "127.0.0.1", () =>
  log(`已监听 http://127.0.0.1:${port}（后端 127.0.0.1:${backendPort}）`),
);
