/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_codelab_test_${suffix}`;
const storageRoot = path.join(os.tmpdir(), `learnmate-codelab-${suffix}`);

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "codelab-test-secret-with-more-than-32-characters";
process.env.DEMO_PASSWORD = "test-only-demo-password";
process.env.AI_ENABLED = "false";
process.env.PATH_PLANNER_AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
process.env.RESOURCE_STORAGE_DIR = path.join(storageRoot, "resources");
process.env.REPORT_STORAGE_DIR = path.join(storageRoot, "reports");

const app = require("../src/app");
const { pool, databaseConfig } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const { setCodeRunnerForTests, resetCodeRunnerForTests } = require("../src/services/codeJudgeService");

let studentId;
let otherStudentId;
let teacherId;
let adminId;
let invalidRoleId;
let studentToken;
let teacherToken;
let adminToken;
let invalidRoleToken;

function token(id, role) {
  return jwt.sign(
    {
      userId: id,
      role,
      ...(role === "STUDENT" ? { studentId: id } : {}),
      ...(role === "TEACHER" ? { teacherId: id } : {}),
    },
    process.env.JWT_SECRET,
    { subject: String(id), expiresIn: "1h" },
  );
}

async function insertUser(username, role) {
  const [result] = await pool.query(
    "INSERT INTO users(student_no,username,display_name,password_hash,role,is_demo) VALUES(?,?,?,?,?,0)",
    [`CL-${username}`, username, username, "test-only-password-hash", role],
  );
  return Number(result.insertId);
}

test.before(async () => {
  await fs.mkdir(storageRoot, { recursive: true });
  assert.equal(await initDB(), true);
  studentId = await insertUser(`student-${suffix}`, "STUDENT");
  otherStudentId = await insertUser(`other-${suffix}`, "STUDENT");
  teacherId = await insertUser(`teacher-${suffix}`, "TEACHER");
  adminId = await insertUser(`admin-${suffix}`, "ADMIN");
  invalidRoleId = await insertUser(`guest-${suffix}`, "GUEST");

  studentToken = token(studentId, "STUDENT");
  teacherToken = token(teacherId, "TEACHER");
  adminToken = token(adminId, "ADMIN");
  invalidRoleToken = token(invalidRoleId, "GUEST");

  await pool.query(
    `INSERT INTO code_exercises
       (exercise_id,subject,knowledge_point,title,description,language,difficulty,starter_code,sample_input,sample_output,explanation,tags,source)
     VALUES
       ('CL-SEQ-001','数据结构','顺序表','顺序表插入','完成顺序表插入逻辑。','c','基础',?,'3\\n1 2 3','1 2 3','练习顺序表基本操作。',JSON_ARRAY('数组','顺序表'),'test'),
       ('CL-TREE-001','数据结构','二叉树','二叉树遍历','完成二叉树遍历逻辑。','c','提高',?,'','A B C','练习树遍历。',JSON_ARRAY('二叉树'),'test')`,
    [
      '#include <stdio.h>\nint main(void) {\n  printf("1 2 3");\n  return 0;\n}',
      '#include <stdio.h>\nint main(void) {\n  printf("A B C");\n  return 0;\n}',
    ],
  );
  await seedJudgeData("CL-SEQ-001");
  setCodeRunnerForTests(fakeRunner);
});

test("未登录访问 CodeLab 返回 401", async () => {
  const response = await request(app).get("/api/code/exercises");
  assert.equal(response.status, 401);
});

test("STUDENT 可以读取真实 CodeLab 题库且不泄露内部字段", async () => {
  const response = await request(app)
    .get("/api/code/exercises")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(response.body.data.length >= 2);
  const exercise = response.body.data.find((item) => item.exercise_id === "CL-SEQ-001");
  assert.ok(exercise);
  assert.equal(Object.hasOwn(exercise, "solution"), false);
  assert.equal(Object.hasOwn(exercise, "hidden_tests"), false);
  assert.equal(Object.hasOwn(exercise, "test_cases"), false);
  assert.equal(Object.hasOwn(exercise, "explanation"), false);
});

test("筛选无结果时 CodeLab 返回 200 和空数组", async () => {
  const response = await request(app)
    .get("/api/code/exercises?subject=%E4%B8%8D%E5%AD%98%E5%9C%A8")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, []);
});

test("CodeLab 详情不存在返回 404", async () => {
  const response = await request(app)
    .get("/api/code/exercises/NOT-FOUND")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(response.status, 404);
});

test("CodeLab 详情接口不泄露标准答案或隐藏测试", async () => {
  const response = await request(app)
    .get("/api/code/exercises/CL-SEQ-001")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.exercise_id, "CL-SEQ-001");
  assert.equal(response.body.data.public_run_available, true);
  assert.equal(response.body.data.submission_available, true);
  assert.equal(Object.hasOwn(response.body.data, "solution"), false);
  assert.equal(Object.hasOwn(response.body.data, "hidden_tests"), false);
  assert.equal(Object.hasOwn(response.body.data, "test_cases"), false);
  assert.equal(Object.hasOwn(response.body.data, "answer"), false);
  assert.equal(Object.hasOwn(response.body.data, "explanation"), false);
  assert.equal(response.body.data.hidden_judge_available, true);

  const unconfigured = await request(app)
    .get("/api/code/exercises/CL-TREE-001")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(unconfigured.status, 200, JSON.stringify(unconfigured.body));
  assert.equal(unconfigured.body.data.public_run_available, false);
  assert.equal(unconfigured.body.data.submission_available, false);
});

test("STUDENT 不能通过未开放路由创建、修改或删除 CodeLab 题目", async () => {
  for (const [method, url] of [
    ["post", "/api/code/exercises"],
    ["patch", "/api/code/exercises/CL-SEQ-001"],
    ["delete", "/api/code/exercises/CL-SEQ-001"],
  ]) {
    const response = await request(app)
      [method](url)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ title: "forbidden" });
    assert.equal(response.status >= 400, true, `${method.toUpperCase()} ${url} should not be allowed`);
  }
});

test("TEACHER、ADMIN 和未知角色不能使用学生端 CodeLab", async () => {
  for (const bearer of [teacherToken, adminToken, invalidRoleToken]) {
    const response = await request(app).get("/api/code/exercises").set("Authorization", `Bearer ${bearer}`);
    assert.equal(response.status, 403);
  }
});

test("教师端原有权限仍然生效", async () => {
  assert.equal((await request(app).get("/api/teacher/classes")).status, 401);
  assert.equal(
    (await request(app).get("/api/teacher/classes").set("Authorization", `Bearer ${studentToken}`)).status,
    403,
  );
  assert.equal(
    (await request(app).get("/api/teacher/classes").set("Authorization", `Bearer ${teacherToken}`)).status,
    200,
  );
});

test("运行样例只写入当前学生自己的提交记录", async () => {
  const response = await request(app)
    .post("/api/code/run")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "c",
      sourceCode: '#include <stdio.h>\nint main(void) { printf("1 2 3"); return 0; }',
      stdin: "",
      studentId: otherStudentId,
    });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, "accepted");
  assert.equal(response.body.mode, "run");
  assert.equal(response.body.executionMode, "docker");

  const [[own]] = await pool.query(
    "SELECT student_id,exercise_id,status,mode,execution_mode FROM code_submissions WHERE exercise_id='CL-SEQ-001' ORDER BY id DESC LIMIT 1",
  );
  assert.equal(Number(own.student_id), studentId);
  assert.equal(own.exercise_id, "CL-SEQ-001");
  assert.equal(own.status, "accepted");
  assert.equal(own.mode, "run");
  assert.equal(own.execution_mode, "docker");

  const [[other]] = await pool.query(
    "SELECT COUNT(*) count FROM code_submissions WHERE student_id=? AND exercise_id='CL-SEQ-001'",
    [otherStudentId],
  );
  assert.equal(Number(other.count), 0);
});

test("自定义输入（包括空输入）原样传递，保存结果不会冒充 AC", async () => {
  const captured = [];
  setCodeRunnerForTests(async (task) => {
    captured.push(task);
    return fakeRunner(task);
  });
  try {
    for (const stdin of ["7 8\n", ""]) {
      const response = await request(app)
        .post("/api/code/run")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          exerciseId: "CL-SEQ-001",
          language: "c",
          sourceCode: "int main(void){return 0;}",
          stdin,
          runMode: "custom",
        });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, "success");
      assert.equal(response.body.judgedBy, "custom_input");
      assert.equal(captured.at(-1).tests.length, 1);
      assert.equal(captured.at(-1).tests[0].input, stdin);
      assert.equal(captured.at(-1).tests[0].compareOutput, false);
      const saved = await request(app)
        .get(`/api/code/submissions/${response.body.submissionId}`)
        .set("Authorization", `Bearer ${studentToken}`);
      assert.match(JSON.stringify(saved.body), /custom_input/);
    }
  } finally {
    setCodeRunnerForTests(fakeRunner);
  }
});

test("未登录 submit 返回 401，学生正式提交 accepted 且隐藏测试不泄露", async () => {
  assert.equal((await request(app).post("/api/code/submit").send({})).status, 401);
  const response = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "c",
      sourceCode: '#include <stdio.h>\nint main(void) { printf("1 2 3"); return 0; }',
      idempotencyKey: "submit-safe-001",
    });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.result.status, "accepted");
  assert.equal(response.body.submission.mode, "submit");
  assert.equal(response.body.reused, false);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("hidden input"), false);
  assert.equal(serialized.includes("expectedOutput"), false);
  assert.equal(serialized.includes("referenceSolution"), false);
  assert.equal(serialized.includes("reference_solution"), false);
});

test("重复幂等提交返回同一 submission，伪造 studentId、score、passed 无效", async () => {
  const body = {
    exerciseId: "CL-SEQ-001",
    language: "c",
    sourceCode: '#include <stdio.h>\nint main(void) { printf("1 2 3"); return 0; }',
    idempotencyKey: "submit-safe-002",
    studentId: otherStudentId,
    score: 100,
    passed: true,
  };
  const first = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send(body);
  const second = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send(body);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.reused, true);
  assert.equal(second.body.submission.id, first.body.submission.id);
  const [[own]] = await pool.query("SELECT student_id,result_json FROM code_submissions WHERE id=?", [
    first.body.submission.id,
  ]);
  assert.equal(Number(own.student_id), studentId);
  assert.equal(JSON.stringify(own.result_json).includes("score"), false);
});

test("submit 使用隐藏测试，run 不使用隐藏测试", async () => {
  const fixedOutputSource = '#include <stdio.h>\nint main(void) { printf("public-ok"); return 0; }';
  const run = await request(app)
    .post("/api/code/run")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({ exerciseId: "CL-SEQ-001", language: "c", sourceCode: fixedOutputSource, stdin: "1 2 3" });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.body.totalCount, 1);
  assert.equal(
    run.body.cases.some((item) => item.visibility === "hidden"),
    false,
  );

  const submit = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "c",
      sourceCode: fixedOutputSource,
      idempotencyKey: "submit-hidden-001",
    });
  assert.equal(submit.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.result.totalCount > run.body.totalCount, true);
  assert.equal(
    submit.body.result.cases.some((item) => item.visibility === "hidden"),
    true,
  );
  assert.equal(JSON.stringify(submit.body).includes("hidden input"), false);
});

test("错误答案、编译错误和未配置私有测试安全返回", async () => {
  const wrong = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "c",
      sourceCode: "WRONG_ANSWER",
      idempotencyKey: "submit-wrong-001",
    });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.body));
  assert.equal(wrong.body.result.status, "wrong_answer");

  const compile = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "c",
      sourceCode: "COMPILE_ERROR",
      idempotencyKey: "submit-compile-001",
    });
  assert.equal(compile.status, 200, JSON.stringify(compile.body));
  assert.equal(compile.body.result.status, "compile_error");

  const missingPrivate = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-TREE-001",
      language: "c",
      sourceCode: "int main(void){return 0;}",
      idempotencyKey: "submit-missing-001",
    });
  assert.equal(missingPrivate.status, 422);
  assert.equal(missingPrivate.body.code, "CODE_PUBLIC_TESTS_NOT_CONFIGURED");
});

test("做题阶段不下发讲解，正式提交后才可解锁参考答案", async () => {
  const detail = await request(app)
    .get("/api/code/exercises/CL-SEQ-001")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(Object.hasOwn(detail.body.data, "explanation"), false);

  const locked = await request(app)
    .get("/api/code/exercises/CL-SEQ-001/solution")
    .set("Authorization", `Bearer ${token(otherStudentId, "STUDENT")}`);
  assert.equal(locked.status, 403);
  assert.equal(locked.body.code, "CODE_SOLUTION_LOCKED");

  const unlocked = await request(app)
    .get("/api/code/exercises/CL-SEQ-001/solution")
    .set("Authorization", `Bearer ${studentToken}`);
  assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));
  assert.equal(unlocked.body.data.unlocked, true);
  assert.ok(unlocked.body.data.explanation.length > 0);
  assert.equal(unlocked.body.data.referenceSolution, "reference solution");
});

test("未配置隐藏用例的练习按公开用例判定并如实标注", async () => {
  await pool.query(
    `INSERT INTO code_test_cases (exercise_id,visibility,input_text,expected_output,order_index)
     VALUES ('CL-TREE-001','public','','A B C',1)
     ON DUPLICATE KEY UPDATE expected_output=VALUES(expected_output)`,
  );

  const submit = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-TREE-001",
      language: "c",
      sourceCode: "int main(void){return 0;}",
      idempotencyKey: "submit-public-only-001",
    });
  assert.equal(submit.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.result.judgedBy, "public_only");
  assert.equal(submit.body.result.totalCount, 1);
  assert.equal(
    submit.body.result.cases.some((item) => item.visibility === "hidden"),
    false,
  );
});

test("不支持语言、未发布练习、不存在练习和 submission 所有权受保护", async () => {
  const unsupported = await request(app)
    .post("/api/code/run")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "python",
      sourceCode: "print(1)",
    });
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.body.code, "UNSUPPORTED_CODE_LANGUAGE");

  await pool.query("UPDATE code_exercises SET is_published=0 WHERE exercise_id='CL-TREE-001'");
  assert.equal(
    (await request(app).get("/api/code/exercises/CL-TREE-001").set("Authorization", `Bearer ${studentToken}`))
      .status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/code/run")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ exerciseId: "CL-TREE-001", language: "c", sourceCode: "int main(void){return 0;}" })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/code/run")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ exerciseId: "NOPE", language: "c", sourceCode: "int main(void){return 0;}" })
    ).status,
    404,
  );

  const submitted = await request(app)
    .post("/api/code/submit")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({
      exerciseId: "CL-SEQ-001",
      language: "c",
      sourceCode: "int main(void){return 0;}",
      idempotencyKey: "submit-owner-001",
    });
  const submissionId = submitted.body.submission.id;
  assert.equal(
    (
      await request(app)
        .get(`/api/code/submissions/${submissionId}`)
        .set("Authorization", `Bearer ${studentToken}`)
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/code/submissions/${submissionId}`)
        .set("Authorization", `Bearer ${token(otherStudentId, "STUDENT")}`)
    ).status,
    404,
  );
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
    if (!/^learnmate_codelab_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function seedJudgeData(exerciseId) {
  await pool.query(
    `INSERT INTO code_exercise_private (exercise_id,language,reference_solution,judge_config_json)
     VALUES (?, 'c', 'reference solution', JSON_OBJECT('judgeVersion','test'))
     ON DUPLICATE KEY UPDATE reference_solution=VALUES(reference_solution)`,
    [exerciseId],
  );
  const tests = [
    ["public", "1 2 3", "public-ok", 1],
    ["hidden", "hidden input", "hidden-ok", 1],
  ];
  for (const [visibility, input, expected, order] of tests) {
    await pool.query(
      `INSERT INTO code_test_cases (exercise_id,visibility,input_text,expected_output,order_index)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE input_text=VALUES(input_text),expected_output=VALUES(expected_output)`,
      [exerciseId, visibility, input, expected, order],
    );
  }
}

async function fakeRunner(task = {}) {
  const source = String(task.sourceCode || "");
  const tests = Array.isArray(task.tests) ? task.tests : [];
  if (source.includes("COMPILE_ERROR")) {
    return {
      compile: { status: "compile_error", message: "syntax error at [path]", durationMs: 1 },
      execution: { status: "compile_error", passedCount: 0, totalCount: tests.length, cases: [] },
    };
  }
  const status = source.includes("WRONG_ANSWER") ? "wrong_answer" : "accepted";
  const cases = tests.map((item, index) => ({
    id: item.id || `${item.visibility}-${index + 1}`,
    visibility: item.visibility,
    status,
    stdout: status === "accepted" ? (item.visibility === "public" ? "public-ok" : "") : "bad",
    stderr: "",
    message: status === "accepted" ? "" : "output did not match expected result",
    durationMs: 1,
  }));
  return {
    compile: { status: "success", message: "", durationMs: 1 },
    execution: {
      status,
      passedCount: status === "accepted" ? cases.length : 0,
      totalCount: cases.length,
      cases,
    },
  };
}
