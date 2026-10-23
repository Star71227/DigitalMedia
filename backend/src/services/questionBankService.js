/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

// 题库使用的学科名与知识库 knowledge_points.subject 不完全一致，
// 做别名关联查询时需要归一到知识库的叫法。
function knowledgeBaseSubject(subject) {
  const value = String(subject || "").trim();
  if (value === "C 语言程序设计") return "C语言";
  if (value === "计算机组成") return "计算机组成原理";
  return value;
}

function normalizeDifficulty(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();

  if (["基础", "basic", "easy", "beginner", "elementary"].includes(value)) {
    return "基础";
  }

  if (["提高", "advanced", "medium", "intermediate"].includes(value)) {
    return "提高";
  }

  if (["综合", "hard", "challenge", "challenging"].includes(value)) {
    return "综合";
  }

  if (["冲刺", "sprint", "expert"].includes(value)) {
    return "冲刺";
  }

  return "基础";
}

function normalizeSubject(input) {
  const value = String(input || "").trim();
  const lowered = value.toLowerCase().replace(/\s+/g, "");

  if (["c", "c语言", "c语言程序设计", "clang"].includes(lowered)) {
    return "C 语言程序设计";
  }

  if (["ds", "数据结构", "datastructure", "datastructures"].includes(lowered)) {
    return "数据结构";
  }

  if (["co", "组成原理", "计算机组成", "计算机组成原理", "computerorganization"].includes(lowered)) {
    return "计算机组成原理";
  }

  if (["os", "操作系统", "operatingsystem"].includes(lowered)) {
    return "操作系统";
  }

  if (["cn", "网络", "计算机网络", "computernetwork", "computernetworks"].includes(lowered)) {
    return "计算机网络";
  }

  if (["python", "py"].includes(lowered)) {
    return "Python";
  }

  return value || "数据结构";
}

async function listQuestions({ subject, knowledgePoint, difficulty, limit, studentId } = {}) {
  const normalizedSubject = normalizeSubject(subject);
  const normalizedDifficulty = difficulty ? normalizeDifficulty(difficulty) : "";
  const normalizedLimit = normalizeLimit(limit);
  const params = [normalizedSubject];
  // 教师自建题只在教师自己的班级作业里出现，不进入学生自助练习题库
  // 答题链路只支持单选（见 quizPackQualityService 的同名约束）：题库里的
  // 填空题 / 应用题 / 代码题只用于教师端题库管理与组卷参考，不进入学生自测。
  const where = [
    "subject = ?",
    "COALESCE(is_published, 1) = 1",
    "owner_teacher_id IS NULL",
    "question_type = 'single_choice'",
  ];
  if (studentId) {
    where.push("(owner_student_id IS NULL OR owner_student_id = ?)");
    params.push(Number(studentId));
  } else {
    where.push("owner_student_id IS NULL");
  }

  if (knowledgePoint) {
    // 允许用「知识图谱规范知识点名」筛选：题库里存的是另一套叫法
    // （例如规范名「链表」在题库里是「线性表」，规范名「函数」在题库里是「函数与递归」）。
    // 因此除精确匹配外，再按别名表匹配该规范知识点登记过的别名。
    // 精确匹配分支原样保留，不改变原有行为。
    where.push(`(knowledge_point = ? OR knowledge_point COLLATE utf8mb4_unicode_ci IN (
        SELECT a.alias COLLATE utf8mb4_unicode_ci FROM knowledge_point_aliases a
          JOIN knowledge_points kp ON kp.id = a.knowledge_point_id
         WHERE kp.name = ? AND kp.subject = ? AND kp.status = 'active'
      ))`);
    params.push(
      String(knowledgePoint).trim(),
      String(knowledgePoint).trim(),
      knowledgeBaseSubject(normalizedSubject),
    );
  }

  if (normalizedDifficulty) {
    where.push("difficulty = ?");
    params.push(normalizedDifficulty);
  }

  params.push(normalizedLimit);

  try {
    const [rows] = await pool.query(
      `
        SELECT
          question_id,
          subject,
          chapter,
          knowledge_point,
          question_type,
          difficulty,
          stem,
          code_context,
          option_a,
          option_b,
          option_c,
          option_d,
          answer,
          analysis,
          hint,
          ability_dimension,
          tags,
          stage,
          is_core,
          source,
          owner_student_id,
          source_url,
          source_title,
          source_kind,
          option_error_types
        FROM question_bank
        WHERE ${where.join(" AND ")}
        ORDER BY id ASC
        LIMIT ?
      `,
      params,
    );

    return rows.map(normalizeQuestionRow);
  } catch (error) {
    throw createDatabaseError("查询题库失败", error);
  }
}

async function getQuestionById(questionId, studentId) {
  if (!questionId) {
    return null;
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT
          question_id,
          subject,
          chapter,
          knowledge_point,
          question_type,
          difficulty,
          stem,
          code_context,
          option_a,
          option_b,
          option_c,
          option_d,
          answer,
          analysis,
          hint,
          ability_dimension,
          tags,
          stage,
          is_core,
          source,
          option_error_types
        FROM question_bank
        WHERE question_id = ? AND COALESCE(is_published, 1) = 1
          AND ${studentId ? "(owner_student_id IS NULL OR owner_student_id = ?)" : "owner_student_id IS NULL"}
        LIMIT 1
      `,
      studentId ? [String(questionId).trim(), Number(studentId)] : [String(questionId).trim()],
    );

    return rows[0] ? normalizeQuestionRow(rows[0]) : null;
  } catch (error) {
    throw createDatabaseError("查询题目详情失败", error);
  }
}

function toPublicQuestion(row) {
  return {
    question_id: row.question_id,
    subject: row.subject,
    chapter: row.chapter,
    knowledge_point: row.knowledge_point,
    question_type: row.question_type || "single_choice",
    difficulty: row.difficulty,
    stem: row.stem,
    code_context: row.code_context || "",
    options: [
      { key: "A", content: row.option_a || "" },
      { key: "B", content: row.option_b || "" },
      { key: "C", content: row.option_c || "" },
      { key: "D", content: row.option_d || "" },
    ],
    hint: row.hint || "",
    ability_dimension: row.ability_dimension || "",
    tags: normalizeTags(row.tags),
    source: row.source || "",
    source_url: row.source_url || null,
    source_title: row.source_title || null,
    source_kind: row.source_kind || null,
  };
}

function toFrontendQuestion(row) {
  return {
    id: row.question_id,
    domain: row.subject,
    question: row.stem,
    code: row.code_context || "",
    options: [row.option_a || "", row.option_b || "", row.option_c || "", row.option_d || ""],
    answerIndex: answerToIndex(row.answer),
    explanation: row.analysis || "",
    hint: row.hint || "",
  };
}

function toPublicFrontendQuestion(row) {
  const { answerIndex, explanation, ...question } = toFrontendQuestion(row);
  return question;
}

function answerToIndex(answer) {
  const normalized = String(answer || "")
    .trim()
    .toUpperCase();
  return Math.max(0, ["A", "B", "C", "D"].indexOf(normalized));
}

function normalizeQuestionRow(row) {
  return {
    ...row,
    tags: normalizeTags(row.tags),
    option_error_types: normalizeObject(row.option_error_types),
    is_core: Boolean(row.is_core),
  };
}

function normalizeObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags;
  }

  if (!tags) {
    return [];
  }

  try {
    const parsed = JSON.parse(tags);
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

/**
 * 学生自测组卷：按题型从题库里随机抽题（默认单选 + 填空）。
 * 与 listQuestions 同一套安全过滤：只要已发布、非教师自建、公共题或本人题；
 * 另外只取「能判分」的题——单选题选项齐全且答案在 A-D，填空题有非空答案。
 */
async function pickRandomQuestions({
  subject,
  questionType = "single_choice",
  limit = 6,
  studentId,
  excludeIds = [],
} = {}) {
  const normalizedSubject = normalizeSubject(subject);
  const normalizedLimit = normalizeLimit(limit);
  const params = [normalizedSubject, String(questionType)];
  const where = [
    "subject = ?",
    "question_type = ?",
    "COALESCE(is_published, 1) = 1",
    "owner_teacher_id IS NULL",
  ];
  if (questionType === "fill_blank") {
    where.push("answer IS NOT NULL", "TRIM(answer) <> ''");
  } else {
    where.push("answer REGEXP '^[A-Da-d]$'", "COALESCE(option_a,'') <> ''", "COALESCE(option_d,'') <> ''");
  }
  if (studentId) {
    // 知识检测只用公共题库：学生自己的 AI 生成题（chapter=个性化测验）里出现过
    // 「题干就是知识点名、选项与题干对不上」的退化题，不适合进正式检测。
    // 这里保留 studentId 形参只是为了不改调用方签名。
    where.push("owner_student_id IS NULL");
  } else {
    where.push("owner_student_id IS NULL");
  }
  const excluded = (Array.isArray(excludeIds) ? excludeIds : [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  if (excluded.length) {
    where.push(`question_id NOT IN (${excluded.map(() => "?").join(",")})`);
    params.push(...excluded);
  }
  params.push(normalizedLimit);

  try {
    const [rows] = await pool.query(
      `
        SELECT
          question_id, subject, chapter, knowledge_point, question_type, difficulty,
          stem, code_context, option_a, option_b, option_c, option_d,
          answer, analysis, hint, ability_dimension, tags, stage, is_core,
          source, owner_student_id, source_url, source_title, source_kind, option_error_types
        FROM question_bank
        WHERE ${where.join(" AND ")}
        ORDER BY RAND()
        LIMIT ?
      `,
      params,
    );
    return rows.map(normalizeQuestionRow);
  } catch (error) {
    throw createDatabaseError("查询题库失败", error);
  }
}

/** 按题型统计可抽题数量（前端用来提示“该科目暂无填空题”之类） */
async function countAvailableQuestions({ subject, studentId } = {}) {
  const normalizedSubject = normalizeSubject(subject);
  const params = [normalizedSubject];
  const where = [
    "subject = ?",
    "COALESCE(is_published, 1) = 1",
    "owner_teacher_id IS NULL",
    "question_type IN ('single_choice','fill_blank')",
  ];
  if (studentId) {
    // 与 pickRandomQuestions 口径一致：知识检测只统计公共题库
    where.push("owner_student_id IS NULL");
  } else {
    where.push("owner_student_id IS NULL");
  }
  try {
    const [rows] = await pool.query(
      `SELECT question_type, COUNT(*) AS n FROM question_bank WHERE ${where.join(" AND ")} GROUP BY question_type`,
      params,
    );
    const counts = { single_choice: 0, fill_blank: 0 };
    for (const row of rows) {
      if (row.question_type === "fill_blank") counts.fill_blank = Number(row.n) || 0;
      if (row.question_type === "single_choice") counts.single_choice = Number(row.n) || 0;
    }
    return counts;
  } catch (error) {
    throw createDatabaseError("统计题库失败", error);
  }
}

function createDatabaseError(message, error) {
  const wrapped = new Error(`${message}：${error.message}`);
  wrapped.statusCode = 503;
  wrapped.code = "QUESTION_BANK_DB_ERROR";
  return wrapped;
}

module.exports = {
  listQuestions,
  pickRandomQuestions,
  countAvailableQuestions,
  getQuestionById,
  normalizeDifficulty,
  normalizeSubject,
  toPublicQuestion,
  toFrontendQuestion,
  toPublicFrontendQuestion,
  answerToIndex,
};
