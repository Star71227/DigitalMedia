/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { getCompleteProfile, saveProfileAndVersion } = require("./studentProfileService");
const { inferErrorAttribution, buildRecommendations } = require("./learningRecommendationService");
const { safelyAdjustLearningPath } = require("./learningPathService");
const { scheduleReview } = require("./reviewScheduleService");

const DIFFICULTY_WEIGHTS = {
  "基础": 2,
  easy: 2,
  basic: 2,
  "提高": 3,
  medium: 3,
  advanced: 3,
  "综合": 4,
  "冲刺": 4,
  hard: 4,
  challenge: 4,
};

function calculateMasteryDelta(difficulty, isCorrect) {
  const weight =
    DIFFICULTY_WEIGHTS[String(difficulty || "").toLowerCase()] || DIFFICULTY_WEIGHTS[difficulty] || 3;
  return (isCorrect ? 1 : -1) * (3 + weight);
}

function clampMastery(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

async function submitQuiz({
  studentId,
  idempotencyKey,
  subject,
  answers,
  startedAt,
  submittedAt,
  assignmentId,
}) {
  if (!idempotencyKey || String(idempotencyKey).length > 100)
    throw requestError("idempotencyKey 不能为空且不能超过100字符");
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 50)
    throw requestError("answers 必须包含 1 到 50 道题");
  const normalizedAssignmentId =
    Number.isInteger(Number(assignmentId)) && Number(assignmentId) > 0 ? Number(assignmentId) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [duplicates] = await connection.query(
      "SELECT result_json FROM quiz_attempts WHERE student_id = ? AND idempotency_key = ? LIMIT 1 FOR UPDATE",
      [studentId, String(idempotencyKey)],
    );
    if (duplicates[0]) {
      await connection.rollback();
      return parseObject(duplicates[0].result_json);
    }

    const ids = answers.map((item) => String(item.questionId || "").trim());
    if (ids.some((id) => !id)) throw requestError("questionId 不能为空");
    const placeholders = ids.map(() => "?").join(",");
    const [questions] = await connection.query(
      `SELECT * FROM question_bank WHERE question_id IN (${placeholders})
        AND (owner_student_id IS NULL OR owner_student_id=?) FOR UPDATE`,
      [...ids, Number(studentId)],
    );
    if (questions.length !== new Set(ids).size) throw requestError("部分题目不存在");
    const questionMap = new Map(questions.map((item) => [item.question_id, normalizeQuestion(item)]));
    const evaluated = answers.map((answer) => {
      const question = questionMap.get(String(answer.questionId));
      const questionType = String(question.question_type || "single_choice").trim();
      const raw = String(answer.answer ?? "").trim();
      // 填空题答案是表达式或术语（如 "n/2"、"递增"），题库里可用 | 分隔多个可接受写法，
      // 所以走文本归一化比对，不能套用 A-D 的那套选项校验。
      if (questionType === "fill_blank") {
        if (!raw) throw requestError("填空题答案不能为空");
        const correctAnswer = String(question.answer || "").trim();
        return {
          question,
          selectedAnswer: raw.slice(0, 255),
          correctAnswer: correctAnswer.slice(0, 255),
          isCorrect: matchesFillBlankAnswer(raw, correctAnswer),
          durationSeconds: normalizeDuration(answer.durationSeconds),
        };
      }
      const selectedAnswer = raw.toUpperCase();
      if (!/[A-D]/.test(selectedAnswer)) throw requestError("答案必须是 A-D");
      const correctAnswer = String(question.answer).trim().toUpperCase();
      const isCorrect = selectedAnswer === correctAnswer;
      return {
        question,
        selectedAnswer,
        correctAnswer,
        isCorrect,
        durationSeconds: normalizeDuration(answer.durationSeconds),
      };
    });
    const correctCount = evaluated.filter((item) => item.isCorrect).length;
    const score = Math.round((correctCount / evaluated.length) * 100);
    const submittedDate = validDate(submittedAt) || new Date();
    const [attemptResult] = await connection.query(
      `INSERT INTO quiz_attempts
         (student_id, idempotency_key, subject, score, correct_count, total_count, started_at, submitted_at, assignment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        studentId,
        String(idempotencyKey),
        subject || questions[0]?.subject || null,
        score,
        correctCount,
        evaluated.length,
        validDate(startedAt),
        submittedDate,
        normalizedAssignmentId,
      ],
    );

    const grouped = new Map();
    const errorAttributions = [];
    const questionResults = [];
    for (const item of evaluated) {
      const key = `${item.question.subject}::${item.question.knowledge_point}`;
      const group = grouped.get(key) || {
        subject: item.question.subject,
        knowledgePoint: item.question.knowledge_point,
        delta: 0,
        wrongCount: 0,
        questionIds: [],
        reasons: [],
      };
      const delta = calculateMasteryDelta(item.question.difficulty, item.isCorrect);
      group.delta += delta;
      group.wrongCount += item.isCorrect ? 0 : 1;
      group.questionIds.push(item.question.question_id);
      group.reasons.push(
        `${item.question.difficulty || "中等"}难度题回答${item.isCorrect ? "正确" : "错误"}`,
      );
      grouped.set(key, group);
      let attribution = null;
      if (!item.isCorrect) {
        attribution = inferErrorAttribution(item.question, item.selectedAnswer);
        errorAttributions.push(attribution);
        await upsertWrongQuestion(connection, studentId, item, attribution);
        await upsertErrorPattern(connection, studentId, item.question, attribution);
        await scheduleReview(
          {
            studentId,
            subject: item.question.subject,
            knowledgePoint: item.question.knowledge_point,
            sourceType: "quiz_question",
            sourceId: item.question.question_id,
            priority: 90,
          },
          connection,
        );
      }
      await connection.query(
        `INSERT INTO quiz_attempt_answers
           (attempt_id, question_id, selected_answer, correct_answer, is_correct, duration_seconds, error_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          attemptResult.insertId,
          item.question.question_id,
          item.selectedAnswer,
          item.correctAnswer,
          item.isCorrect ? 1 : 0,
          item.durationSeconds,
          attribution?.errorType || null,
        ],
      );
      questionResults.push({
        questionId: item.question.question_id,
        isCorrect: item.isCorrect,
        correctAnswer: item.correctAnswer,
        analysis: item.question.analysis || "",
      });
    }

    const masteryChanges = [];
    for (const group of grouped.values()) {
      const [rows] = await connection.query(
        `SELECT mastery, wrong_count, practice_count FROM student_knowledge_mastery
          WHERE student_id = ? AND subject = ? AND knowledge_point = ? FOR UPDATE`,
        [studentId, group.subject, group.knowledgePoint],
      );
      const before = rows[0] ? Number(rows[0].mastery) : 50;
      const after = clampMastery(before + group.delta);
      await connection.query(
        `INSERT INTO student_knowledge_mastery
           (student_id, subject, knowledge_point, mastery, wrong_count, practice_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE mastery=VALUES(mastery), wrong_count=wrong_count+VALUES(wrong_count), practice_count=practice_count+VALUES(practice_count), last_updated=CURRENT_TIMESTAMP`,
        [studentId, group.subject, group.knowledgePoint, after, group.wrongCount, group.questionIds.length],
      );
      masteryChanges.push({
        knowledgePointId: group.knowledgePoint,
        knowledgePointName: group.knowledgePoint,
        subject: group.subject,
        before,
        after,
        delta: after - before,
        reason: group.reasons.join("；"),
        questionIds: group.questionIds,
        occurredAt: submittedDate,
      });
    }

    const previousProfile = await getCompleteProfile(studentId, connection);
    const newVersion = await saveProfileAndVersion(
      connection,
      studentId,
      previousProfile.profile,
      previousProfile.fieldMeta,
      {
        reason: `完成测验，更新 ${masteryChanges.map((item) => item.knowledgePointName).join("、")} 掌握度与错误模式`,
        sourceType: "quiz_submission",
        evidence: { attemptId: attemptResult.insertId, masteryChanges, errorAttributions },
      },
    );
    const updatedProfile = await getCompleteProfile(studentId, connection);
    const recommendations = buildRecommendations({
      profile: updatedProfile.profile,
      masteryChanges,
      errorAttributions,
    });
    const changes = masteryChanges.map((item) => ({
      field: `knowledgeMastery.${item.knowledgePointId}`,
      before: item.before,
      after: item.after,
    }));
    for (const item of errorAttributions)
      changes.push({ field: "errorPatterns", action: "added_or_updated", value: item.label });
    const result = {
      attemptId: attemptResult.insertId,
      score,
      correctCount,
      totalCount: evaluated.length,
      questionResults,
      masteryChanges,
      errorAttributions,
      profileUpdate: { previousVersion: previousProfile.version, currentVersion: newVersion, changes },
      recommendations,
    };
    await connection.query("UPDATE quiz_attempts SET result_json = ? WHERE id = ?", [
      JSON.stringify(result),
      attemptResult.insertId,
    ]);
    await connection.query(
      `INSERT INTO student_learning_events (student_id, event_type, subject, payload_json)
       VALUES (?, 'quiz_submitted', ?, ?)`,
      [
        studentId,
        subject || questions[0]?.subject || null,
        JSON.stringify({
          attemptId: attemptResult.insertId,
          score,
          masteryChanges,
          errorAttributions,
          recommendations,
        }),
      ],
    );
    await connection.commit();
    /* 学习路径调整要跑一次模型（实测 10 题要 2~3 分钟），不能挡在判分结果前面：
       判分、掌握度、错题、复习计划上面已经 commit 落库，这里改成后台补跑，失败只记日志。 */
    void safelyAdjustLearningPath({
      studentId,
      reason: `测验 ${attemptResult.insertId} 完成后动态调整`,
      sourceType: "quiz_submission",
      sourceEventId: String(attemptResult.insertId),
    }).catch((error) => {
      console.warn(`Learning path adjustment skipped: ${error.message}`);
    });
    return result;
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      const [rows] = await pool.query(
        "SELECT result_json FROM quiz_attempts WHERE student_id = ? AND idempotency_key = ? LIMIT 1",
        [studentId, String(idempotencyKey)],
      );
      if (rows[0]) return parseObject(rows[0].result_json);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function upsertWrongQuestion(connection, studentId, item, attribution) {
  await connection.query(
    `INSERT INTO wrong_questions
       (student_id, question_id, subject, knowledge_point, difficulty, question_text,
        selected_answer, correct_answer, analysis, error_reason, feedback_suggestion, recommended_action, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待复习')
     ON DUPLICATE KEY UPDATE selected_answer=VALUES(selected_answer), correct_answer=VALUES(correct_answer),
       error_reason=VALUES(error_reason), feedback_suggestion=VALUES(feedback_suggestion),
       recommended_action=VALUES(recommended_action), status='待复习', updated_at=CURRENT_TIMESTAMP`,
    [
      studentId,
      item.question.question_id,
      item.question.subject,
      item.question.knowledge_point,
      item.question.difficulty,
      item.question.stem,
      item.selectedAnswer,
      item.correctAnswer,
      item.question.analysis || "",
      attribution.evidence,
      attribution.suggestion,
      attribution.suggestion,
    ],
  );
}

async function upsertErrorPattern(connection, studentId, question, attribution) {
  await connection.query(
    `INSERT INTO student_error_patterns
       (student_id, subject, knowledge_point, error_type, occurrence_count, confidence, latest_evidence_json)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE occurrence_count=occurrence_count+1, confidence=VALUES(confidence),
       latest_evidence_json=VALUES(latest_evidence_json), last_seen_at=CURRENT_TIMESTAMP`,
    [
      studentId,
      question.subject,
      question.knowledge_point,
      attribution.errorType,
      attribution.confidence,
      JSON.stringify({
        evidence: attribution.evidence,
        suggestion: attribution.suggestion,
        questionId: question.question_id,
      }),
    ],
  );
}

async function reconcileQuizAttemptDerivedState({ studentId, idempotencyKey }) {
  const id = Number(studentId);
  const key = String(idempotencyKey || "").trim();
  if (!Number.isInteger(id) || id <= 0 || !key || key.length > 100)
    throw requestError("invalid quiz reconciliation scope");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT a.id attempt_id,a.submitted_at,aa.question_id,aa.selected_answer,aa.correct_answer,aa.error_type,
        qb.subject,qb.knowledge_point,qb.difficulty,qb.stem,qb.analysis,qb.ability_dimension,qb.tags,qb.option_error_types
       FROM quiz_attempts a JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id
       JOIN question_bank qb ON qb.question_id=aa.question_id
       WHERE a.student_id=? AND a.idempotency_key=? AND aa.is_correct=0 FOR UPDATE`,
      [id, key],
    );
    for (const row of rows) {
      const question = normalizeQuestion(row);
      const attribution = inferErrorAttribution(question, row.selected_answer);
      const errorType = String(row.error_type || attribution.errorType);
      await connection.query(
        `UPDATE quiz_attempt_answers SET error_type=?
         WHERE attempt_id=? AND question_id=? AND (error_type IS NULL OR error_type='')`,
        [errorType, row.attempt_id, row.question_id],
      );
      await ensureWrongQuestion(
        connection,
        id,
        {
          question,
          selectedAnswer: row.selected_answer,
          correctAnswer: row.correct_answer,
        },
        attribution,
      );
      const [[occurrences]] = await connection.query(
        `SELECT COUNT(*) count FROM quiz_attempt_answers aa
         JOIN quiz_attempts a ON a.id=aa.attempt_id JOIN question_bank qb ON qb.question_id=aa.question_id
         WHERE a.student_id=? AND aa.is_correct=0 AND aa.error_type=? AND qb.subject=? AND qb.knowledge_point=?`,
        [id, errorType, row.subject, row.knowledge_point],
      );
      await ensureErrorPattern(
        connection,
        id,
        question,
        { ...attribution, errorType },
        Math.max(1, Number(occurrences.count || 0)),
        row.submitted_at,
      );
    }
    await connection.commit();
    return { attemptFound: rows.length > 0, reconciledWrongAnswers: rows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureWrongQuestion(connection, studentId, item, attribution) {
  await connection.query(
    `INSERT IGNORE INTO wrong_questions
       (student_id,question_id,subject,knowledge_point,difficulty,question_text,selected_answer,
        correct_answer,analysis,error_reason,feedback_suggestion,recommended_action,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, '待复习')`,
    [
      studentId,
      item.question.question_id,
      item.question.subject,
      item.question.knowledge_point,
      item.question.difficulty,
      item.question.stem,
      item.selectedAnswer,
      item.correctAnswer,
      item.question.analysis || "",
      attribution.evidence,
      attribution.suggestion,
      attribution.suggestion,
    ],
  );
}

async function ensureErrorPattern(connection, studentId, question, attribution, occurrenceCount, occurredAt) {
  const timestamp = validDate(occurredAt) || new Date();
  const evidence = JSON.stringify({
    evidence: attribution.evidence,
    suggestion: attribution.suggestion,
    questionId: question.question_id,
  });
  await connection.query(
    `INSERT INTO student_error_patterns
       (student_id,subject,knowledge_point,error_type,occurrence_count,confidence,latest_evidence_json,first_seen_at,last_seen_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       occurrence_count=GREATEST(occurrence_count,VALUES(occurrence_count)),
       confidence=GREATEST(confidence,VALUES(confidence)),
       latest_evidence_json=IF(last_seen_at<=VALUES(last_seen_at),VALUES(latest_evidence_json),latest_evidence_json),
       first_seen_at=LEAST(first_seen_at,VALUES(first_seen_at)),
       last_seen_at=GREATEST(last_seen_at,VALUES(last_seen_at))`,
    [
      studentId,
      question.subject,
      question.knowledge_point,
      attribution.errorType,
      occurrenceCount,
      attribution.confidence,
      evidence,
      timestamp,
      timestamp,
    ],
  );
}

function normalizeQuestion(row) {
  return { ...row, tags: parseArray(row.tags), option_error_types: parseObject(row.option_error_types) };
}
function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    return JSON.parse(value || "{}");
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
function normalizeDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.round(number), 86400) : null;
}
function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
function requestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// 填空题判分：先归一化（忽略大小写、空白、全角符号差异），再和题库里 | 分隔的多个可接受写法逐一比对。
// 例：题目答案配置 "递增|升序"，学生写 " 升序 " 也算对。
function normalizeFillBlankAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/＋/g, "+")
    .replace(/[－—–]/g, "-")
    .replace(/[⌊]/g, "floor(")
    .replace(/[⌋]/g, ")");
}
function matchesFillBlankAnswer(selected, configured) {
  const normalized = normalizeFillBlankAnswer(selected);
  if (!normalized) return false;
  return String(configured ?? "")
    .split("|")
    .map((item) => normalizeFillBlankAnswer(item))
    .filter(Boolean)
    .some((item) => item === normalized);
}

module.exports = {
  submitQuiz,
  reconcileQuizAttemptDerivedState,
  calculateMasteryDelta,
  clampMastery,
  DIFFICULTY_WEIGHTS,
};
