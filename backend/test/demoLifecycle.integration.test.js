/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_demo_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-demo-${suffix}`);

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.DEMO_PASSWORD = "test-only-demo-password";
process.env.AI_ENABLED = "false";
process.env.PATH_PLANNER_AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
process.env.RESOURCE_STORAGE_DIR = path.join(storageRoot, "resources");
process.env.REPORT_STORAGE_DIR = path.join(storageRoot, "reports");

const { initDB } = require("../src/config/initDB");
const { pool, databaseConfig } = require("../src/config/db");
const app = require("../src/app");
const {
  RESET_CONFIRMATION,
  LEGACY_ADOPT_CONFIRMATION,
  adoptLegacyCompetitionDemo,
  seedCompetitionDemo,
  verifyCompetitionDemo,
  resetCompetitionDemo,
  resetSeedAndVerify,
} = require("../src/services/competitionDemoService");
const { ensureDemoAccount } = require("../src/services/demoAccountService");
const { importKnowledgeBase } = require("../src/services/knowledgeIngestionService");
const { setCodeRunnerForTests, resetCodeRunnerForTests } = require("../src/services/codeJudgeService");

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
});

test("competition demo seed refuses to overwrite an unregistered reserved account", async () => {
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD, 4);
  await pool.query(
    "INSERT INTO users(student_no,username,display_name,password_hash,role,is_demo) VALUES('20260001','zhangsan','原有用户',?,'STUDENT',0)",
    [passwordHash],
  );
  await assert.rejects(
    () => seedCompetitionDemo(),
    (error) => error.code === "DEMO_ACCOUNT_COLLISION",
  );
  const [[unchanged]] = await pool.query(
    "SELECT display_name,is_demo,password_hash FROM users WHERE username='zhangsan'",
  );
  assert.equal(unchanged.display_name, "原有用户");
  assert.equal(Number(unchanged.is_demo), 0);
  assert.equal(await bcrypt.compare(process.env.DEMO_PASSWORD, unchanged.password_hash), true);
  await assert.rejects(
    () => adoptLegacyCompetitionDemo({ env: { ...process.env, DEMO_ADOPT_LEGACY_CONFIRM: "" } }),
    (error) => error.code === "DEMO_LEGACY_ADOPT_CONFIRMATION_REQUIRED",
  );
  const adoption = await adoptLegacyCompetitionDemo({
    env: { ...process.env, DEMO_ADOPT_LEGACY_CONFIRM: LEGACY_ADOPT_CONFIRMATION },
  });
  assert.deepEqual(adoption, { adoptedCount: 1, usernames: ["zhangsan"] });
  const [[registered]] = await pool.query("SELECT is_demo FROM users WHERE username='zhangsan'");
  assert.equal(Number(registered.is_demo), 1);
  const [[audit]] = await pool.query(
    "SELECT COUNT(*) count FROM agent_run_logs WHERE agent_name='DemoDataOperator' AND task_type='legacy_demo_adoption'",
  );
  assert.equal(Number(audit.count), 1);
  await pool.query("DELETE FROM users WHERE username='zhangsan' AND is_demo=1");
});

test("competition demo seed preflights every reserved identity before writing", async () => {
  const [[before]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM knowledge_sources) knowledgeSources,
    (SELECT COUNT(*) FROM users WHERE is_demo=1) demoUsers`);
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD, 4);
  await pool.query(
    "INSERT INTO users(student_no,username,display_name,password_hash,role,is_demo) VALUES('20260002','lisi','Existing user',?,'STUDENT',0)",
    [passwordHash],
  );
  await assert.rejects(
    () => seedCompetitionDemo(),
    (error) => error.code === "DEMO_ACCOUNT_COLLISION",
  );
  const [[after]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM knowledge_sources) knowledgeSources,
    (SELECT COUNT(*) FROM users WHERE is_demo=1) demoUsers`);
  assert.equal(Number(after.knowledgeSources), Number(before.knowledgeSources));
  assert.equal(Number(after.demoUsers), Number(before.demoUsers));
  await pool.query("DELETE FROM users WHERE username='lisi' AND is_demo=0");
});

test("competition demo seed is idempotent and verify succeeds", async () => {
  const first = await seedCompetitionDemo();
  const before = await demoCounts();
  const second = await seedCompetitionDemo();
  const after = await demoCounts();

  assert.equal(first.seeded, true);
  assert.equal(second.seeded, true);
  assert.deepEqual(after, before);
  assert.equal(after.demoUsers, 4);
  assert.equal(after.quizAttempts, 1);
  assert.equal(after.resources, 5);
  assert.equal(after.resourceVersions, 5);
  assert.ok(after.codeSuccesses >= 1);
  assert.ok(after.approvedReports >= 1);

  const verification = await verifyCompetitionDemo();
  assert.equal(verification.passed, true, JSON.stringify(verification, null, 2));
});

test("health endpoint checks the isolated database and storage without leaking configuration", async () => {
  const response = await request(app).get("/api/health").set("X-Request-Id", "demo-health-test-1234");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database, "ok");
  assert.equal(response.body.storage, "ok");
  assert.equal(response.headers["x-request-id"], "demo-health-test-1234");
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(databaseConfig.password), false);
  assert.equal(serialized.includes(storageRoot), false);
});

test("a normal seed repairs a deleted demo error pattern without adding quiz or resource history", async () => {
  const [[student]] = await pool.query("SELECT id FROM users WHERE username='zhangsan' LIMIT 1");
  const before = await demoCounts();
  await pool.query("DELETE FROM student_error_patterns WHERE student_id=? AND knowledge_point='红黑树旋转'", [
    student.id,
  ]);
  const [[missing]] = await pool.query(
    "SELECT COUNT(*) count FROM student_error_patterns WHERE student_id=? AND knowledge_point='红黑树旋转'",
    [student.id],
  );
  assert.equal(Number(missing.count), 0);

  await seedCompetitionDemo();

  const after = await demoCounts();
  const [[restored]] = await pool.query(
    "SELECT occurrence_count FROM student_error_patterns WHERE student_id=? AND knowledge_point='红黑树旋转' AND error_type='procedure_confusion'",
    [student.id],
  );
  assert.ok(restored);
  assert.ok(Number(restored.occurrence_count) >= 1);
  assert.deepEqual(after, before);
  const verification = await verifyCompetitionDemo();
  assert.equal(verification.passed, true, JSON.stringify(verification, null, 2));
});

test("same-version real knowledge content changes are rejected while line-ending-only changes are idempotent", async () => {
  const source = path.resolve(__dirname, "../data/knowledge-base/data-structures/01-complexity.md");
  const raw = await fs.readFile(source, "utf8");
  const changedRoot = await fs.mkdtemp(path.join(os.tmpdir(), `learnmate-knowledge-drift-${suffix}-`));
  try {
    await fs.writeFile(
      path.join(changedRoot, "changed.md"),
      `${raw.replace(/\r\n?/g, "\n")}\n真实内容漂移。\n`,
      "utf8",
    );
    const report = await importKnowledgeBase({ db: pool, rootDir: changedRoot });
    assert.equal(report.failed, 1);
    assert.match(report.errors[0].error, /source version changed/);
    const before = await demoCounts();
    await seedCompetitionDemo();
    assert.deepEqual(await demoCounts(), before, "CRLF/LF differences must not trigger a new import");
  } finally {
    await fs.rm(changedRoot, { recursive: true, force: true });
  }
});

test("reset preserves non-demo users, then reseeds and verifies", async () => {
  const username = `non-demo-${suffix}`;
  await pool.query(
    "INSERT INTO users(student_no,username,display_name,password_hash,role) VALUES(?,?,?,?, 'STUDENT')",
    [`NON-DEMO-${suffix}`, username, "非内置用户", "test-only-hash"],
  );
  const [[knowledgeBefore]] = await pool.query(
    "SELECT COUNT(*) count FROM knowledge_sources WHERE status='active'",
  );
  const result = await resetSeedAndVerify({
    env: { ...process.env, NODE_ENV: "test", DEMO_RESET_CONFIRM: RESET_CONFIRMATION },
  });
  assert.equal(result.verification.passed, true);
  const [[nonDemo]] = await pool.query("SELECT id FROM users WHERE username=?", [username]);
  assert.ok(nonDemo, "non-demo user must survive demo reset");
  const counts = await demoCounts();
  assert.equal(counts.quizAttempts, 1);
  assert.equal(counts.resources, 5);
  const [[knowledgeAfter]] = await pool.query(
    "SELECT COUNT(*) count FROM knowledge_sources WHERE status='active'",
  );
  assert.equal(
    Number(knowledgeAfter.count),
    Number(knowledgeBefore.count),
    "demo reset must not modify the course knowledge base",
  );
});

test("reset recovers safely from teacher-only, student-only, and empty demo account states", async () => {
  const env = { ...process.env, NODE_ENV: "test", DEMO_RESET_CONFIRM: RESET_CONFIRMATION };
  await resetCompetitionDemo({ env });

  await ensureDemoAccount(pool, {
    studentNo: "TEACHER-DEMO",
    username: "teacher_demo",
    displayName: "示例教师",
    role: "TEACHER",
    password: process.env.DEMO_PASSWORD,
  });
  const teacherOnly = await resetCompetitionDemo({ env });
  assert.equal(teacherOnly.reset, true);

  await ensureDemoAccount(pool, {
    studentNo: "20260001",
    username: "zhangsan",
    displayName: "张同学",
    role: "STUDENT",
    password: process.env.DEMO_PASSWORD,
  });
  const studentOnly = await resetCompetitionDemo({ env });
  assert.equal(studentOnly.reset, true);

  const empty = await resetCompetitionDemo({ env });
  assert.deepEqual(empty, { reset: true, counts: {}, resourceFiles: 0, reportFiles: 0 });
  await seedCompetitionDemo();
  const verification = await verifyCompetitionDemo();
  assert.equal(verification.passed, true, JSON.stringify(verification, null, 2));
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
    if (!/^learnmate_demo_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function demoCounts() {
  const [[row]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM users WHERE is_demo=1 AND username IN ('teacher_demo','zhangsan','lisi','wangwu')) demoUsers,
    (SELECT COUNT(*) FROM quiz_attempts WHERE idempotency_key='competition-demo-quiz-v1') quizAttempts,
    (SELECT COUNT(*) FROM learning_resources r JOIN users u ON u.id=r.student_id WHERE u.username='zhangsan') resources,
    (SELECT COUNT(*) FROM learning_resource_versions v JOIN users u ON u.id=v.student_id WHERE u.username='zhangsan') resourceVersions,
    (SELECT COUNT(*) FROM learning_resource_files f JOIN users u ON u.id=f.student_id WHERE u.username='zhangsan') resourceFiles,
    (SELECT COUNT(*) FROM learning_resource_progress p JOIN users u ON u.id=p.student_id WHERE u.username='zhangsan') resourceProgress,
    (SELECT COUNT(*) FROM knowledge_retrieval_runs r JOIN users u ON u.id=r.student_id WHERE u.username='zhangsan') retrievalRuns,
    (SELECT COUNT(*) FROM generation_citations c JOIN users u ON u.id=c.student_id WHERE u.username='zhangsan') citations,
    (SELECT COUNT(*) FROM agent_run_logs l JOIN users u ON u.id=l.student_id WHERE u.username='zhangsan') agentLogs,
    (SELECT COUNT(*) FROM code_submissions s JOIN users u ON u.id=s.student_id JOIN code_exercises e ON e.exercise_id=s.exercise_id WHERE u.username='zhangsan' AND s.mode='submit' AND s.status='accepted' AND s.execution_mode='docker' AND e.path_completion_eligible=1) codeSuccesses,
    (SELECT COUNT(*) FROM learning_assessment_reports r JOIN users u ON u.id=r.student_id WHERE u.username='zhangsan' AND r.status='approved') approvedReports`);
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}
