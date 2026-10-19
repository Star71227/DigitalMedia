/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_teacher_registration_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-teacher-registration-${suffix}`);

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "teacher-registration-test-secret-with-more-than-32-characters";
process.env.AI_ENABLED = "false";
process.env.PATH_PLANNER_AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
process.env.RESOURCE_STORAGE_DIR = path.join(storageRoot, "resources");
process.env.REPORT_STORAGE_DIR = path.join(storageRoot, "reports");
process.env.TEACHER_REGISTRATION_MODE = "open";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { pool, databaseConfig } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const { isTeacherRegistrationEnabled } = require("../src/config/runtimeConfig");

let createdTeacherId;

function registerTeacher(username, overrides = {}) {
  return request(app)
    .post("/api/auth/register-teacher")
    .send({
      username,
      name: "新老师",
      password: "Teacher123",
      confirmPassword: "Teacher123",
      ...overrides,
    });
}

async function userRow(username) {
  const [rows] = await pool.query(
    "SELECT id, student_no, username, display_name, password_hash, role, is_demo FROM users WHERE username=?",
    [username],
  );
  return rows[0];
}

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);
});

test("注册配置默认开放且非法取值会被拒绝", () => {
  assert.equal(isTeacherRegistrationEnabled({}), true);
  assert.equal(isTeacherRegistrationEnabled({ TEACHER_REGISTRATION_MODE: "open" }), true);
  assert.equal(isTeacherRegistrationEnabled({ TEACHER_REGISTRATION_MODE: "OPEN" }), true);
  assert.equal(isTeacherRegistrationEnabled({ TEACHER_REGISTRATION_MODE: "closed" }), false);
  assert.throws(() => isTeacherRegistrationEnabled({ TEACHER_REGISTRATION_MODE: "whatever" }));
});

test("默认开放时可以直接注册教师账号", async () => {
  process.env.TEACHER_REGISTRATION_MODE = "open";
  const response = await registerTeacher("teacher_ok_01");
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    success: true,
    message: "教师账号创建成功，请使用新账号登录。",
    user: { username: "teacher_ok_01", name: "新老师", role: "TEACHER" },
  });

  const row = await userRow("teacher_ok_01");
  createdTeacherId = Number(row.id);
  assert.equal(row.role, "TEACHER");
  assert.equal(Number(row.is_demo), 0);
  assert.equal(row.student_no, "teacher_ok_01");
  assert.notEqual(row.password_hash, "Teacher123");
  assert.equal(await bcrypt.compare("Teacher123", row.password_hash), true);

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("Teacher123"), false);
  assert.equal(serialized.includes("password_hash"), false);
});

test("教师注册不创建学生档案", async () => {
  const [[row]] = await pool.query("SELECT COUNT(*) count FROM student_profiles WHERE student_id=?", [
    createdTeacherId,
  ]);
  assert.equal(Number(row.count), 0);
});

test("关闭教师注册时返回403且不创建账号", async () => {
  process.env.TEACHER_REGISTRATION_MODE = "closed";
  try {
    const response = await registerTeacher("teacher_closed_01");
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "TEACHER_REGISTRATION_DISABLED");
    assert.equal(await userRow("teacher_closed_01"), undefined);
  } finally {
    process.env.TEACHER_REGISTRATION_MODE = "open";
  }
});

test("新教师可以登录并拿到teacherId", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "teacher_ok_01", password: "Teacher123" });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, "TEACHER");
  assert.equal(response.body.user.teacherId, createdTeacherId);
  assert.ok(response.body.token);

  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${response.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, "TEACHER");
  assert.equal(me.body.user.teacherId, createdTeacherId);
});

test("没有班级的新教师可以打开教师看板且数据为空", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "teacher_ok_01", password: "Teacher123" });
  const token = login.body.token;

  const overview = await request(app)
    .get("/api/teacher/dashboard/overview")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.teacher.classCount, 0);
  assert.equal(overview.body.summary.managedStudentCount, 0);

  const students = await request(app).get("/api/teacher/students").set("Authorization", `Bearer ${token}`);
  assert.equal(students.status, 200);
  assert.deepEqual(students.body.data, []);

  const foreignClass = await request(app)
    .get("/api/teacher/classes/1/analytics")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(foreignClass.status, 403);
});

test("学生注册接口仍强制STUDENT角色", async () => {
  const response = await request(app).post("/api/auth/register").send({
    username: "student_role_guard_01",
    name: "新同学",
    password: "Student123",
    confirmPassword: "Student123",
    role: "TEACHER",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "STUDENT");
  const row = await userRow("student_role_guard_01");
  assert.equal(row.role, "STUDENT");
});

test("教师注册沿用用户名与密码校验并返回409/400", async () => {
  const duplicate = await registerTeacher("teacher_ok_01");
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, "USERNAME_TAKEN");

  const badName = await registerTeacher("bad name");
  assert.equal(badName.status, 400);
  assert.equal(badName.body.code, "INVALID_USERNAME");

  const weakPassword = await registerTeacher("teacher_weak_01", {
    password: "short1",
    confirmPassword: "short1",
  });
  assert.equal(weakPassword.status, 400);
  assert.equal(weakPassword.body.code, "INVALID_PASSWORD");

  const mismatch = await registerTeacher("teacher_mismatch_01", { confirmPassword: "Different123" });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.code, "PASSWORD_MISMATCH");
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
    if (!/^learnmate_teacher_registration_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});
