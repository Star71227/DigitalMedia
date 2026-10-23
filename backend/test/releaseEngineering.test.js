/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { validateRuntimeConfig } = require("../src/config/runtimeConfig");
const { isOriginAllowed } = require("../src/config/corsConfig");
const {
  createHealthChecker,
  checkStorage,
  checkWritableDirectory,
} = require("../src/services/healthService");
const {
  assertResetAllowed,
  assertDemoPassword,
  RESET_CONFIRMATION,
} = require("../src/services/competitionDemoService");
const { isAIEnabled } = require("../src/services/aiService");
const { initializeWithRetry } = require("../src/services/startupService");
const resourceStorage = require("../src/services/resourceStorageService");
const reportStorage = require("../src/services/teacherReportStorageService");

test("production startup rejects a missing database password", () => {
  assert.throws(
    () =>
      validateRuntimeConfig({
        NODE_ENV: "production",
        DB_PASSWORD: "",
        JWT_SECRET: "a-secure-production-secret-that-is-long-enough",
      }),
    /DB_PASSWORD/,
  );
});

test("production startup rejects a missing or short JWT secret", () => {
  assert.throws(
    () =>
      validateRuntimeConfig({
        NODE_ENV: "production",
        DB_PASSWORD: "database-password",
        JWT_SECRET: "too-short",
      }),
    /JWT_SECRET/,
  );
});

test("production startup rejects wildcard CORS and accepts an explicit allowlist", () => {
  const base = {
    NODE_ENV: "production",
    DB_PASSWORD: "database-password",
    JWT_SECRET: "a-secure-production-secret-that-is-long-enough",
  };
  assert.throws(() => validateRuntimeConfig({ ...base, CORS_ALLOWED_ORIGINS: "*" }), /must not contain/);
  const config = validateRuntimeConfig({
    ...base,
    CORS_ALLOWED_ORIGINS: "https://student.example,https://teacher.example",
  });
  assert.deepEqual(config.allowedOrigins, ["https://student.example", "https://teacher.example"]);
});

test("production CORS rejects an unknown origin and accepts configured origins", () => {
  const env = {
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "https://student.example,https://teacher.example",
  };
  assert.equal(isOriginAllowed("https://student.example", env), true);
  assert.equal(isOriginAllowed("https://unknown.example", env), false);
  assert.equal(isOriginAllowed(undefined, env), true);
});

test("NODE_ENV normalization cannot bypass production CORS or reset guards", () => {
  const env = { NODE_ENV: " production ", CORS_ALLOWED_ORIGINS: "https://student.example" };
  assert.equal(isOriginAllowed("http://localhost:5173", env), false);
  assert.throws(
    () => assertResetAllowed({ ...env, DEMO_RESET_CONFIRM: RESET_CONFIRMATION }),
    (error) => error.code === "DEMO_RESET_PRODUCTION_DENIED",
  );
  assert.throws(() => validateRuntimeConfig({ NODE_ENV: "staging" }), /NODE_ENV/);
});

test("health checker reports healthy database and writable storage", async () => {
  const checker = createHealthChecker({
    databaseCheck: async () => "ok",
    storageCheck: async () => "ok",
    version: "test",
  });
  const result = await checker();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(
    { status: result.body.status, database: result.body.database, storage: result.body.storage },
    { status: "ok", database: "ok", storage: "ok" },
  );
  assert.equal(result.body.version, "test");
  assert.match(result.body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("readiness returns 503 when the database is unavailable", async () => {
  const checker = createHealthChecker({
    databaseCheck: async () => {
      throw new Error("connection refused");
    },
    storageCheck: async () => "ok",
  });
  const result = await checker();
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, "unavailable");
  assert.equal(result.body.database, "error");
  assert.equal(result.body.storage, "ok");
  assert.equal(JSON.stringify(result.body).includes("connection refused"), false);
});

test("resource and report volume directories are writable", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "learnmate-health-"));
  try {
    await assert.doesNotReject(() =>
      checkStorage({ roots: [path.join(root, "resources"), path.join(root, "reports")] }),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("storage readiness fails when probe rename or deletion is unavailable", async () => {
  const operations = [];
  const fileSystem = {
    mkdir: async () => operations.push("mkdir"),
    writeFile: async () => operations.push("write"),
    rename: async () => operations.push("rename"),
    rm: async () => {
      operations.push("remove");
      throw new Error("read-only cleanup");
    },
  };
  await assert.rejects(() => checkWritableDirectory("/virtual/storage", fileSystem), /read-only cleanup/);
  assert.deepEqual(operations.slice(0, 3), ["mkdir", "write", "rename"]);
});

test("persistent storage resolvers reject traversal and absolute paths", () => {
  for (const value of ["../private.pdf", "..\\private.pptx", "C:/private.pdf", "/private.pdf"]) {
    assert.throws(() => resourceStorage.resolveStoredFile(value), /invalid|escapes/);
    assert.throws(() => reportStorage.resolveStoredFile(value), /invalid|escapes/);
  }
});

test("demo reset requires explicit confirmation", () => {
  assert.throws(
    () => assertResetAllowed({ NODE_ENV: "test" }),
    (error) => error.code === "DEMO_RESET_CONFIRMATION_REQUIRED",
  );
  assert.equal(assertResetAllowed({ NODE_ENV: "test", DEMO_RESET_CONFIRM: RESET_CONFIRMATION }), true);
});

test("demo reset is always rejected in production", () => {
  assert.throws(
    () => assertResetAllowed({ NODE_ENV: "production", DEMO_RESET_CONFIRM: RESET_CONFIRMATION }),
    (error) => error.code === "DEMO_RESET_PRODUCTION_DENIED",
  );
});

test("production demo seeding rejects a weak password at the service boundary", () => {
  assert.throws(
    () => assertDemoPassword("123456", { NODE_ENV: "production" }),
    (error) => error.code === "DEMO_PASSWORD_REQUIRED",
  );
  assert.doesNotThrow(() => assertDemoPassword("strong-demo-password", { NODE_ENV: "production" }));
});

test("AI stays disabled without an explicit global opt-in or credentials", () => {
  const previous = { ...process.env };
  try {
    process.env.AI_ENABLED = "false";
    process.env.SPARK_API_URL = "https://example.invalid";
    process.env.SPARK_API_KEY = "not-a-real-key";
    assert.equal(isAIEnabled(), false);
    process.env.AI_ENABLED = "true";
    delete process.env.SPARK_API_KEY;
    delete process.env.AI_API_KEY;
    assert.equal(isAIEnabled(), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("database startup retry is bounded and succeeds after a transient failure", async () => {
  let calls = 0;
  const retries = [];
  const result = await initializeWithRetry({
    attempts: 3,
    retryMs: 0,
    initialize: async () => ++calls >= 2,
    onRetry: (item) => retries.push(item),
  });
  assert.equal(result, true);
  assert.equal(calls, 2);
  assert.equal(retries.length, 1);
});
