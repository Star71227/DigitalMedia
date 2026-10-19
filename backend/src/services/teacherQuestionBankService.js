/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { assertTeacherRole } = require("./teacherAccessService");

const MAX_LIST_LIMIT = 200;
const DIFFICULTIES = ["基础", "提高", "综合", "冲刺"];

function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function requiredText(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (!text) throw apiError(`${label}不能为空`, 400);
  if (Array.from(text).length > maxLength) throw apiError(`${label}不能超过${maxLength}个字符`, 400);
  return text;
}

function optionalText(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (Array.from(text).length > maxLength) throw apiError(`${label}不能超过${maxLength}个字符`, 400);
  return text;
}

function toTeacherQuestion(row) {
  return {
    questionId: row.question_id,
    subject: row.subject,
    chapter: row.chapter || "",
    knowledgePoint: row.knowledge_point || "",
    difficulty: row.difficulty || "",
    questionType: row.question_type || "single_choice",
    stem: row.stem,
    codeContext: row.code_context || "",
    options: [
      { key: "A", content: row.option_a || "" },
      { key: "B", content: row.option_b || "" },
      { key: "C", content: row.option_c || "" },
      { key: "D", content: row.option_d || "" },
    ],
    // 只有单选题的答案是 A/B/C/D，统一成大写；填空题答案是表达式或术语
    // （如 "2i|O(n)"、"ssthresh"），转大写会破坏语义。
    answer:
      String(row.question_type || "single_choice").trim() === "single_choice"
        ? String(row.answer || "")
            .trim()
            .toUpperCase()
        : String(row.answer || "").trim(),
    analysis: row.analysis || "",
    mine: Number(row.owner_teacher_id || 0) > 0,
    source: row.source || "",
    createdAt: row.created_at,
  };
}

async function listQuestionBankSubjects(user) {
  const role = assertTeacherRole(user);
  const params = [];
  const ownExpression = role === "ADMIN" ? "0" : "SUM(CASE WHEN owner_teacher_id = ? THEN 1 ELSE 0 END)";
  // 教师只统计「公共题库 + 自己的题」
  const ownerScope = role === "ADMIN" ? "" : "AND (owner_teacher_id IS NULL OR owner_teacher_id = ?)";
  if (role !== "ADMIN") params.push(user.userId, user.userId);
  const [rows] = await pool.query(
    `SELECT subject,
            COUNT(*) AS question_count,
            ${ownExpression} AS own_count
       FROM question_bank
      WHERE COALESCE(is_published, 1) = 1 AND answer IS NOT NULL AND answer <> '' AND owner_student_id IS NULL
        ${ownerScope}
      GROUP BY subject
      ORDER BY question_count DESC, subject`,
    params,
  );
  return rows.map((row) => ({
    subject: row.subject,
    questionCount: Number(row.question_count || 0),
    ownCount: Number(row.own_count || 0),
  }));
}

async function listQuestions(user, filters = {}) {
  const role = assertTeacherRole(user);
  const limit = Math.min(Math.max(Number(filters.limit) || MAX_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const where = ["COALESCE(is_published, 1) = 1", "owner_student_id IS NULL"];
  const params = [];
  // 只能看到「公共题库 + 自己出的题」，看不到其他老师自建的题
  if (role !== "ADMIN") {
    where.push("(owner_teacher_id IS NULL OR owner_teacher_id = ?)");
    params.push(user.userId);
  }

  const subject = String(filters.subject ?? "").trim();
  if (subject && subject !== "全部") {
    where.push("subject = ?");
    params.push(subject);
  }
  // 难度筛选：基础 / 综合 / 提高（DIFFICULTIES 中的「冲刺」当前题库没有数据，保留给后续使用）
  const difficulty = String(filters.difficulty ?? "").trim();
  if (difficulty && difficulty !== "全部") {
    where.push("difficulty = ?");
    params.push(difficulty);
  }
  // 题型筛选：题库里同时存在单选题、填空题、应用题与代码题
  const questionType = String(filters.questionType ?? "").trim();
  if (questionType && questionType !== "全部") {
    where.push("question_type = ?");
    params.push(questionType);
  }
  const keyword = String(filters.keyword ?? "").trim();
  if (keyword) {
    if (keyword.length > 100) throw apiError("搜索关键词过长", 400);
    where.push("(stem LIKE ? OR knowledge_point LIKE ? OR question_id LIKE ?)");
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  if (String(filters.scope ?? "").toLowerCase() === "mine") {
    where.push("owner_teacher_id = ?");
    params.push(user.userId);
  }

  const [rows] = await pool.query(
    `SELECT question_id, subject, chapter, knowledge_point, difficulty, question_type, stem, code_context,
            option_a, option_b, option_c, option_d, answer, analysis, owner_teacher_id, source, created_at
       FROM question_bank
      WHERE ${where.join(" AND ")}
      ORDER BY (owner_teacher_id = ?) DESC, created_at DESC, id DESC
      LIMIT ?`,
    [...params, role === "ADMIN" ? 0 : user.userId, limit],
  );

  return {
    data: rows.map(toTeacherQuestion),
    limit,
  };
}

async function createQuestion(user, input = {}) {
  const role = assertTeacherRole(user);
  if (role === "ADMIN") {
    // ADMIN 也能建题，但题目标记为平台题（不归属某个老师）
  }
  const subject = requiredText(input.subject, 100, "科目");
  const stem = requiredText(input.stem, 1000, "题干");
  const options = Array.isArray(input.options) ? input.options : null;
  const optionTexts =
    options && options.length === 4
      ? options.map(
          (item, index) =>
            String(item ?? "").trim() || requiredText("", 500, `选项${["A", "B", "C", "D"][index]}`),
        )
      : null;
  if (!optionTexts) throw apiError("需要提供 A、B、C、D 四个选项", 400, "INVALID_OPTIONS");
  for (let index = 0; index < optionTexts.length; index += 1) {
    if (Array.from(optionTexts[index]).length > 500)
      throw apiError(`选项${["A", "B", "C", "D"][index]}不能超过500个字符`, 400);
  }
  const answer = requiredText(input.answer, 4, "正确答案").toUpperCase();
  if (!/^[ABCD]$/.test(answer)) throw apiError("正确答案必须是 A、B、C 或 D", 400, "INVALID_ANSWER");

  const difficulty = optionalText(input.difficulty, 50, "难度");
  const knowledgePoint = optionalText(input.knowledgePoint ?? input.knowledge_point, 100, "知识点");
  const chapter = optionalText(input.chapter, 100, "章节");
  const analysis = optionalText(input.analysis, 2000, "解析");
  const codeContext = optionalText(input.codeContext ?? input.code_context, 2000, "代码片段");

  const questionId = `TQ-${user.userId}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await pool.query(
    `INSERT INTO question_bank
       (question_id, subject, chapter, knowledge_point, question_type, difficulty, stem, code_context,
        option_a, option_b, option_c, option_d, answer, analysis, source, is_core, is_published, owner_teacher_id)
     VALUES (?, ?, ?, ?, 'single_choice', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher_authored', 1, 1, ?)`,
    [
      questionId,
      subject,
      chapter,
      knowledgePoint,
      difficulty,
      stem,
      codeContext,
      optionTexts[0],
      optionTexts[1],
      optionTexts[2],
      optionTexts[3],
      answer,
      analysis,
      role === "ADMIN" ? null : user.userId,
    ],
  );

  const [[row]] = await pool.query(
    `SELECT question_id, subject, chapter, knowledge_point, difficulty, question_type, stem, code_context,
            option_a, option_b, option_c, option_d, answer, analysis, owner_teacher_id, source, created_at
       FROM question_bank WHERE question_id = ? LIMIT 1`,
    [questionId],
  );
  return toTeacherQuestion(row);
}

async function deleteQuestion(user, questionIdInput) {
  assertTeacherRole(user);
  const questionId = String(questionIdInput ?? "").trim();
  if (!questionId) throw apiError("questionId 不能为空", 400);

  const [[question]] = await pool.query(
    "SELECT question_id, owner_teacher_id FROM question_bank WHERE question_id = ? LIMIT 1",
    [questionId],
  );
  if (!question) throw apiError("题目不存在", 404);
  if (Number(question.owner_teacher_id || 0) !== Number(user.userId)) {
    throw apiError("只能删除自己添加的题目", 403);
  }

  const [[used]] = await pool.query(
    "SELECT COUNT(*) AS count FROM assignment_questions WHERE question_id = ?",
    [questionId],
  );
  if (Number(used.count || 0) > 0) {
    throw apiError("该题目已被作业使用，无法删除", 409, "QUESTION_IN_USE");
  }

  await pool.query("DELETE FROM question_bank WHERE question_id = ? AND owner_teacher_id = ?", [
    questionId,
    user.userId,
  ]);
  return { questionId, deleted: true };
}

module.exports = {
  DIFFICULTIES,
  createQuestion,
  deleteQuestion,
  listQuestionBankSubjects,
  listQuestions,
};
