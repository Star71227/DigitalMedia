/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { listTrustedCodeCaseCandidates } = require("./codeExerciseTrustService");

/**
 * 资源上下文。
 *
 * pathVersion / stageKey 以前是硬要求：缺了就把 NaN 拼进 SQL，报出
 * 「Unknown column 'NaN' in 'where clause'」这种让人摸不着头脑的 500。
 * 现在两者都改成可省略——省略时按学生**当前**路径版本 + 与该科目/知识点匹配的阶段自动定位，
 * 显式传入时仍按原样校验（路径版本不存在、知识点不属于该阶段都会给出明确错误）。
 */
async function buildResourceContext({
  studentId,
  resourceType,
  subject,
  knowledgePoint,
  stageKey,
  pathVersion,
}) {
  const id = Number(studentId);
  if (!Number.isInteger(id) || id <= 0) throw apiError("invalid student", 401);
  if (!["study_note", "mind_map", "pptx", "quiz_pack", "code_case"].includes(resourceType))
    throw apiError("unsupported resourceType", 400);
  const version = await resolvePathVersion(id, pathVersion);
  const [[pathRow]] = await pool.query(
    `SELECT v.version,v.snapshot_json FROM student_learning_paths p
     JOIN learning_path_versions v ON v.student_id=p.student_id AND v.version=?
     WHERE p.student_id=? AND (?=p.current_version OR EXISTS(SELECT 1 FROM learning_path_versions x WHERE x.student_id=p.student_id AND x.version=?)) LIMIT 1`,
    [version, id, version, version],
  );
  if (!pathRow) throw apiError("path version not found", 404);
  const snapshot = parse(pathRow.snapshot_json);
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  const stage = resolveStage(stages, { stageKey, subject, knowledgePoint });
  if (!stage)
    throw apiError(
      stageKey
        ? `stageKey not found in path version`
        : `该学习路径里没有与「${subject} / ${knowledgePoint}」匹配的阶段，请先在学习路径中加入该知识点`,
      422,
    );
  if (stage.subject !== subject || !(stage.knowledgePoints || []).includes(knowledgePoint))
    throw apiError("subject or knowledgePoint does not belong to stage", 422);
  const resolvedStageKey = stage.key;

  const pathKnowledgePoints = [
    ...new Set(
      (snapshot.stages || [])
        .filter((item) => item.subject === subject)
        .flatMap((item) => item.knowledgePoints || []),
    ),
  ].slice(0, 30);
  const [[profile], mastery, errors, questions, codes] = await Promise.all([
    pool.query(
      `SELECT major,grade,current_course,current_version,prior_knowledge_json,learning_goals_json,explanation_preference,resource_preferences_json,pace_preference,weekly_time_budget_minutes FROM student_profiles WHERE student_id=? LIMIT 1`,
      [id],
    ),
    pool.query(
      `SELECT mastery,wrong_count,practice_count FROM student_knowledge_mastery WHERE student_id=? AND subject=? AND knowledge_point=? LIMIT 1`,
      [id, subject, knowledgePoint],
    ),
    pool.query(
      `SELECT error_type,occurrence_count,confidence FROM student_error_patterns WHERE student_id=? AND subject=? AND knowledge_point=? ORDER BY occurrence_count DESC LIMIT 8`,
      [id, subject, knowledgePoint],
    ),
    loadQuestionPool({
      subject,
      studentId: id,
      resourceType,
      pathKnowledgePoints,
      knowledgePoint,
      stageQuestionIds: stage.questionIds || [],
    }),
    pool.query(
      `SELECT exercise_id,title,description,language,difficulty,starter_code,sample_input,sample_output,explanation,source,path_completion_eligible
      FROM code_exercises WHERE exercise_id IN (${placeholders(stage.codeExerciseIds)})`,
      stage.codeExerciseIds || [],
    ),
  ]);
  const baseContext = {
    studentId: id,
    resourceType,
    subject,
    knowledgePoint,
    pathKnowledgePoints,
    pathId: `student-${id}`,
    pathVersion: Number(pathRow.version),
    stageKey: resolvedStageKey,
    stageTitle: stage.title,
    stageGoals: stage.goals,
    stageType: stage.completion?.type || "learning",
    mastery: Number((mastery[0][0] || {}).mastery ?? 50),
  };
  const trustedCodeCaseCandidates =
    resourceType === "code_case"
      ? await listTrustedCodeCaseCandidates({
          ...baseContext,
          allowedCodeExerciseIds: stage.codeExerciseIds || [],
        })
      : [];
  const trustedCodeExerciseIds = trustedCodeCaseCandidates.map((candidate) => candidate.exerciseId);
  const masteryRow = mastery[0][0] || {};
  const estimatedMinutes = Math.max(10, Math.min(120, Number(stage.durationMinutes) || 30));
  return {
    studentId: id,
    resourceType,
    subject,
    knowledgePoint,
    pathKnowledgePoints,
    pathId: `student-${id}`,
    pathVersion: Number(pathRow.version),
    stageKey: resolvedStageKey,
    stageTitle: stage.title,
    stageGoals: stage.goals,
    stageType: stage.completion?.type || "learning",
    mastery: Number(masteryRow.mastery ?? 50),
    weakPoints: Number(masteryRow.mastery ?? 50) < 70 ? [knowledgePoint] : [],
    errorPatterns: errors[0].map((row) => ({
      errorType: row.error_type,
      occurrenceCount: Number(row.occurrence_count),
      confidence: Number(row.confidence),
    })),
    major: profile?.major || "",
    grade: profile?.grade || "",
    currentCourse: profile?.current_course || subject,
    profileVersion: Number(profile?.current_version) || 0,
    learningGoals: parseArray(profile?.learning_goals_json),
    explanationPreference: profile?.explanation_preference || "结构化讲解",
    resourcePreferences: parseArray(profile?.resource_preferences_json),
    paceAndTimeBudget: {
      pacePreference: profile?.pace_preference || "适中",
      weeklyTimeBudgetMinutes: Number(profile?.weekly_time_budget_minutes) || null,
    },
    priorKnowledge: parseArray(profile?.prior_knowledge_json),
    estimatedMinutes,
    difficulty:
      masteryRow.mastery < 50 ? "foundation" : masteryRow.mastery < 75 ? "intermediate" : "advanced",
    allowedQuestionIds: questions[0].map((row) => row.question_id),
    allowedCodeExerciseIds: codes[0].map((row) => row.exercise_id),
    trustedCodeExerciseIds,
    questionEvidence: questions[0].map((row) => ({
      questionId: row.question_id,
      questionType: row.question_type,
      stem: row.stem,
      codeContext: row.code_context,
      optionA: row.option_a,
      optionB: row.option_b,
      optionC: row.option_c,
      optionD: row.option_d,
      answer: row.answer,
      analysis: row.analysis,
      hint: row.hint,
      difficulty: row.difficulty,
      chapter: row.chapter,
      knowledgePoint: row.knowledge_point,
      abilityDimension: row.ability_dimension,
      tags: parseArray(row.tags),
      optionErrorTypes: parse(row.option_error_types),
    })),
    codeEvidence:
      resourceType === "code_case"
        ? trustedCodeCaseCandidates
        : codes[0].map((row) => ({
            exerciseId: row.exercise_id,
            title: row.title,
            description: row.description,
            language: row.language,
            difficulty: row.difficulty,
            starterCode: row.starter_code,
            sampleInput: row.sample_input,
            sampleOutput: row.sample_output,
            explanation: row.explanation,
            source: row.source,
            pathCompletionEligible: Boolean(row.path_completion_eligible),
          })),
    trustedCodeCaseCandidates,
  };
}
function placeholders(items) {
  return Array.isArray(items) && items.length ? items.map(() => "?").join(",") : "NULL";
}

/**
 * 题池。
 *
 * 以前只按「学习路径里出现过的知识点」过滤。像数据结构这种路径里只写了 1 个知识点的学生，
 * 单选池只有 5-6 道，而练习包质量门禁要求 12-16 道且覆盖 ≥5 个知识点，于是必然被拒
 * ——模型再怎么努力也不可能通过，报错却像"内容不合格"。
 *
 * 现在：路径内命中的题仍然排在最前；练习包在题量不足时回退到同学科已发布题库补足，
 * 其它资源类型维持原行为。题库本身就要求 4 个互不重复选项 + 真实答案解析，
 * 因此回退不会降低质量，只是不再被路径知识点卡死。
 */
async function loadQuestionPool({
  subject,
  studentId,
  resourceType,
  pathKnowledgePoints,
  knowledgePoint,
  stageQuestionIds,
}) {
  const limit = resourceType === "quiz_pack" ? 24 : 10;
  const columns =
    "question_id,question_type,stem,code_context,option_a,option_b,option_c,option_d,answer,analysis,hint,difficulty,chapter,knowledge_point,ability_dimension,tags,option_error_types";
  // 练习包只吃单选题：选择题练习包一旦混入填空/简答，门禁会直接判 unsupported_question_type。
  const typeFilter = resourceType === "quiz_pack" ? " AND question_type='single_choice'" : "";
  const [rows] = await pool.query(
    `SELECT ${columns} FROM question_bank
     WHERE subject=? AND COALESCE(is_published, 1)=1 AND (owner_student_id IS NULL OR owner_student_id=?)${typeFilter} AND knowledge_point IN (${placeholders(pathKnowledgePoints)})
     ORDER BY CASE WHEN knowledge_point=? THEN 0 WHEN question_id IN (${placeholders(stageQuestionIds)}) THEN 1 ELSE 2 END,id
     LIMIT ${limit}`,
    [subject, studentId, ...pathKnowledgePoints, knowledgePoint, ...stageQuestionIds],
  );
  if (resourceType !== "quiz_pack" || rows.length >= limit) return [rows];
  const picked = rows.map((row) => row.question_id);
  const [extra] = await pool.query(
    `SELECT ${columns} FROM question_bank
     WHERE subject=? AND COALESCE(is_published, 1)=1 AND (owner_student_id IS NULL OR owner_student_id=?)${typeFilter}
       ${picked.length ? `AND question_id NOT IN (${placeholders(picked)})` : ""}
     ORDER BY CASE WHEN knowledge_point=? THEN 0 WHEN knowledge_point IN (${placeholders(pathKnowledgePoints)}) THEN 1 ELSE 2 END,id
     LIMIT ${limit - rows.length}`,
    [subject, studentId, ...picked, knowledgePoint, ...pathKnowledgePoints],
  );
  return [[...rows, ...extra]];
}
/** 未显式指定路径版本时，取学生当前版本；没有路径就给出可读的错误而不是 NaN */
async function resolvePathVersion(id, pathVersion) {
  const requested = Number(pathVersion);
  if (Number.isInteger(requested) && requested > 0) return requested;
  const [[row]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [id],
  );
  const current = Number(row?.current_version);
  if (!Number.isInteger(current) || current <= 0)
    throw apiError("该学生还没有学习路径，请先生成学习路径再生成资源", 422);
  return current;
}
/** 未指定阶段时，按「科目 + 知识点」自动定位。
 *  刻意**不**退化成"该科目的第一个阶段"：那样只会让后面的校验失败并抛出一句
 *  「subject or knowledgePoint does not belong to stage」，学生根本不知道该怎么办。 */
function resolveStage(stages, { stageKey, subject, knowledgePoint }) {
  if (stageKey) {
    const exact = stages.find((item) => item.key === stageKey);
    if (exact) return exact;
  }
  return (
    stages.find(
      (item) => item.subject === subject && (item.knowledgePoints || []).includes(knowledgePoint),
    ) || null
  );
}
function parse(v) {
  if (v && typeof v === "object") return v;
  try {
    return JSON.parse(v || "{}");
  } catch {
    return {};
  }
}
function parseArray(v) {
  const x = parse(v);
  return Array.isArray(x) ? x : [];
}
function apiError(message, statusCode) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
module.exports = { buildResourceContext };
