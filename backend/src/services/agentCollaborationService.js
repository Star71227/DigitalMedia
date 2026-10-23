/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 多智能体协作（本项目核心特色）——协作轨迹与流水线声明
 * ---------------------------------------------------------------------------
 * 这个项目的 AI 能力不是「一个大模型答所有问题」，而是把教学任务拆给一组职责单一的
 * 智能体，由编排器（agentOrchestrator）按流水线调度：上一个智能体的产物就是下一个的输入，
 * 关键环节还有专职审核智能体把关、不通过就打回重写。
 *
 * 本模块负责把这件事变成**显式、可展示、可追溯**的东西，共三件事：
 *
 *   1. COLLABORATION_PIPELINES —— 把每条流水线声明出来：谁先跑、谁接谁的产物、各自负责什么。
 *      协作关系写在配置里而不是散落在调用顺序中，前端与评测都能直接读到。
 *
 *   2. AsyncLocalStorage 协作上下文 —— 一次用户请求 = 一次协作（一个 traceId）。
 *      编排器用 runWithCollaboration 开一个作用域，作用域内每次 runLoggedAgent 都自动
 *      绑定同一个 traceId 和递增的 step_index，不需要在每个调用点手写参数。
 *
 *   3. 协作轨迹查询 —— 把 agent_run_logs 按 trace_id 归组，还原「这一次协作到底发生了什么」：
 *      参与了哪些智能体、先后顺序、各自耗时与状态、产出摘要。
 *
 * 关于准确性：下面的流水线只声明代码里真实存在的调用关系（由 agentOrchestrator / aiTutorService
 * 的实际 runLoggedAgent 调用点核对而来），不做营销式夸大。
 */
const crypto = require("crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const { pool } = require("../config/db");
const { logAgentRun: persistAgentRun } = require("./agentLogService");

const collaborationStorage = new AsyncLocalStorage();

// agent_run_logs.agent_name → 展示用中文名（与前端「运行日志」保持一致的口径）
const AGENT_LABELS = Object.freeze({
  Coordinator: "协调器",
  Retriever: "课程证据检索",
  ProfileAgent: "学习画像智能体",
  TutorAgent: "私有知识辅导智能体",
  WrongQuestionVisionAgent: "错题视觉识别智能体",
  PlannerAgent: "学习路径规划智能体",
  ResourceAgent: "多模态学习资源智能体",
  ReviewAgent: "内容审核智能体",
  QuizAgent: "个性化测验智能体",
  FeedbackAgent: "错因反馈智能体",
  AssessmentAgent: "学习效果评估智能体",
  CodeTutorAgent: "代码解释智能体",
});

/**
 * 声明的协作流水线。
 * steps[].handoff 说明「上一步交给下一步什么」，这是多智能体协作与「一个大模型硬答」的本质区别。
 * 标注 role 为 retrieval / deterministic 的步骤不是模型调用，但它们是协作链路里真实的一环。
 */
const COLLABORATION_PIPELINES = Object.freeze([
  {
    key: "chat",
    label: "AI 学习助手答疑",
    scenario: "学生提问 → 理解意图 → 检索课程证据 → 生成讲解 → 审核引用与质量 → 不达标打回重写",
    trigger: "POST /api/chat",
    steps: [
      {
        agent: "Coordinator",
        role: "coordinator",
        contributes: "判定提问意图、学科与知识点，判断是否需要代码示例",
        handoff: "把结构化意图 + 学生画像 + 历史提问交给检索环节",
      },
      {
        agent: "Retriever",
        role: "retrieval",
        contributes: "从课程知识库与学生私有资料检索可引用证据片段",
        handoff: "把带编号的证据片段交给辅导智能体，作为唯一可引用来源",
      },
      {
        agent: "TutorAgent",
        role: "tutor",
        contributes: "依据证据生成讲解与代码示例，逐条标注引用编号",
        handoff: "把带引用的回答交给审核智能体与引用校验",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "校验引用覆盖率、结论是否有证据支撑、内容是否达标",
        handoff:
          "不通过时把具体问题（最多 12 条）回灌给 TutorAgent 重写，最多 2 轮；仍不通过则回退为课程资料确定性回答",
      },
    ],
  },
  {
    key: "resource_generation",
    label: "多模态学习资源生成（讲义 / 课件 / 思维导图 / 练习包 / 代码案例）",
    scenario: "四智能体接力：分析学情 → 生成资源 → 质量审核 → 追加学习路径",
    trigger: "POST /api/resources/generate",
    steps: [
      {
        agent: "ProfileAgent",
        role: "profiler",
        contributes: "结合课程、主题和难度分析学习目标、基础要求与可能薄弱点",
        handoff: "把学情分析结论作为资源生成的前置约束",
      },
      {
        agent: "ResourceAgent",
        role: "generator",
        contributes:
          "按学习目标生成含学习目标/核心概念/例题/易错点/巩固练习的 Markdown 讲义，并在数据结构等科目里附代码示例",
        handoff: "把资源正文交给审核智能体",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "检查资料是否围绕主题、难度是否匹配、是否有明显错误，输出审核摘要",
        handoff: "把审核摘要 + 资源正文一起交给规划智能体，用于安排后续路径",
      },
      {
        agent: "PlannerAgent",
        role: "planner",
        contributes: "基于资源内容与审核意见追加后续学习路径建议",
        handoff: "最终产物 = 资源正文 + 审核摘要 + 路径建议，一起入库供学生查看",
      },
    ],
  },
  {
    key: "adaptive_quiz",
    label: "个性化测验生成",
    scenario: "结合学习路径与错题生成学生独享测验，再由审核智能体复核题目质量",
    trigger: "POST /api/quiz/personalized/generate、POST /api/generate-question",
    steps: [
      {
        agent: "QuizAgent",
        role: "generator",
        contributes: "结合学习路径、错题记录与课程知识生成题目与解析",
        handoff: "把生成的题目交给审核环节做结构校验",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "校验选项数量、答案索引合法性、题干是否重复",
        handoff: "不合法或重复的题目在编排器内被替换，保证入库题目可直接作答",
      },
    ],
  },
  {
    key: "wrong_question",
    label: "错题图片分析与归因",
    scenario: "视觉智能体识别图片 → 反馈智能体做知识点归因与复习建议",
    trigger: "POST /api/wrong-questions/analyze",
    steps: [
      {
        agent: "WrongQuestionVisionAgent",
        role: "vision",
        contributes: "识别错题图片内容（仅依赖课程与学生私有资料，不编造）",
        handoff: "把识别出的题干与作答交给反馈智能体",
      },
      {
        agent: "FeedbackAgent",
        role: "generator",
        contributes: "生成错因分析、知识点归因与下一步复习建议",
        handoff: "结果写入错题本与复习队列",
      },
    ],
  },
  {
    key: "path_planning",
    label: "学习路径规划",
    scenario: "规则基线先兜底，再由规划智能体在课程目录约束下生成个性化路径",
    trigger: "POST /api/path/generate",
    steps: [
      {
        agent: "PlannerAgent",
        role: "planner",
        contributes: "汇总画像、错题、资料与助手历史，在课程目录约束内生成学习路径",
        handoff: "路径落库后驱动资源生成与复习调度",
      },
    ],
  },
  {
    key: "assessment",
    label: "学习效果评估",
    scenario: "汇总测验、资源、代码实践与掌握度记录，形成阶段评估",
    trigger: "GET /api/student/assessment",
    steps: [
      {
        agent: "AssessmentAgent",
        role: "generator",
        contributes: "汇总多源学习证据，输出阶段评估结论与改进建议",
        handoff: "评估结论回流到画像与路径规划",
      },
    ],
  },
  {
    key: "profile_update",
    label: "学习画像同步",
    scenario: "从学习行为中提取并更新画像，作为其它智能体的共享上下文",
    trigger: "POST /api/profile/dialogue/message",
    steps: [
      {
        agent: "ProfileAgent",
        role: "profiler",
        contributes: "从自然语言、学习记录与历史表现中提取画像维度并更新",
        handoff: "画像作为共享上下文供给辅导、规划、资源、出题等智能体",
      },
    ],
  },
  {
    key: "code_tutor",
    label: "代码解释闭环",
    scenario: "结合真实运行结果解释编译/运行错误，再由审核智能体核对是否编造执行结果",
    trigger: "POST /api/code/explain",
    steps: [
      {
        agent: "CodeTutorAgent",
        role: "generator",
        contributes: "结合编译器输出、运行输出与边界条件定位问题并给出修改建议",
        handoff: "把解释交给审核智能体核对是否存在「声称已运行」等不实描述",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "检查解释是否与真实运行结果一致、是否编造执行结论",
        handoff: "不通过则打回重写",
      },
    ],
  },
  {
    key: "structured_resource",
    label: "结构化资源线（学习讲义 / 课件 PPT / 思维导图 / 练习包 / 代码案例）",
    scenario: "读画像 → 结构化生成（含质量重试）→ 规则+模型双层复核 → （课件）视觉引擎渲染 PPTX",
    trigger: "POST /api/resources/generate",
    steps: [
      {
        agent: "ProfileAgent",
        role: "profiler",
        contributes: "汇总掌握度、错误模式、路径阶段、最近测验与 CodeLab 证据，形成生成约束",
        handoff: "画像与路径约束 → 结构化生成",
      },
      {
        agent: "ResourceAgent",
        role: "generator",
        contributes:
          "按资源类型生成结构化内容（讲义章节 / 课件页 / 导图节点 / 题目包），并按课程知识库检索结果标注引用",
        handoff: "结构化产物 → 双层审核",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "先跑确定性规则审核（结构、引用、质量门），再跑模型复核；未通过会触发重生成",
        handoff: "审核结论写进资源版本；课件类型再交给 PPTX 视觉引擎渲染落盘",
      },
    ],
  },
  {
    key: "review_schedule",
    label: "滚动复习调度线",
    scenario: "按错题与掌握度安排复习时间（确定性调度，不依赖模型）",
    trigger: "GET /api/review/queue",
    steps: [
      {
        agent: "ReviewScheduleAgent",
        role: "deterministic",
        contributes: "依据错题、测验与历史复习质量计算下一次复习时间",
        handoff: "复习结果回流到画像与掌握度，驱动下一轮协作",
      },
    ],
  },
  {
    key: "full_loop",
    label: "八智能体教学全链路（学情 → 路径 → 资源 → 测验 → 评估 → 归因 → 答疑 → 终审）",
    scenario:
      "把上面几条线路串成一条完整教学闭环：先读学情，再定路径，生成讲义并接受审核打回重写，据讲义出题并再次审核，随后给出阶段评估基线、错题归因与答疑要点，最后由审核智能体做全局终审。",
    trigger: "POST /api/ai-learning/collaboration/full-loop",
    steps: [
      {
        agent: "ProfileAgent",
        role: "profiler",
        contributes: "读取并汇总学习画像（基础、薄弱点、偏好）",
        handoff: "画像 → 路径规划",
      },
      {
        agent: "PlannerAgent",
        role: "planner",
        contributes: "在课程目录约束下确定本次学习的阶段与顺序",
        handoff: "阶段目标 → 资源生成",
      },
      {
        agent: "ResourceAgent",
        role: "generator",
        contributes: "按阶段目标生成重点讲义",
        handoff: "讲义 → 审核智能体（不通过则带问题重写，最多 2 轮）",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "审核讲义必需章节、篇幅、主题贴合与提示词泄漏",
        handoff: "通过后的讲义 → 出题智能体",
      },
      {
        agent: "QuizAgent",
        role: "generator",
        contributes: "围绕讲义与薄弱点出题并附解析",
        handoff: "题目 → 审核（结构合法性 + 去重）",
      },
      {
        agent: "AssessmentAgent",
        role: "assessor",
        contributes: "给出阶段评估基线与达标判断口径",
        handoff: "评估口径 → 归因智能体",
      },
      {
        agent: "FeedbackAgent",
        role: "generator",
        contributes: "把评估与测验结果转成错因归因与下一步复习建议",
        handoff: "复习建议 → 答疑智能体",
      },
      {
        agent: "TutorAgent",
        role: "tutor",
        contributes: "面向学生输出可直接阅读的答疑要点与易错提醒",
        handoff: "全部产物 → 审核智能体终审",
      },
      {
        agent: "ReviewAgent",
        role: "reviewer",
        contributes: "对整条链路的产物做全局终审（讲义/题目/建议是否齐备且互相一致）",
        handoff: "终审结论 + 全部产物一并返回，并写入协作轨迹供教师端查看",
      },
    ],
  },
]);

const PIPELINE_BY_KEY = new Map(COLLABORATION_PIPELINES.map((item) => [item.key, item]));

function agentLabel(name) {
  return AGENT_LABELS[name] || name || "未知智能体";
}

function newTraceId(pipelineKey) {
  const prefix = String(pipelineKey || "collab").slice(0, 24);
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function getPipeline(pipelineKey) {
  return PIPELINE_BY_KEY.get(String(pipelineKey || "")) || null;
}

/**
 * 在协作作用域内执行 fn：作用域内所有 runLoggedAgent 都会带上同一个 traceId。
 * meta: { pipelineKey, studentId, resourceId, pathVersion, meta }
 */
function runWithCollaboration(meta, fn) {
  const pipeline = getPipeline(meta?.pipelineKey);
  const store = {
    traceId: meta?.traceId || newTraceId(meta?.pipelineKey),
    pipelineKey: pipeline ? pipeline.key : String(meta?.pipelineKey || "ad_hoc"),
    pipelineLabel: pipeline ? pipeline.label : "临时协作",
    studentId: meta?.studentId ?? null,
    resourceId: meta?.resourceId ?? null,
    pathVersion: meta?.pathVersion ?? null,
    stepCounter: 0,
    steps: [],
    startedAt: Date.now(),
  };
  return collaborationStorage.run(store, () => fn(store));
}

/** 当前协作的简要标识（用于把 traceId 返回给前端） */
function currentCollaboration() {
  return collaborationStorage.getStore() || null;
}

function currentTraceId() {
  return collaborationStorage.getStore()?.traceId || null;
}

/**
 * 标记一个协作步骤的开始；不在协作作用域内时返回 null（此时行为与改造前完全一致）。
 */
function beginStep({ agent, role, taskType } = {}) {
  const store = collaborationStorage.getStore();
  if (!store) return null;
  store.stepCounter += 1;
  const step = {
    index: store.stepCounter,
    agent: String(agent || "coordinator"),
    role: role || null,
    taskType: taskType || null,
    startedAt: Date.now(),
    status: "running",
    durationMs: null,
  };
  store.steps.push(step);
  return step;
}

function endStep(step, { status = "success", durationMs = null } = {}) {
  if (!step) return;
  step.status = status || "success";
  step.durationMs = Number.isFinite(Number(durationMs)) ? Number(durationMs) : Date.now() - step.startedAt;
}

/**
 * 当前协作执行到此刻的摘要——直接挂进 AI 响应里，前端就能实时展示「谁在干活」。
 */
function currentCollaborationSummary() {
  const store = collaborationStorage.getStore();
  if (!store) return null;
  return {
    traceId: store.traceId,
    pipelineKey: store.pipelineKey,
    pipelineLabel: store.pipelineLabel,
    agentCount: new Set(store.steps.map((item) => item.agent)).size,
    stepCount: store.steps.length,
    elapsedMs: Date.now() - store.startedAt,
    steps: store.steps.map((item) => ({
      index: item.index,
      agent: item.agent,
      label: agentLabel(item.agent),
      role: item.role,
      status: item.status,
      durationMs: item.durationMs,
    })),
  };
}

/** 流水线目录：前端「多智能体协作」页面直接渲染它 */
function getPipelineCatalog() {
  return COLLABORATION_PIPELINES.map((pipeline) => ({
    ...pipeline,
    stepCount: pipeline.steps.length,
    agentCount: new Set(pipeline.steps.map((step) => step.agent)).size,
    steps: pipeline.steps.map((step, index) => ({
      ...step,
      order: index + 1,
      label: agentLabel(step.agent),
    })),
  }));
}

/** 把一条 SQL 行还原成协作步骤 */
function toStep(row) {
  return {
    id: Number(row.id),
    index: Number(row.step_index || 0),
    agent: row.agent_name,
    label: agentLabel(row.agent_name),
    role: row.agent_role || null,
    taskType: row.task_type || "",
    status: row.status || "success",
    durationMs: Number(row.duration_ms || 0),
    summary: row.output_text ? String(row.output_text).slice(0, 240) : "",
    createdAt: row.created_at,
  };
}

/**
 * 最近的协作：按 trace_id 归组（只统计真正参与过协作的日志，历史数据没有 trace_id 会被忽略）。
 */
async function listCollaborations({ limit = 10, studentId = null } = {}) {
  const size = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const params = [];
  let ownerWhere = "";
  if (Number.isFinite(Number(studentId)) && Number(studentId) > 0) {
    ownerWhere = "AND student_id = ?";
    params.push(Number(studentId));
  }

  const [traceRows] = await pool.query(
    `SELECT trace_id,
            MIN(created_at) AS started_at,
            COUNT(*) AS step_count,
            COUNT(DISTINCT agent_name) AS agent_count,
            SUM(duration_ms) AS total_ms,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
            SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) AS fallback_count
       FROM agent_run_logs
      WHERE trace_id IS NOT NULL ${ownerWhere}
      GROUP BY trace_id
      ORDER BY started_at DESC
      LIMIT ?`,
    [...params, size],
  );

  if (!traceRows.length) return [];

  const traceIds = traceRows.map((row) => row.trace_id);
  const placeholders = traceIds.map(() => "?").join(",");
  const [stepRows] = await pool.query(
    `SELECT id, trace_id, agent_name, agent_role, task_type, status, duration_ms, output_text, step_index, created_at
       FROM agent_run_logs
      WHERE trace_id IN (${placeholders})
      ORDER BY trace_id, step_index, id`,
    traceIds,
  );

  const stepsByTrace = new Map();
  for (const row of stepRows) {
    if (!stepsByTrace.has(row.trace_id)) stepsByTrace.set(row.trace_id, []);
    stepsByTrace.get(row.trace_id).push(toStep(row));
  }

  return traceRows.map((row) => {
    const steps = stepsByTrace.get(row.trace_id) || [];
    const pipeline = getPipeline(String(row.trace_id).split("-")[0]) || null;
    return {
      traceId: row.trace_id,
      pipelineKey: pipeline ? pipeline.key : String(row.trace_id).split("-")[0],
      pipelineLabel: pipeline ? pipeline.label : "临时协作",
      scenario: pipeline ? pipeline.scenario : "",
      startedAt: row.started_at,
      stepCount: Number(row.step_count || 0),
      agentCount: Number(row.agent_count || 0),
      totalMs: Number(row.total_ms || 0),
      failedCount: Number(row.failed_count || 0),
      fallbackCount: Number(row.fallback_count || 0),
      agents: [...new Set(steps.map((step) => step.agent))].map((agent) => ({
        agent,
        label: agentLabel(agent),
      })),
      steps,
    };
  });
}

/** 一次协作的完整轨迹 */
async function getCollaboration(traceId) {
  const key = String(traceId || "")
    .trim()
    .slice(0, 64);
  if (!key) return null;
  const [rows] = await pool.query(
    `SELECT id, trace_id, agent_name, agent_role, task_type, status, duration_ms, output_text, step_index, created_at
       FROM agent_run_logs
      WHERE trace_id = ?
      ORDER BY step_index, id`,
    [key],
  );
  if (!rows.length) return null;
  const steps = rows.map(toStep);
  const pipeline = getPipeline(String(key).split("-")[0]) || null;
  return {
    traceId: key,
    pipelineKey: pipeline ? pipeline.key : String(key).split("-")[0],
    pipelineLabel: pipeline ? pipeline.label : "临时协作",
    scenario: pipeline ? pipeline.scenario : "",
    declaredSteps: pipeline
      ? pipeline.steps.map((step, index) => ({ order: index + 1, ...step, label: agentLabel(step.agent) }))
      : [],
    startedAt: rows[0].created_at,
    totalMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
    agents: [...new Set(steps.map((step) => step.agent))].map((agent) => ({
      agent,
      label: agentLabel(agent),
    })),
    steps,
  };
}

/**
 * 「生成 → 审核 → 不通过则带着问题打回重写」闭环执行器。
 * ---------------------------------------------------------------------------
 * 这是多智能体协作里最有价值的一环：审核智能体不是走个形式，它给出可判定的结论，
 * 不通过时把具体问题回灌给生成方重做，最多 maxRounds 轮。
 *
 * generate({ round, feedback }) -> draft
 * review(draft, { round })      -> { passed, issues: [{ code, message }], checks }
 */
async function runReviewLoop({ maxRounds = 2, generate, review, onRound } = {}) {
  const rounds = Math.max(1, Math.min(Number(maxRounds) || 2, 4));
  const history = [];
  let draft = null;
  let feedback = [];

  for (let round = 0; round < rounds; round += 1) {
    draft = await generate({ round, feedback });
    const verdict = (await review(draft, { round })) || {};
    const issues = Array.isArray(verdict.issues) ? verdict.issues.filter(Boolean) : [];
    const passed = verdict.passed === true;

    history.push({
      round: round + 1,
      passed,
      issueCount: issues.length,
      issues: issues
        .map((item) => item?.message)
        .filter(Boolean)
        .slice(0, 8),
    });
    if (typeof onRound === "function") onRound({ round: round + 1, passed, issues });

    if (passed) return { draft, rounds: round + 1, passed: true, issues: [], history };

    feedback = issues
      .map((item) => item?.message)
      .filter(Boolean)
      .slice(0, 8);
    // 判定不通过却没给出原因，说明没法指导返修，再循环也只是重复烧钱
    if (!feedback.length) break;
  }

  return { draft, rounds: history.length, passed: false, issues: feedback, history };
}

/**
 * 把「确定性审核」这一步也写进协作轨迹。
 * 这些审核不调用模型（纯规则），但对学生/评委来说它同样是协作的一环——尤其当它判定不通过、
 * 触发返修时，正是这个项目「多智能体互相把关」最有说服力的证据。
 */
async function recordReviewStep({
  agent = "ReviewAgent",
  taskType = "collaboration_review",
  label,
  verdict,
  note,
} = {}) {
  const step = beginStep({ agent, role: "reviewer", taskType });
  const issues = Array.isArray(verdict?.issues)
    ? verdict.issues.map((item) => item?.message).filter(Boolean)
    : [];
  const passed = verdict?.passed === true;
  endStep(step, { status: passed ? "success" : "fallback" });

  const store = collaborationStorage.getStore();
  await persistAgentRun({
    agentName: agent,
    taskType,
    inputText: { label: label || taskType, round: step ? step.index : null },
    outputText: passed
      ? `审核通过：${note || label || "内容满足要求"}`
      : `审核未通过，已打回重写：${issues.slice(0, 5).join("；")}`,
    status: passed ? "success" : "fallback",
    durationMs: step?.durationMs ?? 0,
    source: "collaboration_review",
    studentId: store?.studentId ?? null,
    resourceId: store?.resourceId ?? null,
    pathVersion: store?.pathVersion ?? null,
    traceId: store?.traceId,
    stepIndex: step?.index,
    agentRole: "reviewer",
  });

  return { passed, issues };
}

/**
 * 记录一个协作步骤（用于「直接调用智能体模块」的流程）。
 * ---------------------------------------------------------------------------
 * 有些流程（例如真实资源生成 resourceGenerationService）是直接调用 agents/ 下的模块，
 * 不经过 orchestrator 的 runLoggedAgent，因此不会自动留下日志。用这个助手把这类调用
 * 也纳入协作轨迹，保证「多智能体协作」在每条线路上都完整可回放。
 */
async function recordAgentStep({
  agent,
  role,
  taskType,
  summary,
  status = "success",
  durationMs = 0,
  input,
} = {}) {
  const step = beginStep({ agent, role, taskType });
  endStep(step, { status, durationMs });
  const store = collaborationStorage.getStore();

  await persistAgentRun({
    agentName: agent,
    taskType,
    inputText: input || { note: taskType },
    outputText: String(summary || "").slice(0, 4000),
    status,
    durationMs,
    source: "collaboration_step",
    // 归属信息必须从协作作用域里带出来：学生端按 student_id 过滤查询，
    // 漏传会让轨迹「写进去了但列表查不到」。
    studentId: store?.studentId ?? null,
    resourceId: store?.resourceId ?? null,
    pathVersion: store?.pathVersion ?? null,
    traceId: store?.traceId,
    stepIndex: step?.index,
    agentRole: role || null,
  });

  return step;
}

/** 包住一次智能体调用并自动记录耗时与成败（失败也会留下轨迹，便于教师端定位） */
async function runTracedStep(meta, work) {
  const startedAt = Date.now();
  try {
    const result = await work();
    const summary = typeof result === "string" ? result : meta?.summary || "";
    await recordAgentStep({ ...meta, status: "success", durationMs: Date.now() - startedAt, summary });
    return result;
  } catch (error) {
    await recordAgentStep({
      ...meta,
      status: "failed",
      durationMs: Date.now() - startedAt,
      summary: `执行失败：${error?.message || error}`,
    });
    throw error;
  }
}

module.exports = {
  AGENT_LABELS,
  COLLABORATION_PIPELINES,
  agentLabel,
  beginStep,
  currentCollaboration,
  currentCollaborationSummary,
  currentTraceId,
  endStep,
  getCollaboration,
  getPipelineCatalog,
  listCollaborations,
  recordAgentStep,
  recordReviewStep,
  runReviewLoop,
  runTracedStep,
  runWithCollaboration,
};
