/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_assignment_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-assignment-${suffix}`);
const password = "Assignment123";

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "assignment-test-secret-with-more-than-32-characters";
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

let teacherToken;
let studentToken;
let outsiderToken;
let classId;
let studentId;
let outsiderId;
const questionIds = [];

async function seedUsersAndClass() {
  const passwordHash = await bcrypt.hash(password, 10);
  const [teacher] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash, role, is_demo) VALUES(?,?,?,?, 'TEACHER', 0)",
    ["T-ASSIGN-001", "assign_teacher", "作业老师", passwordHash],
  );
  const [student] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash, role, is_demo) VALUES(?,?,?,?, 'STUDENT', 0)",
    ["S-ASSIGN-001", "assign_student", "作业学生", passwordHash],
  );
  const [outsider] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash, role, is_demo) VALUES(?,?,?,?, 'STUDENT', 0)",
    ["S-ASSIGN-002", "assign_outsider", "外班学生", passwordHash],
  );
  await pool.query("INSERT INTO student_profiles(student_id) VALUES(?)", [student.insertId]);
  await pool.query("INSERT INTO student_profiles(student_id) VALUES(?)", [outsider.insertId]);

  const [klass] = await pool.query(
    "INSERT INTO teacher_classes(teacher_id, class_name, subject, description) VALUES(?,?,?,?)",
    [teacher.insertId, "作业测试班", "数据结构", "集成测试班级"],
  );
  await pool.query("INSERT INTO teacher_class_students(class_id, teacher_id, student_id) VALUES(?,?,?)", [
    klass.insertId,
    teacher.insertId,
    student.insertId,
  ]);

  classId = Number(klass.insertId);
  studentId = Number(student.insertId);
  outsiderId = Number(outsider.insertId);

  for (let index = 1; index <= 6; index += 1) {
    await pool.query(
      `INSERT INTO question_bank(question_id, subject, chapter, knowledge_point, question_type, difficulty, stem,
         option_a, option_b, option_c, option_d, answer, analysis, source, is_published)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?, 'system_seed', 1)`,
      [
        `ASSIGN-Q-${index}`,
        "数据结构",
        "线性表",
        `知识点${index}`,
        "single_choice",
        "基础",
        `作业测试题干 ${index}`,
        "选项甲",
        "选项乙",
        "选项丙",
        "选项丁",
        "B",
        `解析 ${index}`,
      ],
    );
    questionIds.push(`ASSIGN-Q-${index}`);
  }
}

async function login(identifier) {
  const response = await request(app).post("/api/auth/login").send({ identifier, password });
  assert.equal(response.status, 200, `${identifier} 登录失败`);
  return response.body.token;
}

async function createAssignment(overrides = {}) {
  return request(app)
    .post("/api/teacher/assignments")
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({
      classId,
      title: "第一次作业",
      description: "覆盖线性表基础题",
      subject: "数据结构",
      questionCount: 3,
      ...overrides,
    });
}

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);
  await seedUsersAndClass();
  teacherToken = await login("assign_teacher");
  studentToken = await login("assign_student");
  outsiderToken = await login("assign_outsider");
});

test("教师可以读取发布作业所需的班级与题库科目", async () => {
  const response = await request(app)
    .get("/api/teacher/assignments/options")
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.classes.length, 1);
  assert.equal(response.body.classes[0].className, "作业测试班");
  assert.equal(response.body.classes[0].studentCount, 1);
  const subject = response.body.subjects.find((item) => item.subject === "数据结构");
  assert.ok(subject, "题库应包含数据结构科目");
  assert.equal(subject.questionCount, 6);
});

test("发布作业后学生能看到题目但看不到答案", async () => {
  const created = await createAssignment();
  assert.equal(created.status, 201);
  assert.equal(created.body.assignment.questionCount, 3);

  const detail = await request(app)
    .get(`/api/assignments/${created.body.assignment.id}`)
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.questions.length, 3);
  assert.equal(detail.body.mySubmission, null);
  for (const question of detail.body.questions) {
    assert.equal(Object.prototype.hasOwnProperty.call(question, "answer"), false, "学生不应看到正确答案");
    assert.equal(Object.prototype.hasOwnProperty.call(question, "analysis"), false, "学生不应看到解析");
    assert.equal(question.options.length, 4);
  }

  const mine = await request(app).get("/api/assignments").set("Authorization", `Bearer ${studentToken}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.length, 1);
  assert.equal(mine.body.data[0].submitted, false);
  assert.equal(mine.body.data[0].questionCount, 3);
});

test("学生只能看到自己班级的作业", async () => {
  const mine = await request(app).get("/api/assignments").set("Authorization", `Bearer ${outsiderToken}`);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.data, []);

  const [[assignment]] = await pool.query("SELECT id FROM assignments LIMIT 1");
  const detail = await request(app)
    .get(`/api/assignments/${assignment.id}`)
    .set("Authorization", `Bearer ${outsiderToken}`);
  assert.equal(detail.status, 404);
});

test("未答完的提交被拒绝，答完才记录成绩", async () => {
  const [[assignment]] = await pool.query("SELECT id FROM assignments LIMIT 1");
  const detail = await request(app)
    .get(`/api/assignments/${assignment.id}`)
    .set("Authorization", `Bearer ${studentToken}`);
  const questions = detail.body.questions;

  const partial = await request(app)
    .post(`/api/assignments/${assignment.id}/submit`)
    .set("Authorization", `Bearer ${studentToken}`)
    .send({ answers: [{ questionId: questions[0].question_id, answer: "B" }] });
  assert.equal(partial.status, 400);
  assert.equal(partial.body.code, "ASSIGNMENT_INCOMPLETE");

  const full = await request(app)
    .post(`/api/assignments/${assignment.id}/submit`)
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      answers: questions.map((question, index) => ({
        questionId: question.question_id,
        answer: index === 0 ? "B" : "A",
        durationSeconds: 5,
      })),
    });
  assert.equal(full.status, 200);
  assert.equal(full.body.totalCount, 3);
  assert.equal(full.body.correctCount, 1);
  assert.equal(full.body.score, 33);
  assert.equal(full.body.questionResults.length, 3);
});

test("作业提交通过 assignment_id 关联到 quiz_attempts 并写入错题", async () => {
  const [[attempt]] = await pool.query(
    "SELECT id, assignment_id, student_id, score, total_count FROM quiz_attempts WHERE student_id=? AND assignment_id IS NOT NULL",
    [studentId],
  );
  assert.ok(attempt, "应写入一条带 assignment_id 的作答");
  assert.equal(Number(attempt.assignment_id), 1);
  assert.equal(Number(attempt.total_count), 3);

  const [[answerCount]] = await pool.query(
    "SELECT COUNT(*) count FROM quiz_attempt_answers WHERE attempt_id=?",
    [attempt.id],
  );
  assert.equal(Number(answerCount.count), 3);

  const [[wrong]] = await pool.query("SELECT COUNT(*) count FROM wrong_questions WHERE student_id=?", [
    studentId,
  ]);
  assert.equal(Number(wrong.count), 2, "答错的题应进入错题本");
});

test("重复提交返回首次结果，不会重复计分", async () => {
  const [[assignment]] = await pool.query("SELECT id FROM assignments LIMIT 1");
  const detail = await request(app)
    .get(`/api/assignments/${assignment.id}`)
    .set("Authorization", `Bearer ${studentToken}`);
  const responses = await Promise.all([
    request(app)
      .post(`/api/assignments/${assignment.id}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        answers: detail.body.questions.map((question) => ({ questionId: question.question_id, answer: "A" })),
      }),
    request(app)
      .post(`/api/assignments/${assignment.id}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        answers: detail.body.questions.map((question) => ({ questionId: question.question_id, answer: "A" })),
      }),
  ]);
  const attemptIds = new Set(responses.map((response) => response.body.attemptId));
  assert.equal(attemptIds.size, 1, "并发重复提交应只产生一次作答");
  const [[count]] = await pool.query(
    "SELECT COUNT(*) count FROM quiz_attempts WHERE student_id=? AND assignment_id IS NOT NULL",
    [studentId],
  );
  assert.equal(Number(count.count), 1);
});

test("学生提交后可以看到自己的批改结果", async () => {
  const [[assignment]] = await pool.query("SELECT id FROM assignments LIMIT 1");
  const detail = await request(app)
    .get(`/api/assignments/${assignment.id}`)
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.mySubmission);
  assert.equal(detail.body.mySubmission.results.length, 3);
  for (const result of detail.body.mySubmission.results) {
    assert.ok(result.correctAnswer, "批改结果应包含正确答案");
    assert.ok(typeof result.isCorrect === "boolean");
  }
});

test("教师看到提交情况、每题正确率与未交名单", async () => {
  const [[assignment]] = await pool.query("SELECT id FROM assignments LIMIT 1");
  const response = await request(app)
    .get(`/api/teacher/assignments/${assignment.id}`)
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.studentCount, 1);
  assert.equal(response.body.summary.submittedCount, 1);
  assert.equal(response.body.summary.pendingCount, 0);
  assert.equal(response.body.summary.averageScore, 33);
  assert.equal(response.body.summary.averageCorrectRate, 33);
  assert.deepEqual(response.body.summary.pendingStudents, []);
  assert.equal(response.body.questions.length, 3);
  for (const question of response.body.questions) {
    assert.equal(question.answerCount, 1);
    assert.equal(typeof question.correctRate, "number");
    assert.ok(question.answer, "教师端应看到正确答案");
  }
  assert.equal(response.body.students.length, 1);
  assert.equal(response.body.students[0].submitted, true);
  assert.equal(response.body.students[0].score, 33);
});

test("教师列表带出应交、已交与平均分", async () => {
  const response = await request(app)
    .get("/api/teacher/assignments")
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  const item = response.body.data[0];
  assert.equal(item.questionCount, 3);
  assert.equal(item.studentCount, 1);
  assert.equal(item.submittedCount, 1);
  assert.equal(item.averageScore, 33);
  assert.equal(item.className, "作业测试班");
});

test("作业与权限的错误路径", async () => {
  const studentTry = await request(app)
    .get("/api/teacher/assignments")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(studentTry.status, 403);

  const foreignClass = await createAssignment({ classId: 999999 });
  assert.equal(foreignClass.status, 403);

  const emptyTitle = await createAssignment({ title: "   " });
  assert.equal(emptyTitle.status, 400);

  const tooMany = await createAssignment({ questionCount: 999 });
  assert.equal(tooMany.status, 400);

  const notEnough = await createAssignment({ questionCount: 50 });
  assert.equal(notEnough.status, 400);

  const missing = await request(app)
    .get("/api/assignments/999999")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(missing.status, 404);

  const teacherOnStudentEndpoint = await request(app)
    .get("/api/assignments/999999")
    .set("Authorization", `Bearer ${teacherToken}`);
  assert.equal(teacherOnStudentEndpoint.status, 403, "教师账号不应能使用学生端作业接口");
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
    if (!/^learnmate_assignment_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});
