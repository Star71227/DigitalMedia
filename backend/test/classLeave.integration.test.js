/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_class_leave_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-class-leave-${suffix}`);
const password = "Student123";

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "class-leave-test-secret-with-more-than-32-characters";
process.env.AI_ENABLED = "false";
process.env.PATH_PLANNER_AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
process.env.TEACHER_REGISTRATION_ENABLED = "true";
process.env.RESOURCE_STORAGE_DIR = path.join(storageRoot, "resources");
process.env.REPORT_STORAGE_DIR = path.join(storageRoot, "reports");

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { pool, databaseConfig } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");

let teacherToken;
let studentToken;
let studentId;
let classId;

async function signUpStudent(username) {
  const created = await request(app).post("/api/auth/register").send({
    username,
    name: "退班测试同学",
    password,
    confirmPassword: password,
  });
  assert.equal(created.status, 201);
  const login = await request(app).post("/api/auth/login").send({ identifier: username, password });
  assert.equal(login.status, 200);
  return { token: login.body.token, id: Number(login.body.user.id) };
}

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);

  const teacherRegistration = await request(app).post("/api/auth/register-teacher").send({
    username: "leave_teacher_01",
    name: "退班测试老师",
    password,
    confirmPassword: password,
  });
  assert.equal(teacherRegistration.status, 201);
  const teacherLogin = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "leave_teacher_01", password });
  assert.equal(teacherLogin.status, 200);
  teacherToken = teacherLogin.body.token;

  const student = await signUpStudent("leave_student_01");
  studentToken = student.token;
  studentId = student.id;

  const created = await request(app)
    .post("/api/teacher/classes")
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ className: "退班示例班", subject: "数据结构", description: "用于验证学生自助退班" });
  assert.equal(created.status, 201);
  classId = Number(created.body.class.id);

  const added = await request(app)
    .post(`/api/teacher/classes/${classId}/students`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ studentId });
  assert.equal(added.status, 201);
});

test("加入后学生能在自己的班级列表里看到这个班", async () => {
  const response = await request(app)
    .get("/api/student/classes")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].classId, classId);
  assert.equal(response.body.data[0].className, "退班示例班");
});

test("老师账号调用退班接口会被拒绝", async () => {
  const response = await request(app)
    .delete(`/api/student/classes/${classId}`)
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "STUDENT_ONLY");
});

test("未登录不能退班", async () => {
  const response = await request(app).delete(`/api/student/classes/${classId}`);
  assert.equal(response.status, 401);
});

test("学生退班后不再属于该班，重复退班返回 404", async () => {
  const left = await request(app)
    .delete(`/api/student/classes/${classId}`)
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(left.status, 200);
  assert.equal(left.body.left, true);
  assert.equal(left.body.classId, classId);

  const [[member]] = await pool.query(
    "SELECT COUNT(*) count FROM teacher_class_students WHERE class_id = ? AND student_id = ?",
    [classId, studentId],
  );
  assert.equal(Number(member.count), 0);

  const mine = await request(app).get("/api/student/classes").set("Authorization", `Bearer ${studentToken}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.length, 0);

  const again = await request(app)
    .delete(`/api/student/classes/${classId}`)
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(again.status, 404);
  assert.equal(again.body.code, "NOT_IN_CLASS");

  const students = await request(app)
    .get(`/api/teacher/classes/${classId}/students`)
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(students.status, 200);
  assert.equal(students.body.data.length, 0);
});

test("退班时会把该班的待审核申请一并作废", async () => {
  const student2 = await signUpStudent("leave_student_02");
  const requested = await request(app)
    .post("/api/student/class-requests")
    .set("Authorization", `Bearer ${student2.token}`)
    .send({ classId, message: "想加入" });
  assert.equal(requested.status, 201);

  const pendingBefore = await request(app)
    .get("/api/student/class-requests")
    .set("Authorization", `Bearer ${student2.token}`);
  assert.equal(pendingBefore.body.data.filter((item) => item.status === "pending").length, 1);

  // 先直接加入（模拟老师直接拉人），再退班，看申请是否被作废
  const added = await request(app)
    .post(`/api/teacher/classes/${classId}/students`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ studentId: student2.id });
  assert.equal(added.status, 201);

  const left = await request(app)
    .delete(`/api/student/classes/${classId}`)
    .set("Authorization", `Bearer ${student2.token}`);
  assert.equal(left.status, 200);

  const pendingAfter = await request(app)
    .get("/api/student/class-requests")
    .set("Authorization", `Bearer ${student2.token}`);
  const stillPending = pendingAfter.body.data.filter((item) => item.status === "pending");
  assert.equal(stillPending.length, 0);
  assert.equal(
    pendingAfter.body.data.some((item) => item.status === "cancelled"),
    true,
  );
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
    if (!/^learnmate_class_leave_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});
