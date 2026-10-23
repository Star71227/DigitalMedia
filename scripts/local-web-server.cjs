/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const client = process.argv[2];
if (!["student", "teacher"].includes(client)) throw new Error("Expected student or teacher");
const port = client === "student" ? 5173 : 5174;
const publicRoot = path.join(root, client === "student" ? "frontend-new" : "frontend-teacher", "public");
const buildRoot = path.join(__dirname, "local-web", client);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const proxy = http.request(
      {
        hostname: "127.0.0.1",
        port: 5800,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: "127.0.0.1:5800", origin: `http://127.0.0.1:${port}` },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "后端服务未就绪，请运行项目目录的一键启动脚本。" }));
    });
    req.on("aborted", () => proxy.destroy());
    req.pipe(proxy);
    return;
  }
  let file;
  if (["/main.js", "/main.css"].includes(url.pathname)) file = path.join(buildRoot, url.pathname.slice(1));
  else {
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const candidate = path.resolve(publicRoot, "." + decoded);
    if (candidate !== publicRoot && !candidate.startsWith(publicRoot + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    file =
      fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ? candidate
        : path.join(buildRoot, "index.html");
  }
  if (!fs.existsSync(file)) {
    res.writeHead(503);
    res.end("Local build missing");
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-LearnMate-Client": client,
  });
  fs.createReadStream(file)
    .on("error", () => res.end())
    .pipe(res);
});
server.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log(`${client}: http://127.0.0.1:${port}`));
