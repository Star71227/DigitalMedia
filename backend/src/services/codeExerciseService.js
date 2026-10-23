/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

async function listExercises({ subject, knowledgePoint, difficulty } = {}) {
  const where = ["exercise_id IS NOT NULL", "exercise_id <> ''", "COALESCE(is_published, 1) = 1"];
  const params = [];

  if (subject) {
    where.push("subject = ?");
    params.push(ensureText(subject));
  }

  if (knowledgePoint) {
    where.push("knowledge_point = ?");
    params.push(ensureText(knowledgePoint));
  }

  if (difficulty) {
    where.push("difficulty = ?");
    params.push(ensureText(difficulty));
  }

  const [rows] = await pool.query(
    `
      SELECT
        e.id,
        e.exercise_id,
        e.subject,
        e.knowledge_point,
        e.title,
        e.description,
        e.language,
        e.difficulty,
        e.starter_code,
        e.sample_input,
        e.sample_output,
        e.explanation,
        e.tags,
        e.source,
        e.is_published,
        e.created_at,
        e.updated_at,
        COALESCE(tc.has_public_tests, 0) AS submission_available,
        CASE
          WHEN p.exercise_id IS NOT NULL
            AND NULLIF(TRIM(p.reference_solution), '') IS NOT NULL
            AND COALESCE(tc.has_public_tests, 0) = 1
            AND COALESCE(tc.has_hidden_tests, 0) = 1
          THEN 1
          ELSE 0
        END AS hidden_judge_available,
        COALESCE(tc.has_public_tests, 0) AS public_run_available
      FROM code_exercises e
      LEFT JOIN code_exercise_private p ON p.exercise_id = e.exercise_id
      LEFT JOIN (
        SELECT
          exercise_id,
          MAX(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) AS has_public_tests,
          MAX(CASE WHEN visibility = 'hidden' THEN 1 ELSE 0 END) AS has_hidden_tests
        FROM code_test_cases
        GROUP BY exercise_id
      ) tc ON tc.exercise_id = e.exercise_id
      WHERE ${where.map((condition) => condition.replace(/\bexercise_id\b/g, "e.exercise_id")).join(" AND ")}
      ORDER BY e.exercise_id ASC
    `,
    params,
  );

  return rows.map(toCodeExercise);
}

async function getExerciseById(exerciseId) {
  const [rows] = await pool.query(
    `
      SELECT
        e.id,
        e.exercise_id,
        e.subject,
        e.knowledge_point,
        e.title,
        e.description,
        e.language,
        e.difficulty,
        e.starter_code,
        e.sample_input,
        e.sample_output,
        e.explanation,
        e.tags,
        e.source,
        e.is_published,
        e.created_at,
        e.updated_at,
        COALESCE(tc.has_public_tests, 0) AS submission_available,
        CASE
          WHEN p.exercise_id IS NOT NULL
            AND NULLIF(TRIM(p.reference_solution), '') IS NOT NULL
            AND COALESCE(tc.has_public_tests, 0) = 1
            AND COALESCE(tc.has_hidden_tests, 0) = 1
          THEN 1
          ELSE 0
        END AS hidden_judge_available,
        COALESCE(tc.has_public_tests, 0) AS public_run_available
      FROM code_exercises e
      LEFT JOIN code_exercise_private p ON p.exercise_id = e.exercise_id
      LEFT JOIN (
        SELECT
          exercise_id,
          MAX(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) AS has_public_tests,
          MAX(CASE WHEN visibility = 'hidden' THEN 1 ELSE 0 END) AS has_hidden_tests
        FROM code_test_cases
        GROUP BY exercise_id
      ) tc ON tc.exercise_id = e.exercise_id
      WHERE e.exercise_id = ?
      LIMIT 1
    `,
    [ensureText(exerciseId)],
  );

  return rows[0] ? toCodeExercise(rows[0]) : null;
}

async function getPublishedExerciseById(exerciseId) {
  const exercise = await getExerciseById(exerciseId);
  if (!exercise || exercise.is_published === false) return null;
  return exercise;
}

async function listExerciseTests(exerciseId, { includeHidden = false } = {}) {
  const visibility = includeHidden ? ["public", "hidden"] : ["public"];
  const placeholders = visibility.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT id,exercise_id,visibility,input_text,expected_output,order_index
       FROM code_test_cases
      WHERE exercise_id=? AND visibility IN (${placeholders})
      ORDER BY FIELD(visibility,'public','hidden'),order_index,id`,
    [ensureText(exerciseId), ...visibility],
  );
  return rows.map((row, index) => ({
    id: `${row.visibility}-${Number(row.order_index) || index + 1}`,
    exerciseId: ensureText(row.exercise_id),
    visibility: ensureText(row.visibility) === "hidden" ? "hidden" : "public",
    // 注意：测试用例的输入/期望输出必须原样保留（不能 trim），
    // 否则「只有空白字符」这类用例会被 trim 成空串，程序走到空输入回退分支而误判。
    input: rawText(row.input_text),
    expectedOutput: rawText(row.expected_output),
    orderIndex: Number(row.order_index) || index + 1,
  }));
}

async function getExercisePrivateConfig(exerciseId) {
  const [rows] = await pool.query(
    `SELECT exercise_id,language,reference_solution,judge_config_json,judge_verified,judge_verified_at,
            judge_fingerprint,judge_fingerprint_expires_at,judge_quality_json,execution_mode,
            runner_protocol,runner_image,validator_version
       FROM code_exercise_private
      WHERE exercise_id=? LIMIT 1`,
    [ensureText(exerciseId)],
  );
  if (!rows[0]) return null;
  return {
    exerciseId: ensureText(rows[0].exercise_id),
    language: ensureText(rows[0].language || "c"),
    referenceSolution: ensureText(rows[0].reference_solution),
    judgeConfig: parseJson(rows[0].judge_config_json),
    judgeVerified: Boolean(Number(rows[0].judge_verified || 0)),
    judgeVerifiedAt: rows[0].judge_verified_at,
    judgeFingerprint: ensureText(rows[0].judge_fingerprint),
    judgeFingerprintExpiresAt: rows[0].judge_fingerprint_expires_at,
    judgeQuality: parseJson(rows[0].judge_quality_json),
    executionMode: ensureText(rows[0].execution_mode),
    runnerProtocol: ensureText(rows[0].runner_protocol),
    runnerImage: ensureText(rows[0].runner_image),
    validatorVersion: ensureText(rows[0].validator_version),
  };
}

function toCodeExercise(row = {}) {
  return {
    id: row.id,
    exercise_id: ensureText(row.exercise_id),
    subject: ensureText(row.subject),
    knowledge_point: ensureText(row.knowledge_point),
    title: ensureText(row.title),
    description: ensureText(row.description),
    language: ensureText(row.language),
    difficulty: ensureText(row.difficulty),
    starter_code: ensureText(row.starter_code),
    sample_input: ensureText(row.sample_input),
    sample_output: ensureText(row.sample_output),
    explanation: ensureText(row.explanation),
    tags: parseTags(row.tags),
    source: ensureText(row.source),
    is_published: row.is_published === undefined ? true : Boolean(Number(row.is_published)),
    submission_available: Boolean(Number(row.submission_available || 0)),
    hidden_judge_available: Boolean(Number(row.hidden_judge_available || 0)),
    public_run_available: Boolean(Number(row.public_run_available || 0)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function normalizeStudentId(studentId) {
  const value = Number(studentId);
  if (!Number.isInteger(value) || value <= 0) throw new Error("studentId 无效");
  return value;
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

/** 与 ensureText 的区别：不做 trim，保留空白字符（判题用例输入/期望输出用）。 */
function rawText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

module.exports = {
  getExercisePrivateConfig,
  listExercises,
  listExerciseTests,
  getExerciseById,
  getPublishedExerciseById,
};
