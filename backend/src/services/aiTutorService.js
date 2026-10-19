/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { TutorAgent } = require("./agents/tutorAgent");
const { ReviewAgent } = require("./agents/reviewAgent");
const { validateChatResponse, extractCodeBlocks } = require("./chatResponseValidator");
const { recordAgentStep } = require("./agentCollaborationService");

/**
 * 辅导 ⇄ 审核 闭环：TutorAgent 生成回答 → 引用校验 + ReviewAgent 审核 →
 * 不通过就把具体问题（最多 12 条）回灌给 TutorAgent 重写，最多 2 轮。
 * 每一步都会写进协作轨迹，因此学生端能看见「这次回答被审核打回过没有」。
 */
async function generateTutorResponse(input, options = {}) {
  const tutor = options.tutorAgent || TutorAgent;
  const reviewer = options.reviewAgent || ReviewAgent;
  const validator = options.validateResponse || validateChatResponse;
  const followups = Array.isArray(input.followups) ? input.followups.slice(0, 4) : [];
  const evaluationQuestion = input.resolvedQuestion || input.message;
  let qualityFeedback = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    options.signal?.throwIfAborted();
    if (attempt > 0) options.onReset?.("正在修正回答并重新核验引用");
    const tutorStartedAt = Date.now();
    const answerMarkdown = await tutor.generateChatAnswer(input, {
      generateTextFn: options.generateTextFn,
      qualityFeedback,
      onDelta: options.onDelta,
      signal: options.signal,
    });
    await recordAgentStep({
      agent: "TutorAgent",
      role: "tutor",
      taskType: "chat_answer",
      durationMs: Date.now() - tutorStartedAt,
      summary: `第 ${attempt + 1} 轮生成回答（${String(answerMarkdown || "").length} 字）${attempt > 0 ? "：已按审核意见返修" : ""}`,
    });
    const citationResult =
      input.sourceMode === "rag_model"
        ? input.validateCitations(answerMarkdown)
        : { approved: true, coverage: 0, issues: [], citations: [], validation: null };
    const quality = validator({
      answerMarkdown,
      conversational: true,
      message: evaluationQuestion,
      knowledgePoint: input.intent.knowledgePoint,
      complexity: input.intent.complexity,
      requiresCode: input.intent.requiresCode,
      followups,
      citationIssues: citationResult.issues,
    });
    const review = reviewer.reviewChat({
      answerMarkdown,
      message: evaluationQuestion,
      subject: input.intent.subject,
      knowledgePoint: input.intent.knowledgePoint,
      sourceMode: input.sourceMode,
      citations: citationResult.citations,
      quality,
    });

    const roundPassed = Boolean(quality.passed && review.passed && citationResult.approved);
    await recordAgentStep({
      agent: "ReviewAgent",
      role: "reviewer",
      taskType: "chat_review",
      status: roundPassed ? "success" : "fallback",
      summary: roundPassed
        ? `第 ${attempt + 1} 轮审核通过（引用覆盖 ${citationResult.coverage ?? 0}）`
        : `第 ${attempt + 1} 轮审核未通过，已打回重写：${[
            ...quality.issues,
            ...review.issues,
            ...citationResult.issues,
          ]
            .map((item) => item?.message)
            .filter(Boolean)
            .slice(0, 3)
            .join("；")}`,
    });

    if (quality.passed && review.passed && citationResult.approved) {
      return {
        answerMarkdown,
        citations: citationResult.citations,
        citationValidation: citationResult.validation,
        citationCoverage: citationResult.coverage,
        quality,
        codeBlocks: extractCodeBlocks(answerMarkdown),
        retryCount: attempt,
        review,
      };
    }

    qualityFeedback = uniqueMessages([
      ...quality.issues.map((item) => item.message),
      ...review.issues.map((item) => item.message),
      ...citationResult.issues.map((item) => citationIssueMessage(item)),
    ]).slice(0, 12);
  }

  throw serviceError(
    "AI_RESPONSE_QUALITY_FAILED",
    "模型回答未通过检查：" + qualityFeedback.slice(0, 3).join("；") + "。可缩小问题范围后重试。",
    502,
  );
}

function citationIssueMessage(issue) {
  const labels = {
    citation_missing: "有本地证据时必须在对应结论后标注引用",
    invalid_reference: "引用只能使用本次提供的证据编号",
    unsupported_claim: "结论必须得到引用资料的直接支持",
  };
  return labels[issue?.type] || "引用验证未通过";
}

function uniqueMessages(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function serviceError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

module.exports = { generateTutorResponse, serviceError };
