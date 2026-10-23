/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 造一套示例数据：一批「姓氏 + 同学」的学生 + 覆盖学生端/教师端各页面的丰富记录。
 *
 * 覆盖的页面与依赖表：
 *   学生端 学习报告  ← student_knowledge_mastery / student_error_patterns / quiz_attempts(+answers)
 *                      / wrong_questions / code_submissions / focus_sessions / learning_assessment_reports
 *   学生端 班级信息  ← teacher_class_students（榜单人数）+ quiz_attempts + learning_resource_progress
 *   学生端 作业      ← assignments / assignment_questions / assignment_open_answers + quiz_attempts(assignment_id)
 *   教师端 学生管理  ← loadStudentMetrics（画像 / 路径 / 测验正确率 / 资源完成 / 风险）
 *   教师端 班级情况  ← classAnalytics（掌握度雷达 + 趋势 + 分布）
 *   教师端 测验分析  ← quiz_attempts + quiz_attempt_answers + wrong_questions
 *   教师端 入班申请  ← teacher_class_join_requests（少量 pending）
 *
 * 用法：
 *   node scripts/seedDemoCohort.js                      # 默认给 42 班（教师 12）造 30 人
 *   node scripts/seedDemoCohort.js --count=24 --reset   # 先清掉上次造的 cohort_ 学生再重建
 *   node scripts/seedDemoCohort.js --enrich=8,1         # 同时给指定重点学生补足报告数据
 */
require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const teacherReport = require("../src/services/teacherReportService");

const USERNAME_PREFIX = "cohort_";
const STUDENT_NO_PREFIX = "DEMO2026";
const PASSWORD = process.env.DEMO_PASSWORD || "LearnMateLocal2026!";
const SURNAMES = [
  "王",
  "李",
  "张",
  "刘",
  "陈",
  "杨",
  "黄",
  "赵",
  "吴",
  "周",
  "徐",
  "孙",
  "马",
  "朱",
  "胡",
  "郭",
  "何",
  "高",
  "林",
  "罗",
  "郑",
  "梁",
  "谢",
  "宋",
  "唐",
  "许",
  "韩",
  "冯",
  "邓",
  "曹",
  "彭",
  "曾",
  "萧",
  "田",
  "董",
  "袁",
];
const CITIES = ["北京", "上海", "广州", "成都", "武汉", "西安", "南京", "杭州", "长沙", "青岛"];
const MAJORS = ["计算机科学与技术", "软件工程", "网络工程", "人工智能", "数据科学与大数据技术"];
const GRADES = ["2024 级", "2025 级", "2026 级"];
const PREFERENCES = [
  "偏好图解 + 例题",
  "偏好看代码 + 动手实践",
  "偏好先看结论再看推导",
  "偏好循序渐进的概念梳理",
];
const ERROR_TYPES = ["概念混淆", "边界条件遗漏", "步骤顺序错误", "计算失误", "术语使用不当", "审题遗漏条件"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];
const pickMany = (random, list, count) => {
  const copy = [...list];
  const result = [];
  while (result.length < count && copy.length)
    result.push(...copy.splice(Math.floor(random() * copy.length), 1));
  return result;
};
const between = (random, min, max) => Math.round(min + random() * (max - min));
const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const sha = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const at = (daysAgo, hour = 20, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
};

/**
 * 通用「阶段完成证据」：路径完成度按 teacherAnalyticsService.pathProgress 的三种口径计算，这里逐一对齐。
 *   completion.type = 'quiz'     → 该阶段 completion.ids 里的题都要有答对记录（时间晚于前置阶段）
 *   completion.type = 'resource' → 该阶段 completion.ids 是资源类型（如 mind_map），需要存在对应
 *                                  path_version + stage_key 且进度为 completed 的资源
 *   completion.type = 'codelab'  → 需要 mode=submit / status=accepted / execution_mode=docker 的提交
 * completeThrough 表示「前 N 个阶段做成已完成」，其后的阶段不写证据（保持未完成为 0%）。
 */
async function seedPathProgress(connection, studentId, options) {
  const { pathVersion, stages, completeThrough, startDaysAgo = 22, subject = "数据结构" } = options;
  let evidence = 0;
  for (const [index, stage] of stages.entries()) {
    if (index > completeThrough) break;
    const type = String(stage.completion?.type || "quiz");
    const ids = (stage.completion?.ids || []).map(String).filter(Boolean);
    if (!ids.length) continue;
    const daysAgo = Math.max(0, startDaysAgo - index * 3);
    const completedAt = at(daysAgo, 20 - (index % 3), 15 + index);
    const knowledgePoint = (stage.knowledgePoints || [])[0] || "阶段复习";

    if (type === "quiz") {
      const [rows] = await connection.query(
        `SELECT question_id, answer, subject FROM question_bank WHERE question_id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      if (!rows.length) continue;
      const answers = rows.map((row) => {
        const correctAnswer = String(row.answer || "A")
          .trim()
          .toUpperCase();
        return { row, selected: correctAnswer, correct: true };
      });
      const key = `cohort-${studentId}-stage-${stage.key}`;
      await connection.query(
        `INSERT INTO quiz_attempts (student_id,idempotency_key,subject,score,correct_count,total_count,started_at,submitted_at,result_json)
         VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score), submitted_at=VALUES(submitted_at), correct_count=VALUES(correct_count)`,
        [
          studentId,
          key,
          rows[0].subject || subject,
          100,
          answers.length,
          answers.length,
          new Date(completedAt.getTime() - 8 * 60 * 1000),
          completedAt,
          JSON.stringify({ seeded: true, stageKey: stage.key }),
        ],
      );
      const [[attempt]] = await connection.query(
        "SELECT id FROM quiz_attempts WHERE student_id=? AND idempotency_key=?",
        [studentId, key],
      );
      if (!attempt?.id) continue;
      await insertRows(
        connection,
        "quiz_attempt_answers",
        [
          "attempt_id",
          "question_id",
          "selected_answer",
          "correct_answer",
          "is_correct",
          "duration_seconds",
          "created_at",
        ],
        answers.map((answer, answerIndex) => ({
          attempt_id: Number(attempt.id),
          question_id: answer.row.question_id,
          selected_answer: answer.selected,
          correct_answer: String(answer.row.answer || ""),
          is_correct: 1,
          duration_seconds: 30 + answerIndex * 7,
          created_at: completedAt,
        })),
        { ignore: true },
      );
      evidence += 1;
      continue;
    }

    if (type === "resource") {
      for (const resourceType of ids) {
        const key = `path-${studentId}-${resourceType}`;
        // 已存在的资源不改名（可能挂着真实生成的资源），只补进度
        await connection.query(
          `INSERT INTO learning_resources (student_id,subject,knowledge_point,resource_type,title,status,current_version,context_fingerprint,content_fingerprint,source_type,path_version,stage_key,estimated_minutes,created_at,updated_at)
           VALUES (?,?,?,?,?,'approved',1,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE updated_at=learning_resources.updated_at`,
          [
            studentId,
            subject,
            knowledgePoint,
            resourceType,
            `${knowledgePoint} · ${resourceType === "mind_map" ? "思维导图" : resourceType === "study_note" ? "个性化讲义" : "学习资源"}`,
            sha(`ctx-${key}`),
            sha(`content-${key}`),
            "demo_seed",
            pathVersion,
            stage.key,
            30,
            completedAt,
            completedAt,
          ],
        );
        const [[resource]] = await connection.query(
          "SELECT id, current_version FROM learning_resources WHERE student_id=? AND resource_type=? AND path_version=? AND stage_key=? LIMIT 1",
          [studentId, resourceType, pathVersion, stage.key],
        );
        if (!resource?.id) continue;
        await connection.query(
          `INSERT INTO learning_resource_versions (resource_id,student_id,version,content_json,review_json,content_fingerprint,generator_source,prompt_version)
           VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE content_json=VALUES(content_json)`,
          [
            Number(resource.id),
            studentId,
            Number(resource.current_version) || 1,
            JSON.stringify({ title: `${knowledgePoint} 个性化资源`, content: {} }),
            JSON.stringify({ status: "approved", score: 90, summary: "按当前掌握度生成" }),
            sha(`content-${key}`),
            "demo_seed",
            "demo-v1",
          ],
        );
        // 关键：进度行必须落在资源的 current_version 上，否则路径证据（按 current_version 关联）读不到
        await connection.query(
          `INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent,opened_at,completed_at,last_activity_at,accumulated_seconds)
           SELECT student_id, id, current_version, 'completed', 100, ?, ?, ?, 1800 FROM learning_resources WHERE id=?
           ON DUPLICATE KEY UPDATE status='completed', progress_percent=100, completed_at=VALUES(completed_at), last_activity_at=VALUES(last_activity_at)`,
          [completedAt, completedAt, completedAt, Number(resource.id)],
        );
        evidence += 1;
      }
      continue;
    }

    if (type === "codelab") {
      for (const exerciseId of ids) {
        await connection.query(
          `INSERT INTO code_submissions (student_id,exercise_id,language,source_code,status,time_used,memory_used,mode,passed_count,total_count,result_json,idempotency_key,execution_mode,created_at)
           VALUES (?,?,'c','// 通过全部测试用例','accepted','12ms','2MB','submit',8,8,?,?, 'docker',?)
           ON DUPLICATE KEY UPDATE status='accepted', execution_mode='docker', created_at=VALUES(created_at)`,
          [
            studentId,
            exerciseId,
            JSON.stringify({ summary: "全部用例通过" }),
            `cohort-${studentId}-stage-${stage.key}-${exerciseId}`,
            completedAt,
          ],
        );
        evidence += 1;
      }
    }
  }
  return evidence;
}

/** 兼容旧调用：只处理 quiz 类阶段（cohort 学生的路径都是测验阶段）。 */
async function seedStageEvidence(connection, studentId, stages, options) {
  return seedPathProgress(connection, studentId, {
    pathVersion: options.pathVersion || 1,
    stages,
    completeThrough: options.completedStages - 1,
    startDaysAgo: options.startDaysAgo,
    subject: options.subject,
  });
}

function parseArgs(argv) {
  const options = {
    classId: 42,
    teacherId: 12,
    count: 30,
    days: 30,
    reset: false,
    resetEnrich: false,
    enrich: [8],
    prefix: USERNAME_PREFIX,
    noPrefix: STUDENT_NO_PREFIX,
    surnameOffset: 0,
    seedApplicants: true,
  };
  for (const item of argv.slice(2)) {
    if (item.startsWith("--class=")) options.classId = Number(item.split("=")[1]);
    else if (item.startsWith("--teacher=")) options.teacherId = Number(item.split("=")[1]);
    else if (item.startsWith("--count=")) options.count = Number(item.split("=")[1]);
    else if (item.startsWith("--days=")) options.days = Number(item.split("=")[1]);
    else if (item.startsWith("--enrich="))
      options.enrich = item.split("=")[1].split(",").map(Number).filter(Boolean);
    else if (item.startsWith("--prefix=")) options.prefix = item.split("=")[1];
    else if (item.startsWith("--no-prefix=")) options.noPrefix = item.split("=")[1];
    else if (item.startsWith("--surname-offset=")) options.surnameOffset = Number(item.split("=")[1]) || 0;
    else if (item === "--no-applicants") options.seedApplicants = false;
    else if (item === "--reset") options.reset = true;
    else if (item === "--reset-enrich") options.resetEnrich = true;
  }
  return options;
}

/** LIKE 前缀必须转义：`_` 在 LIKE 里是通配符，'cohort_%' 会连 'cohortb_01' 一起匹配。 */
function likePrefix(prefix) {
  return `${String(prefix).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** mysql2 的 query() 不会把对象转成 JSON 文本，JSON 列必须显式 stringify。 */
function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

async function insertRows(conn, table, columns, rows, options = {}) {
  const { chunkSize = 100, ignore = false } = options;
  if (!rows.length) return 0;
  const placeholders = `(${columns.map(() => "?").join(",")})`;
  let inserted = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const values = [];
    chunk.forEach((row) => columns.forEach((column) => values.push(normalizeValue(row[column]))));
    const [result] = await conn.query(
      `INSERT ${ignore ? "IGNORE " : ""}INTO ${table} (${columns.join(",")}) VALUES ${chunk.map(() => placeholders).join(",")}`,
      values,
    );
    inserted += result.affectedRows || chunk.length;
  }
  return inserted;
}

/** 逐行 upsert：用于可能已存在（唯一键）的画像类数据，保证值被刷新。 */
async function upsertRows(conn, table, columns, conflictColumns, updateColumns, rows) {
  if (!rows.length) return 0;
  const placeholders = `(${columns.map(() => "?").join(",")})`;
  const updates = updateColumns.map((column) => `${column}=VALUES(${column})`).join(",");
  let affected = 0;
  for (const row of rows) {
    const values = columns.map((column) => normalizeValue(row[column]));
    const [result] = await conn.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );
    affected += result.affectedRows || 1;
  }
  return affected;
}

/* ------------------------------------------------------------------ *
 * 学习评估报告：直接复用教师端 createReport（快照 → 报告 JSON → PDF 落盘），
 * 保证报告页的图表（雷达/柱状/饼图）与明细区块都是真实数据。
 * ------------------------------------------------------------------ */
async function seedAssessmentReport(connection, teacherId, studentId, classId, options = {}) {
  const rangeDays = Number(options.rangeDays) || 30;
  const reportType = options.reportType || "period_assessment";
  const teacher = { userId: Number(teacherId), role: "TEACHER" };
  // 走教师端真实链路：生成报告 JSON 的同时渲染 PDF 并落盘，
  // 这样「下载 PDF」按钮拿到的是一份真实文件（含 checksum 与 storage_path）。
  const created = await teacherReport
    .createReport(teacher, studentId, { reportType, rangeDays })
    .catch((error) => ({ error }));
  if (created?.error) return { ok: false, reason: created.error.message };
  if (created?.status !== "approved") return { ok: false, reason: `报告状态为 ${created?.status}` };
  // 命中同快照的既有报告时，createReport 只回传元信息，这里补一次详情查询
  const detail = created.report ? created : await teacherReport.getReport(teacher, created.id);
  return { ok: true, report: detail.report, reportId: created.id };
}

/* ------------------------------------------------------------------ *
 * 素材：真实题库 / 开放题 / 代码练习
 * ------------------------------------------------------------------ */
async function loadAssets(pool) {
  const [questions] = await pool.query(
    `SELECT question_id, subject, knowledge_point, question_type, difficulty, stem, option_a, option_b, option_c, option_d, answer, analysis
       FROM question_bank
      WHERE owner_student_id IS NULL AND is_published=1 AND subject IN ('数据结构','操作系统','计算机组成原理','计算机网络','C 语言程序设计')
      ORDER BY subject, knowledge_point`,
  );
  const bySubject = new Map();
  questions.forEach((row) => {
    const list = bySubject.get(row.subject) || [];
    list.push(row);
    bySubject.set(row.subject, list);
  });
  const dsQuestions = bySubject.get("数据结构") || [];
  const knowledgePoints = [...new Set(dsQuestions.map((row) => row.knowledge_point).filter(Boolean))];
  const [openQuestions] = await pool.query(
    "SELECT question_id, subject, knowledge_point, prompt FROM open_question_bank LIMIT 40",
  );
  const [codeExercises] = await pool.query(
    "SELECT exercise_id, subject, knowledge_point, title, language, difficulty, path_completion_eligible FROM code_exercises WHERE is_published=1 LIMIT 60",
  );
  const [classes] = await pool.query(
    "SELECT id, class_name, subject, teacher_id FROM teacher_classes WHERE id=?",
    [42],
  );
  return { questions, bySubject, dsQuestions, knowledgePoints, openQuestions, codeExercises, classes };
}

function questionOptions(row) {
  return [row.option_a, row.option_b, row.option_c, row.option_d].map((value) =>
    value == null ? "" : String(value),
  );
}
function wrongAnswerFor(random, row) {
  if (row.question_type === "fill_blank") return "不确定";
  const correct = String(row.answer || "A")
    .trim()
    .toUpperCase();
  const others = ["A", "B", "C", "D"].filter((letter) => letter !== correct);
  return pick(random, others);
}

/* ------------------------------------------------------------------ *
 * 单个学生的数据
 * ------------------------------------------------------------------ */
function buildStudentBundle(random, student, assets, context) {
  const { knowledgePoints, dsQuestions, codeExercises } = assets;
  const knowledge = pickMany(
    random,
    knowledgePoints.length ? knowledgePoints : ["树与二叉树"],
    Math.min(9, Math.max(6, knowledgePoints.length)),
  );
  const level = random(); // 决定这名学生整体强弱
  const mastery = knowledge.map((point) => {
    const base =
      level < 0.25
        ? between(random, 34, 58)
        : level < 0.7
          ? between(random, 55, 82)
          : between(random, 74, 96);
    return {
      subject: "数据结构",
      knowledge_point: point,
      mastery: base,
      wrong_count: between(random, 0, 6),
      practice_count: between(random, 3, 26),
      last_updated: at(between(random, 0, 12), between(random, 9, 22)),
    };
  });
  const errorPatterns = pickMany(random, ERROR_TYPES, between(random, 3, 5)).map((errorType, index) => ({
    subject: "数据结构",
    knowledge_point: knowledge[index % knowledge.length],
    error_type: errorType,
    occurrence_count: between(random, 2, 11),
    confidence: (between(random, 55, 95) / 100).toFixed(4),
    latest_evidence_json: { sample: `在「${knowledge[index % knowledge.length]}」相关题目中重复出现` },
    first_seen_at: at(between(random, 20, 40)),
    last_seen_at: at(between(random, 0, 8)),
  }));

  // 测验：近 days 天内 6~16 次，每次 3~6 题
  const attemptCount = between(random, 6, 16);
  const attempts = [];
  for (let index = 0; index < attemptCount; index += 1) {
    const pool = pickMany(random, dsQuestions, between(random, 3, 6));
    if (!pool.length) break;
    const answers = pool.map((row) => {
      const correct = random() < (level < 0.25 ? 0.45 : level < 0.7 ? 0.72 : 0.88);
      return {
        row,
        selected: correct
          ? String(row.answer || "A")
              .trim()
              .toUpperCase()
          : wrongAnswerFor(random, row),
        correct,
        durationSeconds: between(random, 18, 150),
        errorType: correct ? null : pick(random, ERROR_TYPES),
      };
    });
    const correctCount = answers.filter((item) => item.correct).length;
    const daysAgo = Math.max(0, context.days - 1 - Math.floor((index / attemptCount) * (context.days - 1)));
    const submittedAt = at(daysAgo, between(random, 9, 22), between(random, 0, 59));
    attempts.push({
      idempotency_key: `cohort-${student.id}-q${index + 1}`,
      subject: "数据结构",
      score: Math.round((correctCount / answers.length) * 100),
      correct_count: correctCount,
      total_count: answers.length,
      started_at: new Date(submittedAt.getTime() - answers.length * between(random, 30, 90) * 1000),
      submitted_at: submittedAt,
      answers,
    });
  }

  const wrongQuestions = [];
  const usedQuestionIds = new Set();
  attempts.forEach((attempt) => {
    attempt.answers
      .filter((answer) => !answer.correct)
      .forEach((answer) => {
        const id = answer.row.question_id;
        if (usedQuestionIds.has(id) || wrongQuestions.length >= 12) return;
        usedQuestionIds.add(id);
        wrongQuestions.push({
          question_id: id,
          subject: answer.row.subject,
          knowledge_point: answer.row.knowledge_point,
          difficulty: answer.row.difficulty || "基础",
          question_text: answer.row.stem,
          selected_answer: answer.selected,
          correct_answer: String(answer.row.answer || ""),
          analysis: answer.row.analysis || "",
          error_reason: answer.errorType,
          feedback_suggestion: `回到「${answer.row.knowledge_point}」的定义与适用条件，逐项核对选项差异。`,
          recommended_action: `完成 2 道「${answer.row.knowledge_point}」同类练习并复述判断依据。`,
          status: random() < 0.55 ? "待复习" : "已掌握",
          created_at: at(between(random, 0, context.days), between(random, 9, 22)),
          updated_at: at(between(random, 0, 6), between(random, 9, 22)),
        });
      });
  });

  const submissions = pickMany(random, codeExercises, between(random, 2, 6)).map((exercise, index) => {
    const accepted = random() < (level < 0.3 ? 0.35 : level < 0.7 ? 0.65 : 0.9);
    return {
      exercise_id: exercise.exercise_id,
      language: exercise.language || "c",
      source_code: `// ${exercise.title || exercise.exercise_id}\n#include <stdio.h>\nint main(void) { /* 参考实现 */ return 0; }\n`,
      stdin: "",
      stdout: accepted ? "ok\n" : "",
      stderr: accepted ? "" : "wrong answer on case 2\n",
      compile_output: "",
      status: accepted ? "accepted" : random() < 0.5 ? "wrong_answer" : "compile_error",
      time_used: `${between(random, 6, 320)}ms`,
      memory_used: `${between(random, 1, 12)}MB`,
      mode: "submit",
      passed_count: accepted ? between(random, 3, 8) : between(random, 0, 2),
      total_count: 8,
      result_json: { summary: accepted ? "全部用例通过" : "部分用例未通过" },
      idempotency_key: `cohort-${student.id}-code-${index + 1}-${sha(exercise.exercise_id).slice(0, 6)}`,
      execution_mode: "docker",
      created_at: at(between(random, 0, context.days), between(random, 9, 22)),
    };
  });

  const focusDays = Math.max(6, Math.round(context.days * (0.55 + random() * 0.4)));
  const focusSessions = Array.from({ length: focusDays }, () => ({
    session_date: dayKey(at(between(random, 0, context.days - 1))),
    minutes: between(random, 25, 165),
    created_at: at(between(random, 0, context.days), between(random, 8, 23)),
  }));

  const events = Array.from({ length: between(random, 6, 12) }, () => {
    const point = pick(random, knowledge);
    const type = pick(random, [
      "quiz_submitted",
      "resource_opened",
      "code_submitted",
      "path_adjusted",
      "retrieval_run",
      "wrong_question_reviewed",
    ]);
    return {
      event_type: type,
      subject: "数据结构",
      knowledge_point: point,
      payload_json: { summary: `${point} · ${type}` },
      created_at: at(between(random, 0, context.days), between(random, 9, 22)),
    };
  });

  const retrievalRuns = Array.from({ length: between(random, 3, 8) }, () => {
    const point = pick(random, knowledge);
    return {
      request_type: "study_note",
      subject: "数据结构",
      query_text: `${point} 的概念与典型例题`,
      normalized_query: `${point} 概念 例题`,
      retrieval_strategy: "hybrid",
      top_k: 6,
      minimum_score: 0.35,
      knowledge_point: point,
      filters_json: JSON.stringify({ subject: "数据结构" }),
      result_count: between(random, 3, 12),
      confidence: pick(random, ["sufficient", "sufficient", "partial"]),
      created_at: at(between(random, 0, context.days), between(random, 9, 22)),
    };
  });

  return {
    level,
    knowledge,
    mastery,
    errorPatterns,
    attempts,
    wrongQuestions,
    submissions,
    focusSessions,
    events,
    retrievalRuns,
  };
}

/** 挑一批真实知识点用于重点学生的掌握度（优先数据结构主线知识点）。 */
function researchMasteryPoints(assets, count) {
  const preferred = [
    "树与二叉树",
    "二叉树遍历",
    "循环队列",
    "快速排序",
    "二叉搜索树",
    "红黑树旋转",
    "完全二叉树",
    "栈与队列",
    "哈希表",
    "堆与优先队列",
  ];
  const available = assets.knowledgePoints;
  const chosen = preferred.filter((point) => available.includes(point));
  for (const point of available) {
    if (chosen.length >= count) break;
    if (!chosen.includes(point)) chosen.push(point);
  }
  return chosen.slice(0, count);
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
async function main() {
  const options = parseArgs(process.argv);
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 6,
    multipleStatements: false,
  });
  const connection = await pool.getConnection();
  try {
    const [[klass]] = await connection.query(
      "SELECT id, class_name, subject, teacher_id FROM teacher_classes WHERE id=?",
      [options.classId],
    );
    if (!klass) throw new Error(`班级 ${options.classId} 不存在`);
    const teacherId = options.teacherId || Number(klass.teacher_id);
    const [[teacher]] = await connection.query("SELECT id, display_name FROM users WHERE id=?", [teacherId]);
    console.log(
      `目标班级：#${klass.id} ${klass.class_name}（教师 ${teacher?.display_name || teacherId}），目标人数 ${options.count}`,
    );

    const assets = await loadAssets(pool);
    console.log(
      `素材：题库 ${assets.questions.length} 题、知识点 ${assets.knowledgePoints.length} 个、开放题 ${assets.openQuestions.length} 道、代码练习 ${assets.codeExercises.length} 道`,
    );
    // LIKE 里的 `_` 是通配符，先转义再拼进 SQL，否则 cohort_% 会把 cohortb_ 也匹配进来
    const prefixLike = likePrefix(options.prefix);
    const noPrefixLike = likePrefix(options.noPrefix);

    if (options.reset) {
      const [existing] = await connection.query(
        `SELECT id FROM users WHERE username LIKE '${prefixLike}' OR username LIKE 'apply_%'`,
      );
      const ids = existing.map((row) => Number(row.id));
      if (ids.length) {
        const list = ids.join(",");
        for (const [table, column] of [
          [
            "quiz_attempt_answers",
            "attempt_id IN (SELECT id FROM quiz_attempts WHERE student_id IN (" + list + "))",
          ],
          ["quiz_attempts", `student_id IN (${list})`],
          ["wrong_questions", `student_id IN (${list})`],
          ["code_submissions", `student_id IN (${list})`],
          ["focus_sessions", `student_id IN (${list})`],
          ["student_learning_events", `student_id IN (${list})`],
          ["knowledge_retrieval_runs", `student_id IN (${list})`],
          ["student_knowledge_mastery", `student_id IN (${list})`],
          ["student_error_patterns", `student_id IN (${list})`],
          ["learning_resource_progress", `student_id IN (${list})`],
          ["learning_resource_versions", `student_id IN (${list})`],
          ["learning_resource_stage_links", `student_id IN (${list})`],
          ["learning_resources", `student_id IN (${list})`],
          ["learning_path_versions", `student_id IN (${list})`],
          ["student_learning_paths", `student_id IN (${list})`],
          ["student_profile_versions", `student_id IN (${list})`],
          ["student_profiles", `student_id IN (${list})`],
          ["learning_assessment_reports", `student_id IN (${list})`],
          ["assignment_open_answers", `student_id IN (${list})`],
          ["teacher_class_join_requests", `student_id IN (${list})`],
          ["teacher_class_students", `student_id IN (${list})`],
        ]) {
          await connection.query(`DELETE FROM ${table} WHERE ${column}`).catch(() => undefined);
        }
        await connection.query(`DELETE FROM users WHERE id IN (${list})`);
        console.log(`--reset：已清理上次造的 ${ids.length} 名学生及其数据`);
      } else {
        console.log("--reset：没有需要清理的历史 cohort 学生");
      }
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const accountRandom = mulberry32(7);

    // 1) 学生账号 + 班级成员
    const [[{ maxNo }]] = await connection.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(student_no, ${options.noPrefix.length + 1}) AS UNSIGNED)), 0) AS maxNo
         FROM users WHERE student_no LIKE '${noPrefixLike}'`,
    );
    const students = [];
    for (let index = 0; index < options.count; index += 1) {
      const surname = SURNAMES[(index + options.surnameOffset) % SURNAMES.length];
      const sequence = index + 1;
      students.push({
        username: `${options.prefix}${String(sequence).padStart(2, "0")}`,
        student_no: `${options.noPrefix}${String(Number(maxNo) + sequence).padStart(4, "0")}`,
        display_name: `${surname}同学`,
        password_hash: passwordHash,
        role: "STUDENT",
        is_demo: 1,
        created_at: at(between(accountRandom, 40, 90)),
      });
    }
    await insertRows(
      connection,
      "users",
      ["username", "student_no", "display_name", "password_hash", "role", "is_demo", "created_at"],
      students,
      { ignore: true },
    );
    const [cohortUsers] = await connection.query(
      `SELECT id, username, display_name FROM users WHERE username LIKE '${prefixLike}' ORDER BY id`,
    );
    console.log(`学生账号：本次请求 ${students.length} 个，库内 cohort 学生共 ${cohortUsers.length} 个`);

    const memberRandom = mulberry32(11);
    await insertRows(
      connection,
      "teacher_class_students",
      ["class_id", "teacher_id", "student_id", "status", "joined_at"],
      cohortUsers.map((user) => ({
        class_id: klass.id,
        teacher_id: teacherId,
        student_id: Number(user.id),
        status: "active",
        joined_at: at(between(memberRandom, 20, 60), 10),
      })),
      { ignore: true },
    );

    // 2) 画像 / 路径 / 掌握度 / 错因 / 测验 / 错题 / 代码 / 时长 / 事件 / 检索 / 资源
    let reportSeeds = 0;
    for (let index = 0; index < cohortUsers.length; index += 1) {
      const user = cohortUsers[index];
      const studentId = Number(user.id);
      // 幂等：已有明细的学生直接跳过（重新跑脚本不会重复堆数据，--reset 时会先清空）
      const [[alreadySeeded]] = await connection.query(
        "SELECT id FROM quiz_attempts WHERE student_id=? AND idempotency_key=? LIMIT 1",
        [studentId, `cohort-${studentId}-q1`],
      );
      if (alreadySeeded?.id) continue;
      const random = mulberry32(1000 + studentId * 7);
      const bundle = buildStudentBundle(random, { id: studentId, name: user.display_name }, assets, options);

      await connection.query(
        `INSERT INTO student_profiles (student_id,major,grade,current_course,prior_knowledge_json,learning_goals_json,explanation_preference,resource_preferences_json,pace_preference,weekly_time_budget_minutes,profile_completeness,current_version,confirmed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NOW())
         ON DUPLICATE KEY UPDATE current_version=1, updated_at=NOW()`,
        [
          studentId,
          pick(random, MAJORS),
          pick(random, GRADES),
          "数据结构",
          JSON.stringify({
            数据结构: pick(random, ["学过线性表", "学过栈与队列", "学过树与二叉树", "基础较弱"]),
          }),
          JSON.stringify([pick(random, ["通过期末考试", "打牢专业课基础", "准备考研", "提升代码能力"])]),
          pick(random, PREFERENCES),
          JSON.stringify(["study_note", "mind_map", "quiz_pack"]),
          pick(random, ["稳步推进", "集中突破", "碎片时间学习"]),
          pick(random, [180, 240, 300, 420]),
          (0.6 + random() * 0.4).toFixed(4),
        ],
      );
      await connection.query(
        `INSERT INTO student_profile_versions (student_id,version,snapshot_json,change_reason,source_type,evidence_json)
         VALUES (?,1,?,?,?,?)
         ON DUPLICATE KEY UPDATE snapshot_json=VALUES(snapshot_json)`,
        [
          studentId,
          JSON.stringify({
            currentCourse: "数据结构",
            weakPoints: bundle.knowledge.slice(0, 3),
            preference: pick(random, PREFERENCES),
          }),
          "首次学情画像初始化",
          "demo_seed",
          JSON.stringify({ source: "seedDemoCohort" }),
        ],
      );

      const stages = Array.from({ length: 5 }, (_, stageIndex) => {
        const point = bundle.knowledge[(stageIndex + 1) % bundle.knowledge.length];
        const list = assets.dsQuestions.filter((row) => row.knowledge_point === point).slice(0, 3);
        const ids = (list.length ? list : pickMany(random, assets.dsQuestions, 2)).map(
          (row) => row.question_id,
        );
        return {
          key: `stage-${stageIndex + 1}`,
          title: `${stageIndex + 1}. ${point} · 针对性测验`,
          subject: "数据结构",
          durationMinutes: 45,
          goals: [`掌握${point}的核心概念与适用条件`, "完成阶段自测并复盘错题"],
          knowledgePoints: [point],
          questionIds: ids,
          codeExerciseIds: [],
          completion: { type: "quiz", ids },
          dependsOn: stageIndex === 0 ? [] : [`stage-${stageIndex}`],
        };
      });
      await connection.query(
        `INSERT INTO student_learning_paths (student_id,current_version) VALUES (?,1)
         ON DUPLICATE KEY UPDATE current_version=GREATEST(current_version,1), updated_at=NOW()`,
        [studentId],
      );
      await connection.query(
        `INSERT INTO learning_path_versions (student_id,version,title,snapshot_json,semantic_fingerprint,change_reason,source_type)
         VALUES (?,1,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE snapshot_json=VALUES(snapshot_json)`,
        [
          studentId,
          `${bundle.knowledge[0] || "数据结构"} 个性化学习路径`,
          JSON.stringify({ title: "个性化学习路径", stages }),
          sha(`path-${studentId}`),
          "个性化学习路径初始化",
          "demo_seed",
        ],
      );

      await insertRows(
        connection,
        "student_knowledge_mastery",
        [
          "student_id",
          "subject",
          "knowledge_point",
          "mastery",
          "wrong_count",
          "practice_count",
          "last_updated",
        ],
        bundle.mastery.map((item) => ({ student_id: studentId, ...item })),
      );
      await insertRows(
        connection,
        "student_error_patterns",
        [
          "student_id",
          "subject",
          "knowledge_point",
          "error_type",
          "occurrence_count",
          "confidence",
          "latest_evidence_json",
          "first_seen_at",
          "last_seen_at",
        ],
        bundle.errorPatterns.map((item) => ({
          student_id: studentId,
          ...item,
          latest_evidence_json: JSON.stringify(item.latest_evidence_json),
        })),
      );
      // 阶段完成证据：强一点的学生推得更远，弱一点的停在第一、二阶段
      await seedPathProgress(connection, studentId, {
        pathVersion: 1,
        stages,
        completeThrough: bundle.level < 0.25 ? 0 : bundle.level < 0.55 ? 1 : bundle.level < 0.8 ? 2 : 3,
        startDaysAgo: 26,
      });
      await connection
        .query("UPDATE student_learning_paths SET current_version=1 WHERE student_id=?", [studentId])
        .catch(() => undefined);

      for (const attempt of bundle.attempts) {
        const [result] = await connection.query(
          `INSERT INTO quiz_attempts (student_id,idempotency_key,subject,score,correct_count,total_count,started_at,submitted_at,result_json)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            studentId,
            attempt.idempotency_key,
            attempt.subject,
            attempt.score,
            attempt.correct_count,
            attempt.total_count,
            attempt.started_at,
            attempt.submitted_at,
            JSON.stringify({ seeded: true }),
          ],
        );
        await insertRows(
          connection,
          "quiz_attempt_answers",
          [
            "attempt_id",
            "question_id",
            "selected_answer",
            "correct_answer",
            "is_correct",
            "duration_seconds",
            "error_type",
            "created_at",
          ],
          attempt.answers.map((answer) => ({
            attempt_id: Number(result.insertId),
            question_id: answer.row.question_id,
            selected_answer: answer.selected,
            correct_answer: String(answer.row.answer || ""),
            is_correct: answer.correct ? 1 : 0,
            duration_seconds: answer.durationSeconds,
            error_type: answer.errorType,
            created_at: attempt.submitted_at,
          })),
        );
      }
      await insertRows(
        connection,
        "wrong_questions",
        [
          "student_id",
          "question_id",
          "subject",
          "knowledge_point",
          "difficulty",
          "question_text",
          "selected_answer",
          "correct_answer",
          "analysis",
          "error_reason",
          "feedback_suggestion",
          "recommended_action",
          "status",
          "created_at",
          "updated_at",
        ],
        bundle.wrongQuestions.map((item) => ({ student_id: studentId, ...item })),
      ).catch((error) => console.log(`  学生 ${studentId} 错题写入跳过：${error.code || error.message}`));
      await insertRows(
        connection,
        "code_submissions",
        [
          "student_id",
          "exercise_id",
          "language",
          "source_code",
          "stdin",
          "stdout",
          "stderr",
          "compile_output",
          "status",
          "time_used",
          "memory_used",
          "mode",
          "passed_count",
          "total_count",
          "result_json",
          "idempotency_key",
          "execution_mode",
          "created_at",
        ],
        bundle.submissions.map((item) => ({ student_id: studentId, ...item })),
      );
      await insertRows(
        connection,
        "focus_sessions",
        ["student_id", "session_date", "minutes", "created_at"],
        bundle.focusSessions.map((item) => ({ student_id: studentId, ...item })),
      );
      // 打卡记录：教师端「学生管理」的「30 天打卡」列看这张表
      await insertRows(
        connection,
        "daily_check_ins",
        ["student_id", "check_in_date", "created_at"],
        bundle.focusSessions.map((item) => ({
          student_id: studentId,
          check_in_date: item.session_date,
          created_at: item.created_at,
        })),
        { ignore: true },
      ).catch(() => undefined);
      await insertRows(
        connection,
        "student_learning_events",
        ["student_id", "event_type", "subject", "knowledge_point", "payload_json", "created_at"],
        bundle.events.map((item) => ({ student_id: studentId, ...item })),
      );
      await insertRows(
        connection,
        "knowledge_retrieval_runs",
        [
          "student_id",
          "request_type",
          "subject",
          "query_text",
          "normalized_query",
          "retrieval_strategy",
          "top_k",
          "minimum_score",
          "knowledge_point",
          "filters_json",
          "result_count",
          "confidence",
          "created_at",
        ],
        bundle.retrievalRuns.map((item) => ({ student_id: studentId, ...item })),
      );

      // 学习资源（含版本与进度），给教师端「资源完成数」「路径证据」用
      const resourceTypes = ["study_note", "mind_map", "quiz_pack"].slice(0, between(random, 2, 3));
      for (const [resourceIndex, resourceType] of resourceTypes.entries()) {
        const point = bundle.knowledge[(resourceIndex + 2) % bundle.knowledge.length];
        const pathVersion = 1;
        const stageKey = `stage-${(resourceIndex % 5) + 1}`;
        const [resourceResult] = await connection.query(
          `INSERT INTO learning_resources (student_id,subject,knowledge_point,resource_type,title,status,current_version,context_fingerprint,content_fingerprint,source_type,path_version,stage_key,estimated_minutes,created_at,updated_at)
           VALUES (?,?,?,?,?,'approved',1,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE title=VALUES(title), updated_at=NOW()`,
          [
            studentId,
            "数据结构",
            point,
            resourceType,
            `${point} · ${resourceType === "study_note" ? "个性化讲义" : resourceType === "mind_map" ? "思维导图" : "练习包"}`,
            sha(`ctx-${studentId}-${resourceType}`),
            sha(`content-${studentId}-${resourceType}`),
            "demo_seed",
            pathVersion,
            stageKey,
            between(random, 15, 45),
            at(between(random, 5, 30)),
            at(between(random, 0, 5)),
          ],
        );
        const [[resourceRow]] = await connection.query(
          "SELECT id FROM learning_resources WHERE student_id=? AND resource_type=? AND path_version=? AND stage_key=? LIMIT 1",
          [studentId, resourceType, pathVersion, stageKey],
        );
        const resourceId = Number(resourceRow?.id || resourceResult.insertId);
        if (!resourceId) continue;
        await connection.query(
          `INSERT INTO learning_resource_versions (resource_id,student_id,version,content_json,review_json,content_fingerprint,generator_source,model_name,prompt_version)
           VALUES (?,?,1,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE content_json=VALUES(content_json)`,
          [
            resourceId,
            studentId,
            JSON.stringify({
              title: `${point} 个性化资源`,
              content: { slides: [], root: { label: point }, sections: [] },
            }),
            JSON.stringify({ status: "approved", score: 90, summary: "按当前掌握度生成" }),
            sha(`content-${studentId}-${resourceType}`),
            "demo_seed",
            "glm-5.3-flashx",
            "demo-v1",
          ],
        );
        const completed = random() < (bundle.level < 0.3 ? 0.25 : bundle.level < 0.7 ? 0.6 : 0.9);
        await connection.query(
          `INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent,opened_at,completed_at,last_activity_at,accumulated_seconds)
           VALUES (?,?,1,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE status=VALUES(status), progress_percent=VALUES(progress_percent), completed_at=VALUES(completed_at)`,
          [
            studentId,
            resourceId,
            completed ? "completed" : pick(random, ["opened", "in_progress"]),
            completed ? 100 : between(random, 15, 80),
            at(between(random, 3, 25), between(random, 9, 22)),
            completed ? at(between(random, 0, 12), between(random, 9, 22)) : null,
            at(between(random, 0, 5), between(random, 9, 22)),
            between(random, 120, 3600),
          ],
        );
      }

      // 报告：给一部分学生生成（教师端「学习报告」页有内容）
      if (index % 3 === 0) {
        const built = await seedAssessmentReport(connection, teacherId, studentId, klass.id, {
          rangeDays: 30,
          reportVersion: 1,
          generatedAt: at(between(random, 0, 10), between(random, 9, 21)),
        });
        if (built.ok) reportSeeds += 1;
      }
    }
    console.log(
      `明细数据：${cohortUsers.length} 名学生（画像 / 路径 / 掌握度 / 错因 / 测验 / 错题 / 代码 / 时长 / 事件 / 资源）写入完成，报告 ${reportSeeds} 份`,
    );

    // 入班申请：专门造 2 个「姓氏+同学」的旁听申请者（不在班里），加上班里之外的同名重点学生，
    // 一共留 4 条 pending 给教师端「入班申请」页展示。
    const applicantRandom = mulberry32(31);
    const applyPrefix =
      options.prefix === USERNAME_PREFIX ? "apply_" : `apply${options.prefix.replace(/^cohort|\W/g, "")}_`;
    const applicants = options.seedApplicants
      ? [
          {
            username: `${applyPrefix}01`,
            student_no: `${options.noPrefix}APPLY01`,
            display_name: `${SURNAMES[(options.surnameOffset + 32) % SURNAMES.length]}同学`,
          },
          {
            username: `${applyPrefix}02`,
            student_no: `${options.noPrefix}APPLY02`,
            display_name: `${SURNAMES[(options.surnameOffset + 33) % SURNAMES.length]}同学`,
          },
        ]
      : [];
    if (applicants.length) {
      await insertRows(
        connection,
        "users",
        ["username", "student_no", "display_name", "password_hash", "role", "is_demo", "created_at"],
        applicants.map((item) => ({
          ...item,
          password_hash: passwordHash,
          role: "STUDENT",
          is_demo: 1,
          created_at: at(between(applicantRandom, 5, 20)),
        })),
        { ignore: true },
      );
    }
    const [applicantRows] = applicants.length
      ? await connection.query(
          `SELECT id, display_name FROM users WHERE username IN (${applicants.map(() => "?").join(",")}) ORDER BY id`,
          applicants.map((item) => item.username),
        )
      : [[]];
    const [otherStudents] = await connection.query(
      `SELECT u.id, u.display_name FROM users u
        WHERE u.role='STUDENT' AND u.display_name LIKE '%同学'
          AND u.username NOT LIKE 'cohort%'
          AND u.id NOT IN (SELECT student_id FROM teacher_class_students WHERE class_id=?)
          AND u.id NOT IN (SELECT student_id FROM teacher_class_join_requests WHERE class_id=? AND status='pending')
        ORDER BY u.id LIMIT 2`,
      [klass.id, klass.id],
    );
    const requestCandidates = [...applicantRows, ...otherStudents]
      .filter((row, index, list) => list.findIndex((item) => Number(item.id) === Number(row.id)) === index)
      .slice(0, 4);
    await insertRows(
      connection,
      "teacher_class_join_requests",
      ["class_id", "teacher_id", "student_id", "status", "message", "created_at"],
      requestCandidates.map((row) => ({
        class_id: klass.id,
        teacher_id: teacherId,
        student_id: Number(row.id),
        status: "pending",
        message: pick(applicantRandom, [
          "老师好，我想加入这个班跟着一起做作业。",
          "希望加入班级，方便完成课后练习。",
          "想加入班级参与学习和排名。",
        ]),
        created_at: at(between(applicantRandom, 0, 4), between(applicantRandom, 9, 20)),
      })),
      { ignore: true },
    ).catch(() => undefined);
    const [[requestCount]] = await connection.query(
      "SELECT COUNT(*) n FROM teacher_class_join_requests WHERE class_id=? AND status='pending'",
      [klass.id],
    );
    // 入班申请只留「少量」：只保留最新 4 条 pending，其余清掉，免得课堂上列表刷屏
    if (Number(requestCount.n) > 4) {
      await connection
        .query(
          `DELETE FROM teacher_class_join_requests WHERE class_id=? AND status='pending'
           AND id NOT IN (SELECT id FROM (SELECT id FROM teacher_class_join_requests WHERE class_id=? AND status='pending' ORDER BY id DESC LIMIT 4) AS keep)`,
          [klass.id, klass.id],
        )
        .catch(() => undefined);
    }
    const [[finalRequestCount]] = await connection.query(
      "SELECT COUNT(*) n FROM teacher_class_join_requests WHERE class_id=? AND status='pending'",
      [klass.id],
    );
    console.log(`入班申请：${finalRequestCount.n} 条待审核`);

    // 4) 班级作业：新造 4 份（按标题幂等）+ 给已有作业补提交
    // 每份都带选择/填空题，并按题型再挂代码题与简答题，保证学生端作业里三种题型都能看到。
    // 早期手工跑脚本时可能留下同名重复作业（同一班级同一标题多行），这里先合并：保留题量/挂载最多的那条。
    const [duplicateGroups] = await connection.query(
      `SELECT class_id, title, COUNT(*) n FROM assignments WHERE class_id=? GROUP BY class_id, title HAVING n > 1`,
      [klass.id],
    );
    for (const group of duplicateGroups) {
      const [rows] = await connection.query(
        `SELECT a.id,
                (SELECT COUNT(*) FROM assignment_questions q WHERE q.assignment_id=a.id)
              + (SELECT COUNT(*) FROM assignment_code_exercises c WHERE c.assignment_id=a.id)
              + (SELECT COUNT(*) FROM assignment_open_questions o WHERE o.assignment_id=a.id) AS links,
                (SELECT COUNT(*) FROM quiz_attempts t WHERE t.assignment_id=a.id) AS attempts
           FROM assignments a WHERE a.class_id=? AND a.title=? ORDER BY links DESC, attempts DESC, a.id DESC`,
        [klass.id, group.title],
      );
      const [keep, ...drop] = rows;
      for (const row of drop) {
        const assignmentId = Number(row.id);
        await connection
          .query(
            "DELETE FROM quiz_attempt_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE assignment_id=?)",
            [assignmentId],
          )
          .catch(() => undefined);
        await connection
          .query("DELETE FROM quiz_attempts WHERE assignment_id=?", [assignmentId])
          .catch(() => undefined);
        await connection
          .query("DELETE FROM assignment_open_answers WHERE assignment_id=?", [assignmentId])
          .catch(() => undefined);
        for (const table of [
          "assignment_questions",
          "assignment_code_exercises",
          "assignment_open_questions",
        ]) {
          await connection
            .query(`DELETE FROM ${table} WHERE assignment_id=?`, [assignmentId])
            .catch(() => undefined);
        }
        await connection.query("DELETE FROM assignments WHERE id=?", [assignmentId]).catch(() => undefined);
      }
      if (drop.length)
        console.log(
          `作业去重：「${group.title}」保留 #${keep.id}，删除重复的 ${drop.map((row) => `#${row.id}`).join("、")}`,
        );
    }
    const [existingAssignments] = await connection.query(
      "SELECT id, title, question_count FROM assignments WHERE class_id=? ORDER BY id",
      [klass.id],
    );
    // 同一学生同一份作业只保留最早一条 attempt：学生端列表按 assignment 关联 attempt，重复 attempt 会显示两遍
    const [attemptDuplicates] = await connection.query(
      `SELECT student_id, assignment_id, GROUP_CONCAT(id ORDER BY id) ids
         FROM quiz_attempts
        WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id=?)
        GROUP BY student_id, assignment_id HAVING COUNT(*) > 1`,
      [klass.id],
    );
    for (const row of attemptDuplicates) {
      const ids = String(row.ids).split(",").map(Number);
      const [, ...drop] = ids;
      if (!drop.length) continue;
      await connection
        .query(
          `DELETE FROM quiz_attempt_answers WHERE attempt_id IN (${drop.map(() => "?").join(",")})`,
          drop,
        )
        .catch(() => undefined);
      await connection
        .query(`DELETE FROM quiz_attempts WHERE id IN (${drop.map(() => "?").join(",")})`, drop)
        .catch(() => undefined);
    }
    if (attemptDuplicates.length)
      console.log(`作业提交去重：清理了 ${attemptDuplicates.length} 组重复 attempt`);
    const existingTitles = new Set(existingAssignments.map((row) => String(row.title)));
    const codePool = assets.codeExercises.filter((item) => item.subject === "数据结构");
    const openPool = assets.openQuestions.filter((item) => item.subject === "数据结构");
    const dsAll = assets.bySubject.get("数据结构") || [];
    const newAssignmentSpecs = [
      {
        title: "数据结构 · 树与二叉树综合练习",
        days: 5,
        questions: dsAll.filter((row) => /二叉树|树|遍历/.test(row.knowledge_point || "")).slice(0, 4),
        codeExercises: codePool.slice(0, 2),
        openQuestions: openPool.filter((row) => /树|遍历/.test(row.knowledge_point || "")).slice(0, 1),
      },
      {
        title: "数据结构 · 查找与排序阶段测验",
        days: 9,
        questions: dsAll.filter((row) => /排序|查找|哈希|二分/.test(row.knowledge_point || "")).slice(0, 4),
        codeExercises: codePool.slice(2, 3),
        openQuestions: openPool
          .filter((row) => /排序|哈希|复杂度/.test(row.knowledge_point || ""))
          .slice(0, 1),
      },
      {
        title: "数据结构 · 队列与栈代码实操",
        days: 3,
        questions: dsAll.filter((row) => /队列|栈/.test(row.knowledge_point || "")).slice(0, 3),
        codeExercises: codePool.slice(3, 5),
        openQuestions: [],
      },
      {
        title: "数据结构 · 综合应用与简答",
        days: 12,
        questions: pickMany(mulberry32(23), dsAll, 3),
        codeExercises: [],
        openQuestions: openPool.slice(1, 3),
      },
    ]
      .map((spec) => ({
        ...spec,
        questions: spec.questions.length ? spec.questions : pickMany(mulberry32(spec.days + 7), dsAll, 4),
      }))
      .filter((spec) => !existingTitles.has(spec.title));
    for (const spec of newAssignmentSpecs) {
      const [result] = await connection.query(
        `INSERT INTO assignments (teacher_id,class_id,title,description,subject,status,due_at,question_count)
         VALUES (?,?,?,?,?,'published',?,?)`,
        [
          teacherId,
          klass.id,
          spec.title,
          `本次作业：${spec.questions.length} 道客观题${spec.codeExercises.length ? ` · ${spec.codeExercises.length} 道代码题` : ""}${spec.openQuestions.length ? ` · ${spec.openQuestions.length} 道简答题` : ""}。`,
          "数据结构",
          at(-spec.days, 23, 59),
          spec.questions.length + spec.codeExercises.length + spec.openQuestions.length,
        ],
      );
      const assignmentId = Number(result.insertId);
      if (!assignmentId) continue;
      await insertRows(
        connection,
        "assignment_questions",
        ["assignment_id", "question_id", "order_index"],
        spec.questions.map((row, orderIndex) => ({
          assignment_id: assignmentId,
          question_id: row.question_id,
          order_index: orderIndex + 1,
        })),
        { ignore: true },
      );
      await insertRows(
        connection,
        "assignment_code_exercises",
        ["assignment_id", "exercise_id", "order_index"],
        spec.codeExercises.map((row, orderIndex) => ({
          assignment_id: assignmentId,
          exercise_id: row.exercise_id,
          order_index: orderIndex + 1,
        })),
        { ignore: true },
      );
      await insertRows(
        connection,
        "assignment_open_questions",
        ["assignment_id", "open_question_id", "order_index"],
        spec.openQuestions.map((row, orderIndex) => ({
          assignment_id: assignmentId,
          open_question_id: row.question_id,
          order_index: orderIndex + 1,
        })),
        { ignore: true },
      );
    }
    const [allAssignments] = await connection.query(
      "SELECT id, title, question_count, due_at FROM assignments WHERE class_id=? ORDER BY id",
      [klass.id],
    );
    let submissionRows = 0;
    // 重点学生的「待完成」控制：近期截止的 2 份留着不交，其余全部提交，页面上就是「已完成很多、还剩 1–2 份待做」
    const pendingKeepIds = new Set(
      [...allAssignments]
        .sort((a, b) => new Date(b.due_at || 0).getTime() - new Date(a.due_at || 0).getTime())
        .slice(0, 2)
        .map((row) => Number(row.id)),
    );
    const submitters = [...cohortUsers];
    for (const enrichedId of options.enrich) {
      const [[row]] = await connection.query("SELECT id, display_name FROM users WHERE id=?", [enrichedId]);
      if (row) submitters.push({ id: row.id, display_name: row.display_name, enriched: true });
    }
    for (const [assignmentIndex, assignment] of allAssignments.entries()) {
      const [questions] = await connection.query(
        `SELECT qb.question_id, qb.answer, qb.knowledge_point, qb.question_type, qb.subject FROM assignment_questions aq
           JOIN question_bank qb ON qb.question_id = aq.question_id WHERE aq.assignment_id=? ORDER BY aq.order_index`,
        [assignment.id],
      );
      const [codeLinks] = await connection.query(
        "SELECT exercise_id FROM assignment_code_exercises WHERE assignment_id=? ORDER BY order_index",
        [assignment.id],
      );
      if (!questions.length) continue;
      for (const [studentIndex, user] of submitters.entries()) {
        const random = mulberry32(5000 + Number(user.id) * 13 + assignmentIndex);
        if (user.enriched) {
          if (pendingKeepIds.has(Number(assignment.id))) continue; // 重点学生留待完成
        } else if (random() > 0.72) {
          // 其余学生约 3/4 已提交，留一部分未交，教师端作业统计才有分布
          continue;
        }
        // 已经交过这份作业的学生不再写第二条 attempt：学生端列表是按 assignment 关联 attempt 的，
        // 重复 attempt 会让同一份作业在列表里出现两遍。
        const [[existingAttempt]] = await connection.query(
          "SELECT id FROM quiz_attempts WHERE student_id=? AND assignment_id=? LIMIT 1",
          [Number(user.id), Number(assignment.id)],
        );
        if (existingAttempt?.id) continue;
        const answers = questions.map((row) => {
          const correct = user.enriched ? random() < 0.82 : random() < 0.75;
          return {
            row,
            selected: correct
              ? String(row.answer || "A")
                  .trim()
                  .toUpperCase()
              : wrongAnswerFor(random, row),
            correct,
            durationSeconds: between(random, 20, 120),
          };
        });
        const correctCount = answers.filter((item) => item.correct).length;
        const submittedAt = at(between(random, 0, 6), between(random, 10, 22));
        const idempotencyKey = `cohort-${user.id}-assign-${assignment.id}`;
        await connection
          .query(
            `INSERT INTO quiz_attempts (student_id,idempotency_key,subject,score,correct_count,total_count,started_at,submitted_at,result_json,assignment_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE score=VALUES(score), correct_count=VALUES(correct_count), submitted_at=VALUES(submitted_at)`,
            [
              Number(user.id),
              idempotencyKey,
              "数据结构",
              Math.round((correctCount / answers.length) * 100),
              correctCount,
              answers.length,
              new Date(submittedAt.getTime() - 12 * 60 * 1000),
              submittedAt,
              JSON.stringify({ seeded: true, assignmentId: Number(assignment.id) }),
              Number(assignment.id),
            ],
          )
          .catch(() => undefined);
        const [[attemptRow]] = await connection.query(
          "SELECT id FROM quiz_attempts WHERE student_id=? AND idempotency_key=?",
          [Number(user.id), idempotencyKey],
        );
        if (!attemptRow?.id) continue;
        await insertRows(
          connection,
          "quiz_attempt_answers",
          [
            "attempt_id",
            "question_id",
            "selected_answer",
            "correct_answer",
            "is_correct",
            "duration_seconds",
            "created_at",
          ],
          answers.map((answer) => ({
            attempt_id: Number(attemptRow.id),
            question_id: answer.row.question_id,
            selected_answer: answer.selected,
            correct_answer: String(answer.row.answer || ""),
            is_correct: answer.correct ? 1 : 0,
            duration_seconds: answer.durationSeconds,
            created_at: submittedAt,
          })),
          { ignore: true },
        );
        // 代码题提交：作业里挂了代码题时，学生也要有对应提交记录
        for (const [codeIndex, link] of codeLinks.entries()) {
          const accepted = user.enriched ? codeIndex === 0 : random() < 0.6;
          await connection
            .query(
              `INSERT INTO code_submissions (student_id,exercise_id,language,source_code,status,time_used,memory_used,mode,passed_count,total_count,result_json,idempotency_key,execution_mode,created_at,assignment_id)
             VALUES (?,?,'c',?,?,?,?,'submit',?,8,?,?,'docker',?,?)
             ON DUPLICATE KEY UPDATE status=VALUES(status), assignment_id=VALUES(assignment_id)`,
              [
                Number(user.id),
                link.exercise_id,
                `// 作业作答 ${assignment.title}\n`,
                accepted ? "accepted" : "wrong_answer",
                `${between(random, 8, 240)}ms`,
                `${between(random, 1, 12)}MB`,
                accepted ? 8 : between(random, 1, 6),
                JSON.stringify({ summary: accepted ? "全部用例通过" : "部分用例未通过" }),
                `${idempotencyKey}-code-${codeIndex + 1}`,
                submittedAt,
                Number(assignment.id),
              ],
            )
            .catch(() => undefined);
        }
        submissionRows += 1;
      }
      // 简答题作答（如作业挂了开放题）
      const [openLinks] = await connection.query(
        "SELECT open_question_id FROM assignment_open_questions WHERE assignment_id=?",
        [assignment.id],
      );
      for (const link of openLinks) {
        for (const [studentIndex, user] of cohortUsers.entries()) {
          const random = mulberry32(7000 + Number(user.id) * 17 + assignment.id);
          if (random() > 0.6) continue;
          await connection
            .query(
              `INSERT INTO assignment_open_answers (assignment_id,student_id,open_question_id,answer_text,created_at)
             VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE answer_text=VALUES(answer_text)`,
              [
                Number(assignment.id),
                Number(user.id),
                link.open_question_id,
                `${user.display_name} 结合定义、条件与例题说明自己的判断依据，并给出对应的实现思路。`,
                at(between(random, 0, 6), between(random, 10, 22)),
              ],
            )
            .catch(() => undefined);
        }
      }
    }
    console.log(`作业：班级内 ${allAssignments.length} 份，写入 ${submissionRows} 条学生提交`);

    // 5) 给指定重点学生补数据（默认 8 号张湛）
    for (const studentId of options.enrich) {
      const [[user]] = await connection.query("SELECT id, display_name FROM users WHERE id=?", [studentId]);
      if (!user) {
        console.log(`enrich：学生 ${studentId} 不存在，跳过`);
        continue;
      }
      const [[enrichSeeded]] = await connection.query(
        "SELECT id FROM quiz_attempts WHERE student_id=? AND idempotency_key=? LIMIT 1",
        [studentId, `cohort-${studentId}-q1`],
      );
      if (options.resetEnrich) {
        // 这三个表没有唯一键，重复 enrich 会一直堆行：需要重来一次时先清掉这名重点学生的历史
        for (const table of ["focus_sessions", "student_learning_events", "knowledge_retrieval_runs"]) {
          await connection
            .query(`DELETE FROM ${table} WHERE student_id=?`, [studentId])
            .catch(() => undefined);
        }
        console.log(`  --reset-enrich：已清理学生 ${studentId} 的时长 / 事件 / 检索记录，准备重建`);
      }
      const random = mulberry32(9000 + studentId);
      const bundle = buildStudentBundle(random, { id: studentId, name: user.display_name }, assets, options);
      // 重点学生的掌握度刻意做成有强有弱：雷达图有形状、报告有薄弱点也有优势
      const spread = [42, 47, 54, 58, 64, 69, 73, 79, 86, 93];
      const enrichMastery = researchMasteryPoints(assets, spread.length).map((point, index) => ({
        subject: "数据结构",
        knowledge_point: point,
        mastery: spread[index],
        wrong_count: Math.max(1, 9 - index),
        practice_count: 6 + index * 2,
        last_updated: at(index % 7, 20),
      }));
      bundle.mastery = enrichMastery;
      await upsertRows(
        connection,
        "student_knowledge_mastery",
        [
          "student_id",
          "subject",
          "knowledge_point",
          "mastery",
          "wrong_count",
          "practice_count",
          "last_updated",
        ],
        ["student_id", "subject", "knowledge_point"],
        ["mastery", "wrong_count", "practice_count", "last_updated"],
        bundle.mastery.map((item) => ({ student_id: studentId, ...item })),
      );
      await upsertRows(
        connection,
        "student_error_patterns",
        [
          "student_id",
          "subject",
          "knowledge_point",
          "error_type",
          "occurrence_count",
          "confidence",
          "latest_evidence_json",
          "first_seen_at",
          "last_seen_at",
        ],
        ["student_id", "subject", "knowledge_point", "error_type"],
        ["occurrence_count", "confidence", "latest_evidence_json", "last_seen_at"],
        bundle.errorPatterns.map((item) => ({
          student_id: studentId,
          ...item,
          latest_evidence_json: JSON.stringify(item.latest_evidence_json),
        })),
      );
      for (const attempt of bundle.attempts) {
        const [result] = await connection.query(
          `INSERT INTO quiz_attempts (student_id,idempotency_key,subject,score,correct_count,total_count,started_at,submitted_at,result_json)
           VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score)`,
          [
            studentId,
            attempt.idempotency_key,
            attempt.subject,
            attempt.score,
            attempt.correct_count,
            attempt.total_count,
            attempt.started_at,
            attempt.submitted_at,
            JSON.stringify({ seeded: true }),
          ],
        );
        const attemptId =
          Number(result.insertId) ||
          Number(
            (
              await connection.query(
                "SELECT id FROM quiz_attempts WHERE student_id=? AND idempotency_key=?",
                [studentId, attempt.idempotency_key],
              )
            )[0][0]?.id,
          );
        if (!attemptId) continue;
        await insertRows(
          connection,
          "quiz_attempt_answers",
          [
            "attempt_id",
            "question_id",
            "selected_answer",
            "correct_answer",
            "is_correct",
            "duration_seconds",
            "error_type",
            "created_at",
          ],
          attempt.answers.map((answer) => ({
            attempt_id: attemptId,
            question_id: answer.row.question_id,
            selected_answer: answer.selected,
            correct_answer: String(answer.row.answer || ""),
            is_correct: answer.correct ? 1 : 0,
            duration_seconds: answer.durationSeconds,
            error_type: answer.errorType,
            created_at: attempt.submitted_at,
          })),
        ).catch(() => undefined);
      }
      await insertRows(
        connection,
        "wrong_questions",
        [
          "student_id",
          "question_id",
          "subject",
          "knowledge_point",
          "difficulty",
          "question_text",
          "selected_answer",
          "correct_answer",
          "analysis",
          "error_reason",
          "feedback_suggestion",
          "recommended_action",
          "status",
          "created_at",
          "updated_at",
        ],
        bundle.wrongQuestions.map((item) => ({ student_id: studentId, ...item })),
      ).catch(() => undefined);
      await insertRows(
        connection,
        "code_submissions",
        [
          "student_id",
          "exercise_id",
          "language",
          "source_code",
          "stdin",
          "stdout",
          "stderr",
          "status",
          "time_used",
          "memory_used",
          "mode",
          "passed_count",
          "total_count",
          "result_json",
          "idempotency_key",
          "execution_mode",
          "created_at",
        ],
        bundle.submissions.map((item) => ({ student_id: studentId, ...item })),
        { ignore: true },
      ).catch(() => undefined);
      // 时长 / 事件 / 检索没有唯一键，重复跑会堆数据：只在首次 enrich（或显式 --reset-enrich 清空后）写入
      const writeTelemetry = !enrichSeeded?.id || options.resetEnrich;
      if (writeTelemetry) {
        await insertRows(
          connection,
          "focus_sessions",
          ["student_id", "session_date", "minutes", "created_at"],
          bundle.focusSessions.map((item) => ({ student_id: studentId, ...item })),
        );
        await insertRows(
          connection,
          "daily_check_ins",
          ["student_id", "check_in_date", "created_at"],
          bundle.focusSessions.map((item) => ({
            student_id: studentId,
            check_in_date: item.session_date,
            created_at: item.created_at,
          })),
          { ignore: true },
        ).catch(() => undefined);
        await insertRows(
          connection,
          "student_learning_events",
          ["student_id", "event_type", "subject", "knowledge_point", "payload_json", "created_at"],
          bundle.events.map((item) => ({ student_id: studentId, ...item })),
        );
        await insertRows(
          connection,
          "knowledge_retrieval_runs",
          [
            "student_id",
            "request_type",
            "subject",
            "query_text",
            "normalized_query",
            "retrieval_strategy",
            "top_k",
            "minimum_score",
            "knowledge_point",
            "filters_json",
            "result_count",
            "confidence",
            "created_at",
          ],
          bundle.retrievalRuns.map((item) => ({ student_id: studentId, ...item })),
        ).catch(() => undefined);
      }
      // 报告在下面的路径证据 / 资源进度补齐之后再生成（保证报告里的进度与资源数是最终值）

      // 让重点学生的路径完成度真实可算：按当前路径的阶段顺序补时间递增的作答证据
      const [[pathRow]] = await connection.query(
        `SELECT lpv.snapshot_json FROM student_learning_paths slp
           JOIN learning_path_versions lpv ON lpv.student_id = slp.student_id AND lpv.version = slp.current_version
          WHERE slp.student_id = ? LIMIT 1`,
        [studentId],
      );
      const pathSnapshot =
        typeof pathRow?.snapshot_json === "string"
          ? JSON.parse(pathRow.snapshot_json)
          : pathRow?.snapshot_json;
      const pathStages = pathSnapshot?.stages || [];
      const pathVersion =
        Number(pathSnapshot?.version || 0) ||
        (
          await connection.query("SELECT current_version FROM student_learning_paths WHERE student_id=?", [
            studentId,
          ])
        )[0][0]?.current_version ||
        1;
      if (pathStages.length) {
        // 重点学生推进到「倒数第二个阶段」：前面的阶段有实证，最后一个阶段留作课堂上的下一步
        const stageCount = await seedPathProgress(connection, studentId, {
          pathVersion: Number(pathVersion),
          stages: pathStages,
          completeThrough: Math.max(0, pathStages.length - 2),
          startDaysAgo: 22,
          subject: pathStages[0]?.subject || "数据结构",
        });
        console.log(
          `  路径证据：${pathStages.length} 个阶段（路径 v${pathVersion}）中写入 ${stageCount} 段完成证据`,
        );
      }
      // 资源进度：一部分已完成、一部分进行中，报告里的「资源完成数」才有内容
      await connection
        .query(
          `INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent,opened_at,completed_at,last_activity_at,accumulated_seconds)
         SELECT student_id, id, current_version, 'completed', 100, DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 2600
           FROM learning_resources WHERE student_id = ? AND current_version > 0 ORDER BY id LIMIT 5
         ON DUPLICATE KEY UPDATE status='completed', progress_percent=100, completed_at=VALUES(completed_at), last_activity_at=VALUES(last_activity_at)`,
          [studentId],
        )
        .catch((error) => console.log(`  资源完成记录跳过：${error.code || error.message}`));
      await connection
        .query(
          `INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent,opened_at,last_activity_at,accumulated_seconds)
         SELECT student_id, id, current_version, 'in_progress', 45, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 900
           FROM learning_resources WHERE student_id = ? AND current_version > 0 ORDER BY id DESC LIMIT 3
         ON DUPLICATE KEY UPDATE progress_percent=GREATEST(progress_percent,45), last_activity_at=VALUES(last_activity_at)`,
          [studentId],
        )
        .catch(() => undefined);
      const builtReport = await seedAssessmentReport(connection, teacherId, studentId, klass.id, {
        rangeDays: 30,
        reportVersion: 1,
        generatedAt: at(between(random, 0, 5), between(random, 9, 21)),
      });
      console.log(
        `enrich：学生 ${studentId}（${user.display_name}）已补充掌握度 / 错因 / 测验 / 错题 / 代码 / 时长 / 事件 / 资源${builtReport.ok ? " / 学习评估报告" : `（报告跳过：${builtReport.reason}）`}`,
      );
    }

    // 6) 汇总
    const [summary] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE username LIKE '${prefixLike}') AS students,
         (SELECT COUNT(*) FROM teacher_class_students WHERE class_id=?) AS members,
         (SELECT COUNT(*) FROM quiz_attempts WHERE student_id IN (SELECT id FROM users WHERE username LIKE '${prefixLike}')) AS attempts,
         (SELECT COUNT(*) FROM wrong_questions WHERE student_id IN (SELECT id FROM users WHERE username LIKE '${prefixLike}')) AS wrongs,
         (SELECT COUNT(*) FROM student_knowledge_mastery WHERE student_id IN (SELECT id FROM users WHERE username LIKE '${prefixLike}')) AS mastery_rows,
         (SELECT COUNT(*) FROM code_submissions WHERE student_id IN (SELECT id FROM users WHERE username LIKE '${prefixLike}')) AS code_rows,
         (SELECT COUNT(*) FROM teacher_class_join_requests WHERE class_id=? AND status='pending') AS pending_requests,
         (SELECT COUNT(*) FROM assignments WHERE class_id=?) AS assignments`,
      [klass.id, klass.id, klass.id],
    );
    console.log("汇总：", summary[0]);
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("造数据失败：", error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { main, seedAssessmentReport };
