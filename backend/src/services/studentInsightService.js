/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { getCompleteProfile } = require("./studentProfileService");
const { getCurrentLearningPath } = require("./learningPathService");

const RESOURCE_TYPES = ["study_note", "mind_map", "pptx", "quiz_pack", "code_case"];

async function getStudentOverview(studentId, executor = pool) {
  const id = positiveStudentId(studentId);
  const [profile, path, userResult, quizResult, resourceResult, codeResult, eventResult] = await Promise.all([
    getCompleteProfile(id, executor),
    getCurrentLearningPath(id),
    executor.query("SELECT display_name FROM users WHERE id=? LIMIT 1", [id]),
    executor.query(
      `SELECT id,subject,score,correct_count,total_count,submitted_at
      FROM quiz_attempts WHERE student_id=? ORDER BY submitted_at DESC LIMIT 50`,
      [id],
    ),
    executor.query(
      `SELECT r.id,r.title,r.subject,r.knowledge_point,r.resource_type,r.updated_at,
        p.status progress_status,p.progress_percent,p.completed_at
      FROM learning_resources r
      LEFT JOIN learning_resource_progress p ON p.student_id=r.student_id AND p.resource_id=r.id AND p.resource_version=r.current_version
      WHERE r.student_id=? AND r.status='approved' ORDER BY r.updated_at DESC LIMIT 100`,
      [id],
    ),
    executor.query(
      `SELECT id,exercise_id,status,mode,execution_mode,time_used,memory_used,created_at
      FROM code_submissions WHERE student_id=? ORDER BY created_at DESC LIMIT 100`,
      [id],
    ),
    executor.query(
      `SELECT event_type,subject,knowledge_point,payload_json,created_at
      FROM student_learning_events WHERE student_id=? ORDER BY created_at DESC LIMIT 30`,
      [id],
    ),
  ]);

  const quizzes = quizResult[0];
  const resources = resourceResult[0];
  const codeSubmissions = codeResult[0];
  const events = eventResult[0];
  const mastery = profile.profile.knowledgeMastery;
  const answered = sum(quizzes, "total_count");
  const correct = sum(quizzes, "correct_count");
  const successfulCode = codeSubmissions.filter(
    (item) => item.mode === "submit" && item.status === "accepted" && item.execution_mode === "docker",
  );
  const completedResources = resources.filter((item) => item.progress_status === "completed");
  const resourcesByType = resourceTypeCounts(resources);

  return {
    generatedAt: new Date().toISOString(),
    studentName: userResult[0][0]?.display_name || "同学",
    profile: {
      version: profile.version,
      completeness: profile.completeness,
      confirmedAt: profile.confirmedAt,
      currentCourse: profile.profile.currentCourse,
      overallMastery: average(mastery.map((item) => item.mastery)),
      weakPointCount: mastery.filter((item) => item.mastery < 60).length,
      errorPatternCount: profile.profile.errorPatterns.length,
    },
    courses: groupCourses(mastery),
    quiz: {
      attemptCount: quizzes.length,
      averageAccuracy: answered ? round((correct / answered) * 100) : null,
      correctCount: correct,
      answerCount: answered,
      latestAt: quizzes[0]?.submitted_at || null,
      recent: quizzes.slice(0, 8).map((item) => ({
        id: Number(item.id),
        subject: item.subject,
        score: Number(item.score),
        correctCount: Number(item.correct_count),
        totalCount: Number(item.total_count),
        submittedAt: item.submitted_at,
      })),
    },
    path: path
      ? {
          version: path.version,
          title: path.title,
          progress: finiteOrNull(path.progress),
          stages: path.stages.length,
        }
      : null,
    resources: {
      totalCount: resources.length,
      completedCount: completedResources.length,
      inProgressCount: resources.filter((item) => item.progress_status === "in_progress").length,
      latestAt: resources[0]?.updated_at || null,
      byType: resourcesByType,
    },
    codeLab: {
      submissionCount: codeSubmissions.length,
      successCount: successfulCode.length,
      successRate: codeSubmissions.length
        ? round((successfulCode.length / codeSubmissions.length) * 100)
        : null,
      latestAt: codeSubmissions[0]?.created_at || null,
    },
    recentActivities: buildActivities({ events, quizzes, resources, codeSubmissions }).slice(0, 10),
  };
}

async function getStudentAssessment(studentId, executor = pool) {
  const id = positiveStudentId(studentId);
  const [overview, profile, wrongResult, reportResult] = await Promise.all([
    getStudentOverview(id, executor),
    getCompleteProfile(id, executor),
    executor.query(
      `SELECT id,subject,knowledge_point,error_reason,feedback_suggestion,recommended_action,status,updated_at
      FROM wrong_questions WHERE student_id=? ORDER BY updated_at DESC LIMIT 100`,
      [id],
    ),
    executor.query(
      `SELECT id,report_version,status,generated_at,created_at
      FROM learning_assessment_reports WHERE student_id=? AND status='approved' ORDER BY report_version DESC,created_at DESC LIMIT 1`,
      [id],
    ),
  ]);
  const mastery = profile.profile.knowledgeMastery;
  const errorPatterns = profile.profile.errorPatterns;
  const wrongQuestions = wrongResult[0];
  const evidenceCount =
    overview.quiz.attemptCount + overview.codeLab.submissionCount + overview.resources.completedCount;
  const weaknesses = mastery
    .filter((item) => item.mastery < 60)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 8)
    .map((item) =>
      conclusion(
        `${item.knowledgePoint}仍需巩固`,
        [
          `${item.subject}掌握度 ${round(item.mastery)}%`,
          `累计错题 ${item.wrongCount} 次、练习 ${item.practiceCount} 次`,
        ],
        item,
      ),
    );
  const strengths = mastery
    .filter((item) => item.mastery >= 80)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 5)
    .map((item) =>
      conclusion(
        `${item.knowledgePoint}表现稳定`,
        [`${item.subject}掌握度 ${round(item.mastery)}%`, `累计练习 ${item.practiceCount} 次`],
        item,
      ),
    );
  const patterns = errorPatterns
    .slice(0, 8)
    .map((item) =>
      conclusion(
        `${item.knowledgePoint}：${item.errorType}`,
        [`出现 ${item.occurrenceCount} 次`, `归因置信度 ${round(item.confidence * 100)}%`],
        item,
      ),
    );
  const risks = buildRisks(overview, weaknesses, patterns);
  const recommendations = buildRecommendations(overview, weaknesses, wrongQuestions);

  return {
    generatedAt: overview.generatedAt,
    profileVersion: profile.version,
    evidenceSufficient: evidenceCount > 0,
    evidenceCount,
    metrics: {
      overallMastery: overview.profile.overallMastery,
      pathProgress: overview.path?.progress ?? null,
      completedResources: overview.resources.completedCount,
      resourceCount: overview.resources.totalCount,
      resourcesByType: overview.resources.byType,
      quiz: overview.quiz,
      codeLab: overview.codeLab,
    },
    mastery: mastery.map((item) => ({ ...item, mastery: finiteOrNull(item.mastery) })),
    weaknesses,
    errorPatterns: patterns,
    strengths,
    risks,
    recommendations,
    latestPersistedReport: reportResult[0][0]
      ? {
          id: Number(reportResult[0][0].id),
          version: Number(reportResult[0][0].report_version),
          generatedAt: reportResult[0][0].generated_at || reportResult[0][0].created_at,
        }
      : null,
    dataSources: [
      "学生画像与画像版本",
      "知识点掌握记录",
      "测验作答记录",
      "错题与错误模式",
      "当前学习路径",
      "资源完成记录",
      "CodeLab 提交记录",
    ],
  };
}

function buildRisks(overview, weaknesses, patterns) {
  const result = [];
  if (weaknesses.length)
    result.push(
      conclusion(
        "存在尚未稳定掌握的知识点",
        weaknesses.slice(0, 3).flatMap((item) => item.evidence),
      ),
    );
  if (patterns.length)
    result.push(
      conclusion(
        "错误模式可能重复出现",
        patterns.slice(0, 2).flatMap((item) => item.evidence),
      ),
    );
  if (overview.quiz.averageAccuracy !== null && overview.quiz.averageAccuracy < 60) {
    result.push(
      conclusion("近期测验正确率偏低", [
        `${overview.quiz.attemptCount} 次测验，平均正确率 ${overview.quiz.averageAccuracy}%`,
      ]),
    );
  }
  if (!overview.codeLab.submissionCount)
    result.push(conclusion("尚缺少 CodeLab 实践证据", ["CodeLab 提交记录为 0"]));
  return result;
}

function buildRecommendations(overview, weaknesses, wrongQuestions) {
  const result = [];
  if (weaknesses[0])
    result.push(conclusion(`先复习${weaknesses[0].knowledgePoint}并完成同类练习`, weaknesses[0].evidence));
  const pending = wrongQuestions.filter((item) => item.status !== "已掌握");
  if (pending.length)
    result.push(
      conclusion("复盘待掌握错题", [
        `当前有 ${pending.length} 道待复习错题`,
        pending[0].recommended_action || pending[0].feedback_suggestion || "按错题反馈完成同类练习",
      ]),
    );
  if (!overview.codeLab.submissionCount)
    result.push(conclusion("完成一次 CodeLab 实践", ["当前没有 CodeLab 提交记录"]));
  if (!overview.quiz.attemptCount) result.push(conclusion("完成一次每日测验", ["当前没有测验记录"]));
  if (!result.length)
    result.push(
      conclusion("按当前学习路径继续下一阶段", [
        `当前路径进度 ${overview.path?.progress ?? "尚未形成"}${overview.path ? "%" : ""}`,
      ]),
    );
  return result;
}

function groupCourses(mastery) {
  const groups = new Map();
  for (const item of mastery) {
    const subject = String(item.subject || "").trim();
    if (!subject) continue;
    const list = groups.get(subject) || [];
    list.push(item);
    groups.set(subject, list);
  }
  return [...groups.entries()].map(([subject, items]) => ({
    subject,
    mastery: average(items.map((item) => item.mastery)),
    practiceCount: sum(items, "practiceCount"),
    wrongCount: sum(items, "wrongCount"),
    knowledgePointCount: items.length,
  }));
}

function resourceTypeCounts(resources) {
  return Object.fromEntries(
    RESOURCE_TYPES.map((resourceType) => {
      const matching = resources.filter((item) => item.resource_type === resourceType);
      return [
        resourceType,
        {
          generatedCount: matching.length,
          completedCount: matching.filter((item) => item.progress_status === "completed").length,
          inProgressCount: matching.filter((item) => item.progress_status === "in_progress").length,
        },
      ];
    }),
  );
}

function buildActivities({ events, quizzes, resources, codeSubmissions }) {
  const eventItems = events
    .filter((item) => item.event_type !== "quiz_submitted")
    .map((item) => ({
      type: item.event_type,
      text: eventText(item),
      time: item.created_at,
    }));
  const quizItems = quizzes.map((item) => ({
    type: "quiz",
    text: `完成${item.subject || "课程"}测验，得分 ${Number(item.score)}`,
    time: item.submitted_at,
  }));
  const resourceItems = resources
    .filter((item) => item.completed_at)
    .map((item) => ({ type: "resource", text: `完成学习资源《${item.title}》`, time: item.completed_at }));
  const codeItems = codeSubmissions.map((item) => ({
    type: "codelab",
    text: `CodeLab ${item.exercise_id} 提交${item.status === "success" ? "成功" : "未通过"}`,
    time: item.created_at,
  }));
  return [...eventItems, ...quizItems, ...resourceItems, ...codeItems]
    .filter((item) => item.time && !Number.isNaN(new Date(item.time).getTime()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function eventText(item) {
  const payload = parseObject(item.payload_json);
  if (item.event_type === "profile_confirmed") return `确认学习画像 V${payload.version || ""}`.trim();
  if (item.event_type === "quiz_submitted")
    return `完成${item.subject || "课程"}测验，得分 ${payload.score ?? "未记录"}`;
  return `产生学习记录：${item.event_type}`;
}

function conclusion(text, evidence, source = {}) {
  return {
    text,
    evidence: evidence.filter(Boolean),
    knowledgePoint: source.knowledgePoint || null,
    subject: source.subject || null,
  };
}
function positiveStudentId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("无效学生身份");
    error.statusCode = 400;
    throw error;
  }
  return id;
}
function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? round(clean.reduce((a, b) => a + b, 0) / clean.length) : null;
}
function sum(items, key) {
  return items.reduce(
    (total, item) => total + (Number.isFinite(Number(item[key])) ? Number(item[key]) : 0),
    0,
  );
}
function round(value) {
  return Math.round(Number(value) * 10) / 10;
}
function parseObject(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

module.exports = {
  RESOURCE_TYPES,
  getStudentOverview,
  getStudentAssessment,
  groupCourses,
  resourceTypeCounts,
  buildActivities,
};
