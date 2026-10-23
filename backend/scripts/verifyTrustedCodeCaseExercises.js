/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const assert = require("node:assert/strict");
const path = require("path");
require("dotenv").config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});

process.env.CODE_EXECUTION_MODE = process.env.CODE_EXECUTION_MODE || "docker";
process.env.CODE_RUNNER_IMAGE = process.env.CODE_RUNNER_IMAGE || "learnmate/code-runner-c:2.4a";

const { initDB } = require("../src/config/initDB");
const { pool } = require("../src/config/db");
const {
  TRUSTED_CODE_CASE_EXERCISES,
  seedTrustedCodeCaseExercises,
} = require("../src/config/trustedCodeCaseSeeds");
const { getExercisePrivateConfig } = require("../src/services/codeExerciseService");
const { judgeSubmission } = require("../src/services/codeJudgeService");
const { listTrustedCodeCaseCandidates } = require("../src/services/codeExerciseTrustService");

async function main() {
  if (!(await initDB())) throw new Error("Database initialization failed");
  await seedTrustedCodeCaseExercises(pool);

  const summaries = [];
  for (const fixture of TRUSTED_CODE_CASE_EXERCISES) {
    const candidates = await listTrustedCodeCaseCandidates({
      subject: fixture.subject,
      knowledgePoint: fixture.knowledgePoint,
      allowedCodeExerciseIds: [fixture.exerciseId],
    });
    assert.equal(candidates.length, 1, `${fixture.exerciseId} should be a trusted candidate`);

    const privateConfig = await getExercisePrivateConfig(fixture.exerciseId);
    assert.ok(privateConfig?.referenceSolution, `${fixture.exerciseId} reference is missing`);

    const reference = await judgeSubmission({
      exerciseId: fixture.exerciseId,
      language: "c",
      sourceCode: privateConfig.referenceSolution,
    });
    assert.equal(reference.status, "accepted", `${fixture.exerciseId} reference must pass`);

    const knownBug = await judgeSubmission({
      exerciseId: fixture.exerciseId,
      language: "c",
      sourceCode: fixture.knownBugSource,
    });
    assert.notEqual(knownBug.status, "accepted", `${fixture.exerciseId} known bug must be caught`);

    const fixedOutput = await judgeSubmission({
      exerciseId: fixture.exerciseId,
      language: "c",
      sourceCode: fixture.fixedOutputSource,
    });
    assert.notEqual(
      fixedOutput.status,
      "accepted",
      `${fixture.exerciseId} fixed-output answer must be caught`,
    );

    const [[counts]] = await pool.query(
      `SELECT
         SUM(visibility='public') public_count,
         SUM(visibility='hidden') hidden_count
       FROM code_test_cases WHERE exercise_id=?`,
      [fixture.exerciseId],
    );

    summaries.push({
      exerciseId: fixture.exerciseId,
      subject: fixture.subject,
      knowledgePoint: fixture.knowledgePoint,
      language: "c",
      executionMode: reference.executionMode,
      publicTestCount: Number(counts.public_count || 0),
      hiddenTestCount: Number(counts.hidden_count || 0),
      boundaryCategoryCount: fixture.boundaryCategories.length,
      referenceStatus: reference.status,
      knownBugStatus: knownBug.status,
      fixedOutputStatus: fixedOutput.status,
    });
  }

  console.log(
    JSON.stringify(
      {
        passed: true,
        executionMode: "docker",
        image: process.env.CODE_RUNNER_IMAGE,
        trustedExerciseCount: summaries.length,
        summaries,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.code || "TRUSTED_CODE_CASE_VERIFY_FAILED");
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { main };
