/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

async function saveCodeSubmission({
  studentId,
  exerciseId,
  language,
  sourceCode,
  stdin,
  result,
  mode = "run",
  idempotencyKey = null,
  executionMode = "docker",
  assignmentId = null,
} = {}) {
  const normalizedResult = result || {};
  const publicResult = sanitizeResult(normalizedResult);
  const [insertResult] = await pool.query(
    `
      INSERT INTO code_submissions (
        student_id,
        exercise_id,
        language,
        source_code,
        stdin,
        stdout,
        stderr,
        compile_output,
        status,
        time_used,
        memory_used,
        mode,
        passed_count,
        total_count,
        result_json,
        idempotency_key,
        execution_mode,
        assignment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeStudentId(studentId),
      ensureText(exerciseId),
      ensureText(language || "c"),
      ensureText(sourceCode),
      ensureText(stdin),
      ensureText(publicResult.stdout),
      ensureText(publicResult.stderr),
      ensureText(publicResult.compileOutput),
      ensureText(publicResult.status),
      ensureText(publicResult.time),
      ensureText(publicResult.memory),
      normalizeMode(mode),
      Number(publicResult.passedCount || 0),
      Number(publicResult.totalCount || 0),
      JSON.stringify(publicResult),
      idempotencyKey ? normalizeIdempotencyKey(idempotencyKey) : null,
      ensureText(executionMode || publicResult.executionMode || "docker"),
      assignmentId ? positiveId(assignmentId, "assignmentId") : null,
    ],
  );

  return getSubmissionByIdForStudent(normalizeStudentId(studentId), insertResult.insertId);
}

async function getSubmissionByIdForStudent(studentId, submissionId) {
  const [rows] = await pool.query(`SELECT * FROM code_submissions WHERE id=? AND student_id=? LIMIT 1`, [
    positiveId(submissionId, "submissionId"),
    normalizeStudentId(studentId),
  ]);
  return rows[0] ? toPublicSubmission(rows[0]) : null;
}

async function listSubmissionsForStudent(studentId, { exerciseId, mode, limit = 50 } = {}) {
  const where = ["student_id=?"];
  const params = [normalizeStudentId(studentId)];
  if (exerciseId) {
    where.push("exercise_id=?");
    params.push(ensureText(exerciseId));
  }
  if (mode) {
    where.push("mode=?");
    params.push(normalizeMode(mode));
  }
  params.push(Math.max(1, Math.min(100, Number(limit) || 50)));
  const [rows] = await pool.query(
    `SELECT * FROM code_submissions WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`,
    params,
  );
  return rows.map(toPublicSubmission);
}

async function findSubmissionByIdempotency(studentId, idempotencyKey) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  const [rows] = await pool.query(
    `SELECT * FROM code_submissions WHERE student_id=? AND idempotency_key=? LIMIT 1`,
    [normalizeStudentId(studentId), key],
  );
  return rows[0] ? toPublicSubmission(rows[0]) : null;
}

function toPublicSubmission(row = {}) {
  const result = parseJson(row.result_json);
  return {
    id: Number(row.id),
    exerciseId: ensureText(row.exercise_id),
    language: ensureText(row.language),
    mode: normalizeMode(row.mode || "run"),
    status: ensureText(row.status),
    passedCount: Number(row.passed_count || 0),
    totalCount: Number(row.total_count || 0),
    executionMode: ensureText(row.execution_mode),
    result: sanitizeResult(result),
    createdAt: row.created_at,
  };
}

function sanitizeResult(result = {}) {
  const cases = Array.isArray(result.cases)
    ? result.cases.map((item) => {
        const visibility = item.visibility === "hidden" ? "hidden" : "public";
        const safe = {
          id: ensureText(item.id).slice(0, 80),
          visibility,
          status: ensureText(item.status).slice(0, 40),
          message: sanitizeText(item.message, 240),
          durationMs: Number.isFinite(Number(item.durationMs)) ? Number(item.durationMs) : 0,
        };
        if (visibility === "public") {
          safe.stdout = sanitizeText(item.stdout, 4096);
          safe.stderr = sanitizeText(item.stderr, 2048);
        }
        return safe;
      })
    : [];

  return {
    status: ensureText(result.status).slice(0, 40),
    stdout: sanitizeText(result.stdout, 8192),
    stderr: sanitizeText(result.stderr, 4096),
    compileOutput: sanitizeText(result.compileOutput, 4096),
    time: sanitizeText(result.time, 50),
    memory: sanitizeText(result.memory, 50),
    mode: normalizeMode(result.mode || "run"),
    executionMode: ensureText(result.executionMode || "docker").slice(0, 40),
    judgedBy: ["custom_input", "public_only", "public_and_hidden"].includes(result.judgedBy)
      ? result.judgedBy
      : "",
    passedCount: Number(result.passedCount || 0),
    totalCount: Number(result.totalCount || 0),
    cases,
  };
}

function normalizeIdempotencyKey(value) {
  const key = ensureText(value).trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    throw apiError("idempotencyKey 无效", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  return key;
}

function normalizeMode(value) {
  return value === "submit" ? "submit" : "run";
}

function normalizeStudentId(studentId) {
  const value = Number(studentId);
  if (!Number.isInteger(value) || value <= 0) throw apiError("studentId 无效", 400, "INVALID_STUDENT");
  return value;
}

function positiveId(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw apiError(`${name} 无效`, 400, "INVALID_ID");
  return number;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function sanitizeText(value, max) {
  return ensureText(value)
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[path]")
    .replace(/\/(?:work|tmp|runner)\/[^\s"'<>]*/g, "[path]")
    .replace(/\b[0-9a-f]{12,64}\b/gi, "[id]")
    .slice(0, max);
}

function ensureText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  findSubmissionByIdempotency,
  getSubmissionByIdForStudent,
  listSubmissionsForStudent,
  normalizeIdempotencyKey,
  saveCodeSubmission,
  sanitizeResult,
  toPublicSubmission,
};
