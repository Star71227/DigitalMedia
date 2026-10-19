/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://localhost:5174",
];

test("OPTIONS preflight accepts configured local applications with an exact origin", async () => {
  for (const origin of ALLOWED_ORIGINS) {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    assert.equal(response.status, 204, origin);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal(response.headers["access-control-allow-credentials"], undefined);
    assert.notEqual(response.headers["access-control-allow-origin"], "*");
  }
});

test("OPTIONS preflight rejects unknown origins without leaking the allowlist", async () => {
  for (const origin of [
    "http://localhost.evil.com",
    "http://127.0.0.1:9999",
    "https://unconfigured.example",
  ]) {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST");

    assert.equal(response.status, 403, origin);
    assert.equal(response.body.code, "CORS_ORIGIN_DENIED");
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(JSON.stringify(response.body).includes("localhost:5173"), false);
  }
});

test("requests without Origin continue to reach authentication middleware", async () => {
  const response = await request(app).get("/api/auth/me");
  assert.equal(response.status, 401);
  assert.notEqual(response.body.code, "CORS_ORIGIN_DENIED");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});
