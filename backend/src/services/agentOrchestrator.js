/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const {
  ProfileAgent,
  PlannerAgent,
  ResourceAgent,
  QuizAgent,
  ReviewAgent,
  FeedbackAgent,
  TutorAgent,
  AssessmentAgent,
  AGENTS,
} = require("./agents");
const { getOpenQuestionContext } = require("./openQuestionService");
const { logAgentRun: persistAgentRun } = require("./agentLogService");
const { isAIEnabled } = require("./aiService");
const { pool } = require("../config/db");
const { getCompleteProfile } = require("./studentProfileService");
const { getCurrentLearningPath } = require("./learningPathService");
const {
  analyzeChatIntent,
  normalizeChatHistory,
  selectRelevantChatHistory,
  buildProfileSuggestions,
  buildFollowups,
} = require("./chatIntentService");
const {
  prepareGrounding,
  validateAnswerCitations,
  buildDeterministicGroundedAnswer,
  persistGroundedCitations,
} = require("./groundedAnswerService");
const { generateTutorResponse, serviceError } = require("./aiTutorService");
const { validateChatResponse, extractCodeBlocks } = require("./chatResponseValidator");
const { buildCompatibleParts } = require("./chatResponseCompatibility");
const {
  beginStep,
  currentCollaboration,
  currentCollaborationSummary,
  currentTraceId,
  endStep,
  recordAgentStep,
  recordReviewStep,
  runReviewLoop,
  runWithCollaboration,
} = require("./agentCollaborationService");
const {
  reviewAssessment,
  reviewQuestions,
  reviewResourceContent,
  reviewWrongQuestionFeedback,
} = require("./agentReviewRules");

const CHAT_PARTS = [
  {
    agent: "coordinator",
    title: "智课研伴（综合协调）",
  },
  {
    agent: "TheoryAgent",
    title: "TheoryAgent（理论讲解智能体）",
  },
  {
    agent: "CodeAgent",
    title: "CodeAgent（代码示例智能体）",
  },
  {
    agent: "ReviewAgent",
    title: "ReviewAgent（内容审核智能体）",
  },
];

async function runLoggedAgent(agent, taskType, context = {}, prompt = "", options = {}) {
  const startTime = Date.now();
  const agentName = agent && agent.name ? agent.name : options.agentName || "coordinator";
  // 协作轨迹：若当前处在 runWithCollaboration 作用域内，这一步会自动挂上同一个 traceId
  // 与递增的 step_index；不在作用域内时行为与改造前完全一致（字段为空）。
  const step = beginStep({ agent: agentName, role: options.agentRole || null, taskType });

  try {
    const output = await agent.run(context, prompt);
    const durationMs = Date.now() - startTime;
    const status = inferAgentLogStatus(output, options.status);
    endStep(step, { status, durationMs });

    const store = currentCollaboration();
    await persistAgentRun({
      agentName,
      taskType,
      inputText: {
        context,
        prompt,
      },
      outputText: output,
      status,
      durationMs,
      source: options.source || "agent",
      studentId: store?.studentId ?? options.studentId ?? null,
      resourceId: store?.resourceId ?? null,
      pathVersion: store?.pathVersion ?? null,
      traceId: currentTraceId(),
      stepIndex: step ? step.index : undefined,
      agentRole: options.agentRole || null,
    });

    return output;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    endStep(step, { status: "failed", durationMs });

    const store = currentCollaboration();
    await persistAgentRun({
      agentName,
      taskType,
      inputText: {
        context,
        prompt,
      },
      outputText: error.message,
      status: "failed",
      durationMs,
      source: options.source || "agent",
      studentId: store?.studentId ?? options.studentId ?? null,
      resourceId: store?.resourceId ?? null,
      pathVersion: store?.pathVersion ?? null,
      traceId: currentTraceId(),
      stepIndex: step ? step.index : undefined,
      agentRole: options.agentRole || null,
    });

    throw error;
  }
}

function inferAgentLogStatus(output, forcedStatus) {
  if (["success", "fallback", "failed"].includes(forcedStatus)) {
    return forcedStatus;
  }

  if (!isAIEnabled()) {
    return "fallback";
  }

  const text = ensureText(output).toLowerCase();
  return text.includes("fallback") ? "fallback" : "success";
}

/**
 * AI 学习助手答疑入口 —— 一次提问就是一次多智能体协作：
 *   协调器判定意图 → 检索课程证据 → 辅导智能体生成（带引用）→ 审核/引用校验把关（不通过打回重写）
 * 整条链路包在同一个协作作用域里，因此学生端与教师端都能按 trace 回放这次协作。
 */
async function orchestrateChat(args, options = {}) {
  return runWithCollaboration({ pipelineKey: "chat", studentId: args?.studentId ?? null }, () =>
    orchestrateChatInner(args, options),
  );
}

async function orchestrateChatInner(
  { studentId, message, history = [], onDelta, onReset, signal },
  options = {},
) {
  const db = options.db || pool;
  const getCompleteProfileFn = options.getCompleteProfileFn || getCompleteProfile;
  const getCurrentLearningPathFn = options.getCurrentLearningPathFn || getCurrentLearningPath;
  const prepareGroundingFn = options.prepareGroundingFn || prepareGrounding;
  const generateTutorResponseFn = options.generateTutorResponseFn || generateTutorResponse;
  const isAIEnabledFn = options.isAIEnabledFn || isAIEnabled;
  const normalizedHistory = normalizeChatHistory(history);
  const relevantHistory = selectRelevantChatHistory(normalizedHistory, message);
  const contextWarnings = [];
  let profile = null;
  let path = null;

  try {
    profile = await getCompleteProfileFn(studentId);
  } catch {
    contextWarnings.push("profile_unavailable");
    console.warn("chat learner profile unavailable");
  }

  const intentStartedAt = Date.now();
  const intent = analyzeChatIntent(message, {
    history: relevantHistory,
    currentCourse: profile?.profile?.currentCourse,
  });
  await recordAgentStep({
    agent: "Coordinator",
    role: "coordinator",
    taskType: "chat_intent",
    durationMs: Date.now() - intentStartedAt,
    summary: `判定意图：${intent.knowledgePoint || intent.subject || "通用提问"}${intent.requiresCode ? "（需要代码示例）" : ""}${intent.needsClarification ? "（需要追问澄清）" : ""}${profile ? "；已加载学习画像" : "；画像不可用"}`,
  });
  const originalMessage = intent.originalMessage || message;
  const resolvedQuestion = intent.resolvedQuestion || originalMessage;

  try {
    path = await getCurrentLearningPathFn(studentId);
  } catch {
    contextWarnings.push("learning_path_unavailable");
    console.warn("chat learning path unavailable");
  }

  const learnerContext = buildLearnerContext(profile, path, intent);
  const modelAvailable = Boolean(isAIEnabledFn());
  const messageId = crypto.randomUUID();
  const profileSuggestions = buildProfileSuggestions(originalMessage);

  if (intent.needsClarification) {
    return finalizeChatAnswer({
      messageId,
      answerMarkdown: buildClarificationMarkdown(intent.clarificationQuestions),
      sourceMode: "clarification",
      intent,
      knowledgeNotice: "请补充具体问题后，我会继续回答。",
      citations: [],
      followups: intent.clarificationQuestions,
      profileSuggestions,
      modelAvailable,
      quality: simpleQuality(buildClarificationMarkdown(intent.clarificationQuestions)),
      trace: buildTrace({
        intent,
        contextWarnings,
        retrieval: null,
        sourceMode: "clarification",
        retryCount: 0,
      }),
    });
  }

  const retrievalStartedAt = Date.now();
  const grounding = await prepareGroundingFn(
    db,
    {
      studentId,
      subject: intent.subject,
      knowledgePoint: intent.knowledgePoint,
      query: resolvedQuestion,
      requestType: "chat",
      errorPatterns: learnerContext.errorPatterns,
    },
    { tolerateFailure: true, retrieveKnowledgeFn: options.retrieveKnowledgeFn },
  );
  if (grounding.warning) contextWarnings.push(grounding.warning);
  await recordAgentStep({
    agent: "Retriever",
    role: "retrieval",
    taskType: "chat_grounding",
    durationMs: Date.now() - retrievalStartedAt,
    status: grounding.hasEvidence ? "success" : "fallback",
    summary: grounding.hasEvidence
      ? `检索到 ${grounding.retrieval?.results?.length || 0} 条课程证据，回答将逐句标注引用`
      : "未检索到课程证据，回答降级为无引用的模型作答",
  });

  const followups = buildFollowups(intent);
  if (!modelAvailable) {
    if (!grounding.hasEvidence) throw aiUnavailableError();
    const deterministic = buildDeterministicGroundedAnswer(resolvedQuestion, grounding.retrieval);
    await persistCitationsSafely(
      db,
      {
        studentId,
        generationId: messageId,
        validation: deterministic.validation,
      },
      contextWarnings,
      options.persistGroundedCitationsFn,
    );
    return finalizeChatAnswer({
      messageId,
      answerMarkdown: deterministic.answerMarkdown,
      sourceMode: "deterministic_fallback",
      intent,
      knowledgeNotice: "当前模型服务不可用，以下内容依据本地课程资料整理。",
      citations: deterministic.citations,
      followups,
      profileSuggestions,
      modelAvailable: false,
      quality: validateChatResponse({
        answerMarkdown: deterministic.answerMarkdown,
        message: resolvedQuestion,
        knowledgePoint: intent.knowledgePoint,
        complexity: false,
        requiresCode: false,
        followups,
      }),
      trace: buildTrace({
        intent,
        contextWarnings,
        retrieval: grounding.retrieval,
        sourceMode: "deterministic_fallback",
        retryCount: 0,
      }),
      retrieval: grounding.retrieval,
      citationCoverage: deterministic.coverage,
    });
  }

  const sourceMode = grounding.hasEvidence ? "rag_model" : "model_only";
  try {
    const generated = await generateTutorResponseFn(
      {
        message: originalMessage,
        originalMessage,
        resolvedQuestion,
        history: relevantHistory,
        intent,
        learnerContext,
        sourceMode,
        groundingContext: grounding.context,
        followups,
        validateCitations: (answerMarkdown) => validateAnswerCitations(answerMarkdown, grounding.retrieval),
      },
      {
        generateTextFn: options.generateTextFn,
        tutorAgent: options.tutorAgent,
        reviewAgent: options.reviewAgent,
        validateResponse: options.validateResponse,
        onDelta,
        onReset,
        signal,
      },
    );
    if (sourceMode === "rag_model") {
      await persistCitationsSafely(
        db,
        {
          studentId,
          generationId: messageId,
          validation: generated.citationValidation,
        },
        contextWarnings,
        options.persistGroundedCitationsFn,
      );
    }
    return finalizeChatAnswer({
      messageId,
      answerMarkdown: generated.answerMarkdown,
      sourceMode,
      intent,
      knowledgeNotice: sourceMode === "model_only" ? "本回答使用模型通识知识，暂未引用本地课程资料。" : "",
      citations: sourceMode === "model_only" ? [] : generated.citations,
      codeBlocks: generated.codeBlocks,
      followups,
      profileSuggestions,
      modelAvailable: true,
      quality: generated.quality,
      trace: buildTrace({
        intent,
        contextWarnings,
        retrieval: grounding.retrieval,
        sourceMode,
        retryCount: generated.retryCount,
      }),
      retrieval: grounding.retrieval,
      citationCoverage: generated.citationCoverage,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "chat_model_fallback",
        code: String(error?.code || "UNKNOWN"),
        message: String(error?.message || "").slice(0, 160),
      }),
    );
    // 本地 2B 模型很难同时满足 600 字 / 3 小节 / 3 个易错点 / 完整示例 / 2 个追问题这套门槛。
    // 没有课程证据时如实报错；有证据时改用确定性课程资料回答，避免助手整体 502。
    const qualityFailed = error.code === "AI_RESPONSE_QUALITY_FAILED";
    if (!grounding.hasEvidence) {
      if (qualityFailed) throw error;
      throw aiUnavailableError();
    }
    contextWarnings.push(qualityFailed ? "model_quality_failed" : "model_generation_unavailable");
    const deterministic = buildDeterministicGroundedAnswer(resolvedQuestion, grounding.retrieval, {
      reason: qualityFailed ? "quality" : "unavailable",
    });
    await persistCitationsSafely(
      db,
      {
        studentId,
        generationId: messageId,
        validation: deterministic.validation,
      },
      contextWarnings,
      options.persistGroundedCitationsFn,
    );
    return finalizeChatAnswer({
      messageId,
      answerMarkdown: deterministic.answerMarkdown,
      sourceMode: "deterministic_fallback",
      intent,
      knowledgeNotice: qualityFailed
        ? "本次模型回答未通过教学质量校验，以下内容依据本地课程资料整理。"
        : "当前模型服务不可用，以下内容依据本地课程资料整理。",
      citations: deterministic.citations,
      followups,
      profileSuggestions,
      modelAvailable: false,
      quality: validateChatResponse({
        answerMarkdown: deterministic.answerMarkdown,
        message: resolvedQuestion,
        knowledgePoint: intent.knowledgePoint,
        complexity: false,
        followups,
      }),
      trace: buildTrace({
        intent,
        contextWarnings,
        retrieval: grounding.retrieval,
        sourceMode: "deterministic_fallback",
        retryCount: 0,
      }),
      retrieval: grounding.retrieval,
      citationCoverage: deterministic.coverage,
    });
  }
}

function buildLearnerContext(profileResult, path, intent) {
  const profile = profileResult?.profile || {};
  const masteryItems = Array.isArray(profile.knowledgeMastery) ? profile.knowledgeMastery : [];
  const errorItems = Array.isArray(profile.errorPatterns) ? profile.errorPatterns : [];
  const mastery = selectMastery(masteryItems, intent);
  const errorPatterns = errorItems
    .filter(
      (item) => item.subject === intent.subject || matchesPoint(item.knowledgePoint, intent.knowledgePoint),
    )
    .slice(0, 4)
    .map((item) => ({
      errorType: String(item.errorType || "").slice(0, 80),
      knowledgePoint: String(item.knowledgePoint || "").slice(0, 160),
      occurrenceCount: Number(item.occurrenceCount || 0),
      confidence: finiteOrNull(item.confidence),
    }));
  const activeStage = selectCurrentPathStage(path, intent);
  const major = String(profile.majorAndGrade?.major || "").trim();
  const grade = String(profile.majorAndGrade?.grade || "").trim();
  const pace = String(profile.paceAndTimeBudget?.pacePreference || "").trim();
  const minutes = finiteOrNull(profile.paceAndTimeBudget?.weeklyTimeBudgetMinutes);

  return {
    majorAndGrade: [major, grade].filter(Boolean).join(" · "),
    currentCourse: String(profile.currentCourse || "").slice(0, 160),
    priorKnowledge: compactStrings(profile.priorKnowledge, 8, 160),
    learningGoals: compactStrings(profile.learningGoals, 6, 200),
    explanationPreference: compactStrings(profile.explanationPreference, 6, 100),
    resourcePreferences: compactStrings(profile.resourcePreferences, 6, 100),
    paceAndTimeBudget: [pace, minutes ? `每周 ${minutes} 分钟` : ""].filter(Boolean).join("；"),
    mastery,
    errorPatterns,
    currentPathStage: activeStage,
  };
}

function selectMastery(items, intent) {
  const exact = items.find(
    (item) => item.subject === intent.subject && matchesPoint(item.knowledgePoint, intent.knowledgePoint),
  );
  if (exact && Number.isFinite(Number(exact.mastery))) return Number(exact.mastery);
  const sameSubject = items.filter(
    (item) => item.subject === intent.subject && Number.isFinite(Number(item.mastery)),
  );
  if (!sameSubject.length) return null;
  return Math.round(sameSubject.reduce((sum, item) => sum + Number(item.mastery), 0) / sameSubject.length);
}

function selectCurrentPathStage(path, intent) {
  const stages = Array.isArray(path?.stages) ? path.stages : [];
  const matched =
    stages.find((stage) => stage.status === "active" && stage.subject === intent.subject) ||
    stages.find((stage) => stage.status === "active") ||
    stages.find((stage) => stage.subject === intent.subject && stage.status !== "completed");
  if (!matched) return null;
  return {
    title: String(matched.title || "").slice(0, 160),
    subject: String(matched.subject || "").slice(0, 120),
    knowledgePoints: compactStrings(matched.knowledgePoints, 5, 120),
    progress: finiteOrNull(matched.progress),
    status: String(matched.status || "").slice(0, 30),
  };
}

function compactStrings(value, maxItems, maxLength) {
  const items = Array.isArray(value) ? value : String(value || "").trim() ? [value] : [];
  return items
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, maxLength),
    )
    .filter(Boolean)
    .slice(0, maxItems);
}

function matchesPoint(left, right) {
  const a = String(left || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const b = String(right || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function finalizeChatAnswer(input) {
  const answer = {
    messageId: input.messageId,
    answerMarkdown: input.answerMarkdown,
    sourceMode: input.sourceMode,
    subject: input.intent.subject,
    knowledgePoint: input.intent.knowledgePoint,
    knowledgeNotice: input.knowledgeNotice || "",
    citations: Array.isArray(input.citations) ? input.citations : [],
    codeBlocks: Array.isArray(input.codeBlocks) ? input.codeBlocks : extractCodeBlocks(input.answerMarkdown),
    followups: Array.isArray(input.followups) ? input.followups : [],
    profileSuggestions: Array.isArray(input.profileSuggestions) ? input.profileSuggestions : [],
    trace: input.trace,
    modelAvailable: Boolean(input.modelAvailable),
    quality: input.quality,
  };
  answer.parts = buildCompatibleParts({
    ...answer,
    retrievalRunId: input.retrieval?.retrievalRunId,
    retrievalConfidence: input.retrieval?.confidence,
    citationCoverage: input.citationCoverage,
  });
  return answer;
}

function buildClarificationMarkdown(questions) {
  return [
    "# 需要补充的信息",
    "",
    "为了准确回答，请补充下面一项或多项：",
    "",
    ...questions.slice(0, 3).map((question, index) => `${index + 1}. ${question}`),
  ].join("\n");
}

function simpleQuality(answerMarkdown) {
  const metrics = validateChatResponse({
    answerMarkdown,
    message: answerMarkdown,
    knowledgePoint: "综合问题",
    complexity: false,
    followups: [],
  });
  return { ...metrics, passed: true, issues: [] };
}

function buildTrace({ intent, contextWarnings, retrieval, sourceMode, retryCount }) {
  const steps = [
    {
      name: "learner_context",
      status: contextWarnings.some((item) => /profile|path/.test(item)) ? "partial" : "completed",
    },
  ];
  if (intent.isContextualFollowup) {
    const sourcePoint = String(intent.contextSourceKnowledgePoint || "上一轮问题").slice(0, 120);
    steps.push({
      name: "context_resolution",
      status: "completed",
      detail: `已结合上一轮${sourcePoint === "上一轮问题" ? "" : `“${sourcePoint}”`}问题解析当前追问`,
    });
  }
  steps.push({ name: "intent", status: "completed", detail: `${intent.subject} / ${intent.knowledgePoint}` });
  if (sourceMode === "clarification") {
    steps.push({ name: "clarification", status: "completed" });
  } else if (retrieval?.unsupportedForRag) {
    steps.push({ name: "retrieval", status: "skipped", detail: "当前课程暂无本地知识库" });
  } else {
    steps.push({
      name: "retrieval",
      status: retrieval?.results?.length
        ? "completed"
        : contextWarnings.includes("knowledge_retrieval_unavailable")
          ? "unavailable"
          : "no_match",
      detail: retrieval?.results?.length ? `命中 ${retrieval.results.length} 条本地资料` : "未使用本地引用",
    });
  }
  if (!["clarification", "deterministic_fallback"].includes(sourceMode)) {
    steps.push({
      name: "TutorAgent",
      status: "completed",
      detail: retryCount ? "质量修正后生成" : "模型生成",
    });
    steps.push({ name: "ReviewAgent", status: "passed", detail: "教学质量与引用检查通过" });
  } else if (sourceMode === "deterministic_fallback") {
    steps.push({ name: "local_fallback", status: "completed", detail: "模型未执行" });
  }
  return {
    collapsed: true,
    summary: traceSummary(sourceMode, retryCount),
    steps,
  };
}

function traceSummary(sourceMode, retryCount) {
  const labels = {
    rag_model: "已使用模型回答，并用本地课程资料增强和校验引用。",
    model_only: "已使用模型通识知识回答，未生成本地引用。",
    deterministic_fallback: "模型未执行，已依据本地课程资料整理有限回答。",
    clarification: "需要补充具体问题后继续回答。",
  };
  return `${labels[sourceMode] || "回答已处理。"}${retryCount ? " 首次结果未通过质量检查，已修正一次。" : ""}`;
}

async function persistCitationsSafely(db, input, warnings, persistFn) {
  try {
    await (persistFn || persistGroundedCitations)(db, input);
  } catch {
    warnings.push("citation_persistence_unavailable");
    console.warn("chat citation persistence unavailable");
  }
}

function aiUnavailableError() {
  return serviceError(
    "AI_SERVICE_UNAVAILABLE",
    "当前模型服务不可用，本地知识库也未覆盖该问题，请检查AI配置后重试。",
    503,
  );
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function orchestrateResourceGeneration({
  subject,
  topic,
  resourceType,
  difficulty,
  personalization,
  studentId,
  resourceId,
}) {
  const context = buildProfileContext({ subject, topic, resourceType, difficulty, personalization });

  // 整条流水线在一次协作作用域内执行：4 个智能体的运行会被同一个 traceId 串起来
  return runWithCollaboration({ pipelineKey: "resource_generation", studentId, resourceId }, async () => {
    try {
      const profileSummary = await runLoggedAgent(
        ProfileAgent,
        "resource_generation",
        context,
        "请根据课程、主题和难度分析学习目标、基础要求和可能薄弱点。",
        { agentRole: "profiler" },
      );

      const resourcePrompt = [
        "请生成 Markdown 学习资料，必须包含以下章节：",
        "# 标题",
        "## 学习目标",
        "## 核心概念",
        "## 公式或方法",
        "## 例题讲解",
        "## 易错点",
        "## 巩固练习",
        "## 学习建议",
        "如果知识点适合代码，例如 C 语言、数据结构、Python，请包含代码示例。",
      ].join("\n");

      // 生成 ⇄ 审核 闭环：审核不通过就把具体问题回灌给 ResourceAgent 重写（最多 2 轮）
      const resourceLoop = await runReviewLoop({
        maxRounds: 2,
        generate: async ({ round, feedback }) => {
          const revisePrompt = feedback.length
            ? `${resourcePrompt}\n\n【上一轮未通过审核，请针对性修正以下问题后重写全文】\n${feedback
                .map((message, index) => `${index + 1}. ${message}`)
                .join("\n")}`
            : resourcePrompt;
          return runLoggedAgent(
            ResourceAgent,
            "resource_generation",
            { ...context, profileSummary, round: round + 1 },
            revisePrompt,
            { agentRole: "generator" },
          );
        },
        review: async (draft) => {
          const verdict = reviewResourceContent(draft, { ...context, subject, topic });
          await recordReviewStep({
            agent: "ReviewAgent",
            label: `讲义审核（${subject || "未指定科目"} / ${topic || "未指定主题"}）`,
            verdict,
            note: "讲义章节完整、篇幅达标、主题贴合且无提示词泄漏",
          });
          return verdict;
        },
      });
      const resourceContent = resourceLoop.draft;
      const reviewSummary = await runLoggedAgent(
        ReviewAgent,
        "resource_review",
        {
          ...context,
          profileSummary,
          resourceContent,
          reviewRounds: resourceLoop.rounds,
          reviewPassed: resourceLoop.passed,
        },
        "请检查资料是否围绕 subject/topic，难度是否匹配，是否有明显错误，并输出审核摘要。",
        { agentRole: "reviewer" },
      );

      const learningPath = await runLoggedAgent(
        PlannerAgent,
        "path_planning",
        { ...context, profileSummary, resourceContent, reviewSummary },
        "请追加后续学习路径建议，使用 Markdown 小节输出。",
        { agentRole: "planner" },
      );

      return [
        ensureRequiredResourceSections(resourceContent, context),
        "",
        reviewSummary.startsWith("##") ? reviewSummary : `## ReviewAgent 审核摘要\n\n${reviewSummary}`,
        "",
        learningPath.startsWith("##") ? learningPath : `## 后续学习路径建议\n\n${learningPath}`,
      ]
        .join("\n")
        .trim();
    } catch (error) {
      console.warn("orchestrateResourceGeneration failed, using fallback:", error.message);
      return buildResourceFallback(context);
    }
  });
}

async function orchestrateAdaptiveQuiz({ domain, knowledgePoint, difficulty, studentId }) {
  const context = await withOpenQuestionContext(buildProfileContext({ domain, knowledgePoint, difficulty }), {
    limit: 3,
  });

  return runWithCollaboration({ pipelineKey: "adaptive_quiz", studentId }, async () => {
    const quizPrompt = [
      "请生成一道中文选择题，只输出 JSON 对象，不要使用 Markdown。",
      "字段必须为 id, domain, question, code, options, answerIndex, explanation, hint。",
      "options 必须恰好 4 项，answerIndex 必须是 0 到 3 的整数。",
    ].join("\n");

    try {
      // 出题 ⇄ 审核 闭环：非法结构（选项数不对/答案下标越界/缺解析）会被退回重出。
      // 注意审核针对「模型原始产出」而不是 normalizeQuestion 之后的结果——后者会把非法值
      // 兜底修好，那样审核就永远通过，闭环也就成了摆设。
      const loop = await runReviewLoop({
        maxRounds: 2,
        generate: ({ feedback }) =>
          runLoggedAgent(
            QuizAgent,
            "adaptive_quiz",
            context,
            feedback.length
              ? `${quizPrompt}\n\n【上一轮未通过审核，请修正以下问题后重新出题】\n${feedback
                  .map((message, index) => `${index + 1}. ${message}`)
                  .join("\n")}`
              : quizPrompt,
            { agentRole: "generator" },
          ),
        review: async (draft) => {
          const parsed = extractJsonObject(draft);
          // 题目 JSON 里的 question 字段是题干文本；只有它是对象时才当作外层包装
          const raw = parsed
            ? parsed.question && typeof parsed.question === "object"
              ? parsed.question
              : parsed
            : null;
          const verdict = raw
            ? reviewQuestions(
                [
                  {
                    stem: raw.question || raw.stem || raw.questionText,
                    options: raw.options,
                    answerIndex: raw.answerIndex,
                    analysis: raw.explanation || raw.analysis,
                  },
                ],
                { existingStems: [] },
              )
            : {
                passed: false,
                issues: [{ code: "quiz_unparsable", message: "模型没有返回可解析的题目 JSON" }],
                checks: {},
              };

          await recordReviewStep({
            agent: "ReviewAgent",
            taskType: "quiz_review",
            label: `题目审核（${knowledgePoint || domain || "未指定知识点"}）`,
            verdict,
            note: "题干、4 个选项、正确答案下标与解析均合法",
          });
          return verdict;
        },
      });

      const parsed = extractJsonObject(loop.draft);
      if (parsed) {
        return normalizeQuestion(parsed.question || parsed, context);
      }
    } catch (error) {
      console.warn("orchestrateAdaptiveQuiz failed, using fallback:", error.message);
    }

    return buildQuestionFallback(context);
  });
}

async function generateQuizHint({ question, code, options, studentId }) {
  const context = { question, code, options };

  return runWithCollaboration({ pipelineKey: "adaptive_quiz", studentId }, async () => {
    try {
      const hint = await runLoggedAgent(
        QuizAgent,
        "quiz_hint",
        context,
        [
          "请为这道题生成一个中文提示，最多三句话。",
          "不要直接泄露正确选项或答案。",
          "如果题目有代码，请提醒学生关注变量变化、循环条件和返回值。",
        ].join("\n"),
        { agentRole: "generator" },
      );

      return sanitizeHint(hint, context);
    } catch (error) {
      console.warn("generateQuizHint failed, using fallback:", error.message);
      return buildHintFallback(context);
    }
  });
}

async function orchestrateTutor(context = {}, extraPrompt = "") {
  const enrichedContext = await withOpenQuestionContext(normalizeAgentContext(context), { limit: 3 });
  return runWithCollaboration({ pipelineKey: "chat", studentId: enrichedContext?.studentId }, async () =>
    runLoggedAgent(TutorAgent, "chat", enrichedContext, extraPrompt || "请进行智能辅导答疑。", {
      agentRole: "tutor",
    }),
  );
}

async function orchestrateAssessment(context = {}, extraPrompt = "") {
  return runWithCollaboration({ pipelineKey: "assessment", studentId: context?.studentId }, async () => {
    const prompt = extraPrompt || "请评估学习效果并给出阶段总结。";
    // 生成 ⇄ 审核 闭环：评估结论里的百分比必须来自输入数据，编造的数字会被打回重写
    const loop = await runReviewLoop({
      maxRounds: 2,
      generate: ({ feedback }) =>
        runLoggedAgent(
          AssessmentAgent,
          "assessment",
          { ...context, reviseFeedback: feedback },
          feedback.length
            ? `${prompt}\n\n【上一轮未通过审核，请修正】\n${feedback.map((message, index) => `${index + 1}. ${message}`).join("\n")}`
            : prompt,
          { agentRole: "assessor" },
        ),
      review: async (draft) => {
        const verdict = reviewAssessment(draft, { allowedPercentages: collectPercentages(context) });
        await recordReviewStep({
          agent: "ReviewAgent",
          taskType: "assessment_review",
          label: "学情评估审核",
          verdict,
          note: "评估结论的篇幅与引用数字均能对回输入数据",
        });
        return verdict;
      },
    });
    return loop.draft;
  });
}

/** 收集输入事实里出现过的百分比，作为评估结论可引用的白名单 */
function collectPercentages(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return [...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
}

async function analyzeWrongQuestion(context = {}, extraPrompt = "") {
  const enrichedContext = await withOpenQuestionContext(normalizeAgentContext(context), { limit: 3 });

  return runWithCollaboration(
    { pipelineKey: "wrong_question", studentId: enrichedContext?.studentId },
    async () => {
      const prompt =
        extraPrompt ||
        [
          "请分析本次错题，必须返回 JSON 对象。",
          "字段：error_reason、feedback_suggestion、recommended_action。",
          "如果 openQuestionCheckpoints 不为空，请优先指出学生漏掉的评分点。",
        ].join("\n");

      // 生成 ⇄ 审核 闭环：归因结果必须包含知识点、错因与下一步建议，否则重写
      const loop = await runReviewLoop({
        maxRounds: 2,
        generate: ({ feedback }) =>
          runLoggedAgent(
            FeedbackAgent,
            "wrong_question_feedback",
            { ...enrichedContext, reviseFeedback: feedback },
            feedback.length
              ? `${prompt}\n\n【上一轮未通过审核，请补齐以下内容】\n${feedback
                  .map((message, index) => `${index + 1}. ${message}`)
                  .join("\n")}`
              : prompt,
            { agentRole: "generator" },
          ),
        review: async (draft) => {
          const normalized = normalizeWrongQuestionFeedback(draft, enrichedContext);
          const verdict = reviewWrongQuestionFeedback(
            [normalized.error_reason, normalized.feedback_suggestion, normalized.recommended_action]
              .filter(Boolean)
              .join("\n"),
            {
              evidenceCount: Array.isArray(enrichedContext?.openQuestionCheckpoints)
                ? enrichedContext.openQuestionCheckpoints.length
                : 0,
            },
          );
          await recordReviewStep({
            agent: "ReviewAgent",
            taskType: "wrong_question_review",
            label: "错题归因审核",
            verdict,
            note: "归因包含知识点、错因与可执行的复习建议",
          });
          return verdict;
        },
      });

      return normalizeWrongQuestionFeedback(loop.draft, enrichedContext);
    },
  );
}

function normalizeWrongQuestionFeedback(feedback, context = {}) {
  const fallback = buildWrongQuestionFeedbackFallback(context);

  if (feedback && typeof feedback === "object" && !Array.isArray(feedback)) {
    return {
      error_reason:
        ensureText(feedback.error_reason || feedback.errorReason || feedback.reason) || fallback.error_reason,
      feedback_suggestion:
        ensureText(feedback.feedback_suggestion || feedback.feedbackSuggestion || feedback.suggestion) ||
        fallback.feedback_suggestion,
      recommended_action:
        ensureText(feedback.recommended_action || feedback.recommendedAction || feedback.action) ||
        fallback.recommended_action,
    };
  }

  const parsed = extractJsonObject(feedback);
  if (parsed) {
    return normalizeWrongQuestionFeedback(parsed, context);
  }

  const text = ensureText(feedback);
  if (text) {
    return {
      error_reason: text,
      feedback_suggestion: fallback.feedback_suggestion,
      recommended_action: fallback.recommended_action,
    };
  }

  return fallback;
}

function buildWrongQuestionFeedbackFallback(context = {}) {
  const subject = ensureText(context.subject || context.domain) || "当前科目";
  const topic = ensureText(context.knowledgePoint || context.topic) || "当前知识点";
  const selected = ensureText(context.selectedAnswer || context.selected_answer);
  const correct = ensureText(context.correctAnswer || context.correct_answer);
  const checkpoints = Array.isArray(context.openQuestionCheckpoints)
    ? context.openQuestionCheckpoints
        .map((item) => ensureText(typeof item === "string" ? item : JSON.stringify(item)))
        .filter(Boolean)
    : [];
  const checkpointText = checkpoints.slice(0, 3).join("；");
  const analysis = ensureText(context.analysis || (context.question && context.question.analysis));
  const basis = checkpointText || analysis || `${topic} 的定义、适用条件和题干关键信息`;

  return {
    error_reason: `本题属于 ${subject} 的 ${topic}。你选择 ${selected || "当前答案"}，正确答案是 ${correct || "标准答案"}；需要重点补齐：${basis}。`,
    feedback_suggestion: checkpointText
      ? `优先对照开放追问题库评分点复盘：${checkpointText}。`
      : `先回顾 ${topic} 的核心概念，再结合本题解析复盘错误选项。`,
    recommended_action: `重做本题，并完成 2 道 ${topic} 同类基础题。`,
  };
}

async function generateSimilarQuestions(context = {}, extraPrompt = "") {
  const enrichedContext = await withOpenQuestionContext(normalizeAgentContext(context), { limit: 3 });
  const text = await runLoggedAgent(
    QuizAgent,
    "quiz_generation",
    enrichedContext,
    extraPrompt || "请生成 3 道同类练习题，题目应围绕同一知识点但改变情境或边界条件。",
  );
  const parsed = extractJsonArray(text);
  return parsed.length > 0 ? parsed : [buildQuestionFallback(enrichedContext)];
}

function normalizeAgentContext(context = {}) {
  return {
    ...context,
    ...buildProfileContext(context),
  };
}

async function withOpenQuestionContext(context = {}, { limit = 3 } = {}) {
  const subject = context.subject || context.domain;
  const knowledgePoint = context.knowledgePoint || context.topic;

  if (!subject && !knowledgePoint) {
    return {
      ...context,
      openQuestionContext: [],
      openQuestionCheckpoints: [],
    };
  }

  const openQuestionContext = await getOpenQuestionContext({
    subject,
    knowledgePoint,
    limit,
  });

  return {
    ...context,
    openQuestionContext,
    openQuestionCheckpoints: openQuestionContext.flatMap((item) => item.checkpoints || []),
  };
}

async function syncProfileFromActivity(context = {}, extraPrompt = "") {
  return runLoggedAgent(
    ProfileAgent,
    "profile_update",
    context,
    extraPrompt || "请根据学习活动更新画像摘要，包括掌握点、薄弱点和下一步建议。",
  );
}

function buildProfileContext(input = {}) {
  const message = ensureText(input.message || input.question);

  return {
    message,
    history: Array.isArray(input.history) ? input.history : [],
    subject: ensureText(input.subject || input.domain || inferSubject(message)),
    domain: ensureText(input.domain || input.subject || inferSubject(message)),
    topic: ensureText(input.topic || input.knowledgePoint || inferTopic(message)),
    knowledgePoint: ensureText(input.knowledgePoint || input.topic || inferTopic(message)),
    resourceType: ensureText(input.resourceType || "LectureNotes"),
    difficulty: ensureText(input.difficulty || "advanced"),
    raw: input,
  };
}

function extractJsonArray(text) {
  const sources = getJsonCandidateSources(text);

  for (const source of sources) {
    for (let index = source.indexOf("["); index >= 0; index = source.indexOf("[", index + 1)) {
      const end = findMatchingBracket(source, index, "[", "]");
      if (end < 0) {
        continue;
      }

      try {
        const parsed = JSON.parse(source.slice(index, end + 1));
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (error) {
        // Try the next candidate.
      }
    }
  }

  return [];
}

function logAgentRun(agentName, payload = {}) {
  console.log(`[agent:${agentName}]`, {
    status: payload.status || "planned",
    usedFallback: Boolean(payload.usedFallback),
  });
}

function normalizeChatParts(parts, message) {
  const fallback = buildChatFallback(message);

  return CHAT_PARTS.map((partInfo, index) => {
    const matched = parts.find((item) => item && item.agent === partInfo.agent) || parts[index] || {};

    const normalized = {
      agent: partInfo.agent,
      title: partInfo.title,
      content: ensureText(matched.content) || fallback[index].content,
    };

    if (partInfo.agent === "CodeAgent") {
      normalized.code = ensureText(matched.code) || fallback[index].code;
      normalized.codeLanguage = ensureText(matched.codeLanguage) || fallback[index].codeLanguage || "c";
    }

    return normalized;
  });
}

function normalizeQuestion(question, context = {}) {
  const fallback = buildQuestionFallback(context);
  const options = Array.isArray(question.options) ? question.options.map(String).slice(0, 4) : [];
  const answerIndex = Number(question.answerIndex);

  if (options.length !== 4 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    return fallback;
  }

  return {
    id: ensureText(question.id) || fallback.id,
    domain: ensureText(question.domain) || context.domain || context.subject || fallback.domain,
    question: ensureText(question.question) || fallback.question,
    code: ensureText(question.code),
    options,
    answerIndex,
    explanation: ensureText(question.explanation) || fallback.explanation,
    hint: ensureText(question.hint) || fallback.hint,
  };
}

function ensureRequiredResourceSections(content, context) {
  const normalized = ensureText(content) || buildResourceFallback(context);
  const requiredSections = [
    "## 学习目标",
    "## 核心概念",
    "## 公式或方法",
    "## 例题讲解",
    "## 易错点",
    "## 巩固练习",
    "## 学习建议",
  ];

  const missing = requiredSections.filter((section) => !normalized.includes(section));
  if (missing.length === 0 && normalized.includes("# ")) {
    return normalized;
  }

  return buildResourceFallback(context);
}

function buildChatFallback(message) {
  const isTree = isTopicMatch(message, ["树", "二叉", "遍历", "traversal"]);

  if (isTree) {
    return [
      {
        agent: "coordinator",
        title: "智课研伴（综合协调）",
        content:
          "已完成多智能体协同：ProfileAgent 判断该问题属于数据结构中的树与二叉树遍历；TutorAgent 负责讲解遍历顺序；ResourceAgent 提供 C 语言示例；ReviewAgent 补充边界与复杂度。",
      },
      {
        agent: "TheoryAgent",
        title: "TheoryAgent（理论讲解智能体）",
        content: [
          "二叉树遍历的关键是“根节点在什么时候被访问”。",
          "前序遍历：根-左-右，常用于复制树、输出表达式前缀形式。",
          "中序遍历：左-根-右，若对象是二叉搜索树，中序结果会递增。",
          "后序遍历：左-右-根，常用于释放树、计算目录大小或表达式求值。",
          "层序遍历：按深度从上到下访问，通常借助队列。",
        ].join("\n"),
      },
      {
        agent: "CodeAgent",
        title: "CodeAgent（代码示例智能体）",
        content: "下面是递归实现。递归出口是 root == NULL，每个节点只会被访问一次。",
        code: buildTreeTraversalCode(),
        codeLanguage: "c",
      },
      {
        agent: "ReviewAgent",
        title: "ReviewAgent（内容审核智能体）",
        content: [
          "复杂度：三种深度优先遍历的时间复杂度都是 O(n)，递归栈空间为 O(h)，h 是树高。",
          "易错点：不要把中序遍历直接等同于有序输出，只有二叉搜索树才满足这个性质。",
          "工程提醒：若树退化成链表，递归深度可能接近 n，可以改用显式栈降低栈溢出风险。",
        ].join("\n"),
      },
    ];
  }

  return [
    {
      agent: "coordinator",
      title: "智课研伴（综合协调）",
      content: `已收到问题：“${message}”。当前使用多智能体 fallback 流程，保持前端 parts 返回结构不变。`,
    },
    {
      agent: "TheoryAgent",
      title: "TheoryAgent（理论讲解智能体）",
      content: "建议先定位课程领域、核心定义、输入输出关系和约束条件，再从性质、方法、复杂度三个层次展开。",
    },
    {
      agent: "CodeAgent",
      title: "CodeAgent（代码示例智能体）",
      content: "可先写出最小可运行框架，再补充边界条件与异常输入处理。",
      code: [
        "#include <stdio.h>",
        "",
        "int main(void) {",
        '    printf("ZhiKe YanBan fallback demo\\n");',
        "    return 0;",
        "}",
      ].join("\n"),
      codeLanguage: "c",
    },
    {
      agent: "ReviewAgent",
      title: "ReviewAgent（内容审核智能体）",
      content: "请重点检查：空输入、极端规模、重复元素、内存释放、时间复杂度是否满足题目约束。",
    },
  ];
}

function buildResourceFallback(context) {
  const subject = context.subject || context.domain || "计算机专业课程";
  const topic = context.topic || context.knowledgePoint || "核心知识点";
  const difficulty = context.difficulty || "Advanced";
  const codeSection = shouldIncludeCode(subject, topic)
    ? [
        "",
        "```c",
        "#include <stdio.h>",
        "",
        "typedef struct TreeNode {",
        "    int value;",
        "    struct TreeNode *left;",
        "    struct TreeNode *right;",
        "} TreeNode;",
        "",
        "void preorder(TreeNode *root) {",
        "    if (root == NULL) return;",
        '    printf("%d ", root->value);',
        "    preorder(root->left);",
        "    preorder(root->right);",
        "}",
        "```",
      ].join("\n")
    : "";

  return [
    `# ${topic}`,
    "",
    "## 学习目标",
    "",
    `- 理解「${subject}」中「${topic}」的定义、性质和适用场景。`,
    `- 能够完成 ${difficulty} 难度下的概念辨析、例题推导和边界检查。`,
    "",
    "## 核心概念",
    "",
    `${topic} 的学习重点是把抽象定义转化为可推导、可实现、可验证的过程。`,
    "",
    "## 公式或方法",
    "",
    "- 明确输入规模 n。",
    "- 列出关键操作的执行次数。",
    "- 分析时间复杂度、空间复杂度和最坏情况。",
    "",
    "## 例题讲解",
    "",
    `例题：请说明「${topic}」在解题中如何处理边界情况。`,
    "",
    "思路：先构造最小样例，再构造极端样例，观察状态变化是否符合定义。",
    codeSection,
    "",
    "## 易错点",
    "",
    "1. 只记结论，不理解适用条件。",
    "2. 混淆逻辑结构、存储结构和算法过程。",
    "3. 忽略空输入、单元素、退化结构和复杂度上界。",
    "",
    "## 巩固练习",
    "",
    `请用自己的话解释「${topic}」的核心思想，并给出一个反例说明常见误解。`,
    "",
    "## 学习建议",
    "",
    "先画图或列状态表，再写伪代码，最后补充复杂度与边界条件。",
  ].join("\n");
}

function buildQuestionFallback(context = {}) {
  const domain = context.domain || context.subject || "数据结构";
  const point = context.knowledgePoint || context.topic || "树与二叉树";
  const text = `${domain} ${point}`.toLowerCase();

  if (isTopicMatch(text, ["树", "二叉", "遍历"])) {
    return {
      id: "DS_TREE_001",
      domain,
      question: "关于二叉树前序、中序和后序遍历，下列说法哪一项是正确的？",
      code: "",
      options: [
        "前序遍历的访问顺序是根节点、左子树、右子树",
        "中序遍历一定能让任意二叉树输出递增序列",
        "后序遍历的第一个访问节点一定是根节点",
        "层序遍历属于深度优先遍历",
      ],
      answerIndex: 0,
      explanation:
        "前序遍历定义为根-左-右。中序只有在二叉搜索树上才天然有序；后序最后访问根节点；层序遍历是广度优先遍历。",
      hint: "先抓住根节点的访问时机，再比较三种深度优先遍历。",
    };
  }

  if (isTopicMatch(text, ["组成", "cache", "缓存", "主存", "虚拟存储", "存储系统"])) {
    return {
      id: "CO_CACHE_001",
      domain,
      question: "关于 Cache 与主存之间的关系，下列说法哪一项是正确的？",
      code: "",
      options: [
        "Cache 利用程序访问的局部性原理提升平均访存速度",
        "Cache 容量越大，命中率一定达到 100%",
        "直接映射 Cache 不会发生冲突失效",
        "虚拟存储的页表可以完全替代 Cache",
      ],
      answerIndex: 0,
      explanation:
        "Cache 的核心依据是时间局部性和空间局部性。容量增大不保证 100% 命中；直接映射会有冲突失效；页表解决地址转换，不替代 Cache。",
      hint: "回忆局部性原理，再区分 Cache、主存和虚拟存储各自解决的问题。",
    };
  }

  if (isTopicMatch(text, ["操作系统", "进程", "线程", "调度", "死锁"])) {
    return {
      id: "OS_SCHED_001",
      domain,
      question: "关于进程调度算法，下列说法哪一项是正确的？",
      code: "",
      options: [
        "时间片轮转算法通常适合分时系统，能够改善交互响应",
        "先来先服务算法一定能获得最短平均等待时间",
        "短作业优先算法不会造成长作业饥饿",
        "优先级调度不需要考虑优先级反转问题",
      ],
      answerIndex: 0,
      explanation:
        "时间片轮转通过周期性切换让交互任务较快获得响应。FCFS 不保证最短平均等待时间；SJF 可能导致长作业饥饿；优先级调度需要处理优先级反转。",
      hint: "关注每种调度算法最想优化的指标，以及它可能牺牲的公平性。",
    };
  }

  if (isTopicMatch(text, ["网络", "tcp", "可靠传输", "拥塞", "连接"])) {
    return {
      id: "NET_TCP_001",
      domain,
      question: "关于 TCP 可靠传输机制，下列说法哪一项是正确的？",
      code: "",
      options: [
        "TCP 通过序号、确认、重传和滑动窗口等机制实现可靠传输",
        "TCP 三次握手只用于提高传输速率",
        "拥塞控制只发生在接收端缓存不足时",
        "UDP 和 TCP 都保证数据按序可靠到达",
      ],
      answerIndex: 0,
      explanation:
        "TCP 可靠性来自序号、ACK、超时/快速重传、滑动窗口等机制。三次握手用于建立连接并同步序号；拥塞控制关注网络负载；UDP 不保证可靠有序。",
      hint: "把可靠传输、连接建立、流量控制和拥塞控制分开看。",
    };
  }

  if (isTopicMatch(text, ["python", "列表", "字典", "函数", "list", "dict"])) {
    return {
      id: "PY_LIST_001",
      domain,
      question: "关于 Python 列表和字典，下列说法哪一项是正确的？",
      code: "items = [1, 2, 3]\nlookup = {'a': 1, 'b': 2}",
      options: [
        "列表适合按位置访问元素，字典适合按键查找值",
        "列表和字典的键都必须是不可变对象",
        "字典会自动按值从小到大排序",
        "列表 append 操作会返回修改后的新列表",
      ],
      answerIndex: 0,
      explanation:
        "列表是有序序列，常按下标访问；字典是键值映射，适合按键查找。字典的键需可哈希，列表没有键；字典不按值自动排序；append 原地修改并返回 None。",
      hint: "先区分序列和映射，再关注操作是原地修改还是返回新对象。",
    };
  }

  return {
    id: "CS_GENERAL_001",
    domain,
    question: `关于「${point}」的学习方法，下列哪一项最合理？`,
    code: "",
    options: [
      "先明确定义和约束，再结合例题分析复杂度与边界条件",
      "只记住最终结论，不需要理解适用场景",
      "所有问题都可以用同一种数据结构解决",
      "只要代码能运行，就不需要分析复杂度",
    ],
    answerIndex: 0,
    explanation:
      "计算机专业课程的学习需要同时关注定义、约束、实现和复杂度。只背结论或忽略复杂度都会导致迁移能力不足。",
    hint: "优先选择同时覆盖定义、条件、实现和复杂度的选项。",
  };
}

function buildHintFallback({ question, code, options }) {
  const questionText = String(question || "");

  if (code) {
    return "提示：先沿着代码执行顺序手动跟踪变量变化，再检查循环条件、递归出口或返回值；不要直接从选项猜答案。";
  }

  if (isTopicMatch(questionText, ["遍历", "前序", "中序", "后序", "二叉树"])) {
    return "提示：把注意力放在根节点的访问时机上，前序、中序、后序的区别就是根节点分别出现在访问序列的不同位置。";
  }

  if (Array.isArray(options) && options.length > 0) {
    return "提示：先排除描述过于绝对或混淆概念的选项，再回到题干中的限制条件判断。";
  }

  return "提示：先回到概念定义，再判断题干中的限制条件是否改变了常规结论。";
}

function sanitizeHint(hint, context) {
  const text = ensureText(hint);
  if (!text || text.includes("QuizAgent fallback")) {
    return buildHintFallback(context);
  }

  const answerPatterns = [
    /正确答案\s*(是|为)?\s*[A-D]/i,
    /答案\s*(是|为)?\s*[A-D]/i,
    /选\s*[A-D]/i,
    /answer\s*(is|:)?\s*[A-D]/i,
  ];

  if (answerPatterns.some((pattern) => pattern.test(text))) {
    return buildHintFallback(context);
  }

  return text;
}

function extractJsonObject(text) {
  const sources = getJsonCandidateSources(text);

  for (const source of sources) {
    for (let index = source.indexOf("{"); index >= 0; index = source.indexOf("{", index + 1)) {
      const end = findMatchingBracket(source, index, "{", "}");
      if (end < 0) {
        continue;
      }

      try {
        const parsed = JSON.parse(source.slice(index, end + 1));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (error) {
        // Try the next candidate.
      }
    }
  }

  return null;
}

function getJsonCandidateSources(text) {
  const raw = String(text || "");
  const sources = [];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = fencePattern.exec(raw);

  while (match) {
    sources.push(match[1].trim());
    match = fencePattern.exec(raw);
  }

  sources.push(
    raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim(),
  );

  return sources.filter(Boolean);
}

function findMatchingBracket(text, start, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractCodeBlock(text) {
  const content = String(text || "");
  const match = content.match(/```([a-zA-Z0-9+#-]*)\s*([\s\S]*?)```/);

  if (!match) {
    return null;
  }

  return {
    language: normalizeCodeLanguage(match[1]),
    code: match[2].trim(),
  };
}

function summarizeCodeContent(text) {
  const content = ensureText(text);
  if (!content) {
    return "ResourceAgent 已准备代码示例。";
  }

  return (
    content.replace(/```[\s\S]*?```/g, "").trim() ||
    "ResourceAgent 已准备代码示例，重点关注边界条件和复杂度。"
  );
}

function buildFallbackCode(message) {
  if (isTopicMatch(message, ["树", "二叉", "遍历", "traversal"])) {
    return {
      language: "c",
      code: buildTreeTraversalCode(),
    };
  }

  return {
    language: "c",
    code: [
      "#include <stdio.h>",
      "",
      "int main(void) {",
      '    printf("ZhiKe YanBan fallback demo\\n");',
      "    return 0;",
      "}",
    ].join("\n"),
  };
}

function buildTreeTraversalCode() {
  return [
    "#include <stdio.h>",
    "",
    "typedef struct TreeNode {",
    "    int value;",
    "    struct TreeNode *left;",
    "    struct TreeNode *right;",
    "} TreeNode;",
    "",
    "void preorder(TreeNode *root) {",
    "    if (root == NULL) return;",
    '    printf("%d ", root->value);',
    "    preorder(root->left);",
    "    preorder(root->right);",
    "}",
    "",
    "void inorder(TreeNode *root) {",
    "    if (root == NULL) return;",
    "    inorder(root->left);",
    '    printf("%d ", root->value);',
    "    inorder(root->right);",
    "}",
    "",
    "void postorder(TreeNode *root) {",
    "    if (root == NULL) return;",
    "    postorder(root->left);",
    "    postorder(root->right);",
    '    printf("%d ", root->value);',
    "}",
  ].join("\n");
}

function normalizeCodeLanguage(language) {
  const normalized = String(language || "c")
    .trim()
    .toLowerCase();

  if (["c", "cpp", "c++", "python", "py", "java", "javascript", "js"].includes(normalized)) {
    return normalized === "c++"
      ? "cpp"
      : normalized === "py"
        ? "python"
        : normalized === "js"
          ? "javascript"
          : normalized;
  }

  return "c";
}

function inferSubject(text) {
  if (isTopicMatch(text, ["树", "二叉", "链表", "栈", "队列", "图", "算法"])) {
    return "数据结构";
  }
  if (isTopicMatch(text, ["进程", "线程", "调度", "死锁", "内存管理"])) {
    return "操作系统";
  }
  if (isTopicMatch(text, ["cache", "缓存", "主存", "流水线", "组成"])) {
    return "计算机组成原理";
  }
  if (isTopicMatch(text, ["tcp", "ip", "拥塞", "网络", "可靠传输"])) {
    return "计算机网络";
  }
  if (isTopicMatch(text, ["python", "列表", "字典", "函数"])) {
    return "Python";
  }
  return "计算机专业课程";
}

function inferTopic(text) {
  if (isTopicMatch(text, ["前序", "中序", "后序", "二叉", "树"])) {
    return "树与二叉树";
  }
  if (isTopicMatch(text, ["cache", "缓存", "主存"])) {
    return "存储系统";
  }
  if (isTopicMatch(text, ["进程", "调度"])) {
    return "进程调度";
  }
  if (isTopicMatch(text, ["tcp", "连接", "拥塞"])) {
    return "TCP 可靠传输";
  }
  if (isTopicMatch(text, ["python", "列表", "字典"])) {
    return "Python 容器";
  }
  return "综合知识点";
}

function shouldIncludeCode(subject, topic) {
  return isTopicMatch(`${subject} ${topic}`, [
    "c",
    "python",
    "数据结构",
    "算法",
    "树",
    "二叉树",
    "链表",
    "栈",
    "队列",
    "图",
    "遍历",
    "代码",
  ]);
}

function isTopicMatch(text, keywords) {
  const source = String(text || "").toLowerCase();
  return keywords.some((keyword) => source.includes(String(keyword).toLowerCase()));
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

const runChat = orchestrateChat;
const runResourceGeneration = orchestrateResourceGeneration;
const runQuestionGeneration = orchestrateAdaptiveQuiz;
const runQuizHint = generateQuizHint;

module.exports = {
  AGENTS,
  orchestrateChat,
  orchestrateResourceGeneration,
  orchestrateAdaptiveQuiz,
  generateQuizHint,
  orchestrateTutor,
  orchestrateAssessment,
  analyzeWrongQuestion,
  generateSimilarQuestions,
  syncProfileFromActivity,
  buildProfileContext,
  extractJsonArray,
  logAgentRun,
  runLoggedAgent,
  runChat,
  runResourceGeneration,
  runQuestionGeneration,
  runQuizHint,
};
