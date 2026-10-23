/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { assertTeacherRole, assertTeacherCanAccessClass, positiveId } = require("./teacherAccessService");
const { submitQuiz } = require("./quizSubmissionService");
const { judgeSubmission, assertSupportedLanguage } = require("./codeJudgeService");
const { saveCodeSubmission } = require("./codeSubmissionService");

const MAX_QUESTIONS_PER_ASSIGNMENT = 50;
const DEFAULT_QUESTIONS_PER_ASSIGNMENT = 5;
// 一份作业最多挂多少道 CodeLab 代码题：代码题在学生端 CodeLab 环境里作答，提交后后台自动判题
const MAX_CODE_EXERCISES_PER_ASSIGNMENT = 10;
// 简答题（open_question_bank）单独限流：主观题作答成本高，一份作业不宜太多
const MAX_OPEN_QUESTIONS_PER_ASSIGNMENT = 10;
const ASSIGNMENT_STATUSES = new Set(["published", "closed"]);

function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function studentIdOf(user) {
  const id = Number(user?.studentId ?? user?.userId);
  if (!Number.isInteger(id) || id <= 0) throw apiError("无法确认学生身份", 403);
  return id;
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

function positiveCount(value, fallback, max, label) {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > max) {
    throw apiError(`${label}需为1至${max}之间的整数`, 400);
  }
  return candidate;
}

function optionalDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw apiError(`${label}格式不正确`, 400);
  return date;
}

function questionOptions(row) {
  return [
    { key: "A", content: row.option_a || "" },
    { key: "B", content: row.option_b || "" },
    { key: "C", content: row.option_c || "" },
    { key: "D", content: row.option_d || "" },
  ];
}

function toPublicAssignmentQuestion(row) {
  return {
    question_id: row.question_id,
    subject: row.subject,
    chapter: row.chapter,
    knowledge_point: row.knowledge_point,
    question_type: row.question_type || "single_choice",
    difficulty: row.difficulty,
    stem: row.stem,
    code_context: row.code_context || "",
    options: questionOptions(row),
    hint: row.hint || "",
  };
}

function toTeacherAssignmentQuestion(row, orderIndex) {
  return {
    ...toPublicAssignmentQuestion(row),
    orderIndex: Number(orderIndex),
    // 只有单选题的答案是 A-D 选项字母，可以统一大写；
    // 填空题答案是表达式/术语（如 "2^k-1"、"递增|升序"），转大写会破坏语义。
    answer:
      String(row.question_type || "single_choice").trim() === "single_choice"
        ? String(row.answer || "")
            .trim()
            .toUpperCase()
        : String(row.answer || "").trim(),
    analysis: row.analysis || "",
    answerCount: Number(row.answer_count || 0),
    correctCount: Number(row.correct_count || 0),
    correctRate:
      Number(row.answer_count || 0) > 0
        ? Math.round((Number(row.correct_count || 0) / Number(row.answer_count)) * 100)
        : null,
  };
}

async function listQuestionBankSubjects() {
  const [rows] = await pool.query(
    `SELECT subject, COUNT(*) AS question_count
       FROM question_bank
      WHERE COALESCE(is_published, 1) = 1 AND answer IS NOT NULL AND answer <> ''
      GROUP BY subject
      ORDER BY question_count DESC, subject`,
  );
  return rows.map((row) => ({ subject: row.subject, questionCount: Number(row.question_count) }));
}

async function listManagedClasses(user) {
  const role = assertTeacherRole(user);
  const params = [];
  let where = "c.status = 'active'";
  if (role !== "ADMIN") {
    where += " AND c.teacher_id = ?";
    params.push(user.userId);
  }
  const [rows] = await pool.query(
    `SELECT c.id, c.class_name, c.subject,
            (SELECT COUNT(*) FROM teacher_class_students s WHERE s.class_id = c.id AND s.status = 'active') AS student_count
       FROM teacher_classes c
      WHERE ${where}
      ORDER BY c.id`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    className: row.class_name,
    subject: row.subject,
    studentCount: Number(row.student_count || 0),
  }));
}

// 代码题 ID 归一化：去空、去重、限流
function normalizeCodeExerciseIds(value) {
  const list = Array.isArray(value) ? value : [];
  const ids = [...new Set(list.map((item) => String(item ?? "").trim()).filter(Boolean))];
  if (ids.length > MAX_CODE_EXERCISES_PER_ASSIGNMENT) {
    throw apiError(`一份作业最多挂 ${MAX_CODE_EXERCISES_PER_ASSIGNMENT} 道代码题`, 400);
  }
  return ids;
}

// 教师端发布作业时的代码题候选：只下发题面、样例与用例数量，隐藏用例与参考题解不下发
async function listAssignmentCodeExercises(user, filters = {}) {
  assertTeacherRole(user);
  const subject = String(filters.subject ?? "").trim();
  const params = [];
  const where = ["COALESCE(is_published, 1) = 1"];
  if (subject && subject !== "全部") {
    where.push("subject = ?");
    params.push(subject);
  }
  const [rows] = await pool.query(
    `SELECT e.exercise_id, e.subject, e.knowledge_point, e.title, e.description, e.language, e.difficulty,
            (SELECT COUNT(*) FROM code_test_cases t WHERE t.exercise_id = e.exercise_id) AS case_count,
            (SELECT COUNT(*) FROM code_test_cases t WHERE t.exercise_id = e.exercise_id AND t.visibility = 'hidden') AS hidden_count
       FROM code_exercises e
      WHERE ${where.join(" AND ")}
      ORDER BY e.subject, e.exercise_id`,
    params,
  );
  return {
    data: rows.map((row) => ({
      exerciseId: row.exercise_id,
      subject: row.subject,
      knowledgePoint: row.knowledge_point || "",
      title: row.title,
      description: row.description || "",
      language: row.language || "c",
      difficulty: row.difficulty || "",
      caseCount: Number(row.case_count || 0),
      hiddenCount: Number(row.hidden_count || 0),
    })),
  };
}

async function createAssignment(user, input = {}) {
  const role = assertTeacherRole(user);
  const classId = positiveId(input.classId, "classId");
  await assertTeacherCanAccessClass(user, classId);

  const title = requiredText(input.title, 160, "作业标题");
  const description = optionalText(input.description, 500, "作业说明");
  const subject = requiredText(input.subject, 120, "科目");
  const dueAt = optionalDate(input.dueAt, "截止时间");

  const [[classRow]] = await pool.query("SELECT id, class_name FROM teacher_classes WHERE id = ? LIMIT 1", [
    classId,
  ]);
  if (!classRow) throw apiError("班级不存在", 404);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 组卷只能用「公共题库 + 自己出的题」，不能用其他老师自建的题
    const ownerScope = role === "ADMIN" ? "" : " AND (owner_teacher_id IS NULL OR owner_teacher_id = ?)";
    const ownerScopeParams = role === "ADMIN" ? [] : [user.userId];

    let questionIds = [];
    const explicitQuestionIds = Array.isArray(input.questionIds)
      ? [...new Set(input.questionIds.map((value) => String(value ?? "").trim()).filter(Boolean))]
      : [];
    const codeExerciseIds = normalizeCodeExerciseIds(input.codeExerciseIds);
    // 填空 / 简答的 id 先在这里归一化：下面判断「要不要自动抽单选」时必须能看到它们
    const fillBlankIds = Array.isArray(input.fillBlankIds)
      ? [...new Set(input.fillBlankIds.map((value) => String(value ?? "").trim()).filter(Boolean))]
      : [];
    const openQuestionIds = Array.isArray(input.openQuestionIds)
      ? [...new Set(input.openQuestionIds.map((value) => String(value ?? "").trim()).filter(Boolean))]
      : [];

    // 是否要自动抽单选题。
    // 以前这里只看「有没有代码题」，导致「只挂填空题 / 简答题」的作业：
    //   传 questionCount:0 -> 报「题目数量需为1至50之间」；不传 -> 反而被塞进 5 道单选。
    // 现在改成：只有老师明确要单选（显式给了 questionCount>0），或这份作业压根没挂任何
    // 填空/简答/代码题（即传统的自动抽题模式）时，才自动抽单选。
    const requestedQuestionCount =
      input.questionCount === undefined || input.questionCount === null || input.questionCount === ""
        ? null
        : Number(input.questionCount);
    const hasManualNonChoice =
      fillBlankIds.length > 0 || openQuestionIds.length > 0 || codeExerciseIds.length > 0;
    const autoPickSingleChoice =
      !explicitQuestionIds.length &&
      (requestedQuestionCount === null ? !hasManualNonChoice : requestedQuestionCount > 0);

    if (explicitQuestionIds.length) {
      questionIds = explicitQuestionIds;
      if (questionIds.length > MAX_QUESTIONS_PER_ASSIGNMENT) {
        throw apiError(`题目数量需为1至${MAX_QUESTIONS_PER_ASSIGNMENT}之间`, 400);
      }
      const placeholders = questionIds.map(() => "?").join(",");
      const [rows] = await connection.query(
        `SELECT question_id FROM question_bank WHERE question_id IN (${placeholders}) AND COALESCE(is_published, 1) = 1 AND owner_student_id IS NULL AND question_type = 'single_choice'${ownerScope}`,
        [...questionIds, ...ownerScopeParams],
      );
      if (rows.length !== questionIds.length) throw apiError("部分题目不存在或未发布", 400);
    } else if (autoPickSingleChoice) {
      const questionCount = positiveCount(
        input.questionCount,
        DEFAULT_QUESTIONS_PER_ASSIGNMENT,
        MAX_QUESTIONS_PER_ASSIGNMENT,
        "题目数量",
      );
      const [rows] = await connection.query(
        `SELECT question_id FROM question_bank
          WHERE subject = ? AND COALESCE(is_published, 1) = 1 AND answer IS NOT NULL AND answer <> ''
            AND owner_student_id IS NULL AND question_type = 'single_choice'${ownerScope}
          ORDER BY (owner_teacher_id = ?) DESC, question_id
          LIMIT ?`,
        [subject, ...ownerScopeParams, user.userId, questionCount],
      );
      if (rows.length < questionCount) {
        throw apiError(
          `科目「${subject}」当前可用题目只有 ${rows.length} 道，少于需要的 ${questionCount} 道`,
          400,
        );
      }
      questionIds = rows.map((row) => row.question_id);
    }

    // 填空题：已在上面归一化，这里只做校验
    if (fillBlankIds.length) {
      if (fillBlankIds.length > MAX_QUESTIONS_PER_ASSIGNMENT) {
        throw apiError(`填空题数量需为1至${MAX_QUESTIONS_PER_ASSIGNMENT}之间`, 400);
      }
      const placeholders = fillBlankIds.map(() => "?").join(",");
      const [rows] = await connection.query(
        `SELECT question_id FROM question_bank
          WHERE question_id IN (${placeholders}) AND COALESCE(is_published, 1) = 1
            AND owner_student_id IS NULL AND question_type = 'fill_blank'${ownerScope}`,
        [...fillBlankIds, ...ownerScopeParams],
      );
      if (rows.length !== fillBlankIds.length) throw apiError("部分填空题不存在、未发布或题型不符", 400);
    }

    // 简答题：来自 open_question_bank，单独一张关联表保存（已在上方归一化）
    if (openQuestionIds.length) {
      if (openQuestionIds.length > MAX_OPEN_QUESTIONS_PER_ASSIGNMENT) {
        throw apiError(`简答题数量需为1至${MAX_OPEN_QUESTIONS_PER_ASSIGNMENT}之间`, 400);
      }
      const placeholders = openQuestionIds.map(() => "?").join(",");
      const [rows] = await connection.query(
        `SELECT question_id FROM open_question_bank WHERE question_id IN (${placeholders}) AND subject = ?`,
        [...openQuestionIds, subject],
      );
      if (rows.length !== openQuestionIds.length) throw apiError("部分简答题不存在或不属于该科目", 400);
    }

    if (codeExerciseIds.length) {
      const placeholders = codeExerciseIds.map(() => "?").join(",");
      const [rows] = await connection.query(
        `SELECT exercise_id FROM code_exercises
          WHERE exercise_id IN (${placeholders}) AND COALESCE(is_published, 1) = 1 AND subject = ?`,
        [...codeExerciseIds, subject],
      );
      if (rows.length !== codeExerciseIds.length) {
        throw apiError("部分代码题不存在、未发布或不属于该科目", 400);
      }
    }

    if (!questionIds.length && !fillBlankIds.length && !openQuestionIds.length && !codeExerciseIds.length) {
      throw apiError("作业至少要包含一道题目（单选题 / 填空题 / 简答题）或一道代码题", 400);
    }

    const [result] = await connection.query(
      `INSERT INTO assignments (teacher_id, class_id, title, description, subject, status, due_at, question_count)
       VALUES (?, ?, ?, ?, ?, 'published', ?, ?)`,
      [
        role === "ADMIN" && input.teacherId ? positiveId(input.teacherId, "teacherId") : user.userId,
        classId,
        title,
        description,
        subject,
        dueAt,
        questionIds.length + fillBlankIds.length,
      ],
    );
    const assignmentId = Number(result.insertId);

    let orderIndex = 0;
    for (const questionId of [...questionIds, ...fillBlankIds]) {
      orderIndex += 1;
      await connection.query(
        "INSERT INTO assignment_questions (assignment_id, question_id, order_index) VALUES (?, ?, ?)",
        [assignmentId, questionId, orderIndex],
      );
    }

    let openOrderIndex = 0;
    for (const openQuestionId of openQuestionIds) {
      openOrderIndex += 1;
      await connection.query(
        "INSERT INTO assignment_open_questions (assignment_id, open_question_id, order_index) VALUES (?, ?, ?)",
        [assignmentId, openQuestionId, openOrderIndex],
      );
    }

    let codeOrderIndex = 0;
    for (const exerciseId of codeExerciseIds) {
      codeOrderIndex += 1;
      await connection.query(
        "INSERT INTO assignment_code_exercises (assignment_id, exercise_id, order_index) VALUES (?, ?, ?)",
        [assignmentId, exerciseId, codeOrderIndex],
      );
    }

    await connection.commit();
    return {
      id: assignmentId,
      classId,
      className: classRow.class_name,
      title,
      description,
      subject,
      status: "published",
      dueAt,
      questionCount: questionIds.length + fillBlankIds.length,
      singleChoiceCount: questionIds.length,
      fillBlankCount: fillBlankIds.length,
      openQuestionCount: openQuestionIds.length,
      codeExerciseCount: codeExerciseIds.length,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function listTeacherAssignments(user) {
  const role = assertTeacherRole(user);
  const params = [];
  let where = "";
  if (role !== "ADMIN") {
    where = "WHERE a.teacher_id = ?";
    params.push(user.userId);
  }
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.description, a.subject, a.status, a.due_at, a.created_at,
            a.class_id, c.class_name,
            (SELECT COUNT(*) FROM assignment_questions aq WHERE aq.assignment_id = a.id) AS question_count,
            (SELECT COUNT(*) FROM teacher_class_students s WHERE s.class_id = a.class_id AND s.status = 'active') AS student_count,
            (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.assignment_id = a.id) AS submitted_count,
            (SELECT AVG(qa.score) FROM quiz_attempts qa WHERE qa.assignment_id = a.id) AS average_score,
            (SELECT COUNT(*) FROM assignment_code_exercises ace WHERE ace.assignment_id = a.id) AS code_exercise_count,
            (SELECT COUNT(DISTINCT cs.exercise_id, cs.student_id) FROM code_submissions cs
              WHERE cs.assignment_id = a.id AND cs.mode = 'submit') AS code_submitted_count
       FROM assignments a
       JOIN teacher_classes c ON c.id = a.class_id
       ${where}
      ORDER BY a.created_at DESC, a.id DESC`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    description: row.description || "",
    subject: row.subject,
    status: row.status,
    dueAt: row.due_at,
    createdAt: row.created_at,
    classId: Number(row.class_id),
    className: row.class_name,
    questionCount: Number(row.question_count || 0),
    studentCount: Number(row.student_count || 0),
    submittedCount: Number(row.submitted_count || 0),
    codeExerciseCount: Number(row.code_exercise_count || 0),
    codeSubmittedCount: Number(row.code_submitted_count || 0),
    averageScore:
      row.average_score === null || row.average_score === undefined
        ? null
        : Math.round(Number(row.average_score)),
  }));
}

async function loadTeacherAssignment(user, assignmentIdInput) {
  const role = assertTeacherRole(user);
  const assignmentId = positiveId(assignmentIdInput, "assignmentId");
  const params = [assignmentId];
  let where = "a.id = ?";
  if (role !== "ADMIN") {
    where += " AND a.teacher_id = ?";
    params.push(user.userId);
  }
  const [[row]] = await pool.query(
    `SELECT a.id, a.teacher_id, a.class_id, a.title, a.description, a.subject, a.status, a.due_at, a.created_at,
            c.class_name
       FROM assignments a
       JOIN teacher_classes c ON c.id = a.class_id
      WHERE ${where}
      LIMIT 1`,
    params,
  );
  if (!row) throw apiError("作业不存在或无权访问", 404);
  return row;
}

async function getTeacherAssignmentDetail(user, assignmentIdInput) {
  const assignment = await loadTeacherAssignment(user, assignmentIdInput);
  const assignmentId = Number(assignment.id);

  const [questionRows] = await pool.query(
    `SELECT aq.order_index, qb.question_id, qb.subject, qb.chapter, qb.knowledge_point, qb.question_type,
            qb.difficulty, qb.stem, qb.code_context, qb.option_a, qb.option_b, qb.option_c, qb.option_d,
            qb.answer, qb.analysis, qb.hint,
            COUNT(qaa.id) AS answer_count,
            SUM(CASE WHEN qaa.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
       FROM assignment_questions aq
       JOIN question_bank qb ON qb.question_id = aq.question_id
       LEFT JOIN quiz_attempts qa ON qa.assignment_id = aq.assignment_id
       LEFT JOIN quiz_attempt_answers qaa ON qaa.attempt_id = qa.id AND qaa.question_id = aq.question_id
      WHERE aq.assignment_id = ?
      GROUP BY aq.id, aq.order_index, qb.question_id, qb.subject, qb.chapter, qb.knowledge_point, qb.question_type,
               qb.difficulty, qb.stem, qb.code_context, qb.option_a, qb.option_b, qb.option_c, qb.option_d,
               qb.answer, qb.analysis, qb.hint
      ORDER BY aq.order_index, aq.id`,
    [assignmentId],
  );

  const [studentRows] = await pool.query(
    `SELECT u.id AS student_id, u.username, u.display_name,
            qa.id AS attempt_id, qa.score, qa.correct_count, qa.total_count, qa.submitted_at,
            (SELECT COUNT(*) FROM assignment_open_answers oaa
              WHERE oaa.assignment_id = ? AND oaa.student_id = u.id) AS open_answer_count
       FROM teacher_class_students tcs
       JOIN users u ON u.id = tcs.student_id
       LEFT JOIN quiz_attempts qa ON qa.assignment_id = ? AND qa.student_id = u.id
      WHERE tcs.class_id = ? AND tcs.status = 'active'
      ORDER BY u.id`,
    [assignmentId, assignmentId, Number(assignment.class_id)],
  );

  const [codeExerciseRows] = await pool.query(
    `SELECT ace.exercise_id, ace.order_index, e.subject, e.knowledge_point, e.title, e.description,
            e.language, e.difficulty,
            (SELECT COUNT(*) FROM code_test_cases t WHERE t.exercise_id = e.exercise_id) AS case_count,
            (SELECT COUNT(*) FROM code_test_cases t WHERE t.exercise_id = e.exercise_id AND t.visibility = 'hidden') AS hidden_count
       FROM assignment_code_exercises ace
       JOIN code_exercises e ON e.exercise_id = ace.exercise_id
      WHERE ace.assignment_id = ?
      ORDER BY ace.order_index, ace.id`,
    [assignmentId],
  );

  const [codeSubmissionRows] = await pool.query(
    `SELECT s.id, s.exercise_id, s.student_id, s.status, s.passed_count, s.total_count, s.execution_mode, s.created_at,
            s.language, s.source_code, s.compile_output, s.result_json,
            u.display_name
       FROM code_submissions s
       JOIN users u ON u.id = s.student_id
       JOIN teacher_class_students tcs ON tcs.student_id = s.student_id AND tcs.class_id = ? AND tcs.status = 'active'
      WHERE s.assignment_id = ? AND s.mode = 'submit'
      ORDER BY s.id DESC`,
    [Number(assignment.class_id), assignmentId],
  );

  const codeExercises = codeExerciseRows.map((row) => {
    const mine = codeSubmissionRows.filter((item) => item.exercise_id === row.exercise_id);
    const latestByStudent = new Map();
    for (const item of mine) {
      if (!latestByStudent.has(Number(item.student_id))) latestByStudent.set(Number(item.student_id), item);
    }
    const submissions = [...latestByStudent.values()].map((item) => ({
      submissionId: Number(item.id),
      studentId: Number(item.student_id),
      studentName: item.display_name,
      status: item.status,
      accepted: item.status === "accepted",
      passedCount: Number(item.passed_count || 0),
      totalCount: Number(item.total_count || 0),
      executionMode: item.execution_mode || "",
      language: item.language || row.language || "c",
      sourceCode: item.source_code || "",
      compileOutput: String(item.compile_output || "").slice(0, 4000),
      submittedAt: item.created_at,
    }));
    return {
      exerciseId: row.exercise_id,
      orderIndex: Number(row.order_index),
      subject: row.subject,
      knowledgePoint: row.knowledge_point || "",
      title: row.title || row.exercise_id,
      description: row.description || "",
      language: row.language || "c",
      difficulty: row.difficulty || "",
      caseCount: Number(row.case_count || 0),
      hiddenCount: Number(row.hidden_count || 0),
      submissions,
      submittedCount: submissions.length,
      acceptedCount: submissions.filter((item) => item.accepted).length,
    };
  });

  // 每个学生的逐题作答明细（选了哪个选项/填了什么、正确答案、对错），供教师端查看
  const [answerRows] = await pool.query(
    `SELECT qa.student_id, qaa.question_id, qaa.selected_answer, qaa.correct_answer, qaa.is_correct,
            qb.question_type
       FROM quiz_attempts qa
       JOIN quiz_attempt_answers qaa ON qaa.attempt_id = qa.id
       JOIN question_bank qb ON qb.question_id = qaa.question_id
      WHERE qa.assignment_id = ?
      ORDER BY qa.student_id, qaa.id`,
    [assignmentId],
  );

  // 简答题：题干 + 每个学生的文本作答（主观题，不参与自动评分，供教师端查看）
  const [openQuestionRows] = await pool.query(
    `SELECT aoq.order_index, oq.question_id, oq.subject, oq.chapter, oq.knowledge_point, oq.difficulty, oq.prompt
       FROM assignment_open_questions aoq
       JOIN open_question_bank oq ON oq.question_id = aoq.open_question_id
      WHERE aoq.assignment_id = ?
      ORDER BY aoq.order_index, aoq.id`,
    [assignmentId],
  );

  const [openAnswerRows] = await pool.query(
    `SELECT oaa.student_id, oaa.open_question_id, oaa.answer_text, oaa.created_at
       FROM assignment_open_answers oaa
      WHERE oaa.assignment_id = ?`,
    [assignmentId],
  );

  const students = studentRows.map((row) => {
    const hasAttempt = row.attempt_id !== null && row.attempt_id !== undefined;
    const openAnswerCount = Number(row.open_answer_count || 0);
    const submitted = hasAttempt || openAnswerCount > 0;
    return {
      studentId: Number(row.student_id),
      username: row.username,
      displayName: row.display_name,
      submitted,
      status: submitted ? "submitted" : "pending",
      score: hasAttempt ? Number(row.score) : null,
      correctCount: hasAttempt ? Number(row.correct_count) : null,
      totalCount: hasAttempt ? Number(row.total_count) : null,
      submittedAt: submitted ? row.submitted_at : null,
      openAnswerCount,
      answers: hasAttempt
        ? answerRows
            .filter((item) => Number(item.student_id) === Number(row.student_id))
            .map((item) => ({
              questionId: item.question_id,
              questionType: item.question_type || "single_choice",
              selectedAnswer: item.selected_answer || "",
              correctAnswer: item.correct_answer || "",
              isCorrect: Number(item.is_correct) === 1,
            }))
        : [],
      openAnswers: openAnswerRows
        .filter((item) => Number(item.student_id) === Number(row.student_id))
        .map((item) => ({
          openQuestionId: item.open_question_id,
          answer: item.answer_text || "",
          submittedAt: item.created_at,
        })),
    };
  });

  const submittedList = students.filter((item) => item.submitted);
  const scored = students.filter((item) => item.submitted && item.totalCount);
  // 平均分只在「有客观题作答记录」的学生里算：只交了简答题的学生没有自动分，不能按 0 拉低平均
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, item) => sum + Number(item.score || 0), 0) / scored.length)
    : null;
  const averageCorrectRate = scored.length
    ? Math.round(
        (scored.reduce((sum, item) => sum + Number(item.correctCount || 0) / Number(item.totalCount), 0) /
          scored.length) *
          100,
      )
    : null;

  return {
    assignment: {
      id: assignmentId,
      title: assignment.title,
      description: assignment.description || "",
      subject: assignment.subject,
      status: assignment.status,
      dueAt: assignment.due_at,
      createdAt: assignment.created_at,
      classId: Number(assignment.class_id),
      className: assignment.class_name,
      questionCount: questionRows.length,
      fillBlankCount: questionRows.filter((row) => String(row.question_type || "").trim() === "fill_blank")
        .length,
      openQuestionCount: openQuestionRows.length,
      codeExerciseCount: codeExercises.length,
    },
    questions: questionRows.map((row) => toTeacherAssignmentQuestion(row, row.order_index)),
    openQuestions: openQuestionRows.map((row) => ({
      openQuestionId: row.question_id,
      orderIndex: Number(row.order_index),
      subject: row.subject,
      chapter: row.chapter || "",
      knowledgePoint: row.knowledge_point || "",
      difficulty: row.difficulty || "",
      prompt: row.prompt,
      answeredCount: openAnswerRows.filter((item) => item.open_question_id === row.question_id).length,
    })),
    codeExercises,
    students,
    summary: {
      studentCount: students.length,
      submittedCount: submittedList.length,
      pendingCount: students.length - submittedList.length,
      averageScore,
      averageCorrectRate,
      pendingStudents: students.filter((item) => !item.submitted).map((item) => item.displayName),
      fillBlankCount: questionRows.filter((row) => String(row.question_type || "").trim() === "fill_blank")
        .length,
      openQuestionCount: openQuestionRows.length,
      openAnsweredCount: students.filter((item) => item.openAnswerCount > 0).length,
      codeExerciseCount: codeExercises.length,
      codeSubmittedCount: codeExercises.reduce((sum, item) => sum + item.submittedCount, 0),
      codeAcceptedCount: codeExercises.reduce((sum, item) => sum + item.acceptedCount, 0),
    },
  };
}

async function loadAssignmentForStudent(studentId, assignmentIdInput) {
  const assignmentId = positiveId(assignmentIdInput, "assignmentId");
  const [[row]] = await pool.query(
    `SELECT a.id, a.class_id, a.title, a.description, a.subject, a.status, a.due_at, a.created_at,
            c.class_name, t.display_name AS teacher_name
       FROM assignments a
       JOIN teacher_class_students tcs ON tcs.class_id = a.class_id AND tcs.student_id = ? AND tcs.status = 'active'
       JOIN teacher_classes c ON c.id = a.class_id AND c.status = 'active'
       JOIN users t ON t.id = a.teacher_id
      WHERE a.id = ? AND a.status IN ('published', 'closed')
      LIMIT 1`,
    [studentId, assignmentId],
  );
  if (!row) throw apiError("作业不存在，或你不在该作业所属班级", 404);
  return row;
}

async function listStudentAssignments(user) {
  const studentId = studentIdOf(user);
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.description, a.subject, a.status, a.due_at, a.created_at,
            c.class_name, t.display_name AS teacher_name,
            (SELECT COUNT(*) FROM assignment_questions aq WHERE aq.assignment_id = a.id) AS question_count,
            (SELECT COUNT(*) FROM assignment_code_exercises ace WHERE ace.assignment_id = a.id) AS code_exercise_count,
            (SELECT COUNT(DISTINCT cs.exercise_id) FROM code_submissions cs
              WHERE cs.assignment_id = a.id AND cs.student_id = ? AND cs.mode = 'submit') AS my_code_submission_count,
            (SELECT COUNT(DISTINCT cs.exercise_id) FROM code_submissions cs
              WHERE cs.assignment_id = a.id AND cs.student_id = ? AND cs.mode = 'submit' AND cs.status = 'accepted') AS my_code_accepted_count,
            qa.id AS attempt_id, qa.score, qa.correct_count, qa.total_count, qa.submitted_at
       FROM assignments a
       JOIN teacher_class_students tcs ON tcs.class_id = a.class_id AND tcs.student_id = ? AND tcs.status = 'active'
       JOIN teacher_classes c ON c.id = a.class_id AND c.status = 'active'
       JOIN users t ON t.id = a.teacher_id
       LEFT JOIN quiz_attempts qa ON qa.assignment_id = a.id AND qa.student_id = ?
      WHERE a.status IN ('published', 'closed')
      ORDER BY a.created_at DESC, a.id DESC`,
    [studentId, studentId, studentId, studentId],
  );
  return rows.map((row) => {
    const submitted = row.attempt_id !== null && row.attempt_id !== undefined;
    return {
      id: Number(row.id),
      title: row.title,
      description: row.description || "",
      subject: row.subject,
      status: row.status,
      dueAt: row.due_at,
      createdAt: row.created_at,
      className: row.class_name,
      teacherName: row.teacher_name,
      questionCount: Number(row.question_count || 0),
      codeExerciseCount: Number(row.code_exercise_count || 0),
      codeSubmittedCount: Number(row.my_code_submission_count || 0),
      codeAcceptedCount: Number(row.my_code_accepted_count || 0),
      submitted,
      score: submitted ? Number(row.score) : null,
      correctCount: submitted ? Number(row.correct_count) : null,
      totalCount: submitted ? Number(row.total_count) : null,
      submittedAt: submitted ? row.submitted_at : null,
    };
  });
}

async function getStudentAssignment(user, assignmentIdInput) {
  const studentId = studentIdOf(user);
  const assignment = await loadAssignmentForStudent(studentId, assignmentIdInput);
  const assignmentId = Number(assignment.id);

  const [questionRows] = await pool.query(
    `SELECT aq.order_index, qb.question_id, qb.subject, qb.chapter, qb.knowledge_point, qb.question_type,
            qb.difficulty, qb.stem, qb.code_context, qb.option_a, qb.option_b, qb.option_c, qb.option_d, qb.hint
       FROM assignment_questions aq
       JOIN question_bank qb ON qb.question_id = aq.question_id
      WHERE aq.assignment_id = ?
      ORDER BY aq.order_index, aq.id`,
    [assignmentId],
  );

  const [[attempt]] = await pool.query(
    `SELECT id, score, correct_count, total_count, submitted_at FROM quiz_attempts
      WHERE assignment_id = ? AND student_id = ? LIMIT 1`,
    [assignmentId, studentId],
  );

  let mySubmission = null;
  if (attempt) {
    const [answerRows] = await pool.query(
      `SELECT qaa.question_id, qaa.selected_answer, qaa.correct_answer, qaa.is_correct, qb.analysis
         FROM quiz_attempt_answers qaa
         JOIN question_bank qb ON qb.question_id = qaa.question_id
        WHERE qaa.attempt_id = ?`,
      [Number(attempt.id)],
    );
    mySubmission = {
      attemptId: Number(attempt.id),
      score: Number(attempt.score),
      correctCount: Number(attempt.correct_count),
      totalCount: Number(attempt.total_count),
      submittedAt: attempt.submitted_at,
      results: answerRows.map((row) => ({
        questionId: row.question_id,
        selectedAnswer: row.selected_answer,
        correctAnswer: row.correct_answer,
        isCorrect: Number(row.is_correct) === 1,
        analysis: row.analysis || "",
      })),
    };
  }

  const [codeExerciseRows] = await pool.query(
    `SELECT ace.exercise_id, ace.order_index, e.subject, e.knowledge_point, e.title, e.description,
            e.language, e.difficulty, e.starter_code, e.sample_input, e.sample_output,
            (SELECT COUNT(*) FROM code_test_cases t WHERE t.exercise_id = e.exercise_id) AS case_count,
            (SELECT COUNT(*) FROM code_test_cases t WHERE t.exercise_id = e.exercise_id AND t.visibility = 'hidden') AS hidden_count
       FROM assignment_code_exercises ace
       JOIN code_exercises e ON e.exercise_id = ace.exercise_id
      WHERE ace.assignment_id = ?
      ORDER BY ace.order_index, ace.id`,
    [assignmentId],
  );

  const [myCodeRows] = await pool.query(
    `SELECT id, exercise_id, language, source_code, status, passed_count, total_count, execution_mode, created_at
       FROM code_submissions
      WHERE assignment_id = ? AND student_id = ? AND mode = 'submit'
      ORDER BY id DESC`,
    [assignmentId, studentId],
  );

  const codeExercises = codeExerciseRows.map((row) => {
    const mine = myCodeRows.filter((item) => item.exercise_id === row.exercise_id);
    const latest = mine[0] || null;
    return {
      exerciseId: row.exercise_id,
      orderIndex: Number(row.order_index),
      subject: row.subject,
      knowledgePoint: row.knowledge_point || "",
      title: row.title || row.exercise_id,
      description: row.description || "",
      language: row.language || "c",
      difficulty: row.difficulty || "",
      starterCode: row.starter_code || "",
      sampleInput: row.sample_input || "",
      sampleOutput: row.sample_output || "",
      caseCount: Number(row.case_count || 0),
      hiddenCount: Number(row.hidden_count || 0),
      mySubmission: latest
        ? {
            submissionId: Number(latest.id),
            status: latest.status,
            accepted: latest.status === "accepted",
            passedCount: Number(latest.passed_count || 0),
            totalCount: Number(latest.total_count || 0),
            executionMode: latest.execution_mode || "",
            sourceCode: latest.source_code || "",
            submittedAt: latest.created_at,
          }
        : null,
      mySubmissionCount: mine.length,
    };
  });

  // 简答题：只暴露题干与知识点，评分要点（checkpoints）不下发给学生
  const [openQuestionRows] = await pool.query(
    `SELECT aoq.order_index, oq.question_id, oq.subject, oq.chapter, oq.knowledge_point, oq.difficulty, oq.prompt
       FROM assignment_open_questions aoq
       JOIN open_question_bank oq ON oq.question_id = aoq.open_question_id
      WHERE aoq.assignment_id = ?
      ORDER BY aoq.order_index, aoq.id`,
    [assignmentId],
  );

  const [myOpenAnswerRows] = await pool.query(
    `SELECT open_question_id, answer_text, created_at
       FROM assignment_open_answers
      WHERE assignment_id = ? AND student_id = ?`,
    [assignmentId, studentId],
  );

  const openQuestions = openQuestionRows.map((row) => ({
    openQuestionId: row.question_id,
    orderIndex: Number(row.order_index),
    subject: row.subject,
    chapter: row.chapter || "",
    knowledgePoint: row.knowledge_point || "",
    difficulty: row.difficulty || "",
    prompt: row.prompt,
    myAnswer: myOpenAnswerRows.find((item) => item.open_question_id === row.question_id)?.answer_text || "",
  }));

  return {
    assignment: {
      id: assignmentId,
      title: assignment.title,
      description: assignment.description || "",
      subject: assignment.subject,
      status: assignment.status,
      dueAt: assignment.due_at,
      className: assignment.class_name,
      teacherName: assignment.teacher_name,
      questionCount: questionRows.length,
      openQuestionCount: openQuestions.length,
      codeExerciseCount: codeExercises.length,
    },
    questions: questionRows.map((row) => ({
      ...toPublicAssignmentQuestion(row),
      orderIndex: Number(row.order_index),
    })),
    openQuestions,
    codeExercises,
    mySubmission,
  };
}

async function submitStudentAssignment(user, assignmentIdInput, input = {}) {
  const studentId = studentIdOf(user);
  const assignment = await loadAssignmentForStudent(studentId, assignmentIdInput);
  const assignmentId = Number(assignment.id);
  if (assignment.status === "closed") throw apiError("该作业已关闭，无法提交", 403);

  const [questionRows] = await pool.query(
    "SELECT question_id FROM assignment_questions WHERE assignment_id = ? ORDER BY order_index, id",
    [assignmentId],
  );
  const expectedIds = questionRows.map((row) => row.question_id);

  const [openRows] = await pool.query(
    "SELECT open_question_id FROM assignment_open_questions WHERE assignment_id = ? ORDER BY order_index, id",
    [assignmentId],
  );
  const expectedOpenIds = openRows.map((row) => row.open_question_id);

  if (!expectedIds.length && !expectedOpenIds.length) {
    throw apiError("该作业没有客观题，请在代码题区域提交", 400, "ASSIGNMENT_NO_QUESTIONS");
  }

  // ---- 客观题：单选题（A-D）+ 填空题（文本，自动判分）----
  const answers = Array.isArray(input.answers) ? input.answers : [];
  if (expectedIds.length) {
    if (!answers.length) throw apiError("请至少提交一道题的答案", 400);
    const submittedIds = answers.map((item) => String(item?.questionId ?? "").trim());
    if (submittedIds.some((id) => !id)) throw apiError("questionId 不能为空", 400);
    if (new Set(submittedIds).size !== submittedIds.length) throw apiError("同一道题不能重复提交", 400);
    const submittedSet = new Set(submittedIds);
    const missing = expectedIds.filter((id) => !submittedSet.has(id));
    if (missing.length) throw apiError(`还有 ${missing.length} 道题未作答`, 400, "ASSIGNMENT_INCOMPLETE");
    const unknown = submittedIds.filter((id) => !expectedIds.includes(id));
    if (unknown.length) throw apiError("提交了不属于该作业的题目", 400);
  } else if (answers.length) {
    throw apiError("提交了不属于该作业的题目", 400);
  }

  // ---- 简答题：主观题，只落库供教师端查看，不参与自动评分 ----
  const openAnswers = Array.isArray(input.openAnswers) ? input.openAnswers : [];
  const normalizedOpenAnswers = openAnswers.map((item) => ({
    openQuestionId: String(item?.openQuestionId ?? "").trim(),
    answer: String(item?.answer ?? "").trim(),
  }));
  if (expectedOpenIds.length) {
    if (normalizedOpenAnswers.some((item) => !item.openQuestionId))
      throw apiError("openQuestionId 不能为空", 400);
    const openSet = new Set(normalizedOpenAnswers.map((item) => item.openQuestionId));
    if (openSet.size !== normalizedOpenAnswers.length) throw apiError("同一道简答题不能重复提交", 400);
    const missingOpen = expectedOpenIds.filter((id) => !openSet.has(id));
    if (missingOpen.length)
      throw apiError(`还有 ${missingOpen.length} 道简答题未作答`, 400, "ASSIGNMENT_INCOMPLETE");
    if (normalizedOpenAnswers.some((item) => !item.answer)) throw apiError("简答题答案不能为空", 400);
    const unknownOpen = normalizedOpenAnswers.filter(
      (item) => !expectedOpenIds.includes(item.openQuestionId),
    );
    if (unknownOpen.length) throw apiError("提交了不属于该作业的简答题", 400);
  } else if (normalizedOpenAnswers.length) {
    throw apiError("提交了不属于该作业的简答题", 400);
  }

  const result = expectedIds.length
    ? await submitQuiz({
        studentId,
        idempotencyKey: `assignment:${assignmentId}`,
        subject: assignment.subject,
        answers: answers.map((item) => ({
          questionId: String(item.questionId).trim(),
          answer: item.answer,
          durationSeconds: item.durationSeconds,
        })),
        startedAt: input.startedAt,
        submittedAt: input.submittedAt,
        assignmentId,
      })
    : null;

  for (const item of normalizedOpenAnswers) {
    await pool.query(
      `INSERT INTO assignment_open_answers (assignment_id, student_id, open_question_id, answer_text)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text)`,
      [assignmentId, studentId, item.openQuestionId, item.answer],
    );
  }

  return {
    assignmentId,
    attemptId: result ? result.attemptId : null,
    score: result ? result.score : null,
    correctCount: result ? result.correctCount : null,
    totalCount: result ? result.totalCount : null,
    questionResults: result ? result.questionResults : [],
    openAnswerCount: normalizedOpenAnswers.length,
    masteryChanges: result ? result.masteryChanges || [] : [],
    recommendations: result ? result.recommendations || [] : [],
  };
}

// 学生在作业里提交代码题：后台自动判题（公开 + 隐藏用例），结果形态与 CodeLab 练习一致
async function submitStudentCode(user, assignmentIdInput, exerciseIdInput, input = {}) {
  const studentId = studentIdOf(user);
  const assignment = await loadAssignmentForStudent(studentId, assignmentIdInput);
  const assignmentId = Number(assignment.id);
  if (assignment.status === "closed") throw apiError("该作业已关闭，无法提交", 403);

  const exerciseId = requiredText(exerciseIdInput, 120, "代码题编号");
  const [[link]] = await pool.query(
    "SELECT exercise_id FROM assignment_code_exercises WHERE assignment_id = ? AND exercise_id = ? LIMIT 1",
    [assignmentId, exerciseId],
  );
  if (!link) throw apiError("该代码题不属于这份作业", 404);

  const sourceCode = String(input.sourceCode ?? "");
  if (!sourceCode.trim()) throw apiError("请先编写代码再提交", 400);
  if (Buffer.byteLength(sourceCode, "utf8") > 65536) throw apiError("代码长度超过限制", 400);
  const language = String(input.language || "c")
    .trim()
    .toLowerCase();
  assertSupportedLanguage(language);

  const result = await judgeSubmission({ exerciseId, language, sourceCode });
  const submission = await saveCodeSubmission({
    studentId,
    exerciseId,
    language,
    sourceCode,
    stdin: "",
    result,
    mode: "submit",
    executionMode: result.executionMode,
    assignmentId,
  });

  return {
    assignmentId,
    exerciseId,
    accepted: result.status === "accepted",
    result,
    submission,
  };
}

// 组卷时可选用的简答题：来自 open_question_bank，按科目过滤。
// 简答题没有「正确答案」，教师端只用来选题；学生作答后由教师侧查看。
async function listAssignmentOpenQuestions(user, filters = {}) {
  assertTeacherRole(user);
  const subject = String(filters.subject ?? "").trim();
  const params = [];
  let where = "";
  if (subject && subject !== "全部") {
    where = "WHERE subject = ?";
    params.push(subject);
  }
  const [rows] = await pool.query(
    `SELECT question_id, subject, chapter, knowledge_point, difficulty, prompt
       FROM open_question_bank
       ${where}
      ORDER BY subject, question_id
      LIMIT 200`,
    params,
  );
  return {
    data: rows.map((row) => ({
      openQuestionId: row.question_id,
      subject: row.subject,
      chapter: row.chapter || "",
      knowledgePoint: row.knowledge_point || "",
      difficulty: row.difficulty || "",
      prompt: row.prompt,
    })),
  };
}

module.exports = {
  ASSIGNMENT_STATUSES,
  MAX_QUESTIONS_PER_ASSIGNMENT,
  MAX_CODE_EXERCISES_PER_ASSIGNMENT,
  MAX_OPEN_QUESTIONS_PER_ASSIGNMENT,
  createAssignment,
  getStudentAssignment,
  getTeacherAssignmentDetail,
  listAssignmentCodeExercises,
  listAssignmentOpenQuestions,
  listManagedClasses,
  listQuestionBankSubjects,
  listStudentAssignments,
  listTeacherAssignments,
  submitStudentAssignment,
  submitStudentCode,
};
