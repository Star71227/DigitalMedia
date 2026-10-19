/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_auth_registration_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-auth-registration-${suffix}`);
const legacyPassword = "LegacyPass123";

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "registration-test-secret-with-more-than-32-characters";
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

let registeredToken;
let registeredUserId;

async function register(username, overrides = {}) {
  return request(app)
    .post("/api/auth/register")
    .send({
      username,
      name: "新同学",
      password: "Student123",
      confirmPassword: "Student123",
      ...overrides,
    });
}

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);
  const passwordHash = await bcrypt.hash(legacyPassword, 10);
  const [result] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash, role, is_demo) VALUES(?,?,?,?, 'STUDENT', 0)",
    ["LEGACY-001", "legacy_student", "旧账号", passwordHash],
  );
  await pool.query("INSERT INTO student_profiles(student_id) VALUES(?)", [result.insertId]);
});

test("合法学生注册返回201且角色固定为STUDENT", async () => {
  const response = await register("student_new_01");
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    success: true,
    message: "注册成功，请使用新账号登录。",
    user: { username: "student_new_01", name: "新同学", role: "STUDENT" },
  });
  const [[row]] = await pool.query(
    "SELECT id, student_no, username, role, is_demo FROM users WHERE username=?",
    ["student_new_01"],
  );
  registeredUserId = Number(row.id);
  assert.equal(row.student_no, "student_new_01");
  assert.equal(row.role, "STUDENT");
  assert.equal(Number(row.is_demo), 0);
});

test("伪造ADMIN角色会被忽略", async () => {
  const response = await register("student_admin_01", { role: "ADMIN" });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "STUDENT");
  const [[row]] = await pool.query("SELECT role FROM users WHERE username=?", ["student_admin_01"]);
  assert.equal(row.role, "STUDENT");
});

test("伪造TEACHER角色会被忽略", async () => {
  const response = await register("student_teacher_01", { role: "TEACHER" });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "STUDENT");
  const [[row]] = await pool.query("SELECT role FROM users WHERE username=?", ["student_teacher_01"]);
  assert.equal(row.role, "STUDENT");
});

test("密码使用bcrypt哈希且响应不包含密码或哈希", async () => {
  const response = await register("student_hash_01");
  assert.equal(response.status, 201);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("Student123"), false);
  assert.equal(serialized.includes("password_hash"), false);
  const [[row]] = await pool.query("SELECT password_hash FROM users WHERE username=?", ["student_hash_01"]);
  assert.notEqual(row.password_hash, "Student123");
  assert.equal(await bcrypt.compare("Student123", row.password_hash), true);
});

test("注册密码可以通过现有登录和JWT机制", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "student_new_01", password: "Student123" });
  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.role, "STUDENT");
  assert.equal(response.body.user.studentId, registeredUserId);
  registeredToken = response.body.token;
  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${registeredToken}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.studentId, registeredUserId);
});

test("重复username返回409", async () => {
  const response = await register("student_new_01");
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "USERNAME_TAKEN");
});

test("非法username返回400", async () => {
  const response = await register("bad name");
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "INVALID_USERNAME");
});

test("密码过短返回400", async () => {
  const response = await register("student_short_01", { password: "short1", confirmPassword: "short1" });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "INVALID_PASSWORD");
});

test("两次密码不一致返回400", async () => {
  const response = await register("student_mismatch_01", { confirmPassword: "Different123" });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PASSWORD_MISMATCH");
});

test("用户和最小学生档案在同一事务中创建", async () => {
  const [[profile]] = await pool.query(
    "SELECT student_id, profile_completeness, current_version FROM student_profiles WHERE student_id=?",
    [registeredUserId],
  );
  assert.equal(Number(profile.student_id), registeredUserId);
  assert.equal(Number(profile.profile_completeness), 0);
  assert.equal(Number(profile.current_version), 0);
});

test("档案创建失败时用户回滚", async () => {
  const triggerName = `fail_registration_profile_${process.pid}`;
  await pool.query(
    `CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON student_profiles FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'registration profile failure'`,
  );
  try {
    const response = await register("student_rollback_01");
    assert.equal(response.status, 500);
    assert.equal(response.body.code, "REGISTER_FAILED");
    const [users] = await pool.query("SELECT id FROM users WHERE username=?", ["student_rollback_01"]);
    assert.equal(users.length, 0);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
  }
});

test("并发重复注册只有一次成功", async () => {
  const responses = await Promise.all([register("student_race_01"), register("student_race_01")]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [201, 409]);
  const [[count]] = await pool.query("SELECT COUNT(*) count FROM users WHERE username=?", [
    "student_race_01",
  ]);
  assert.equal(Number(count.count), 1);
});

test("新用户首次画像为空且无虚假学习数据", async () => {
  const profile = await request(app).get("/api/profile/me").set("Authorization", `Bearer ${registeredToken}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.version, 0);
  assert.equal(profile.body.completeness, 0);
  assert.equal(profile.body.profile.knowledgeMastery.length, 0);
  assert.equal(profile.body.profile.errorPatterns.length, 0);

  const tables = [
    "student_learning_events",
    "student_knowledge_mastery",
    "student_error_patterns",
    "wrong_questions",
    "quiz_attempts",
    "learning_path_versions",
    "learning_resources",
    "resource_generation_jobs",
    "learning_resource_progress",
    "code_submissions",
  ];
  for (const table of tables) {
    const [[row]] = await pool.query(`SELECT COUNT(*) count FROM \`${table}\` WHERE student_id=?`, [
      registeredUserId,
    ]);
    assert.equal(Number(row.count), 0, `${table} should be empty for a new student`);
  }
});

test("新用户可以打开学习资源页接口且没有历史资源", async () => {
  const response = await request(app).get("/api/resources").set("Authorization", `Bearer ${registeredToken}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, []);
});

test("新学生不能访问教师接口", async () => {
  const response = await request(app)
    .get("/api/teacher/dashboard/overview")
    .set("Authorization", `Bearer ${registeredToken}`);
  assert.equal(response.status, 403);
});

test("新学生不能访问管理员接口", async () => {
  const response = await request(app)
    .get("/api/teacher/students")
    .set("Authorization", `Bearer ${registeredToken}`);
  assert.equal(response.status, 403);
});

test("旧学生账号登录不回归", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "legacy_student", password: legacyPassword });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, "STUDENT");
  assert.ok(response.body.token);
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
    if (!/^learnmate_auth_registration_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});
