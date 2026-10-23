/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const assert = require("node:assert/strict");
const crypto = require("crypto");
const path = require("path");
const jwt = require("jsonwebtoken");
const request = require("supertest");

require("dotenv").config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});

process.env.CODE_EXECUTION_MODE = process.env.CODE_EXECUTION_MODE || "docker";
process.env.CODE_RUNNER_IMAGE = process.env.CODE_RUNNER_IMAGE || "learnmate/code-runner-c:2.4a";

const app = require("../src/app");
const { initDB } = require("../src/config/initDB");
const { pool } = require("../src/config/db");
const { seedRedBlackTreeDemo } = require("../src/config/initLearningProfileDB");
const { getExercisePrivateConfig } = require("../src/services/codeExerciseService");

const EXERCISE_ID = "DS_CODE_RBT_001";
const HIDDEN_OUTPUTS = ["9 4 6", "200 100 150", "1 0 -1", "13 8 11", "-5 -20 -10", "99 42 77"];

async function main() {
  if (!(await initDB())) throw new Error("Database initialization failed");
  await seedRedBlackTreeDemo(pool);

  const token = await buildStudentToken();
  const headers = { Authorization: `Bearer ${token}` };
  const privateConfig = await getExercisePrivateConfig(EXERCISE_ID);
  const referenceSource = privateConfig.referenceSolution;

  const publicRun = await request(app)
    .post("/api/code/run")
    .set(headers)
    .send({ exerciseId: EXERCISE_ID, language: "c", sourceCode: referenceSource, stdin: "10 20 15\n" });
  assert.equal(publicRun.status, 200, publicRun.text);
  assert.equal(publicRun.body.status, "accepted");
  assert.equal(publicRun.body.mode, "run");
  assert.equal(publicRun.body.executionMode, "docker");
  assertNoHiddenLeak(publicRun.body);

  const firstSubmit = await submit(headers, referenceSource, "accepted");
  const repeated = await request(app)
    .post("/api/code/submit")
    .set(headers)
    .set("Idempotency-Key", firstSubmit.idempotencyKey)
    .send({ exerciseId: EXERCISE_ID, language: "c", sourceCode: referenceSource });
  assert.equal(repeated.status, 200, repeated.text);
  assert.equal(repeated.body.submission.id, firstSubmit.submissionId);

  await submit(headers, fixedPublicOnlySource(), "wrong_answer");
  await submit(headers, "int main(void) { syntax error }", "compile_error");
  await submit(headers, "int main(void){ while(1){} return 0; }", "timeout");

  const unsupported = await request(app)
    .post("/api/code/submit")
    .set(headers)
    .send({ exerciseId: EXERCISE_ID, language: "python", sourceCode: "print('no')" });
  assert.equal(unsupported.status, 400, unsupported.text);
  assert.equal(unsupported.body.code, "UNSUPPORTED_CODE_LANGUAGE");

  const [runRows] = await pool.query("SELECT mode, execution_mode FROM code_submissions WHERE id=? LIMIT 1", [
    publicRun.body.submissionId,
  ]);
  assert.equal(runRows[0].mode, "run");
  assert.equal(runRows[0].execution_mode, "docker");

  console.log(
    JSON.stringify(
      {
        passed: true,
        executionMode: "docker",
        image: process.env.CODE_RUNNER_IMAGE,
        scenarios: [
          "run",
          "submit",
          "idempotency",
          "wrong_answer",
          "compile_error",
          "timeout",
          "unsupported_language",
          "hidden_privacy",
        ],
      },
      null,
      2,
    ),
  );
}

async function submit(headers, sourceCode, expectedStatus) {
  const idempotencyKey = `verify-code-api-${crypto.randomUUID()}`;
  const response = await request(app)
    .post("/api/code/submit")
    .set(headers)
    .set("Idempotency-Key", idempotencyKey)
    .send({ exerciseId: EXERCISE_ID, language: "c", sourceCode });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.result.status, expectedStatus, response.text);
  assert.equal(response.body.result.mode, "submit");
  assert.equal(response.body.result.executionMode, "docker");
  assertNoHiddenLeak(response.body);
  return { idempotencyKey, submissionId: response.body.submission.id };
}

async function buildStudentToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error("JWT_SECRET must be configured before API verification");
  const [[student]] = await pool.query(
    "SELECT id, username, student_no FROM users WHERE username='zhangsan' AND role='STUDENT' LIMIT 1",
  );
  if (!student) throw new Error("Demo student zhangsan is required; run npm run demo:seed first");
  return jwt.sign(
    {
      userId: Number(student.id),
      studentId: Number(student.id),
      username: student.username,
      studentNo: student.student_no,
      role: "STUDENT",
    },
    secret,
    { subject: String(student.id), expiresIn: "10m" },
  );
}

function assertNoHiddenLeak(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes("referenceSolution"), false);
  assert.equal(text.includes("reference_solution"), false);
  assert.equal(text.includes("sourceCode"), false);
  assert.equal(text.includes("source_code"), false);
  for (const output of HIDDEN_OUTPUTS)
    assert.equal(text.includes(output), false, `hidden output leaked: ${output}`);
}

function fixedPublicOnlySource() {
  return [
    "#include <stdio.h>",
    "int main(void) {",
    "  int a, b, c;",
    '  if (scanf("%d %d %d", &a, &b, &c) != 3) return 0;',
    '  printf("20 10 15");',
    "  return 0;",
    "}",
  ].join("\n");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.code || "CODE_API_DOCKER_VERIFY_FAILED");
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { main };
