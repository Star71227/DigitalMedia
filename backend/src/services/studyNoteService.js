/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText, isAIEnabled } = require("./aiService");
const { retrieveKnowledge } = require("./knowledgeRetrievalService");
const { validateCitations } = require("./citationValidationService");
const { validateResourceEnvelope, fingerprint } = require("./resourceSchema");
const { PROMPT_VERSION, buildStudyNotePrompt, parseStudyNoteJson } = require("./studyNotePromptService");
const { buildDetailedStudyNoteContent } = require("./studyNoteFallbackService");
const { validateStudyNoteQuality } = require("./studyNoteQualityService");

const MAX_GENERATION_ATTEMPTS = 3;

async function generateStudyNoteResource(context, options = {}) {
  const retrieval = await prepareStudyNoteRetrieval(context, options);
  const citations = buildCitationCatalog(retrieval);
  const modelAvailableAtStart =
    Boolean((options.isAIEnabledFn || isAIEnabled)()) &&
    process.env.MULTIMODAL_RESOURCE_AI_ENABLED === "true";
  const qualityAttempts = [];
  let lastModelError = null;
  if (modelAvailableAtStart) {
    let feedback = [];
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const prompt = buildStudyNotePrompt(context, { citations, qualityFeedback: feedback });
        const raw = await (options.generateTextFn || generateText)({
          capability: "resource",
          messages: [
            {
              role: "system",
              content:
                "You generate one detailed Chinese study_note JSON content object. Return strict JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: attempt === 0 ? 0.25 : 0.15,
          maxTokens: 24000,
          jsonMode: true,
        });
        const content = parseStudyNoteJson(raw);
        const sourceMode = retrieval.results.length ? "rag_model" : "model_only";
        const envelope = buildStudyNoteEnvelope(context, content, {
          sourceMode,
          citations,
          modelAvailable: true,
        });
        const validated = validateResourceEnvelope(envelope, context);
        const quality = validateStudyNoteQuality({
          content: validated.content,
          context,
          citations,
          retrieval,
        });
        qualityAttempts.push({
          attempt: attempt + 1,
          sourceMode,
          passed: quality.passed,
          issues: quality.issues,
        });
        await options.onQualityAttempt?.({ attempt: attempt + 1, sourceMode, quality });
        if (quality.passed) {
          return finalizeStudyNoteResult({
            envelope: validated,
            source: sourceMode,
            model: process.env.LLM_MODEL || process.env.SPARK_MODEL || process.env.AI_MODEL || null,
            sourceMode,
            modelAvailable: true,
            quality,
            qualityAttempts,
            retryCount: attempt,
            retrieval,
            citations,
            citationValidation: validateStudyNoteCitations(validated.content, retrieval),
            knowledgeNotice: retrieval.results.length
              ? "已结合本地课程知识库生成并校验引用。"
              : "本次未命中可用课程资料，使用模型通识生成且不生成本地引用。",
          });
        }
        feedback = quality.issues.map((item) => item.message).slice(0, 10);
      } catch (error) {
        lastModelError = error;
        // 以前这里在第一次失败时静默 break，模型错误被完全吞掉，只剩一句「未通过质量门禁」，
        // 排查时看不到真实原因。现在统一打日志，并对可重试错误继续尝试。
        console.error(
          `[study_note] 第 ${attempt + 1}/${MAX_GENERATION_ATTEMPTS} 次模型生成失败：${error?.message || error}`,
        );
        const fatal =
          /^Spark HTTP 4\d\d/.test(String(error?.message || "")) ||
          error?.name === "AbortError" ||
          /aborted|timeout/i.test(String(error?.message || ""));
        if (fatal) break;
      }
    }
    // 模型三次都没通过质量门禁时，以前在这里直接抛错，永远走不到下面的确定性兜底：
    // 「模型写得不够好」于是变成「学生拿不到讲义」。现在统一落到兜底——
    // 兜底讲义是确定性生成且能通过质量门的，只有当它也不合格才真的报错。
    if (lastModelError) {
      console.error(
        `[study_note] 模型路径出错（${lastModelError?.message || lastModelError}），改用确定性兜底。`,
      );
    } else {
      console.warn(
        `[study_note] 模型三次生成均未通过质量门禁，改用确定性兜底。未通过项：${qualityAttempts
          .map(
            (item) =>
              `${item.sourceMode}#${item.attempt}:${(item.issues || []).map((issue) => issue.code).join("+") || "unknown"}`,
          )
          .join(" | ")}`,
      );
    }
  }
  const fallbackContent = (options.fallbackBuilder || buildDetailedStudyNoteContent)(context, { citations });
  const fallbackEnvelope = buildStudyNoteEnvelope(context, fallbackContent, {
    sourceMode: "deterministic_fallback",
    citations,
    modelAvailable: false,
  });
  const validatedFallback = validateResourceEnvelope(fallbackEnvelope, context);
  const fallbackQuality = validateStudyNoteQuality({
    content: validatedFallback.content,
    context,
    citations,
    retrieval,
  });
  qualityAttempts.push({
    attempt: qualityAttempts.length + 1,
    sourceMode: "deterministic_fallback",
    passed: fallbackQuality.passed,
    issues: fallbackQuality.issues,
  });
  await options.onQualityAttempt?.({
    attempt: qualityAttempts.length,
    sourceMode: "deterministic_fallback",
    quality: fallbackQuality,
  });
  if (!fallbackQuality.passed) {
    // 兜底也不合格时必须把「具体哪几条不过」打到日志里，否则只剩一句「未通过质量门禁」，没法排查。
    console.error(`[study_note] 确定性兜底未通过质量门禁：${JSON.stringify(fallbackQuality.issues)}`);
    throw qualityError("在线模型与确定性兜底都未通过质量门禁。", qualityAttempts);
  }
  return finalizeStudyNoteResult({
    envelope: validatedFallback,
    source: "deterministic_fallback",
    model: null,
    sourceMode: "deterministic_fallback",
    modelAvailable: false,
    quality: fallbackQuality,
    qualityAttempts,
    retryCount: Math.max(0, qualityAttempts.length - 1),
    retrieval,
    citations,
    citationValidation: validateStudyNoteCitations(validatedFallback.content, retrieval),
    knowledgeNotice: retrieval.results.length
      ? "在线模型未生成可用结果，已依据本地课程资料和确定性教学结构生成。"
      : "在线模型未生成可用结果，且当前课程知识库无可用命中；本讲义使用本地确定性教学结构，不包含虚假引用。",
  });
}

function buildStudyNote(context) {
  return buildDetailedStudyNoteContent(context, { citations: [] });
}

async function prepareStudyNoteRetrieval(context, options = {}) {
  const retrieve = options.retrieveKnowledgeFn || retrieveKnowledge;
  try {
    const retrieval = await retrieve(options.db || require("../config/db").pool, {
      studentId: context.studentId,
      requestType: "study_note",
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      query: `${context.knowledgePoint} ${array(context.stageGoals).join(" ")}`,
      stageGoals: context.stageGoals,
      errorPatterns: context.errorPatterns,
      topK: 6,
      minimumScore: 0.12,
    });
    await options.onKnowledgeRetrieval?.(retrieval);
    return retrieval;
  } catch (error) {
    const retrieval = {
      retrievalRunId: null,
      results: [],
      insufficient: true,
      unsupportedForRag: false,
      confidence: "insufficient",
      warning: "knowledge_retrieval_unavailable",
    };
    await options.onKnowledgeRetrieval?.(retrieval);
    return retrieval;
  }
}

function buildCitationCatalog(retrieval) {
  return array(retrieval?.results)
    .slice(0, 6)
    .map((item, index) => ({
      label: `S${index + 1}`,
      chunkId: item.chunkId,
      sourceKey: item.sourceKey,
      sourceTitle: item.sourceTitle,
      chapter: item.chapter,
      section: item.section,
      license: item.license,
      version: item.sourceVersion,
      excerpt: String(item.content || "").slice(0, 500),
      supportScore: item.score,
    }));
}

function buildStudyNoteEnvelope(context, content, meta = {}) {
  const sourceMode = meta.sourceMode || "deterministic_fallback";
  const citations = array(meta.citations);
  return {
    resourceType: "study_note",
    title: `${context.knowledgePoint}个性化学习讲义`,
    subject: context.subject,
    knowledgePoint: context.knowledgePoint,
    learningObjectives: array(context.stageGoals).slice(0, 5).length
      ? array(context.stageGoals).slice(0, 5)
      : [`掌握${context.knowledgePoint}`],
    targetLearnerSummary: [
      context.major || context.grade ? `${context.major || ""}${context.grade || ""}` : "",
      `当前掌握度 ${context.mastery}`,
      `偏好${context.explanationPreference}`,
      `学习节奏${context.paceAndTimeBudget?.pacePreference || "适中"}`,
    ]
      .filter(Boolean)
      .join("，"),
    estimatedMinutes: context.estimatedMinutes,
    generationRationale: [
      `路径阶段：${context.stageTitle}`,
      `当前掌握度：${context.mastery}`,
      context.errorPatterns?.[0] ? `主要错误模式：${context.errorPatterns[0].errorType}` : "暂无高频错误模式",
      `资源偏好：${array(context.resourcePreferences).join("、") || "结构化资源"}`,
      sourceMode === "rag_model"
        ? `知识库引用：${citations.map((item) => item.label).join("、")}`
        : "未伪造课程资料引用",
    ],
    content,
    retrievalRunId: meta.retrievalRunId,
    citations,
  };
}

function validateStudyNoteCitations(content, retrieval) {
  if (!array(retrieval?.results).length) return { approved: true, coverage: 0, issues: [], citations: [] };
  const basis = array(content.citationBasis).join("\n");
  const claims = [...basis.matchAll(/\[S(\d+)\]/g)].map((match, index) => {
    const result = retrieval.results[Number(match[1]) - 1];
    return {
      locationKey: `study_note.citationBasis[${index}]`,
      text: basis.slice(Math.max(0, match.index - 180), Math.min(basis.length, match.index + 220)),
      chunkIds: result ? [result.chunkId] : [Number.NaN],
    };
  });
  return validateCitations({ claims, retrieval });
}

function finalizeStudyNoteResult(result) {
  return {
    content: {
      ...result.envelope,
      retrievalRunId: result.retrieval?.retrievalRunId || undefined,
      citations: result.citations,
    },
    source: result.source,
    model: result.model,
    sourceMode: result.sourceMode,
    modelAvailable: result.modelAvailable,
    quality: result.quality,
    qualityAttempts: result.qualityAttempts,
    retryCount: result.retryCount,
    retrieval: result.retrieval,
    citationValidation: result.citationValidation,
    knowledgeNotice: result.knowledgeNotice,
    promptVersion: PROMPT_VERSION,
    generationId: fingerprint({
      studentId: result.envelope.studentId,
      title: result.envelope.title,
      checkedAt: result.quality.checkedAt,
    }),
  };
}

function qualityError(message, attempts) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = "RESOURCE_QUALITY_REJECTED";
  error.publicMessage = "学习讲义未通过质量检查，已拒绝保存为正式资源。";
  error.details = {
    attempts: attempts.map((item) => ({
      attempt: item.attempt,
      sourceMode: item.sourceMode,
      passed: item.passed,
      issues: item.issues,
    })),
  };
  return error;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  MAX_GENERATION_ATTEMPTS,
  buildStudyNote,
  generateStudyNoteResource,
  buildStudyNoteEnvelope,
  buildCitationCatalog,
  qualityError,
};
