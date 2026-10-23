/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEVELOPMENT_ORIGINS,
  configuredOrigins,
  createCorsOptions,
  isOriginAllowed,
} = require("../src/config/corsConfig");
const { validateRuntimeConfig } = require("../src/config/runtimeConfig");

const STUDENT_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

test("development defaults allow student dev and preview origins and preserve teacher dev", () => {
  for (const origin of STUDENT_ORIGINS) {
    assert.equal(DEVELOPMENT_ORIGINS.includes(origin), true, origin);
    assert.equal(isOriginAllowed(origin, { NODE_ENV: "development" }), true, origin);
  }
  assert.equal(isOriginAllowed("http://localhost:5174", { NODE_ENV: "development" }), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:5174", { NODE_ENV: "development" }), true);
});

test("configured origins trim whitespace, remove empty entries, and deduplicate", () => {
  const env = {
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: " https://student.example, ,https://teacher.example,https://student.example, ",
  };
  assert.deepEqual(configuredOrigins(env), ["https://student.example", "https://teacher.example"]);
  const runtime = validateRuntimeConfig({
    ...env,
    DB_PASSWORD: "database-password",
    JWT_SECRET: "a-secure-production-secret-that-is-long-enough",
  });
  assert.deepEqual(runtime.allowedOrigins, ["https://student.example", "https://teacher.example"]);
});

test("origin matching is exact and rejects protocol, case, port, and hostname changes", () => {
  const env = { NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "http://localhost:4173" };
  assert.equal(isOriginAllowed("http://localhost:4173", env), true);
  for (const origin of [
    "https://localhost:4173",
    "HTTP://LOCALHOST:4173",
    "http://localhost:5173",
    "http://localhost:4173/",
    "http://localhost.evil.com",
    "http://localhost:4173.evil.com",
    "http://127.0.0.1:9999",
    "https://unconfigured.example",
    "null",
  ]) {
    assert.equal(isOriginAllowed(origin, env), false, origin);
  }
});

test("requests without Origin follow the existing server-to-server policy", () => {
  assert.equal(isOriginAllowed(undefined, { NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "" }), true);
  assert.equal(isOriginAllowed("", { NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "" }), true);
});

test("CORS options use credentials false and return a generic denial", async () => {
  const options = createCorsOptions({
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "https://student.example",
  });
  assert.equal(options.credentials, false);
  assert.notEqual(options.origin, "*");

  const error = await new Promise((resolve) => {
    options.origin("https://unknown.example", (item) => resolve(item));
  });
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "CORS_ORIGIN_DENIED");
  assert.equal(error.message.includes("student.example"), false);
});
