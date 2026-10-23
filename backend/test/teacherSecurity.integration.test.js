/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
process.env.JWT_SECRET = "teacher-security-test-secret-more-than-32-characters";
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const suffix = `${Date.now()}-${Math.floor(process.pid)}`;
let teacherA, teacherB, studentA, studentB, classA, classB;
let teacherToken, studentToken, adminToken;
function token(id, role) {
  return jwt.sign(
    { userId: id, role, ...(role === "STUDENT" ? { studentId: id } : { teacherId: id }) },
    process.env.JWT_SECRET,
    { subject: String(id), expiresIn: "1h" },
  );
}
test.before(async () => {
  assert.equal(await initDB(), true);
  const insert = async (username, role) =>
    Number(
      (
        await pool.query(
          "INSERT INTO users(student_no,username,display_name,password_hash,role) VALUES(?,?,?,?,?)",
          [`T-${username}`, username, username, "test-only", role],
        )
      )[0].insertId,
    );
  teacherA = await insert(`teacher-a-${suffix}`, "TEACHER");
  teacherB = await insert(`teacher-b-${suffix}`, "TEACHER");
  studentA = await insert(`student-a-${suffix}`, "STUDENT");
  studentB = await insert(`student-b-${suffix}`, "STUDENT");
  const admin = await insert(`admin-${suffix}`, "ADMIN");
  classA = Number(
    (
      await pool.query(
        "INSERT INTO teacher_classes(teacher_id,class_name,subject,status) VALUES(?,?,?,'active')",
        [teacherA, `A-${suffix}`, "数据结构"],
      )
    )[0].insertId,
  );
  classB = Number(
    (
      await pool.query(
        "INSERT INTO teacher_classes(teacher_id,class_name,subject,status) VALUES(?,?,?,'active')",
        [teacherB, `B-${suffix}`, "数据结构"],
      )
    )[0].insertId,
  );
  await pool.query(
    "INSERT INTO teacher_class_students(class_id,teacher_id,student_id,status) VALUES(?,?,?,'active'),(?,?,?,'active')",
    [classA, teacherA, studentA, classB, teacherB, studentB],
  );
  teacherToken = token(teacherA, "TEACHER");
  studentToken = token(studentA, "STUDENT");
  adminToken = token(admin, "ADMIN");
});
test("未登录不能访问教师接口", async () => {
  assert.equal((await request(app).get("/api/teacher/dashboard/overview")).status, 401);
});
test("STUDENT 不能访问教师接口", async () => {
  assert.equal(
    (await request(app).get("/api/teacher/dashboard/overview").set("Authorization", `Bearer ${studentToken}`))
      .status,
    403,
  );
});
test("TEACHER 只列出自己的班级与管理学生", async () => {
  const classes = await request(app)
    .get("/api/teacher/classes")
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(classes.status, 200);
  assert.deepEqual(
    classes.body.data.map((x) => x.id),
    [classA],
  );
  const students = await request(app)
    .get("/api/teacher/students?pageSize=100&teacherId=999999")
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(students.status, 200);
  assert.deepEqual(
    students.body.data.map((x) => x.studentId),
    [studentA],
  );
});
test("TEACHER 修改 studentId 不能越权且不泄露学生详情", async () => {
  const own = await request(app)
    .get(`/api/teacher/students/${studentA}/detail`)
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(own.status, 200);
  const other = await request(app)
    .get(`/api/teacher/students/${studentB}/detail`)
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(other.status, 403);
  assert.equal(other.body.error, "无权访问该学生");
});
test("ADMIN 可以按权限读取任意学生", async () => {
  const response = await request(app)
    .get(`/api/teacher/students/${studentB}/detail`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.student.studentId, studentB);
});
test("工作台管理学生数来自 active 关系", async () => {
  const response = await request(app)
    .get("/api/teacher/dashboard/overview")
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.managedStudentCount, 1);
  assert.equal(response.body.summary.averageQuizAccuracy, null);
});
test.after(async () => {
  await pool.query("DELETE FROM learning_assessment_reports WHERE student_id IN (?,?)", [
    studentA || 0,
    studentB || 0,
  ]);
  await pool.query("DELETE FROM teacher_class_students WHERE class_id IN (?,?)", [classA || 0, classB || 0]);
  await pool.query("DELETE FROM teacher_classes WHERE id IN (?,?)", [classA || 0, classB || 0]);
  await pool.query("DELETE FROM users WHERE username LIKE ?", [`%-${suffix}`]);
  await pool.end();
});
