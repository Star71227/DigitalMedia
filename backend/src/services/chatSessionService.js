/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

const DEFAULT_SESSION_TITLE = "新对话";
const SESSION_LIMIT_MAX = 50;
const MESSAGE_LIMIT_MAX = 100;
const HISTORY_LIMIT = 10;
const HISTORY_CHARACTER_LIMIT = 8000;
const SOURCE_MODES = new Set(["rag_model", "model_only", "deterministic_fallback", "clarification"]);

function createChatSessionService({ db = pool } = {}) {
  async function createSession(studentId) {
    const ownerId = positiveId(studentId, "studentId");
    const [result] = await db.query(
      "INSERT INTO chat_sessions (student_id, title, status) VALUES (?, ?, 'active')",
      [ownerId, DEFAULT_SESSION_TITLE],
    );
    return getSessionById(ownerId, result.insertId);
  }

  async function listSessions(studentId, options = {}) {
    const ownerId = positiveId(studentId, "studentId");
    const status = normalizeSessionStatus(options.status);
    const limit = boundedLimit(options.limit, 20, SESSION_LIMIT_MAX);
    const page = boundedPage(options.page);
    const offset = (page - 1) * limit;
    const [rows] = await db.query(
      `SELECT id, title, status, created_at, updated_at, last_message_at
       FROM chat_sessions
       WHERE student_id = ? AND status = ?
       ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
       LIMIT ? OFFSET ?`,
      [ownerId, status, limit + 1, offset],
    );
    const hasMore = rows.length > limit;
    return {
      sessions: rows.slice(0, limit).map(publicSession),
      pagination: { page, limit, hasMore },
    };
  }

  async function getSessionById(studentId, sessionId) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const [rows] = await db.query(
      `SELECT id, title, status, created_at, updated_at, last_message_at
       FROM chat_sessions WHERE id = ? AND student_id = ? LIMIT 1`,
      [id, ownerId],
    );
    if (!rows[0]) throw serviceError("CHAT_SESSION_NOT_FOUND", "聊天会话不存在", 404);
    return publicSession(rows[0]);
  }

  async function assertSessionOwnership(studentId, sessionId, options = {}) {
    const session = await getSessionById(studentId, sessionId);
    if (options.requireActive && session.status !== "active") {
      throw serviceError("CHAT_SESSION_ARCHIVED", "该聊天会话已归档，不能继续发送消息", 409);
    }
    return session;
  }

  async function renameSession(studentId, sessionId, title) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const normalizedTitle = normalizeTitle(title);
    await assertSessionOwnership(ownerId, id);
    await db.query("UPDATE chat_sessions SET title = ? WHERE id = ? AND student_id = ?", [
      normalizedTitle,
      id,
      ownerId,
    ]);
    return getSessionById(ownerId, id);
  }

  async function archiveSession(studentId, sessionId) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    await assertSessionOwnership(ownerId, id);
    await db.query("UPDATE chat_sessions SET status = 'archived' WHERE id = ? AND student_id = ?", [
      id,
      ownerId,
    ]);
    return getSessionById(ownerId, id);
  }

  async function listMessages(studentId, sessionId, options = {}) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const session = await assertSessionOwnership(ownerId, id);
    const limit = boundedLimit(options.limit, 50, MESSAGE_LIMIT_MAX);
    const beforeId = optionalPositiveId(options.beforeId, "beforeId");
    const params = [id, ownerId];
    const cursorClause = beforeId ? "AND id < ?" : "";
    if (beforeId) params.push(beforeId);
    params.push(limit + 1);
    const [rows] = await db.query(
      `SELECT id, public_message_id, role, content_text, answer_json, source_mode,
              subject, knowledge_point, status, error_code, created_at
       FROM chat_messages
       WHERE session_id = ? AND student_id = ? ${cursorClause}
       ORDER BY id DESC LIMIT ?`,
      params,
    );
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    return {
      session,
      messages: selected.reverse().map(publicMessage),
      pagination: {
        limit,
        hasMore,
        nextBeforeId: hasMore && selected.length ? Number(selected[0].id) : null,
      },
    };
  }

  async function buildSessionHistory(studentId, sessionId, options = {}) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const excludeMessageId = optionalPositiveId(options.excludeMessageId, "excludeMessageId");
    await assertSessionOwnership(ownerId, id);
    const params = [id, ownerId];
    const exclusion = excludeMessageId ? "AND id <> ?" : "";
    if (excludeMessageId) params.push(excludeMessageId);
    params.push(Math.max(HISTORY_LIMIT * 3, 30));
    const [rows] = await db.query(
      `SELECT id, role, content_text, subject, knowledge_point, created_at
       FROM chat_messages
       WHERE session_id = ? AND student_id = ? AND status = 'completed'
         AND role IN ('user', 'assistant') ${exclusion}
       ORDER BY id DESC LIMIT ?`,
      params,
    );
    return trimHistoryRows(rows, {
      limit: Math.min(HISTORY_LIMIT, boundedLimit(options.limit, HISTORY_LIMIT, HISTORY_LIMIT)),
      maxCharacters: HISTORY_CHARACTER_LIMIT,
    });
  }

  async function saveUserMessage(studentId, sessionId, message) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const content = cleanRequiredText(message, 4000, "聊天消息不能为空");
    const [result] = await db.query(
      `INSERT INTO chat_messages (session_id, student_id, role, content_text, status)
       SELECT id, student_id, 'user', ?, 'completed'
       FROM chat_sessions
       WHERE id = ? AND student_id = ? AND status = 'active'`,
      [content, id, ownerId],
    );
    if (!result.affectedRows) {
      await assertSessionOwnership(ownerId, id, { requireActive: true });
      throw serviceError("CHAT_MESSAGE_SAVE_FAILED", "聊天消息保存失败", 500);
    }
    await db.query(
      `UPDATE chat_sessions
       SET title = CASE WHEN title = ? THEN ? ELSE title END,
           last_message_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND student_id = ? AND status = 'active'`,
      [DEFAULT_SESSION_TITLE, buildAutomaticTitle(content), id, ownerId],
    );
    return getMessageById(ownerId, id, result.insertId);
  }

  async function saveAssistantMessage(studentId, sessionId, answer) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const publicAnswer = sanitizePublicAnswer(answer);
    const messageId = normalizePublicMessageId(answer?.messageId);
    const [result] = await db.query(
      `INSERT INTO chat_messages
         (session_id, student_id, public_message_id, role, content_text, answer_json,
          source_mode, subject, knowledge_point, status)
       SELECT id, student_id, ?, 'assistant', ?, ?, ?, ?, ?, 'completed'
       FROM chat_sessions WHERE id = ? AND student_id = ?`,
      [
        messageId,
        publicAnswer.answerMarkdown,
        JSON.stringify(publicAnswer),
        publicAnswer.sourceMode || null,
        publicAnswer.subject || null,
        publicAnswer.knowledgePoint || null,
        id,
        ownerId,
      ],
    );
    if (!result.affectedRows) throw serviceError("CHAT_SESSION_NOT_FOUND", "聊天会话不存在", 404);
    await updateSessionActivity(ownerId, id);
    return getMessageById(ownerId, id, result.insertId);
  }

  async function saveFailedAssistantMessage(studentId, sessionId, input = {}) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const errorCode = normalizeErrorCode(input.errorCode);
    const [result] = await db.query(
      `INSERT INTO chat_messages
         (session_id, student_id, role, content_text, status, error_code)
       SELECT id, student_id, 'assistant', ?, 'failed', ?
       FROM chat_sessions WHERE id = ? AND student_id = ?`,
      ["当前回答生成失败，请稍后重试。", errorCode, id, ownerId],
    );
    if (!result.affectedRows) throw serviceError("CHAT_SESSION_NOT_FOUND", "聊天会话不存在", 404);
    await updateSessionActivity(ownerId, id);
    return getMessageById(ownerId, id, result.insertId);
  }

  async function updateSessionActivity(studentId, sessionId) {
    const ownerId = positiveId(studentId, "studentId");
    const id = positiveId(sessionId, "sessionId");
    const [result] = await db.query(
      `UPDATE chat_sessions SET last_message_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND student_id = ?`,
      [id, ownerId],
    );
    if (!result.affectedRows) throw serviceError("CHAT_SESSION_NOT_FOUND", "聊天会话不存在", 404);
  }

  async function getMessageById(studentId, sessionId, messageId) {
    const [rows] = await db.query(
      `SELECT id, public_message_id, role, content_text, answer_json, source_mode,
              subject, knowledge_point, status, error_code, created_at
       FROM chat_messages
       WHERE id = ? AND session_id = ? AND student_id = ? LIMIT 1`,
      [
        positiveId(messageId, "messageId"),
        positiveId(sessionId, "sessionId"),
        positiveId(studentId, "studentId"),
      ],
    );
    if (!rows[0]) throw serviceError("CHAT_MESSAGE_NOT_FOUND", "聊天消息不存在", 404);
    return publicMessage(rows[0]);
  }

  return {
    createSession,
    listSessions,
    getSessionById,
    assertSessionOwnership,
    renameSession,
    archiveSession,
    listMessages,
    buildSessionHistory,
    saveUserMessage,
    saveAssistantMessage,
    saveFailedAssistantMessage,
    updateSessionActivity,
  };
}

function publicSession(row) {
  return {
    id: Number(row.id),
    title: String(row.title || DEFAULT_SESSION_TITLE),
    status: row.status === "archived" ? "archived" : "active",
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
    lastMessageAt: isoDate(row.last_message_at),
  };
}

function publicMessage(row) {
  const message = {
    id: Number(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: redactSensitiveText(row.content_text),
    status: row.status === "failed" ? "failed" : "completed",
    createdAt: isoDate(row.created_at),
  };
  if (row.public_message_id) message.messageId = String(row.public_message_id);
  if (message.role === "assistant" && message.status === "completed") {
    message.answer = sanitizePublicAnswer(parseJsonObject(row.answer_json));
  }
  if (message.status === "failed") message.errorCode = normalizeErrorCode(row.error_code);
  return message;
}

function sanitizePublicAnswer(value = {}) {
  const answer = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceMode = SOURCE_MODES.has(String(answer.sourceMode)) ? String(answer.sourceMode) : "";
  return {
    answerMarkdown: safeString(answer.answerMarkdown, 50000),
    sourceMode,
    subject: safeString(answer.subject, 120),
    knowledgePoint: safeString(answer.knowledgePoint, 180),
    knowledgeNotice: safeString(answer.knowledgeNotice, 500),
    citations: sanitizeCitations(answer.citations),
    codeBlocks: sanitizeCodeBlocks(answer.codeBlocks),
    followups: sanitizeStringArray(answer.followups, 4, 500),
    profileSuggestions: sanitizeProfileSuggestions(answer.profileSuggestions),
    trace: sanitizeTrace(answer.trace),
    quality: sanitizeQuality(answer.quality),
    modelAvailable: Boolean(answer.modelAvailable),
  };
}

function sanitizeCitations(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => ({
    label: safeString(item?.label, 30),
    chunkId: finiteNumber(item?.chunkId),
    sourceKey: safeString(item?.sourceKey, 180),
    sourceTitle: safeString(item?.sourceTitle, 255),
    chapter: safeString(item?.chapter, 255),
    section: safeString(item?.section, 255),
    license: safeString(item?.license, 100),
    version: safeString(item?.version, 60),
    excerpt: safeString(item?.excerpt, 500),
    supportScore: finiteNumber(item?.supportScore),
  }));
}

function sanitizeCodeBlocks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .map((item) => ({
      language: safeString(item?.language, 30),
      code: safeString(item?.code, 20000),
    }))
    .filter((item) => item.code);
}

function sanitizeProfileSuggestions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 4)
    .map((item) => ({
      dimension: safeString(item?.dimension, 80),
      suggestedValue: sanitizeStringArray(item?.suggestedValue, 8, 120),
      evidence: safeString(item?.evidence, 1000),
      reason: safeString(item?.reason, 300),
    }))
    .filter((item) => item.dimension);
}

function sanitizeTrace(value) {
  const trace = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    collapsed: true,
    summary: safeString(trace.summary, 500),
    steps: Array.isArray(trace.steps)
      ? trace.steps
          .slice(0, 20)
          .map((step) => ({
            name: safeString(step?.name, 80),
            status: safeString(step?.status, 40),
            detail: safeString(step?.detail, 300),
          }))
          .filter((step) => step.name)
      : [],
  };
}

function sanitizeQuality(value) {
  const quality = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    passed: Boolean(quality.passed),
    characterCount: nonNegativeNumber(quality.characterCount),
    sectionCount: nonNegativeNumber(quality.sectionCount),
    codeBlockCount: nonNegativeNumber(quality.codeBlockCount),
    exampleCount: nonNegativeNumber(quality.exampleCount),
    misconceptionCount: nonNegativeNumber(quality.misconceptionCount),
    practiceCount: nonNegativeNumber(quality.practiceCount),
    placeholderMatches: nonNegativeNumber(quality.placeholderMatches),
    repeatedContentRatio: nonNegativeNumber(quality.repeatedContentRatio),
    issues: Array.isArray(quality.issues)
      ? quality.issues
          .slice(0, 20)
          .map((item) => ({
            code: safeString(item?.code, 80),
            message: safeString(item?.message, 300),
          }))
          .filter((item) => item.code || item.message)
      : [],
  };
}

function trimHistoryRows(rows, options = {}) {
  const limit = Math.max(1, Math.min(HISTORY_LIMIT, Number(options.limit) || HISTORY_LIMIT));
  const maxCharacters = Math.max(
    1,
    Math.min(HISTORY_CHARACTER_LIMIT, Number(options.maxCharacters) || HISTORY_CHARACTER_LIMIT),
  );
  const selected = [];
  let used = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (selected.length >= limit || used >= maxCharacters) break;
    const role = row?.role === "assistant" ? "assistant" : row?.role === "user" ? "user" : "";
    if (!role) continue;
    const content = redactSensitiveText(row.content_text).trim();
    if (!content) continue;
    const remaining = maxCharacters - used;
    const bounded = Array.from(content).slice(0, remaining).join("");
    if (!bounded) break;
    const item = { role, content: bounded };
    if (role === "assistant") {
      const subject = safeString(row.subject, 120);
      const knowledgePoint = safeString(row.knowledge_point, 180);
      if (subject) item.subject = subject;
      if (knowledgePoint) item.knowledgePoint = knowledgePoint;
    }
    selected.push(item);
    used += Array.from(bounded).length;
  }
  return selected.reverse();
}

function buildAutomaticTitle(message) {
  const clean = String(message || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(clean).slice(0, 36).join("") || DEFAULT_SESSION_TITLE;
}

function normalizeTitle(value) {
  const raw = String(value ?? "");
  if (/[<>]/.test(raw)) throw serviceError("INVALID_CHAT_TITLE", "标题不能包含 HTML", 400);
  const title = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const length = Array.from(title).length;
  if (length < 1 || length > 60)
    throw serviceError("INVALID_CHAT_TITLE", "标题长度必须为 1 至 60 个字符", 400);
  return title;
}

function redactSensitiveText(value) {
  let text = String(value ?? "");
  for (const secret of sensitiveEnvironmentValues()) {
    text = text.replace(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]");
  }
  return text
    .replace(/Authorization\s*:\s*Bearer\s+[^\s]+/gi, "Authorization: [REDACTED]")
    .replace(
      /(?:SPARK_API_KEY|SPARK_API_SECRET|API_KEY|API_SECRET|DB_PASSWORD|JWT_SECRET)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]",
    )
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/gi, "[REDACTED]")
    .replace(
      /^.*(?:system\s+prompt|系统提示词|hidden\s+reasoning|隐藏推理)\s*[:：=].*$/gim,
      "[敏感内容已移除]",
    )
    .replace(/\b[A-Za-z]:\\[^\r\n]+/g, "[本机路径已隐藏]");
}

function sensitiveEnvironmentValues() {
  return [
    process.env.SPARK_API_KEY,
    process.env.SPARK_API_SECRET,
    process.env.API_KEY,
    process.env.API_SECRET,
    process.env.DB_PASSWORD,
    process.env.JWT_SECRET,
  ]
    .map((item) => String(item || ""))
    .filter((item) => item.length >= 8);
}

function normalizeSessionStatus(value) {
  const status = String(value || "active").toLowerCase();
  if (!["active", "archived"].includes(status)) {
    throw serviceError("INVALID_CHAT_SESSION_STATUS", "无效的会话状态", 400);
  }
  return status;
}

function normalizePublicMessageId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{1,64}$/.test(id) ? id : null;
}

function normalizeErrorCode(value) {
  const code = String(value || "CHAT_GENERATION_FAILED")
    .trim()
    .toUpperCase();
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : "CHAT_GENERATION_FAILED";
}

function cleanRequiredText(value, maxLength, message) {
  const text = String(value ?? "").trim();
  if (!text) throw serviceError("INVALID_CHAT_MESSAGE", message, 400);
  return Array.from(text).slice(0, maxLength).join("");
}

function safeString(value, maxLength) {
  return Array.from(redactSensitiveText(value).trim()).slice(0, maxLength).join("");
}

function sanitizeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => safeString(item, maxLength))
    .filter(Boolean);
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value) && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function boundedLimit(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(maximum, number);
}

function boundedPage(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, 100000) : 1;
}

function positiveId(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw serviceError("INVALID_CHAT_SESSION_ID", `${name} 必须是正整数`, 400);
  }
  return number;
}

function optionalPositiveId(value, name) {
  if (value === undefined || value === null || value === "") return null;
  return positiveId(value, name);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function isoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serviceError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

const chatSessionService = createChatSessionService();

module.exports = {
  ...chatSessionService,
  createChatSessionService,
  sanitizePublicAnswer,
  trimHistoryRows,
  buildAutomaticTitle,
  normalizeTitle,
  redactSensitiveText,
  DEFAULT_SESSION_TITLE,
  SESSION_LIMIT_MAX,
  MESSAGE_LIMIT_MAX,
  HISTORY_LIMIT,
  HISTORY_CHARACTER_LIMIT,
};
