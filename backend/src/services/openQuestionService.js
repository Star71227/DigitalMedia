/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { normalizeSubject, normalizeDifficulty } = require("./questionBankService");

async function listOpenQuestions({ subject, knowledgePoint, difficulty, limit } = {}) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedSubject = subject ? normalizeSubject(subject) : "";
  const normalizedKnowledgePoint = ensureText(knowledgePoint);
  const normalizedDifficulty = difficulty ? normalizeDifficulty(difficulty) : "";

  try {
    let rows = await queryOpenQuestions({
      subject: normalizedSubject,
      knowledgePoint: normalizedKnowledgePoint,
      difficulty: normalizedDifficulty,
      limit: normalizedLimit,
    });

    if (normalizedKnowledgePoint && rows.length === 0) {
      rows = await queryOpenQuestions({
        subject: normalizedSubject,
        difficulty: normalizedDifficulty,
        limit: normalizedLimit,
      });
    }

    return rows.map(normalizeOpenQuestionRow);
  } catch (error) {
    console.warn(`open_question_bank 查询失败，已使用空上下文：${error.message}`);
    return [];
  }
}

async function getOpenQuestionContext({ subject, knowledgePoint, limit } = {}) {
  const questions = await listOpenQuestions({
    subject,
    knowledgePoint,
    limit: limit || 5,
  });

  return questions.map((question) => ({
    question_id: question.question_id,
    subject: question.subject,
    knowledge_point: question.knowledge_point,
    difficulty: question.difficulty,
    prompt: question.prompt,
    followups: question.followups,
    checkpoints: question.checkpoints,
  }));
}

async function queryOpenQuestions({ subject, knowledgePoint, difficulty, limit }) {
  const where = [];
  const params = [];
  const orderParams = [];
  let orderBy = "id ASC";

  if (subject) {
    where.push("subject = ?");
    params.push(subject);
  }

  if (knowledgePoint) {
    where.push("(knowledge_point = ? OR chapter = ? OR knowledge_point LIKE ? OR chapter LIKE ?)");
    params.push(knowledgePoint, knowledgePoint, `%${knowledgePoint}%`, `%${knowledgePoint}%`);

    orderBy = [
      "CASE",
      "WHEN knowledge_point = ? THEN 0",
      "WHEN chapter = ? THEN 1",
      "WHEN knowledge_point LIKE ? THEN 2",
      "WHEN chapter LIKE ? THEN 3",
      "ELSE 4",
      "END, id ASC",
    ].join(" ");
    orderParams.push(knowledgePoint, knowledgePoint, `%${knowledgePoint}%`, `%${knowledgePoint}%`);
  }

  if (difficulty) {
    where.push("difficulty = ?");
    params.push(difficulty);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
      SELECT
        question_id,
        subject,
        chapter,
        knowledge_point,
        difficulty,
        prompt,
        followups,
        checkpoints,
        source
      FROM open_question_bank
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ?
    `,
    [...params, ...orderParams, limit],
  );

  return rows;
}

function normalizeOpenQuestionRow(row) {
  return {
    question_id: row.question_id,
    subject: row.subject,
    chapter: row.chapter || "",
    knowledge_point: row.knowledge_point || "",
    difficulty: row.difficulty || "",
    prompt: row.prompt || "",
    followups: normalizeJsonArray(row.followups),
    checkpoints: normalizeJsonArray(row.checkpoints),
    source: row.source || "interview_grill_adapted",
  };
}

function toPublicOpenQuestion(row) {
  return {
    question_id: row.question_id,
    subject: row.subject,
    chapter: row.chapter,
    knowledge_point: row.knowledge_point,
    difficulty: row.difficulty,
    prompt: row.prompt,
    followups: normalizeJsonArray(row.followups),
    checkpoints: normalizeJsonArray(row.checkpoints),
  };
}

function normalizeJsonArray(value) {
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

function normalizeLimit(limit) {
  const value = Number(limit || 5);
  if (!Number.isFinite(value) || value <= 0) {
    return 5;
  }

  return Math.min(Math.floor(value), 50);
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

module.exports = {
  listOpenQuestions,
  getOpenQuestionContext,
  normalizeJsonArray,
  toPublicOpenQuestion,
};
