/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TRUSTED_CODE_CASE_VALIDATOR_VERSION,
  buildJudgeFingerprint,
  containsPrivateJudgeField,
  qualifyTrustedExercise,
} = require("../src/services/codeExerciseTrustService");

const runner = {
  executionMode: "docker",
  runnerProtocol: "code-runner-c.v1",
  runnerImage: "learnmate/code-runner-c:2.4a",
};
const publicTests = [
  { visibility: "public", input: "1", expectedOutput: "1", orderIndex: 1 },
  { visibility: "public", input: "2", expectedOutput: "2", orderIndex: 2 },
  { visibility: "public", input: "3", expectedOutput: "3", orderIndex: 3 },
];
const hiddenTests = Array.from({ length: 6 }, (_, index) => ({
  visibility: "hidden",
  input: `h${index}`,
  expectedOutput: `o${index}`,
  orderIndex: index + 1,
}));
const judgeConfig = { judgeVersion: "test", outputComparison: "trim" };
const referenceSolution = "int main(void){return 0;}";

function trustedRow(overrides = {}) {
  const fingerprint = buildJudgeFingerprint({
    language: "c",
    referenceSolution,
    publicTests,
    hiddenTests,
    judgeConfig,
    runnerProtocol: runner.runnerProtocol,
    runnerImage: runner.runnerImage,
  });
  return {
    exercise_id: "CODE-1",
    subject: "Data Structures",
    knowledge_point: "Stack",
    title: "Stack CodeLab",
    description: "Complete a C exercise.",
    language: "c",
    difficulty: "foundation",
    starter_code: "int main(void){return 0;}",
    sample_input: "1",
    sample_output: "1",
    explanation: "public explanation",
    tags: JSON.stringify(["stack"]),
    source: "test",
    is_published: 1,
    path_completion_eligible: 1,
    reference_solution: referenceSolution,
    judge_config_json: JSON.stringify(judgeConfig),
    judge_verified: 1,
    judge_verified_at: new Date(),
    judge_fingerprint: fingerprint,
    judge_fingerprint_expires_at: new Date(Date.now() + 60_000),
    judge_quality_json: JSON.stringify({
      referenceAccepted: true,
      knownBugCaught: true,
      fixedOutputCaught: true,
      boundaryCategories: ["empty", "single", "large"],
    }),
    execution_mode: "docker",
    runner_protocol: runner.runnerProtocol,
    runner_image: runner.runnerImage,
    validator_version: TRUSTED_CODE_CASE_VALIDATOR_VERSION,
    ...overrides,
  };
}

test("trusted exercise qualifies only when fingerprint and quality metadata match", () => {
  const qualified = qualifyTrustedExercise(trustedRow(), [...publicTests, ...hiddenTests], {
    runner,
    subject: "Data Structures",
    knowledgePoint: "Stack",
    allowedIds: ["CODE-1"],
  });
  assert.equal(qualified.qualified, true);
  assert.equal(qualified.publicCandidate.exerciseId, "CODE-1");
  assert.equal(qualified.publicCandidate.qualitySummary.hiddenTestCount, 6);
  assert.equal(JSON.stringify(qualified.publicCandidate).includes("reference_solution"), false);

  const tampered = qualifyTrustedExercise(
    trustedRow({ judge_fingerprint: "0".repeat(64) }),
    [...publicTests, ...hiddenTests],
    {
      runner,
      subject: "Data Structures",
      knowledgePoint: "Stack",
      allowedIds: ["CODE-1"],
    },
  );
  assert.equal(tampered.qualified, false);
  assert.ok(tampered.issues.includes("judge_fingerprint_mismatch"));
});

test("private judge fields are detected before public projection", () => {
  assert.equal(containsPrivateJudgeField({ referenceSolution: "secret" }), true);
  assert.equal(
    containsPrivateJudgeField({
      qualitySummary: { hiddenTestCount: 6 },
      testCases: [{ expectedOutput: "public" }],
    }),
    false,
  );
});
