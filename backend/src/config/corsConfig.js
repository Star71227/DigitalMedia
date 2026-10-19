/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5700",
  "http://127.0.0.1:5700",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];
const { normalizeNodeEnv, parseAllowedOrigins } = require("./runtimeConfig");

function configuredOrigins(env = process.env) {
  const configured = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (normalizeNodeEnv(env.NODE_ENV) === "production") return configured;
  return [...new Set([...DEVELOPMENT_ORIGINS, ...configured])];
}

function isOriginAllowed(origin, env = process.env) {
  if (!origin) return true;
  return configuredOrigins(env).includes(String(origin));
}

function createCorsOptions(env = process.env) {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin, env)) return callback(null, true);
      const error = new Error("Origin is not allowed by the LearnMate CORS policy");
      error.statusCode = 403;
      error.code = "CORS_ORIGIN_DENIED";
      return callback(error);
    },
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key"],
    exposedHeaders: ["X-Request-Id", "Content-Disposition"],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}

// 启动自检用：生产模式下若不显式配置，本地开发端口会被拒绝，浏览器里的登录/提交会 403。
function missingLocalDevOrigins(env = process.env) {
  if (normalizeNodeEnv(env.NODE_ENV) !== "production") return [];
  const configured = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (configured.includes("*")) return [];
  return DEVELOPMENT_ORIGINS.filter(
    (origin) =>
      /^http:\/\/(?:localhost|127\.0\.0\.1):(?:5173|5174|4173)$/.test(origin) && !configured.includes(origin),
  );
}

module.exports = {
  DEVELOPMENT_ORIGINS,
  configuredOrigins,
  isOriginAllowed,
  createCorsOptions,
  missingLocalDevOrigins,
};
