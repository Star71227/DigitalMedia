/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
process.env.JWT_SECRET = "code-case-api-test-secret-with-more-than-32-characters";
process.env.AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
process.env.CODE_EXECUTION_MODE = "docker";
process.env.CODE_RUNNER_IMAGE = "learnmate/code-runner-c:2.4a";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../src/app");
const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const { initLearningPathDB } = require("../src/config/initLearningPathDB");
const { initLearningResourceDB } = require("../src/config/initLearningResourceDB");
const { TRUSTED_CODE_CASE_EXERCISES } = require("../src/config/trustedCodeCaseSeeds");
const { getExercisePrivateConfig } = require("../src/services/codeExerciseService");
const { createOrAdjustLearningPath } = require("../src/services/learningPathService");

const createdStudentIds = [];
const PRIVATE_CODE_FIELDS = [
  "referenceSolution",
  "reference_solution",
  "hiddenTests",
  "hidden_tests",
  "judgeConfig",
  "judge_config",
  "judgeFingerprint",
  "judge_fingerprint",
  "runnerImage",
  "runner_image",
  "learnmate/code-runner-c",
];

test.before(async () => {
  await initDB();
  await initLearningPathDB(pool);
  await initLearningResourceDB(pool);
});

test("trusted code_case HTTP generation and CodeLab submit cover all three C themes", async () => {
  for (const fixture of TRUSTED_CODE_CASE_EXERCISES) {
    const student = await createStudentForFixture(fixture);
    const token = jwt.sign(
      { sub: String(student.studentId), username: student.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const path = await createOrAdjustLearningPath({
      studentId: student.studentId,
      reason: `code_case trusted API ${fixture.exerciseId}`,
      sourceType: "test",
    });
    const stage = path.stages.find(
      (item) => item.subject === fixture.subject && item.knowledgePoints.includes(fixture.knowledgePoint),
    );
    assert.ok(stage, `${fixture.exerciseId} stage exists`);

    const generated = await request(app)
      .post("/api/resources/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        resourceType: "code_case",
        subject: stage.subject,
        knowledgePoint: stage.knowledgePoints[0],
        stageKey: stage.key,
        pathVersion: path.version,
      });

    assert.equal(generated.status, 200, JSON.stringify(generated.body));
    const resource = generated.body.resource;
    assert.equal(resource.resourceType, "code_case");
    assert.equal(resource.status, "approved");
    assert.equal(resource.content.verificationStatus, "verified");
    assert.equal(resource.content.codeExerciseId, fixture.exerciseId);
    assert.equal(resource.content.codeLabEntry.exerciseId, fixture.exerciseId);
    assert.equal(resource.content.sourceMode, "deterministic_fallback");
    assert.equal(resource.content.modelAvailable, false);
    assert.ok(resource.content.candidateCount >= 1);
    assert.ok(resource.content.testCases.length >= 3);
    assert.ok(resource.content.boundaryConditions.length >= 3);
    assert.equal(resource.content.qualitySummary.trusted, true);
    assert.equal(resource.content.qualitySummary.executionMode, "docker");
    assert.equal(resource.content.qualitySummary.publicTestCount, 3);
    assert.equal(resource.content.qualitySummary.hiddenTestCount, 6);
    assertNoPrivateCodeFields(resource);

    const [[versionRow]] = await pool.query(
      "SELECT code_exercise_id, code_case_candidate_key FROM learning_resource_versions WHERE resource_id=? AND version=? LIMIT 1",
      [resource.id, resource.version],
    );
    assert.equal(versionRow.code_exercise_id, fixture.exerciseId);
    assert.ok(String(versionRow.code_case_candidate_key || "").length > 0);

    const read = await request(app)
      .get(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.resource.content.codeExerciseId, fixture.exerciseId);
    assertNoPrivateCodeFields(read.body.resource);

    const privateConfig = await getExercisePrivateConfig(fixture.exerciseId);
    const submit = await request(app)
      .post("/api/code/submit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `trusted-api-${fixture.exerciseId}`)
      .send({
        exerciseId: fixture.exerciseId,
        language: "c",
        sourceCode: privateConfig.referenceSolution,
        idempotencyKey: `trusted-api-${fixture.exerciseId}`,
      });

    assert.equal(submit.status, 200, JSON.stringify(submit.body));
    assert.equal(submit.body.result.status, "accepted");
    assert.equal(submit.body.result.executionMode, "docker");
    assert.equal(submit.body.result.passedCount, 9);
    assert.equal(submit.body.result.totalCount, 9);
    assertNoPrivateCodeFields(submit.body);
  }
});

test.after(async () => {
  if (createdStudentIds.length) {
    await pool.query(
      `DELETE FROM code_submissions WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM learning_resource_progress WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM learning_resource_stage_links WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM learning_resource_versions WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM learning_resources WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM learning_path_adjustment_events WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM learning_path_versions WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM student_learning_paths WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM student_knowledge_mastery WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM student_profiles WHERE student_id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
    await pool.query(
      `DELETE FROM users WHERE id IN (${createdStudentIds.map(() => "?").join(",")})`,
      createdStudentIds,
    );
  }
  await pool.end();
});

async function createStudentForFixture(fixture) {
  const username = `code_case_api_${fixture.exerciseId.toLowerCase()}_${Date.now()}`;
  const [insert] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash) VALUES (?, ?, ?, 'test')",
    [`CC-${fixture.exerciseId}-${Date.now()}`, username, `CodeCase ${fixture.subject}`],
  );
  const studentId = insert.insertId;
  createdStudentIds.push(studentId);
  await pool.query(
    `INSERT INTO student_profiles
       (student_id, current_course, learning_goals_json, resource_preferences_json, profile_completeness, current_version)
     VALUES (?, ?, ?, ?, 1, 1)`,
    [
      studentId,
      fixture.subject,
      JSON.stringify([`掌握${fixture.knowledgePoint}`]),
      JSON.stringify(["代码案例"]),
    ],
  );
  await pool.query(
    `INSERT INTO student_knowledge_mastery
       (student_id, subject, knowledge_point, mastery, wrong_count, practice_count)
     VALUES (?, ?, ?, 35, 2, 1)`,
    [studentId, fixture.subject, fixture.knowledgePoint],
  );
  return { studentId, username };
}

function assertNoPrivateCodeFields(value) {
  const serialized = JSON.stringify(value);
  for (const secret of PRIVATE_CODE_FIELDS) {
    assert.equal(serialized.includes(secret), false, secret);
  }
}
