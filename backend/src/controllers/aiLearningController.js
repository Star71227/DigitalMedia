/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { probeAIService } = require("../services/aiService");
const { getWebSearchStatus } = require("../services/webSearchService");
const { getAgentCatalog, getAgentIntegrationStatus } = require("../services/agentCatalogService");
const {
  createPersonalDocument,
  listPersonalDocuments,
  deletePersonalDocument,
  getKnowledgeGraph,
} = require("../services/personalKnowledgeService");
const { analyzeWrongQuestion } = require("../services/wrongQuestionRecognitionService");
const { generatePersonalizedQuiz } = require("../services/personalizedQuizService");
const { listDueReviews, recordReviewResult } = require("../services/reviewScheduleService");
const {
  getCollaboration,
  getPipelineCatalog,
  listCollaborations,
} = require("../services/agentCollaborationService");
const { runTeachingFullLoop } = require("../services/agentTeachingLoopService");

async function status(req, res, next) {
  try {
    // Configuration alone is not readiness: the local LLaMA Factory process may
    // have exited while the environment variables still look valid.
    const ai = await probeAIService({ timeoutMs: 3000 });
    const search = getWebSearchStatus();
    return res.json({
      status: !ai.available
        ? "configuration_required"
        : !ai.ready
          ? "model_unreachable"
          : search.available
            ? "ready"
            : "model_ready_search_pending",
      ai,
      webSearch: search,
      models: {
        default: process.env.LLM_MODEL || ai.model,
        vision: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL || ai.model,
        tutor: process.env.LLM_TUTOR_MODEL || process.env.LLM_MODEL || ai.model,
        planner: process.env.LLM_PLANNER_MODEL || process.env.LLM_MODEL || ai.model,
        quiz: process.env.LLM_QUIZ_MODEL || process.env.LLM_MODEL || ai.model,
      },
      evidencePolicy: "course_and_student_private_only",
      capabilities: {
        wrongQuestionVision: ai.ready && ai.transport === "http",
        groundedCourseCitations: true,
        personalKnowledge: true,
        learningPathContextChain: true,
        personalizedWebQuiz: search.available,
        rollingReview: true,
      },
      agents: getAgentCatalog(),
    });
  } catch (error) {
    return next(error);
  }
}

async function agents(req, res, next) {
  try {
    return res.json(await getAgentIntegrationStatus({ probe: false }));
  } catch (error) {
    return next(error);
  }
}

async function modelHealth(req, res, next) {
  try {
    const result = await getAgentIntegrationStatus({ probe: true });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function createDocument(req, res, next) {
  try {
    const result = await createPersonalDocument({ studentId: req.user.studentId, ...req.body });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    return next(error);
  }
}
async function listDocuments(req, res, next) {
  try {
    return res.json({ data: await listPersonalDocuments(req.user.studentId, req.query) });
  } catch (error) {
    return next(error);
  }
}
async function removeDocument(req, res, next) {
  try {
    const deleted = await deletePersonalDocument(req.user.studentId, req.params.documentId);
    return deleted ? res.json({ success: true }) : res.status(404).json({ error: "资料不存在" });
  } catch (error) {
    return next(error);
  }
}
async function graph(req, res, next) {
  try {
    return res.json(await getKnowledgeGraph(req.user.studentId, req.query));
  } catch (error) {
    return next(error);
  }
}
async function analyzeWrong(req, res, next) {
  try {
    return res.status(201).json(await analyzeWrongQuestion({ studentId: req.user.studentId, ...req.body }));
  } catch (error) {
    return next(error);
  }
}
async function generateQuiz(req, res, next) {
  try {
    return res
      .status(201)
      .json(await generatePersonalizedQuiz({ studentId: req.user.studentId, ...req.body }));
  } catch (error) {
    return next(error);
  }
}
async function reviewQueue(req, res, next) {
  try {
    return res.json({ data: await listDueReviews(req.user.studentId, req.query) });
  } catch (error) {
    return next(error);
  }
}
async function reviewResult(req, res, next) {
  try {
    const result = await recordReviewResult({
      studentId: req.user.studentId,
      itemId: req.params.itemId,
      quality: req.body?.quality,
    });
    return result ? res.json(result) : res.status(404).json({ error: "复习任务不存在" });
  } catch (error) {
    return next(error);
  }
}
async function loopOverview(req, res, next) {
  try {
    const studentId = req.user.studentId;
    const [[documents], [wrong], [chats], [paths], [quizzes], [reviews]] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) count FROM student_knowledge_documents WHERE student_id=? AND status='active'",
        [studentId],
      ),
      pool.query("SELECT COUNT(*) count FROM wrong_questions WHERE student_id=?", [studentId]),
      pool.query("SELECT COUNT(*) count FROM chat_messages WHERE student_id=? AND role='user'", [studentId]),
      pool.query("SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1", [
        studentId,
      ]),
      pool.query("SELECT COUNT(*) count FROM question_bank WHERE owner_student_id=?", [studentId]),
      pool.query(
        "SELECT COUNT(*) count FROM review_schedule_items WHERE student_id=? AND status='pending' AND due_at<=NOW()",
        [studentId],
      ),
    ]);
    return res.json({
      chain: [
        "资料上传",
        "错题识别",
        "教材证据检索",
        "助手提问沉淀",
        "学习路径生成",
        "联网测验组卷",
        "滚动复习",
      ],
      counts: {
        personalDocuments: Number(documents[0]?.count || 0),
        wrongQuestions: Number(wrong[0]?.count || 0),
        assistantQuestions: Number(chats[0]?.count || 0),
        pathVersion: Number(paths[0]?.current_version || 0),
        personalizedQuestions: Number(quizzes[0]?.count || 0),
        dueReviews: Number(reviews[0]?.count || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
}

function resourceCatalog(req, res) {
  return res.json({
    groups: [
      { key: "understand", label: "理解知识", types: ["study_note", "mind_map", "ppt"] },
      { key: "practice", label: "练习应用", types: ["quiz_pack", "code_case"] },
      { key: "review", label: "复习巩固", types: ["wrong_question_review", "spaced_review"] },
    ],
    workflow: [
      "选择路径阶段",
      "汇总画像与错题",
      "检索课程私有知识",
      "模型生成",
      "引用与质量校验",
      "保存版本",
      "学习进度回写",
    ],
    endpoints: {
      list: "GET /api/resources",
      generate: "POST /api/resources/generate",
      detail: "GET /api/resources/:resourceId",
      progress: "POST /api/resources/:resourceId/progress",
    },
  });
}

/* ---------------------------------------------------------------------------
 * 多智能体协作（项目核心特色）：线路图 + 协作轨迹 + 八智能体全链路
 * ------------------------------------------------------------------------- */

/** 线路图：每条 AI 能力由哪些智能体按什么顺序接力、各自交接什么 */
async function collaborationPipelines(req, res, next) {
  try {
    return res.json({ data: getPipelineCatalog() });
  } catch (error) {
    return next(error);
  }
}

/** 最近的协作轨迹：按 trace_id 归组，还原「这一次协作发生了什么」 */
async function collaborations(req, res, next) {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    const canSeeAll = role === "TEACHER" || role === "ADMIN";
    const scopeAll = String(req.query.scope || "").toLowerCase() === "all" && canSeeAll;
    return res.json({
      data: await listCollaborations({
        limit: req.query.limit,
        studentId: scopeAll ? null : req.user?.studentId,
      }),
      scope: scopeAll ? "all" : "self",
    });
  } catch (error) {
    return next(error);
  }
}

/** 单次协作的完整轨迹（含声明的流水线与实际执行对比） */
async function collaborationDetail(req, res, next) {
  try {
    const result = await getCollaboration(req.params.traceId);
    if (!result) return res.status(404).json({ error: "协作轨迹不存在" });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * 八智能体教学全链路：一次请求串起 8 个智能体、含 3 段审核闭环。
 * 结果里同时返回各智能体产物与协作轨迹，前端可直接渲染“协作回放”。
 */
async function fullLoop(req, res, next) {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    const studentId = role === "STUDENT" ? req.user?.studentId : req.body?.studentId || null;
    const result = await runTeachingFullLoop({
      studentId,
      subject: req.body?.subject,
      topic: req.body?.topic,
      difficulty: req.body?.difficulty,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  status,
  agents,
  modelHealth,
  createDocument,
  listDocuments,
  removeDocument,
  graph,
  analyzeWrong,
  generateQuiz,
  reviewQueue,
  reviewResult,
  loopOverview,
  resourceCatalog,
  collaborationPipelines,
  collaborations,
  collaborationDetail,
  fullLoop,
};
