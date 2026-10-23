/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { PlannerAgent } = require("./agents");
const { isAIEnabled } = require("./aiService");
const { validateLearningPath, semanticFingerprint } = require("./learningPathSchema");

async function createOrAdjustLearningPath({
  studentId,
  reason = "生成个性化学习路径",
  sourceType = "manual",
  sourceEventId = null,
  candidateOverride = null,
}) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const catalog = await loadCatalog(pool, normalizedStudentId);
  const profile = await loadPlanningProfile(normalizedStudentId, pool);
  const rawCandidate = candidateOverride || (await buildCandidate({ catalog, profile }));
  const candidate = validateLearningPath(rawCandidate, catalog);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const currentCatalog = await loadCatalog(connection, normalizedStudentId);
    const validated = validateLearningPath(candidate, currentCatalog);
    const currentFingerprint = semanticFingerprint(validated);

    await connection.query(
      "INSERT IGNORE INTO student_learning_paths (student_id, current_version) VALUES (?, 0)",
      [normalizedStudentId],
    );
    const [[pathRow]] = await connection.query(
      "SELECT current_version FROM student_learning_paths WHERE student_id = ? FOR UPDATE",
      [normalizedStudentId],
    );

    if (sourceEventId) {
      const [eventInsert] = await connection.query(
        `INSERT IGNORE INTO learning_path_adjustment_events
           (student_id, source_type, source_event_id, status)
         VALUES (?, ?, ?, 'processing')`,
        [normalizedStudentId, sourceType, String(sourceEventId)],
      );
      if (eventInsert.affectedRows === 0) {
        await connection.rollback();
        return getCurrentLearningPath(normalizedStudentId);
      }
    }

    let currentVersionRow = null;
    if (Number(pathRow.current_version) > 0) {
      [[currentVersionRow]] = await connection.query(
        `SELECT version, semantic_fingerprint FROM learning_path_versions
         WHERE student_id = ? AND version = ? FOR UPDATE`,
        [normalizedStudentId, pathRow.current_version],
      );
    }

    if (currentVersionRow && currentVersionRow.semantic_fingerprint === currentFingerprint) {
      await markAdjustmentEvent(
        connection,
        normalizedStudentId,
        sourceType,
        sourceEventId,
        currentVersionRow.version,
        "no_change",
      );
      await connection.commit();
      return getCurrentLearningPath(normalizedStudentId);
    }

    const nextVersion = Number(pathRow.current_version) + 1;
    await connection.query(
      `INSERT INTO learning_path_versions
         (student_id, version, title, snapshot_json, semantic_fingerprint, change_reason, source_type, source_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedStudentId,
        nextVersion,
        validated.title,
        JSON.stringify(validated),
        currentFingerprint,
        truncate(reason, 255),
        truncate(sourceType, 60),
        sourceEventId ? truncate(String(sourceEventId), 120) : null,
      ],
    );
    await connection.query("UPDATE student_learning_paths SET current_version = ? WHERE student_id = ?", [
      nextVersion,
      normalizedStudentId,
    ]);
    await markAdjustmentEvent(
      connection,
      normalizedStudentId,
      sourceType,
      sourceEventId,
      nextVersion,
      "created",
    );
    await connection.commit();
    return getCurrentLearningPath(normalizedStudentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function safelyAdjustLearningPath(input) {
  try {
    return await createOrAdjustLearningPath(input);
  } catch (error) {
    console.warn(`Learning path adjustment skipped: ${error.message}`);
    return null;
  }
}

async function getCurrentLearningPath(studentId) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const [[row]] = await pool.query(
    `SELECT v.version, v.title, v.snapshot_json, v.change_reason, v.source_type, v.created_at
       FROM student_learning_paths p
       JOIN learning_path_versions v ON v.student_id = p.student_id AND v.version = p.current_version
      WHERE p.student_id = ? LIMIT 1`,
    [normalizedStudentId],
  );
  if (!row) return null;
  const snapshot = parseObject(row.snapshot_json);
  const stages = await evaluateStages(normalizedStudentId, snapshot.stages || [], Number(row.version));
  return {
    version: Number(row.version),
    title: row.title,
    stages,
    changeReason: row.change_reason,
    sourceType: row.source_type,
    createdAt: row.created_at,
    progress: stages.length
      ? Math.round(stages.reduce((sum, stage) => sum + stage.progress, 0) / stages.length)
      : 0,
  };
}

async function listLearningPathVersions(studentId) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const [rows] = await pool.query(
    `SELECT version, title, snapshot_json, change_reason, source_type, created_at
       FROM learning_path_versions WHERE student_id = ? ORDER BY version DESC LIMIT 30`,
    [normalizedStudentId],
  );
  return rows.map((row, index) => {
    const snapshot = parseObject(row.snapshot_json);
    const previous = rows[index + 1] ? parseObject(rows[index + 1].snapshot_json) : null;
    return {
      version: Number(row.version),
      title: row.title,
      changeReason: row.change_reason,
      sourceType: row.source_type,
      createdAt: row.created_at,
      stages: snapshot.stages || [],
      diff: previous
        ? diffPaths(previous, snapshot)
        : {
            added: snapshot.stages?.map((stage) => stage.key) || [],
            removed: [],
            changed: [],
            reordered: false,
          },
    };
  });
}

async function buildCandidate({ catalog, profile }) {
  const fallback = buildDeterministicCandidate(catalog, profile);
  if (
    process.env.PATH_PLANNER_AI_ENABLED !== "true" ||
    !isAIEnabled() ||
    typeof PlannerAgent.planPath !== "function"
  )
    return fallback;
  try {
    const modelCandidate = await PlannerAgent.planPath({ catalog, profile, baseline: fallback });
    return validateLearningPath(modelCandidate, catalog);
  } catch (error) {
    return fallback;
  }
}

function buildDeterministicCandidate(catalog, profile) {
  const mastery = new Map(
    (profile.mastery || []).map((item) => [`${item.subject}::${item.knowledgePoint}`, Number(item.mastery)]),
  );
  const wrongDetails = new Map(
    (profile.wrongQuestions || []).map((item) => [`${item.subject}::${item.knowledgePoint}`, item]),
  );
  const preferredSubject = String(profile.currentCourse || "").trim();
  const groups = new Map();
  for (const question of catalog.questions)
    addCatalogItem(groups, question.subject, question.knowledgePoint, "questionIds", question.questionId);
  for (const exercise of catalog.codeExercises)
    addCatalogItem(
      groups,
      exercise.subject,
      exercise.knowledgePoint,
      "codeExerciseIds",
      exercise.exerciseId,
      exercise,
    );
  let entries = Array.from(groups.values()).filter(
    (item) => item.knowledgePoint && (item.questionIds.length || item.verifiedCodeExerciseIds.length),
  );
  if (preferredSubject && entries.some((item) => item.subject === preferredSubject))
    entries = entries.filter((item) => item.subject === preferredSubject);
  entries.sort((a, b) => {
    const aKey = `${a.subject}::${a.knowledgePoint}`;
    const bKey = `${b.subject}::${b.knowledgePoint}`;
    const aScore = priorityScore(mastery.get(aKey), wrongDetails.get(aKey));
    const bScore = priorityScore(mastery.get(bKey), wrongDetails.get(bKey));
    return aScore - bScore || a.knowledgePoint.localeCompare(b.knowledgePoint, "zh-CN");
  });
  entries = entries.slice(0, 6);
  if (!entries.length) throw serviceError("题库和 CodeLab 中没有可用于规划的资源", 422);

  const weeklyBudget = clamp(Number(profile.weeklyTimeBudgetMinutes) || 240, 90, 840);
  const stageBudget = clamp(Math.floor(weeklyBudget / entries.length / 5) * 5, 20, 120);
  const goal = String(profile.learningGoals?.[0] || "").trim();
  const preferredResource = String(profile.resourcePreferences?.[0] || "").trim();
  const stages = entries.map((entry, index) => {
    const currentMastery = mastery.get(`${entry.subject}::${entry.knowledgePoint}`) ?? 50;
    const wrong = wrongDetails.get(`${entry.subject}::${entry.knowledgePoint}`);
    const type =
      currentMastery < 60 && index < 2 ? "resource" : entry.questionIds.length ? "quiz" : "codelab";
    const ids =
      type === "resource"
        ? ["mind_map"]
        : type === "quiz"
          ? entry.questionIds.slice(0, 3)
          : entry.verifiedCodeExerciseIds.slice(0, 2);
    const reason = wrong?.count
      ? `近期待复习错题 ${wrong.count} 道，当前掌握度 ${Math.round(currentMastery)}%`
      : `当前掌握度 ${Math.round(currentMastery)}%，按薄弱度排序`;
    const errorReason = String(wrong?.errorReasons?.[0] || "").trim();
    const taskLabel =
      type === "quiz"
        ? `完成 ${ids.length} 道已审核测验题`
        : type === "codelab"
          ? `完成 ${ids.length} 个可判题 CodeLab`
          : `先用思维导图重建概念关系${preferredResource ? `（兼顾偏好：${preferredResource}）` : ""}`;
    return {
      key: `stage-${index + 1}`,
      title: `${index + 1}. ${entry.knowledgePoint} · ${type === "resource" ? "补基础" : type === "quiz" ? "针对性测验" : "代码实战"}`,
      subject: entry.subject,
      durationMinutes: clamp(stageBudget + (currentMastery < 45 ? 15 : 0), 20, 135),
      goals: [
        `个性化依据：${reason}`,
        `本阶段行动：${taskLabel}`,
        errorReason
          ? `重点纠正：${errorReason}`
          : `验收目标：能解释${entry.knowledgePoint}的条件、过程与边界`,
        goal ? `关联个人目标：${goal}` : `完成后再进入下一阶段`,
      ],
      knowledgePoints: [entry.knowledgePoint],
      questionIds: entry.questionIds.slice(0, 6),
      codeExerciseIds: entry.codeExerciseIds.slice(0, 4),
      completion: { type, ids },
      dependsOn: index === 0 ? [] : [`stage-${index}`],
    };
  });
  const lead = entries[0]?.knowledgePoint || "当前薄弱点";
  return {
    title: preferredSubject
      ? `${preferredSubject} · 先攻克${lead}的个性化路径`
      : `先攻克${lead}的个性化学习路径`,
    stages,
  };
}

function priorityScore(masteryValue, wrong) {
  const mastery = Number.isFinite(Number(masteryValue)) ? Number(masteryValue) : 50;
  return mastery - Math.min(36, Number(wrong?.count || 0) * 7);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function evaluateStages(studentId, stages, pathVersion) {
  const state = new Map();
  const result = [];
  for (const stage of stages) {
    const dependencyStates = stage.dependsOn.map((key) => state.get(key));
    if (dependencyStates.some((item) => !item || item.status !== "completed")) {
      const locked = toPublicStage(stage, "locked", 0, null);
      state.set(stage.key, locked);
      result.push(locked);
      continue;
    }
    const unlockAt = dependencyStates.reduce((latest, item) => laterDate(latest, item.completedAt), null);
    const evidence = await completionEvidence(studentId, stage, pathVersion, unlockAt);
    const status = evidence.progress === 100 ? "completed" : "active";
    const evaluated = toPublicStage(stage, status, evidence.progress, evidence.completedAt);
    state.set(stage.key, evaluated);
    result.push(evaluated);
  }
  return result;
}

async function completionEvidence(studentId, stage, pathVersion, unlockAt) {
  const completion = stage.completion;
  const ids = completion.ids || [];
  if (!ids.length) return { progress: 0, completedAt: null };
  let rows;
  if (completion.type === "quiz") {
    [rows] = await pool.query(
      `SELECT a.question_id AS ref_id, MAX(q.submitted_at) AS completed_at
         FROM quiz_attempt_answers a JOIN quiz_attempts q ON q.id = a.attempt_id
        WHERE q.student_id = ? AND a.is_correct = 1 AND a.question_id IN (${ids.map(() => "?").join(",")})
          AND (? IS NULL OR q.submitted_at > ?)
        GROUP BY a.question_id`,
      [studentId, ...ids, unlockAt, unlockAt],
    );
  } else if (completion.type === "codelab") {
    [rows] = await pool.query(
      `SELECT s.exercise_id AS ref_id, MAX(s.created_at) AS completed_at
         FROM code_submissions s JOIN code_exercises e ON e.exercise_id = s.exercise_id
         WHERE s.student_id = ? AND s.mode = 'submit' AND s.status = 'accepted' AND s.execution_mode = 'docker' AND e.path_completion_eligible = 1 AND s.exercise_id IN (${ids.map(() => "?").join(",")})
          AND (? IS NULL OR s.created_at > ?)
        GROUP BY s.exercise_id`,
      [studentId, ...ids, unlockAt, unlockAt],
    );
  } else {
    [rows] = await pool.query(
      `SELECT r.resource_type AS ref_id, MAX(p.completed_at) AS completed_at
         FROM learning_resources r JOIN learning_resource_progress p
           ON p.resource_id=r.id AND p.resource_version=r.current_version AND p.student_id=r.student_id
        WHERE r.student_id=? AND r.path_version=? AND r.stage_key=? AND r.status='approved'
          AND p.status='completed' AND r.resource_type IN (${ids.map(() => "?").join(",")})
          AND (? IS NULL OR p.completed_at > ?)
        GROUP BY r.resource_type`,
      [studentId, pathVersion, stage.key, ...ids, unlockAt, unlockAt],
    );
  }
  const completedIds = new Set(rows.map((row) => String(row.ref_id)));
  const completedAt = rows.reduce((latest, row) => laterDate(latest, row.completed_at), null);
  return {
    progress: Math.round((completedIds.size / ids.length) * 100),
    completedAt: completedIds.size === ids.length ? completedAt : null,
  };
}

async function loadCatalog(executor, studentId) {
  const [questions, codeExercises] = await Promise.all([
    executor.query(
      "SELECT question_id, subject, knowledge_point, difficulty FROM question_bank WHERE question_id <> '' AND knowledge_point <> '' AND (owner_student_id IS NULL OR owner_student_id=?) ORDER BY question_id",
      [studentId],
    ),
    executor.query(
      "SELECT exercise_id, subject, knowledge_point, difficulty, path_completion_eligible FROM code_exercises WHERE exercise_id <> '' AND knowledge_point <> '' ORDER BY exercise_id",
    ),
  ]);
  const normalizedQuestions = questions[0].map((row) => ({
    questionId: row.question_id,
    subject: row.subject,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
  }));
  const normalizedCode = codeExercises[0].map((row) => ({
    exerciseId: row.exercise_id,
    subject: row.subject,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
    pathCompletionEligible: Boolean(row.path_completion_eligible),
  }));
  return {
    questions: normalizedQuestions,
    codeExercises: normalizedCode,
    knowledgePoints: [
      ...new Set([...normalizedQuestions, ...normalizedCode].map((item) => item.knowledgePoint)),
    ],
  };
}

async function loadPlanningProfile(studentId, executor) {
  const [[profile], mastery, wrongQuestions, chatHistory, personalDocuments] = await Promise.all([
    executor.query(
      `SELECT current_course,major,grade,prior_knowledge_json,learning_goals_json,
      explanation_preference,resource_preferences_json,pace_preference,weekly_time_budget_minutes
      FROM student_profiles WHERE student_id = ? LIMIT 1`,
      [studentId],
    ),
    executor.query(
      "SELECT subject, knowledge_point, mastery FROM student_knowledge_mastery WHERE student_id = ?",
      [studentId],
    ),
    executor.query(
      `SELECT subject,knowledge_point,COUNT(*) count,
      GROUP_CONCAT(DISTINCT NULLIF(error_reason,'') ORDER BY updated_at DESC SEPARATOR '；') error_reasons
      FROM wrong_questions WHERE student_id=? AND status='待复习'
      GROUP BY subject,knowledge_point ORDER BY count DESC LIMIT 30`,
      [studentId],
    ),
    executor.query(
      `SELECT subject,knowledge_point,content_text,created_at FROM chat_messages
      WHERE student_id=? AND role='user' ORDER BY created_at DESC LIMIT 20`,
      [studentId],
    ),
    executor.query(
      `SELECT subject,title,created_at FROM student_knowledge_documents
      WHERE student_id=? AND status='active' ORDER BY created_at DESC LIMIT 30`,
      [studentId],
    ),
  ]);
  const row = profile[0] || {};
  return {
    currentCourse: row.current_course || "",
    major: row.major || "",
    grade: row.grade || "",
    priorKnowledge: parseArray(row.prior_knowledge_json),
    learningGoals: parseArray(row.learning_goals_json),
    explanationPreference: row.explanation_preference || "",
    resourcePreferences: parseArray(row.resource_preferences_json),
    pacePreference: row.pace_preference || "",
    weeklyTimeBudgetMinutes: Number(row.weekly_time_budget_minutes || 0),
    mastery: mastery[0].map((item) => ({
      subject: item.subject,
      knowledgePoint: item.knowledge_point,
      mastery: item.mastery,
    })),
    wrongQuestions: wrongQuestions[0].map((item) => ({
      subject: item.subject,
      knowledgePoint: item.knowledge_point,
      count: Number(item.count),
      errorReasons: String(item.error_reasons || "")
        .split("；")
        .filter(Boolean)
        .slice(0, 6),
    })),
    recentAssistantQuestions: chatHistory[0].map((item) => ({
      subject: item.subject,
      knowledgePoint: item.knowledge_point,
      question: String(item.content_text || "").slice(0, 500),
      createdAt: item.created_at,
    })),
    personalDocuments: personalDocuments[0].map((item) => ({
      subject: item.subject,
      title: item.title,
      createdAt: item.created_at,
    })),
  };
}

async function markAdjustmentEvent(connection, studentId, sourceType, sourceEventId, version, status) {
  if (!sourceEventId) return;
  await connection.query(
    `UPDATE learning_path_adjustment_events SET path_version = ?, status = ?, error_message = NULL
      WHERE student_id = ? AND source_type = ? AND source_event_id = ?`,
    [version, status, studentId, sourceType, String(sourceEventId)],
  );
}

function addCatalogItem(groups, subject, knowledgePoint, field, id, catalogItem = null) {
  const key = `${subject}::${knowledgePoint}`;
  const item = groups.get(key) || {
    subject,
    knowledgePoint,
    questionIds: [],
    codeExerciseIds: [],
    verifiedCodeExerciseIds: [],
  };
  if (!item[field].includes(id)) item[field].push(id);
  if (field === "codeExerciseIds") {
    if (catalogItem?.pathCompletionEligible && !item.verifiedCodeExerciseIds.includes(id))
      item.verifiedCodeExerciseIds.push(id);
  }
  groups.set(key, item);
}
function toPublicStage(stage, status, progress, completedAt) {
  return {
    ...stage,
    status,
    progress,
    completedAt,
    resources: [
      ...stage.questionIds.map((id) => `题库：${id}`),
      ...stage.codeExerciseIds.map((id) => `CodeLab：${id}`),
    ],
  };
}
function diffPaths(previous, current) {
  const before = previous.stages.map((stage) => stage.key);
  const after = current.stages.map((stage) => stage.key);
  const previousByKey = new Map(previous.stages.map((stage) => [stage.key, stage]));
  return {
    added: after.filter((key) => !before.includes(key)),
    removed: before.filter((key) => !after.includes(key)),
    changed: current.stages
      .filter(
        (stage) =>
          previousByKey.has(stage.key) &&
          semanticFingerprint({ stages: [previousByKey.get(stage.key)] }) !==
            semanticFingerprint({ stages: [stage] }),
      )
      .map((stage) => stage.key),
    reordered:
      before.filter((key) => after.includes(key)).join("|") !==
      after.filter((key) => before.includes(key)).join("|"),
  };
}
function laterDate(left, right) {
  if (!right) return left;
  if (!left) return right;
  return new Date(right) > new Date(left) ? right : left;
}
function parseObject(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function parseArray(value) {
  const parsed = parseObject(value);
  return Array.isArray(parsed) ? parsed : [];
}
function truncate(value, length) {
  return String(value || "")
    .trim()
    .slice(0, length);
}
function normalizeStudentId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw serviceError("invalid student id", 401);
  return id;
}
function serviceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  createOrAdjustLearningPath,
  safelyAdjustLearningPath,
  getCurrentLearningPath,
  listLearningPathVersions,
  buildDeterministicCandidate,
  loadCatalog,
};
