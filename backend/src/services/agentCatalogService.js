/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { getAIStatus, getAIRuntimeMetrics, probeAIService } = require("./aiService");
const { getWebSearchStatus } = require("./webSearchService");

const AGENT_DEFINITIONS = Object.freeze([
  {
    key: "profile",
    name: "ProfileAgent",
    label: "学习画像智能体",
    purpose: "从学生自然语言、学习记录和历史表现中提取并更新学习画像。",
    modelRole: "default",
    endpoints: ["POST /api/profile/dialogue/message", "POST /api/profile/dialogue/confirm"],
  },
  {
    key: "tutor",
    name: "TutorAgent",
    label: "私有知识辅导智能体",
    purpose: "结合课程知识库、学生资料、画像、路径和历史提问生成带可核验引用的回答。",
    modelRole: "tutor",
    endpoints: ["POST /api/chat", "POST /api/knowledge/answer"],
  },
  {
    key: "wrong_question_vision",
    name: "WrongQuestionVisionAgent",
    label: "错题视觉识别智能体",
    purpose: "识别错题图片，并仅依据课程与学生私有资料完成知识点归因和错因分析。",
    modelRole: "vision",
    endpoints: ["POST /api/wrong-questions/analyze", "POST /api/chat"],
  },
  {
    key: "planner",
    name: "PlannerAgent",
    label: "学习路径规划智能体",
    purpose: "汇总画像、错题、个人资料和助手历史，生成受课程目录约束的学习路径。",
    modelRole: "planner",
    endpoints: ["POST /api/path/generate"],
  },
  {
    key: "resource",
    name: "ResourceAgent",
    label: "多模态学习资源智能体",
    purpose: "按路径阶段生成讲义、思维导图、课件、练习包和代码案例。",
    modelRole: "default",
    endpoints: ["POST /api/resources/generate"],
  },
  {
    key: "resource_review",
    name: "ReviewAgent",
    label: "资源质量审核智能体",
    purpose: "对模型生成内容执行结构、引用和教学质量复核，不通过时触发修订或回退。",
    modelRole: "default",
    internal: true,
    endpoints: ["POST /api/resources/generate"],
  },
  {
    key: "quiz",
    name: "QuizAgent",
    label: "个性化测验智能体",
    purpose: "结合学习路径、错题、私有知识和可验证题源生成学生独享测验。",
    modelRole: "quiz",
    endpoints: ["POST /api/quiz/personalized/generate", "POST /api/generate-question", "POST /api/quiz-hint"],
  },
  {
    key: "feedback",
    name: "FeedbackAgent",
    label: "错因反馈智能体",
    purpose: "根据作答、评分点和错题证据生成错因、复习建议和下一步行动。",
    modelRole: "default",
    internal: true,
    endpoints: ["POST /api/quiz/submit", "POST /api/wrong-questions/analyze"],
  },
  {
    key: "assessment",
    name: "AssessmentAgent",
    label: "学习效果评估智能体",
    purpose: "汇总测验、资源、代码实践和知识掌握记录，形成阶段评估。",
    modelRole: "default",
    endpoints: ["GET /api/student/assessment"],
  },
  {
    key: "code_tutor",
    name: "CodeTutorAgent",
    label: "代码解释智能体",
    purpose: "结合运行结果解释编译错误、运行错误、输出和边界条件。",
    modelRole: "tutor",
    endpoints: ["POST /api/code/explain"],
  },
  {
    key: "review_schedule",
    name: "ReviewScheduleAgent",
    label: "滚动复习调度器",
    purpose: "依据错题、测验和复习质量安排下一次复习时间。",
    modelRole: "deterministic",
    endpoints: ["GET /api/review/queue", "POST /api/review/queue/:itemId/result"],
  },
]);

function configuredModels(env = process.env) {
  const fallback = env.LLM_MODEL || "";
  return {
    default: fallback,
    vision: env.LLM_VISION_MODEL || fallback,
    tutor: env.LLM_TUTOR_MODEL || fallback,
    planner: env.LLM_PLANNER_MODEL || fallback,
    quiz: env.LLM_QUIZ_MODEL || fallback,
    deterministic: null,
  };
}

function getAgentCatalog() {
  const ai = getAIStatus();
  const search = getWebSearchStatus();
  const models = configuredModels();
  const metrics = new Map(getAIRuntimeMetrics().map((item) => [item.capability, item]));
  return AGENT_DEFINITIONS.map((definition) => ({
    ...definition,
    internal: Boolean(definition.internal),
    enabled: definition.modelRole === "deterministic" ? true : ai.available,
    model: models[definition.modelRole],
    provider: definition.modelRole === "deterministic" ? "rules" : ai.provider,
    webSearchRequired: definition.key === "quiz",
    webSearchAvailable: definition.key === "quiz" ? search.available : undefined,
    runtime: metrics.get(definition.key) || null,
  }));
}

async function getAgentIntegrationStatus({ probe = false } = {}) {
  const ai = getAIStatus();
  return {
    ai,
    liveModel: probe ? await probeAIService() : null,
    models: configuredModels(),
    agents: getAgentCatalog(),
    runtime: getAIRuntimeMetrics(),
  };
}

module.exports = {
  AGENT_DEFINITIONS,
  configuredModels,
  getAgentCatalog,
  getAgentIntegrationStatus,
};
