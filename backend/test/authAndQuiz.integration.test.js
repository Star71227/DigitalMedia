/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_auth_quiz_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-auth-quiz-${suffix}`);
const demoPassword = "test-only-demo-password";

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.DEMO_PASSWORD = demoPassword;
process.env.JWT_SECRET = "test-only-secret-with-more-than-32-characters";
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
const { seedCompetitionDemo } = require("../src/services/competitionDemoService");
const { setCodeRunnerForTests, resetCodeRunnerForTests } = require("../src/services/codeJudgeService");
const { createOrAdjustLearningPath } = require("../src/services/learningPathService");

let zhangToken;
let liToken;

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);
  setCodeRunnerForTests(async (task = {}) => ({
    compile: { status: "success", message: "", durationMs: 1 },
    execution: {
      status: "accepted",
      passedCount: Array.isArray(task.tests) ? task.tests.length : 0,
      totalCount: Array.isArray(task.tests) ? task.tests.length : 0,
      cases: (task.tests || []).map((item, index) => ({
        id: item.id || `${item.visibility}-${index + 1}`,
        visibility: item.visibility,
        status: "accepted",
        stdout: item.visibility === "public" ? item.expectedOutput : "",
        stderr: "",
        message: "",
        durationMs: 1,
      })),
    },
  }));
  await seedCompetitionDemo();
});

test("正确账号密码可以登录", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "zhangsan", password: demoPassword });
  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  zhangToken = response.body.token;
});

test("错误密码不能登录", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "zhangsan", password: "wrong-password" });
  assert.equal(response.status, 401);
});

test("未认证不能读取画像", async () => {
  const response = await request(app).get("/api/profile/me");
  assert.equal(response.status, 401);
});

test("不同学生读取到隔离的画像数据", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "lisi", password: demoPassword });
  liToken = login.body.token;
  const [zhang, li] = await Promise.all([
    request(app).get("/api/profile/me").set("Authorization", `Bearer ${zhangToken}`),
    request(app).get("/api/profile/me").set("Authorization", `Bearer ${liToken}`),
  ]);
  assert.equal(zhang.status, 200);
  assert.equal(li.status, 200);
  assert.ok(zhang.body.profile.knowledgeMastery.some((item) => item.knowledgePoint === "红黑树旋转"));
  assert.equal(
    li.body.profile.knowledgeMastery.some((item) => item.knowledgePoint === "红黑树旋转"),
    false,
  );
});

test("画像确认生成持久化版本", async () => {
  const start = await request(app)
    .post("/api/profile/dialogue/start")
    .set("Authorization", `Bearer ${liToken}`)
    .send();
  const confirmedProfile = {
    majorAndGrade: { major: "软件工程", grade: "大二" },
    currentCourse: "数据结构",
    priorKnowledge: ["学过 C 语言"],
    learningGoals: ["通过课程考试"],
    explanationPreference: "图解和代码示例",
    resourcePreferences: ["代码练习", "讲义"],
    paceAndTimeBudget: { pacePreference: "稳步", weeklyTimeBudgetMinutes: 300 },
  };
  const response = await request(app)
    .post("/api/profile/dialogue/confirm")
    .set("Authorization", `Bearer ${liToken}`)
    .send({ sessionId: start.body.sessionId, confirmedProfile });
  assert.equal(response.status, 200);
  assert.ok(response.body.version >= 1);
  const history = await request(app).get("/api/profile/history").set("Authorization", `Bearer ${liToken}`);
  assert.ok(history.body.data.length >= 1);
});

test("真实测验忽略前端分数并完成画像闭环", async () => {
  const key = `integration-${Date.now()}`;
  const before = await request(app).get("/api/profile/me").set("Authorization", `Bearer ${zhangToken}`);
  const beforeMastery = before.body.profile.knowledgeMastery.find(
    (item) => item.knowledgePoint === "红黑树旋转",
  ).mastery;
  const response = await request(app)
    .post("/api/quiz/submit")
    .set("Authorization", `Bearer ${zhangToken}`)
    .send({
      idempotencyKey: key,
      subject: "数据结构",
      score: 100,
      answers: [{ questionId: "DS-RBT-ROTATE-001", answer: "B", durationSeconds: 34 }],
      submittedAt: new Date().toISOString(),
    });
  assert.equal(response.status, 200);
  assert.equal(response.body.score, 0);
  assert.equal(response.body.masteryChanges[0].before, beforeMastery);
  assert.equal(response.body.masteryChanges[0].after, Math.max(0, beforeMastery - 6));
  assert.equal(response.body.errorAttributions[0].errorType, "procedure_confusion");
  assert.ok(response.body.profileUpdate.currentVersion > response.body.profileUpdate.previousVersion);
  assert.ok(response.body.recommendations.some((item) => item.resourceType === "code_lab"));

  const duplicate = await request(app)
    .post("/api/quiz/submit")
    .set("Authorization", `Bearer ${zhangToken}`)
    .send({
      idempotencyKey: key,
      subject: "数据结构",
      answers: [{ questionId: "DS-RBT-ROTATE-001", answer: "B" }],
    });
  assert.equal(duplicate.body.attemptId, response.body.attemptId);
});

test("错题和错误模式已持久化且接口结构稳定", async () => {
  const [wrongRows] = await pool.query(
    "SELECT * FROM wrong_questions w JOIN users u ON u.id=w.student_id WHERE u.username='zhangsan' AND w.question_id='DS-RBT-ROTATE-001'",
  );
  const [patterns] = await pool.query(
    "SELECT * FROM student_error_patterns p JOIN users u ON u.id=p.student_id WHERE u.username='zhangsan' AND p.knowledge_point='红黑树旋转'",
  );
  assert.ok(wrongRows.length >= 1);
  assert.ok(patterns.some((item) => item.error_type === "procedure_confusion"));
});

test("无效题目触发事务回滚，不产生半完成 attempt", async () => {
  const key = `rollback-${Date.now()}`;
  const response = await request(app)
    .post("/api/quiz/submit")
    .set("Authorization", `Bearer ${zhangToken}`)
    .send({
      idempotencyKey: key,
      answers: [{ questionId: "NOT-EXISTS", answer: "A" }],
    });
  assert.equal(response.status, 400);
  const [rows] = await pool.query("SELECT id FROM quiz_attempts WHERE idempotency_key = ?", [key]);
  assert.equal(rows.length, 0);
});

test("路径接口只使用 JWT 身份且请求参数不能越权", async () => {
  const unauthorized = await request(app).get("/api/path/me");
  assert.equal(unauthorized.status, 401);
  const generated = await request(app)
    .post("/api/path/generate")
    .set("Authorization", `Bearer ${zhangToken}`)
    .send({ studentId: 999999 });
  assert.equal(generated.status, 200);
  assert.ok(generated.body.stages.length > 0);
  const injected = await request(app)
    .get("/api/path/me?studentId=999999")
    .set("Authorization", `Bearer ${zhangToken}`);
  assert.equal(injected.status, 200);
  const [[owner]] = await pool.query(
    "SELECT student_id FROM student_learning_paths WHERE current_version=? AND student_id=(SELECT id FROM users WHERE username='zhangsan')",
    [injected.body.version],
  );
  assert.ok(owner);
  assert.ok(injected.body.stages.slice(1).every((stage) => stage.status === "locked"));
});

test("重复生成不产生无意义版本，V1/V2 历史来自数据库", async () => {
  const first = await request(app).get("/api/path/me").set("Authorization", `Bearer ${zhangToken}`);
  const duplicate = await request(app)
    .post("/api/path/generate")
    .set("Authorization", `Bearer ${zhangToken}`)
    .send();
  assert.equal(duplicate.body.version, first.body.version);
  const history = await request(app).get("/api/path/versions").set("Authorization", `Bearer ${zhangToken}`);
  const [[count]] = await pool.query(
    "SELECT COUNT(*) AS count FROM learning_path_versions WHERE student_id=(SELECT id FROM users WHERE username='zhangsan')",
  );
  assert.equal(history.body.data.length, Number(count.count));
  assert.equal(history.body.data[0].version, duplicate.body.version);
});

test("结构发生真实变化时创建 V2，版本差异由数据库快照计算", async () => {
  const [[zhang]] = await pool.query("SELECT id FROM users WHERE username='zhangsan'");
  const [[current]] = await pool.query(
    "SELECT version,snapshot_json FROM learning_path_versions WHERE student_id=? ORDER BY version DESC LIMIT 1",
    [zhang.id],
  );
  const candidate =
    typeof current.snapshot_json === "string" ? JSON.parse(current.snapshot_json) : current.snapshot_json;
  assert.ok(candidate.stages.length >= 1);
  const first = candidate.stages[0];
  const completion =
    first.completion?.type === "resource"
      ? { type: "quiz", ids: [first.questionIds[0]] }
      : { type: "resource", ids: ["mind_map"] };
  candidate.stages[0] = { ...first, completion };
  const adjusted = await createOrAdjustLearningPath({
    studentId: zhang.id,
    reason: "测试真实结构调整",
    sourceType: "test",
    candidateOverride: candidate,
  });
  assert.equal(adjusted.version, Number(current.version) + 1);
  const history = await request(app).get("/api/path/versions").set("Authorization", `Bearer ${zhangToken}`);
  assert.equal(history.body.data[0].version, adjusted.version);
  assert.ok(history.body.data[0].diff.changed.length >= 1);
});

test("非法调整回滚且旧路径版本继续有效", async () => {
  const before = await request(app).get("/api/path/me").set("Authorization", `Bearer ${zhangToken}`);
  const [[zhang]] = await pool.query("SELECT id FROM users WHERE username='zhangsan'");
  const invalid = {
    title: "非法路径",
    stages: [
      {
        key: "bad",
        title: "伪造阶段",
        subject: "数据结构",
        durationMinutes: 45,
        goals: ["伪造"],
        knowledgePoints: ["不存在知识点"],
        questionIds: ["NOT-EXISTS"],
        codeExerciseIds: [],
        completion: { type: "quiz", ids: ["NOT-EXISTS"] },
        dependsOn: [],
      },
    ],
  };
  await assert.rejects(
    () => createOrAdjustLearningPath({ studentId: zhang.id, candidateOverride: invalid }),
    /unknown knowledge point|invalid question reference/,
  );
  const after = await request(app).get("/api/path/me").set("Authorization", `Bearer ${zhangToken}`);
  assert.equal(after.body.version, before.body.version);
});

test.after(async () => {
  resetCodeRunnerForTests();
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
    if (!/^learnmate_auth_quiz_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});
