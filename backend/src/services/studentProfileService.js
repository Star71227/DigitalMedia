/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const {
  DIALOGUE_FIELDS,
  emptyProfileDraft,
  normalizeDraft,
  getMissingFields,
  calculateCompleteness,
  mergeDraft,
  cleanText,
} = require("./profileSchema");
const { analyzeProfileDialogue, nextQuestion } = require("./agents/profileDialogueAgent");

async function getCompleteProfile(studentId, executor = pool) {
  assertStudentId(studentId);
  const [[profileRows], [masteryRows], [errorRows], [versionRows]] = await Promise.all([
    executor.query("SELECT * FROM student_profiles WHERE student_id = ? LIMIT 1", [studentId]),
    executor.query(
      `SELECT subject, knowledge_point, mastery, wrong_count, practice_count, last_updated
         FROM student_knowledge_mastery WHERE student_id = ? AND subject <> '' AND knowledge_point <> ''
        ORDER BY subject, mastery ASC`,
      [studentId],
    ),
    executor.query(
      `SELECT subject, knowledge_point, error_type, occurrence_count, confidence,
              latest_evidence_json, last_seen_at
         FROM student_error_patterns WHERE student_id = ?
        ORDER BY last_seen_at DESC`,
      [studentId],
    ),
    executor.query(
      `SELECT version, change_reason, evidence_json, source_type, created_at
         FROM student_profile_versions WHERE student_id = ?
        ORDER BY version DESC LIMIT 1`,
      [studentId],
    ),
  ]);

  const row = profileRows[0];
  const draft = row ? rowToDraft(row) : emptyProfileDraft();
  const fieldMeta = parseObject(row?.field_meta_json);
  const latest = versionRows[0] || null;
  return {
    profile: {
      ...draft,
      knowledgeMastery: masteryRows.map((item) => ({
        subject: item.subject,
        knowledgePoint: item.knowledge_point,
        mastery: Number(item.mastery),
        wrongCount: Number(item.wrong_count),
        practiceCount: Number(item.practice_count),
        updatedAt: item.last_updated,
      })),
      errorPatterns: errorRows.map((item) => ({
        subject: item.subject,
        knowledgePoint: item.knowledge_point,
        errorType: item.error_type,
        occurrenceCount: Number(item.occurrence_count),
        confidence: Number(item.confidence),
        evidence: parseObject(item.latest_evidence_json),
        updatedAt: item.last_seen_at,
      })),
    },
    completeness: row ? Number(row.profile_completeness) : 0,
    version: row ? Number(row.current_version) : 0,
    updatedAt: row?.updated_at || null,
    confirmedAt: row?.confirmed_at || null,
    fieldMeta,
    evidenceSummary: buildEvidenceSummary(fieldMeta, masteryRows, errorRows),
    latestChange: latest
      ? {
          version: Number(latest.version),
          reason: latest.change_reason,
          sourceType: latest.source_type,
          evidence: parseObject(latest.evidence_json),
          createdAt: latest.created_at,
        }
      : null,
  };
}

async function startDialogue(studentId) {
  const [activeRows] = await pool.query(
    `SELECT * FROM profile_dialogue_sessions
      WHERE student_id = ? AND status IN ('collecting','ready_for_confirmation')
      ORDER BY id DESC LIMIT 1`,
    [studentId],
  );
  let session = activeRows[0];
  if (!session) {
    const current = await getCompleteProfile(studentId);
    const draft = normalizeDraft(current.profile);
    const [result] = await pool.query(
      `INSERT INTO profile_dialogue_sessions
         (student_id, status, round_count, draft_profile_json, field_meta_json)
       VALUES (?, 'collecting', 0, ?, ?)`,
      [studentId, JSON.stringify(draft), JSON.stringify(current.fieldMeta || {})],
    );
    const missing = getMissingFields(draft);
    const assistantMessage = nextQuestion(missing[0]);
    await pool.query(
      `INSERT INTO profile_dialogue_messages (session_id, role, content, extracted_fields_json)
       VALUES (?, 'assistant', ?, NULL)`,
      [result.insertId, assistantMessage],
    );
    session = {
      id: result.insertId,
      status: "collecting",
      round_count: 0,
      draft_profile_json: draft,
      field_meta_json: current.fieldMeta || {},
    };
  }
  const draft = normalizeDraft(parseObject(session.draft_profile_json));
  const missingFields = getMissingFields(draft);
  const [messages] = await pool.query(
    `SELECT role, content, created_at FROM profile_dialogue_messages WHERE session_id = ? ORDER BY id`,
    [session.id],
  );
  return {
    sessionId: String(session.id),
    status: session.status,
    assistantMessage:
      messages.filter((item) => item.role === "assistant").at(-1)?.content || nextQuestion(missingFields[0]),
    progress: calculateCompleteness(draft),
    missingFields,
    currentDraft: draft,
    fieldMeta: parseObject(session.field_meta_json),
    messages,
  };
}

async function sendDialogueMessage(studentId, sessionId, message) {
  const normalizedMessage = cleanText(message, 1000);
  if (!normalizedMessage) throw badRequest("message 不能为空");
  const [sessions] = await pool.query(
    "SELECT * FROM profile_dialogue_sessions WHERE id = ? AND student_id = ? LIMIT 1",
    [Number(sessionId), studentId],
  );
  const session = sessions[0];
  if (!session) throw notFound("画像对话会话不存在");
  if (session.status === "completed") throw badRequest("画像对话已经完成");
  if (Number(session.round_count) >= 6) throw badRequest("本次画像对话已达到轮数上限，请确认画像");

  await pool.query(
    `INSERT INTO profile_dialogue_messages (session_id, role, content, extracted_fields_json)
     VALUES (?, 'user', ?, NULL)`,
    [session.id, normalizedMessage],
  );
  const [history] = await pool.query(
    "SELECT role, content FROM profile_dialogue_messages WHERE session_id = ? ORDER BY id",
    [session.id],
  );
  const currentDraft = normalizeDraft(parseObject(session.draft_profile_json));
  const currentMeta = parseObject(session.field_meta_json);
  const result = await analyzeProfileDialogue({
    currentDraft,
    fieldMeta: currentMeta,
    history,
    message: normalizedMessage,
    roundCount: Number(session.round_count),
  });
  const patchValues = Object.fromEntries(
    Object.entries(result.profilePatch).map(([field, descriptor]) => [field, descriptor.value]),
  );
  const nextDraft = mergeDraft(currentDraft, patchValues);
  const nextMeta = { ...currentMeta };
  for (const [field, descriptor] of Object.entries(result.profilePatch)) {
    const previousConfidence = Number(nextMeta[field]?.confidence || 0);
    if (descriptor.confidence >= previousConfidence) {
      nextMeta[field] = {
        confidence: descriptor.confidence,
        evidence: descriptor.evidence,
        source: "student_dialogue",
      };
    }
  }

  await pool.query(
    `UPDATE profile_dialogue_sessions
        SET status = ?, round_count = round_count + 1, draft_profile_json = ?, field_meta_json = ?
      WHERE id = ? AND student_id = ?`,
    [result.status, JSON.stringify(nextDraft), JSON.stringify(nextMeta), session.id, studentId],
  );
  await pool.query(
    `INSERT INTO profile_dialogue_messages (session_id, role, content, extracted_fields_json)
     VALUES (?, 'assistant', ?, ?)`,
    [session.id, result.assistantMessage, JSON.stringify(result.profilePatch)],
  );

  return { ...result, sessionId: String(session.id), currentDraft: nextDraft, fieldMeta: nextMeta };
}

async function confirmDialogue(studentId, sessionId, confirmedProfile) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessions] = await connection.query(
      "SELECT * FROM profile_dialogue_sessions WHERE id = ? AND student_id = ? FOR UPDATE",
      [Number(sessionId), studentId],
    );
    const session = sessions[0];
    if (!session) throw notFound("画像对话会话不存在");
    if (session.status === "completed") throw badRequest("画像已经确认");
    const submitted = confirmedProfile || parseObject(session.draft_profile_json);
    const unknownFields = Object.keys(submitted || {}).filter((field) => !DIALOGUE_FIELDS.includes(field));
    if (unknownFields.length) throw badRequest(`画像包含未知字段：${unknownFields.join(", ")}`);
    const draft = normalizeDraft(submitted);
    const meta = parseObject(session.field_meta_json);
    const version = await saveProfileAndVersion(connection, studentId, draft, meta, {
      reason: "学生确认对话式学习画像",
      sourceType: "dialogue_confirmation",
      evidence: meta,
    });
    await connection.query(
      `UPDATE profile_dialogue_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [session.id],
    );
    await connection.query(
      `INSERT INTO student_learning_events (student_id, event_type, payload_json)
       VALUES (?, 'profile_confirmed', ?)`,
      [studentId, JSON.stringify({ version, sessionId: session.id })],
    );
    await connection.commit();
    return await getCompleteProfile(studentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function patchProfile(studentId, patch) {
  const unknown = Object.keys(patch || {}).filter((field) => !DIALOGUE_FIELDS.includes(field));
  if (unknown.length) throw badRequest(`不允许修改字段：${unknown.join(", ")}`);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const current = await getCompleteProfile(studentId, connection);
    const next = mergeDraft(current.profile, patch);
    const meta = { ...current.fieldMeta };
    for (const field of Object.keys(patch || {})) {
      meta[field] = { confidence: 1, evidence: "学生主动修改并确认", source: "student_edit" };
    }
    await saveProfileAndVersion(connection, studentId, next, meta, {
      reason: "学生主动修改画像偏好",
      sourceType: "student_edit",
      evidence: { fields: Object.keys(patch || {}) },
    });
    await connection.commit();
    return await getCompleteProfile(studentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listProfileHistory(studentId) {
  const [rows] = await pool.query(
    `SELECT version, snapshot_json, change_reason, evidence_json, source_type, created_at
       FROM student_profile_versions WHERE student_id = ? ORDER BY version DESC LIMIT 30`,
    [studentId],
  );
  return rows.map((row) => ({
    version: Number(row.version),
    snapshot: parseObject(row.snapshot_json),
    reason: row.change_reason,
    evidence: parseObject(row.evidence_json),
    sourceType: row.source_type,
    createdAt: row.created_at,
  }));
}

async function listLearningEvents(studentId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 10));
  const [rows] = await pool.query(
    `SELECT event_type, subject, knowledge_point, payload_json, created_at
       FROM student_learning_events WHERE student_id = ? ORDER BY id DESC LIMIT ?`,
    [studentId, safeLimit],
  );
  return rows.map((row) => {
    const payload = parseObject(row.payload_json);
    const type =
      row.event_type === "quiz_submitted"
        ? "test"
        : row.event_type === "profile_confirmed"
          ? "profile"
          : "activity";
    const text =
      row.event_type === "quiz_submitted"
        ? `完成${row.subject || "课程"}测验，得分 ${payload.score ?? "--"}，画像已根据真实作答更新`
        : row.event_type === "profile_confirmed"
          ? `确认学习画像 V${payload.version || ""}`
          : row.event_type;
    return { type, text, time: row.created_at, eventType: row.event_type };
  });
}

async function saveProfileAndVersion(connection, studentId, draft, fieldMeta, change) {
  const normalized = normalizeDraft(draft);
  const [rows] = await connection.query(
    "SELECT current_version FROM student_profiles WHERE student_id = ? FOR UPDATE",
    [studentId],
  );
  const nextVersion = Number(rows[0]?.current_version || 0) + 1;
  await connection.query(
    `INSERT INTO student_profiles (
       student_id, major, grade, current_course, prior_knowledge_json, learning_goals_json,
       explanation_preference, resource_preferences_json, pace_preference,
       weekly_time_budget_minutes, field_meta_json, profile_completeness,
       current_version, confirmed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       major=VALUES(major), grade=VALUES(grade), current_course=VALUES(current_course),
       prior_knowledge_json=VALUES(prior_knowledge_json), learning_goals_json=VALUES(learning_goals_json),
       explanation_preference=VALUES(explanation_preference), resource_preferences_json=VALUES(resource_preferences_json),
       pace_preference=VALUES(pace_preference), weekly_time_budget_minutes=VALUES(weekly_time_budget_minutes),
       field_meta_json=VALUES(field_meta_json), profile_completeness=VALUES(profile_completeness),
       current_version=VALUES(current_version), confirmed_at=COALESCE(confirmed_at, CURRENT_TIMESTAMP)`,
    [
      studentId,
      normalized.majorAndGrade.major || null,
      normalized.majorAndGrade.grade || null,
      normalized.currentCourse || null,
      JSON.stringify(normalized.priorKnowledge),
      JSON.stringify(normalized.learningGoals),
      normalized.explanationPreference || null,
      JSON.stringify(normalized.resourcePreferences),
      normalized.paceAndTimeBudget.pacePreference || null,
      normalized.paceAndTimeBudget.weeklyTimeBudgetMinutes,
      JSON.stringify(fieldMeta || {}),
      calculateCompleteness(normalized),
      nextVersion,
    ],
  );
  const snapshot = await getCompleteProfile(studentId, connection);
  snapshot.profile = { ...snapshot.profile, ...normalized };
  snapshot.version = nextVersion;
  await connection.query(
    `INSERT INTO student_profile_versions
       (student_id, version, snapshot_json, change_reason, evidence_json, source_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      studentId,
      nextVersion,
      JSON.stringify(snapshot.profile),
      change.reason,
      JSON.stringify(change.evidence || {}),
      change.sourceType,
    ],
  );
  return nextVersion;
}

function rowToDraft(row) {
  return normalizeDraft({
    majorAndGrade: { major: row.major, grade: row.grade },
    currentCourse: row.current_course,
    priorKnowledge: parseArray(row.prior_knowledge_json),
    learningGoals: parseArray(row.learning_goals_json),
    explanationPreference: row.explanation_preference,
    resourcePreferences: parseArray(row.resource_preferences_json),
    paceAndTimeBudget: {
      pacePreference: row.pace_preference,
      weeklyTimeBudgetMinutes: row.weekly_time_budget_minutes,
    },
  });
}

function buildEvidenceSummary(meta, masteryRows, errorRows) {
  const dialogue = Object.entries(meta || {}).map(([field, value]) => ({
    field,
    source: value.source,
    confidence: value.confidence,
    evidence: value.evidence,
  }));
  if (masteryRows.length)
    dialogue.push({
      field: "knowledgeMastery",
      source: "quiz_behavior",
      evidence: `${masteryRows.length} 个知识点的真实作答记录`,
    });
  if (errorRows.length)
    dialogue.push({
      field: "errorPatterns",
      source: "wrong_answers",
      evidence: `${errorRows.length} 类错误模式`,
    });
  return dialogue;
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function assertStudentId(value) {
  if (!Number.isInteger(Number(value)) || Number(value) <= 0) throw badRequest("无效学生身份");
}
function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

module.exports = {
  getCompleteProfile,
  startDialogue,
  sendDialogueMessage,
  confirmDialogue,
  patchProfile,
  listProfileHistory,
  listLearningEvents,
  saveProfileAndVersion,
};
