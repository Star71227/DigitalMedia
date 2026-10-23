/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_auth_account_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-auth-account-${suffix}`);
const originalPassword = "Student123";
const newPassword = "Student456";

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "account-test-secret-with-more-than-32-characters";
process.env.AI_ENABLED = "false";
process.env.PATH_PLANNER_AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
process.env.RESOURCE_STORAGE_DIR = path.join(storageRoot, "resources");
process.env.REPORT_STORAGE_DIR = path.join(storageRoot, "reports");

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { pool, databaseConfig } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");

let token;
let userId;

async function signUp(username) {
  const created = await request(app).post("/api/auth/register").send({
    username,
    name: "账号安全测试",
    password: originalPassword,
    confirmPassword: originalPassword,
  });
  assert.equal(created.status, 201);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ identifier: username, password: originalPassword });
  assert.equal(login.status, 200);
  return { token: login.body.token, id: Number(login.body.user.id) };
}

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);
  const account = await signUp("account_security_01");
  token = account.token;
  userId = account.id;
});

test("未登录不能改密码或注销", async () => {
  const change = await request(app)
    .post("/api/auth/password")
    .send({ currentPassword: originalPassword, newPassword });
  assert.equal(change.status, 401);
  const deactivate = await request(app)
    .post("/api/auth/deactivate")
    .send({ password: originalPassword, confirm: "注销" });
  assert.equal(deactivate.status, 401);
});

test("当前密码错误会被拒绝", async () => {
  const response = await request(app)
    .post("/api/auth/password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: "WrongPass123", newPassword, confirmPassword: newPassword });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "CURRENT_PASSWORD_WRONG");
});

test("新密码强度不足 / 两次不一致会被拒绝", async () => {
  const weak = await request(app)
    .post("/api/auth/password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: originalPassword, newPassword: "short", confirmPassword: "short" });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, "INVALID_PASSWORD");

  const mismatch = await request(app)
    .post("/api/auth/password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: originalPassword, newPassword, confirmPassword: "Student789" });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.code, "PASSWORD_MISMATCH");
});

test("改密码后旧密码失效、新密码可登录", async () => {
  const changed = await request(app)
    .post("/api/auth/password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: originalPassword, newPassword, confirmPassword: newPassword });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.success, true);

  const [[row]] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [userId]);
  assert.equal(await bcrypt.compare(originalPassword, row.password_hash), false);
  assert.equal(await bcrypt.compare(newPassword, row.password_hash), true);

  const oldLogin = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "account_security_01", password: originalPassword });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "account_security_01", password: newPassword });
  assert.equal(newLogin.status, 200);
  assert.ok(newLogin.body.token);
  token = newLogin.body.token;
});

test("相同的新密码会被拒绝", async () => {
  const response = await request(app)
    .post("/api/auth/password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: newPassword, newPassword, confirmPassword: newPassword });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PASSWORD_UNCHANGED");
});

test("注销需要密码与「注销」二字确认", async () => {
  const wrongPassword = await request(app)
    .post("/api/auth/deactivate")
    .set("Authorization", `Bearer ${token}`)
    .send({ password: "WrongPass123", confirm: "注销" });
  assert.equal(wrongPassword.status, 400);
  assert.equal(wrongPassword.body.code, "PASSWORD_WRONG");

  const missingConfirm = await request(app)
    .post("/api/auth/deactivate")
    .set("Authorization", `Bearer ${token}`)
    .send({ password: newPassword, confirm: "确定" });
  assert.equal(missingConfirm.status, 400);
  assert.equal(missingConfirm.body.code, "CONFIRM_REQUIRED");
});

test("注销后账号不可登录且身份被匿名化", async () => {
  const response = await request(app)
    .post("/api/auth/deactivate")
    .set("Authorization", `Bearer ${token}`)
    .send({ password: newPassword, confirm: "注销" });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  const [[row]] = await pool.query(
    "SELECT student_no, username, display_name, is_demo FROM users WHERE id = ?",
    [userId],
  );
  assert.match(String(row.username), /^deleted_\d+_\d+$/);
  assert.equal(row.username, row.student_no);
  assert.equal(row.display_name, "已注销用户");
  assert.equal(Number(row.is_demo), 0);

  const [[profile]] = await pool
    .query("SELECT major, grade, current_course FROM student_profiles WHERE student_id = ?", [userId])
    .catch(() => [[null]]);
  if (profile) {
    assert.equal(profile.major, null);
    assert.equal(profile.grade, null);
    assert.equal(profile.current_course, null);
  }

  const login = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "account_security_01", password: newPassword });
  assert.equal(login.status, 401);
});

test("内置账号不能被改密或注销", async () => {
  const passwordHash = await bcrypt.hash(originalPassword, 10);
  const [created] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash, role, is_demo) VALUES(?,?,?,?, 'STUDENT', 1)",
    ["DEMO-9001", "demo_protected_01", "示例同学", passwordHash],
  );
  const login = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "demo_protected_01", password: originalPassword });
  assert.equal(login.status, 200);

  const change = await request(app)
    .post("/api/auth/password")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: originalPassword, newPassword, confirmPassword: newPassword });
  assert.equal(change.status, 403);
  assert.equal(change.body.code, "DEMO_ACCOUNT_PROTECTED");

  const deactivate = await request(app)
    .post("/api/auth/deactivate")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({ password: originalPassword, confirm: "注销" });
  assert.equal(deactivate.status, 403);
  assert.equal(deactivate.body.code, "DEMO_ACCOUNT_PROTECTED");

  const [[row]] = await pool.query("SELECT is_demo FROM users WHERE id = ?", [created.insertId]);
  assert.equal(Number(row.is_demo), 1);
});

test.after(async () => {
  await pool.end().catch(() => undefined);
  const server = await mysql
    .createConnection({
      host: databaseConfig.host,
      port: databaseConfig.port,
      user: databaseConfig.user,
      password: databaseConfig.password,
      charset: "utf8mb4",
    })
    .catch(() => null);
  if (server) {
    if (!/^learnmate_auth_account_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});
