/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText, isAIEnabled } = require("./aiService");
const { reviewResourceRules } = require("./resourceReviewRules");

async function reviewResource(content, context, hooks = {}) {
  const deterministic = reviewResourceRules(content, context);
  await hooks.onDeterministicReview?.(deterministic);
  if (process.env.MULTIMODAL_REVIEW_AI_ENABLED !== "true" || !isAIEnabled()) {
    const result = {
      ...deterministic,
      modelReviewExecuted: false,
      modelReviewStatus: "disabled",
      summary: `${deterministic.summary} 模型审核未执行。`,
    };
    await hooks.onAiReview?.(result);
    return result;
  }
  try {
    const raw = await generateText({
      capability: "resource_review",
      messages: [
        {
          role: "system",
          content:
            "You are ReviewAgent. Return strict JSON with issues only. Never invent IDs, prompts, paths, URLs, or secrets.",
        },
        {
          role: "user",
          content: JSON.stringify({
            resource: content,
            ruleReview: {
              score: deterministic.score,
              passed: deterministic.passed,
              issues: deterministic.issues,
            },
            context: {
              subject: context.subject,
              knowledgePoint: context.knowledgePoint,
              mastery: context.mastery,
              allowedQuestionIds: context.allowedQuestionIds,
              allowedCodeExerciseIds: context.allowedCodeExerciseIds,
            },
          }),
        },
      ],
      temperature: 0.1,
      maxTokens: 1800,
    });
    const parsed = parseModelReview(raw);
    const result = mergeModelReview(deterministic, parsed);
    await hooks.onAiReview?.(result);
    return result;
  } catch (error) {
    const result = {
      ...deterministic,
      modelReviewExecuted: false,
      modelReviewStatus: "unavailable",
      summary: `${deterministic.summary} 模型审核不可用，未将失败伪装为通过。`,
    };
    await hooks.onAiReview?.(result);
    return result;
  }
}

function parseModelReview(raw) {
  const text = String(raw || "").trim();
  if (!text.startsWith("{") || !text.endsWith("}")) throw new Error("invalid model review response");
  const value = JSON.parse(text);
  const issues = Array.isArray(value.issues)
    ? value.issues.slice(0, 20).map(normalizeModelIssue).filter(Boolean)
    : [];
  return { issues, summary: String(value.summary || "模型审核完成").slice(0, 300) };
}

// 模型返回的问题条目字段名并不固定（message / description / issue / problem / detail…），
// 以前只认 message 与 dimension：两者缺失时，每条问题都会被折叠成
// 「dimension=factuality + message=模型发现潜在问题」，于是事实性维度被重复扣分、
// 88 分的资源也被判 rejected，而日志里完全看不出真实原因。这里做字段名归一化。
const DIMENSION_ALIASES = new Map([
  ["factuality", "factuality"],
  ["事实性", "factuality"],
  ["正确性", "factuality"],
  ["准确性", "factuality"],
  ["structure", "structure"],
  ["结构", "structure"],
  ["组织", "structure"],
  ["逻辑", "structure"],
  ["personalization", "personalization"],
  ["个性化", "personalization"],
  ["针对性", "personalization"],
  ["readability", "readability"],
  ["可读性", "readability"],
  ["表达", "readability"],
  ["清晰度", "readability"],
  ["difficulty", "difficulty"],
  ["难度", "difficulty"],
  ["梯度", "difficulty"],
  ["safety", "safety"],
  ["安全", "safety"],
  ["合规", "safety"],
]);

function normalizeModelIssue(item) {
  if (typeof item === "string") {
    const text = item.trim();
    return text
      ? {
          severity: "medium",
          category: "factuality",
          dimension: null,
          location: "content",
          message: text.slice(0, 500),
          suggestedFix: "人工核验后修复",
          source: "ai",
        }
      : null;
  }
  if (!item || typeof item !== "object") return null;
  const message = String(
    item.message ||
      item.description ||
      item.issue ||
      item.problem ||
      item.detail ||
      item.text ||
      item.title ||
      "",
  ).trim();
  if (!message) return null;
  const severity = String(item.severity || item.level || "").toLowerCase();
  const rawDimension = String(item.dimension || item.category || item.type || "")
    .trim()
    .toLowerCase();
  return {
    severity: ["low", "medium", "high", "critical"].includes(severity) ? severity : "medium",
    category: "factuality",
    // 没有明确维度就保持 null：既不冤枉某个维度，也避免同一问题被反复扣分。
    dimension: DIMENSION_ALIASES.get(rawDimension) || null,
    location: String(item.location || item.where || item.position || "content").slice(0, 160),
    message: message.slice(0, 500),
    suggestedFix: String(item.suggestedFix || item.suggestion || item.fix || "人工核验后修复").slice(0, 500),
    source: "ai",
  };
}

function mergeModelReview(ruleReview, modelReview) {
  const modelIssues = modelReview.issues;
  const dimensions = ruleReview.dimensions.map((dimension) => {
    const related = modelIssues.filter((item) => item.dimension === dimension.dimension);
    const deduction = related.reduce(
      (sum, item) => sum + { low: 1, medium: 2, high: 4, critical: 8 }[item.severity],
      0,
    );
    const score = Math.max(0, dimension.score - deduction);
    return {
      ...dimension,
      score,
      status: related.length || dimension.status === "failed" ? "failed" : "passed",
      issues: [...dimension.issues, ...related],
      suggestions: [...dimension.suggestions, ...related.map((item) => item.suggestedFix)],
    };
  });
  // 没有声明维度的问题不再挂到某个维度上重复扣分，而是给一次封顶的总体扣分。
  const dimensionless = modelIssues.filter((item) => !item.dimension);
  const flatDeduction = Math.min(
    12,
    dimensionless.reduce((sum, item) => sum + { low: 1, medium: 2, high: 4, critical: 8 }[item.severity], 0),
  );
  const score = Math.max(0, dimensions.reduce((sum, item) => sum + item.score, 0) - flatDeduction);
  const factuality = dimensions.find((item) => item.dimension === "factuality")?.score || 0;
  const safety = dimensions.find((item) => item.dimension === "safety")?.score || 0;
  const issues = [...ruleReview.issues, ...modelIssues];
  const passed =
    score >= ruleReview.passThreshold &&
    factuality >= 20 &&
    safety === 5 &&
    !issues.some((item) => item.severity === "critical");
  return {
    ...ruleReview,
    status: passed ? "approved" : "rejected",
    passed,
    score,
    totalScore: score,
    dimensions,
    issues,
    modelIssues,
    modelReviewExecuted: true,
    modelReviewStatus: "completed",
    summary: `${ruleReview.summary} ${modelReview.summary}`,
    reviewedAt: new Date().toISOString(),
  };
}

module.exports = { reviewResource, parseModelReview, mergeModelReview };
