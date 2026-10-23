/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

const VALID_WRONG_QUESTION_STATUSES = ["待复习", "已掌握"];

async function recordWrongQuestion({ studentId, question, selectedAnswer, feedback = {} }) {
  if (!question || !question.question_id) {
    const error = new Error("question.question_id is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedFeedback = normalizeFeedback(feedback);
  const params = [
    normalizeStudentId(studentId),
    ensureText(question.question_id),
    ensureText(question.subject),
    ensureText(question.knowledge_point),
    ensureText(question.difficulty),
    ensureText(question.stem || question.question_text || question.question),
    normalizeAnswer(selectedAnswer),
    normalizeAnswer(question.answer || question.correct_answer),
    ensureText(question.analysis),
    normalizedFeedback.error_reason,
    normalizedFeedback.feedback_suggestion,
    normalizedFeedback.recommended_action,
  ];

  await pool.query(
    `
      INSERT INTO wrong_questions (
        student_id,
        question_id,
        subject,
        knowledge_point,
        difficulty,
        question_text,
        selected_answer,
        correct_answer,
        analysis,
        error_reason,
        feedback_suggestion,
        recommended_action,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待复习')
      ON DUPLICATE KEY UPDATE
        subject = VALUES(subject),
        knowledge_point = VALUES(knowledge_point),
        difficulty = VALUES(difficulty),
        question_text = VALUES(question_text),
        selected_answer = VALUES(selected_answer),
        correct_answer = VALUES(correct_answer),
        analysis = VALUES(analysis),
        error_reason = VALUES(error_reason),
        feedback_suggestion = VALUES(feedback_suggestion),
        recommended_action = VALUES(recommended_action),
        status = '待复习',
        updated_at = CURRENT_TIMESTAMP
    `,
    params,
  );

  return { recorded: true };
}

async function listWrongQuestions({ studentId, status, subject } = {}) {
  const where = ["student_id = ?", "question_id IS NOT NULL"];
  const params = [normalizeStudentId(studentId)];

  if (status) {
    assertValidStatus(status);
    where.push("status = ?");
    params.push(status);
  }

  if (subject) {
    where.push("subject = ?");
    params.push(ensureText(subject));
  }

  const [rows] = await pool.query(
    `
      SELECT
        id,
        question_id,
        subject,
        knowledge_point,
        difficulty,
        question_text,
        selected_answer,
        correct_answer,
        analysis,
        error_reason,
        feedback_suggestion,
        recommended_action,
        status,
        updated_at
      FROM wrong_questions
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC, id DESC
    `,
    params,
  );

  return rows;
}

async function updateWrongQuestionStatus({ studentId, id, status }) {
  assertValidStatus(status);

  const [result] = await pool.query(
    `
      UPDATE wrong_questions
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ? AND id = ?
    `,
    [status, normalizeStudentId(studentId), Number(id)],
  );

  return result.affectedRows > 0;
}

function assertValidStatus(status) {
  if (!VALID_WRONG_QUESTION_STATUSES.includes(status)) {
    const error = new Error("错题状态只能是待复习或已掌握");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeStudentId(studentId) {
  const value = Number(studentId);
  if (!Number.isInteger(value) || value <= 0) throw new Error("studentId 无效");
  return value;
}

function normalizeAnswer(answer) {
  return ensureText(answer).toUpperCase();
}

function normalizeFeedback(feedback) {
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return {
      error_reason: "",
      feedback_suggestion: "",
      recommended_action: "",
    };
  }

  return {
    error_reason: ensureText(feedback.error_reason),
    feedback_suggestion: ensureText(feedback.feedback_suggestion),
    recommended_action: ensureText(feedback.recommended_action),
  };
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

module.exports = {
  VALID_WRONG_QUESTION_STATUSES,
  recordWrongQuestion,
  listWrongQuestions,
  updateWrongQuestionStatus,
};
