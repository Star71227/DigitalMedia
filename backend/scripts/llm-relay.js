#!/usr/bin/env node
/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 本机大模型转发口（给组员免配置用你机器上的 API key）
 *
 * 背景
 * - LLM_API_KEY 不能提交进仓库（会永久留在 GitHub 历史里），但组员又不想各自配 key。
 * - 这个脚本在你机器上起一个 OpenAI 兼容的端点：它持有你 .env 里的 key，对外不需要 key。
 *   组员只要把 LLM_API_URL 指向 http://<你这台机器的IP>:8090/v1/chat/completions 即可，
 *   模型、超时、结构化输出等其余配置都由本机决定。
 *
 * 用法（在 backend 目录）
 *   node scripts/llm-relay.js
 *   可选环境变量：
 *     RELAY_PORT=8090              监听端口
 *     RELAY_HOST=0.0.0.0           监听地址（0.0.0.0 = 局域网可达；只想本机用就写 127.0.0.1）
 *     RELAY_ALLOW_IPS=10.0.0.5,10.0.0.6   仅允许这些来源 IP（留空 = 不限制，局域网内任何人可用）
 *
 * 健康检查：GET http://127.0.0.1:8090/health
 *
 * ⚠️ 安全提示：留空 RELAY_ALLOW_IPS 时，同一局域网内任何人都能用你的额度调用。
 *    校园网/实验室等共享网络建议填上组员的 IP，或只在需要时启动本脚本。
 */
const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");

const backendRoot = path.join(__dirname, "..");
const envPath = path.join(backendRoot, ".env");
if (fs.existsSync(envPath)) {
  require(path.join(backendRoot, "node_modules", "dotenv")).config({ path: envPath });
}

const UPSTREAM = String(process.env.LLM_API_URL || "").trim();
const API_KEY = String(process.env.LLM_API_KEY || "").trim();
const PORT = Number(process.env.RELAY_PORT || 8090);
const HOST = String(process.env.RELAY_HOST || "0.0.0.0");
const ALLOW_IPS = String(process.env.RELAY_ALLOW_IPS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!UPSTREAM || !API_KEY) {
  console.error("[relay] 缺少 LLM_API_URL 或 LLM_API_KEY，请先在本机 backend/.env 里配好智谱配置。");
  process.exit(1);
}

let upstreamHost = "invalid";
try {
  upstreamHost = new URL(UPSTREAM).hostname;
} catch (error) {
  console.error(`[relay] LLM_API_URL 不是合法 URL：${UPSTREAM}`);
  process.exit(1);
}

function clientIp(request) {
  const raw =
    String(request.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    request.socket.remoteAddress ||
    "";
  return raw.replace(/^::ffff:/, "");
}

function allowed(request) {
  if (!ALLOW_IPS.length) return true;
  const ip = clientIp(request);
  return ALLOW_IPS.includes(ip) || ip === "127.0.0.1" || ip === "::1";
}

function json(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  response.end(text);
}

const server = http.createServer((request, response) => {
  const url = request.url || "/";

  if (request.method === "GET" && (url === "/health" || url === "/__local/health")) {
    return json(response, 200, {
      service: "learnmate-llm-relay",
      upstreamHost,
      upstreamModel: String(process.env.LLM_MODEL || ""),
      keyPresent: true,
      restrictedTo: ALLOW_IPS.length ? ALLOW_IPS : "any (LAN)",
      usage: "把组员的 LLM_API_URL 指向 http://<本机IP>:" + PORT + "/v1/chat/completions",
    });
  }

  if (!allowed(request)) {
    console.warn(`[relay] 拒绝来源 ${clientIp(request)}`);
    return json(response, 403, { error: { message: "此来源未被允许使用本机模型转发口" } });
  }

  // /v1/models 之类只读接口直接透传
  if (request.method === "GET") {
    return proxy(request, response, url);
  }

  if (request.method === "POST") {
    return proxy(request, response, url);
  }

  return json(response, 405, { error: { message: "method not allowed" } });
});

function proxy(request, response, url) {
  // 组员请求的是本机的 /v1/chat/completions；上游（智谱）真实路径是 /api/paas/v4/chat/completions。
  // 因此必须保留上游自己的 pathname，只把查询串带过去，不能拿 /v1/... 去覆盖它（否则 nginx 直接 405）。
  let target;
  let targetPath;
  try {
    target = new URL(UPSTREAM);
    targetPath = `${target.pathname}${url.split("?")[1] ? `?${url.split("?")[1]}` : ""}`;
  } catch (error) {
    return json(response, 400, { error: { message: "bad upstream url" } });
  }
  const client = target.protocol === "https:" ? https : http;

  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    let body = Buffer.concat(chunks);
    // 组员那边的 .env 可能没写 LLM_MODEL（他们本来就不该关心模型名），
    // 这里统一补上本机配置的模型，缺了就由本机决定，避免上游报 model 为空。
    if (body.length && String(request.headers["content-type"] || "").includes("json")) {
      try {
        // 有些客户端（例如 PowerShell 的 Out-File -Encoding utf8）会带 BOM，JSON.parse 会直接失败，
        // 去掉 BOM 再解析，避免"模型名没补上"导致上游报错。
        const parsed = JSON.parse(body.toString("utf8").replace(/^\uFEFF/, ""));
        if (!parsed.model) {
          parsed.model = process.env.LLM_MODEL;
          body = Buffer.from(JSON.stringify(parsed), "utf8");
        }
      } catch (error) {
        // 非 JSON 或解析失败：原样透传
      }
    }
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const upstreamRequest = client.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: targetPath,
        method: request.method,
        headers,
        timeout: 240000,
      },
      (upstreamResponse) => {
        const status = upstreamResponse.statusCode || 502;
        const raw = [];
        upstreamResponse.on("data", (chunk) => raw.push(chunk));
        upstreamResponse.on("end", () => {
          const payload = Buffer.concat(raw);
          console.log(
            `[relay] ${request.method} ${url} -> ${targetPath} -> ${status} (${payload.length}B) from ${clientIp(request)}`,
          );
          response.writeHead(status, {
            "Content-Type": upstreamResponse.headers["content-type"] || "application/json; charset=utf-8",
            "Content-Length": payload.length,
          });
          response.end(payload);
        });
      },
    );
    upstreamRequest.on("timeout", () => {
      upstreamRequest.destroy(new Error("upstream timeout"));
    });
    upstreamRequest.on("error", (error) => {
      console.error(`[relay] 上游错误：${error.message}`);
      json(response, 502, { error: { message: `转发到上游失败：${error.message}` } });
    });
    if (body.length) upstreamRequest.write(body);
    upstreamRequest.end();
  });
}

server.listen(PORT, HOST, () => {
  console.log(`[relay] 已启动：http://${HOST}:${PORT}/v1/chat/completions`);
  console.log(`[relay] 上游：${upstreamHost} 模型：${process.env.LLM_MODEL || "(未设置)"}`);
  console.log(
    `[relay] 允许来源：${ALLOW_IPS.length ? ALLOW_IPS.join(", ") : "局域网内任何人（建议用 RELAY_ALLOW_IPS 限制）"}`,
  );
});
