/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText, isAIEnabled } = require("./aiService");
const { retrieveKnowledge } = require("./knowledgeRetrievalService");
const { validateCitations } = require("./citationValidationService");
const { validateResourceEnvelope, fingerprint } = require("./resourceSchema");
const { PROMPT_VERSION, buildMindMapPrompt, parseMindMapJson } = require("./mindMapPromptService");
const { buildStructuredMindMapContent } = require("./mindMapFallbackService");
const { validateMindMapQuality, VALIDATOR_VERSION } = require("./mindMapQualityService");

const MAX_GENERATION_ATTEMPTS = 3;

async function generateMindMapResource(context, options = {}) {
  const retrieval = await prepareMindMapRetrieval(context, options);
  const citations = buildCitationCatalog(retrieval);
  const modelAvailableAtStart =
    Boolean((options.isAIEnabledFn || isAIEnabled)()) &&
    process.env.MULTIMODAL_RESOURCE_AI_ENABLED === "true";
  const qualityAttempts = [];
  let providerFailed = false;

  if (modelAvailableAtStart) {
    let feedback = [];
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      let raw;
      try {
        const prompt = buildMindMapPrompt(context, { citations, qualityFeedback: feedback });
        raw = await (options.generateTextFn || generateText)({
          capability: "resource",
          messages: [
            {
              role: "system",
              content: "You generate one Chinese mind_map JSON content object. Return strict JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: attempt === 0 ? 0.22 : 0.12,
          maxTokens: 20000,
          jsonMode: true,
        });
      } catch (error) {
        console.error(`[mind_map] 模型调用失败：${error?.message || error}`);
        providerFailed = true;
        break;
      }

      try {
        const content = parseMindMapJson(raw);
        const sourceMode = retrieval.results.length ? "rag_model" : "model_only";
        const envelope = buildMindMapEnvelope(context, content, {
          sourceMode,
          citations,
          modelAvailable: true,
          retrievalRunId: retrieval.retrievalRunId,
        });
        const validated = validateResourceEnvelope(envelope, context);
        const quality = validateMindMapQuality({ content: validated.content, context, citations, retrieval });
        qualityAttempts.push({
          attempt: attempt + 1,
          sourceMode,
          passed: quality.passed,
          issues: quality.issues,
        });
        await options.onQualityAttempt?.({ attempt: attempt + 1, sourceMode, quality });
        if (quality.passed) {
          return finalizeMindMapResult({
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
            citationValidation: validateMindMapCitations(validated.content, retrieval),
            knowledgeNotice: retrieval.results.length
              ? "已结合本地课程知识库生成并校验导图引用。"
              : "本次未命中可用课程资料，使用在线模型通识生成且不生成本地引用。",
          });
        }
        feedback = quality.issues.map((item) => item.message).slice(0, 12);
      } catch (error) {
        const quality = parseFailureQuality(error);
        qualityAttempts.push({
          attempt: attempt + 1,
          sourceMode: "model_parse_or_schema_failed",
          passed: false,
          issues: quality.issues,
        });
        await options.onQualityAttempt?.({
          attempt: attempt + 1,
          sourceMode: "model_parse_or_schema_failed",
          quality,
        });
        feedback = quality.issues.map((item) => item.message);
      }
    }
    // 模型三次都没过结构质量门禁时不再直接抛错：以前这里中断，下面的确定性兜底永远走不到，
    // 于是「模型画得不够好」变成「学生拿不到思维导图」。现在统一落到兜底，兜底也不合格才报错。
    console.warn(
      `[mind_map] 模型三段未通过结构质量门禁${providerFailed ? "（上游请求失败）" : ""}，改用确定性兜底。未通过项：${qualityAttempts
        .map(
          (item) =>
            `${item.sourceMode}#${item.attempt}:${(item.issues || []).map((issue) => issue.code || issue.message).join("+") || "unknown"}`,
        )
        .join(" | ")}`,
    );
  }

  const fallbackContent = (options.fallbackBuilder || buildStructuredMindMapContent)(context, { citations });
  const fallbackEnvelope = buildMindMapEnvelope(context, fallbackContent, {
    sourceMode: "deterministic_fallback",
    citations,
    modelAvailable: false,
    retrievalRunId: retrieval.retrievalRunId,
  });
  const validatedFallback = validateResourceEnvelope(fallbackEnvelope, context);
  const fallbackQuality = validateMindMapQuality({
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
    console.error(`[mind_map] 确定性兜底未通过结构质量门禁：${JSON.stringify(fallbackQuality.issues)}`);
    throw qualityError("在线模型与确定性兜底都未通过结构质量门禁。", qualityAttempts);
  }
  return finalizeMindMapResult({
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
    citationValidation: validateMindMapCitations(validatedFallback.content, retrieval),
    knowledgeNotice: retrieval.results.length
      ? "在线模型未生成可用结果，已依据本地课程资料和确定性结构生成导图。"
      : "在线模型未生成可用结果，且当前课程知识库无可用命中；本导图使用确定性教学结构，不包含虚假引用。",
  });
}

function buildMindMap(context) {
  return buildStructuredMindMapContent(context, { citations: [] });
}

async function prepareMindMapRetrieval(context, options = {}) {
  const retrieve = options.retrieveKnowledgeFn || retrieveKnowledge;
  try {
    const retrieval = await retrieve(options.db || require("../config/db").pool, {
      studentId: context.studentId,
      requestType: "mind_map",
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      query: `${context.knowledgePoint} ${array(context.stageGoals).join(" ")}`,
      stageGoals: context.stageGoals,
      errorPatterns: context.errorPatterns,
      topK: 8,
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
    .slice(0, 8)
    .map((item, index) => ({
      label: `S${index + 1}`,
      chunkId: item.chunkId ?? item.id,
      sourceKey: item.sourceKey ?? item.source_key,
      sourceTitle: item.sourceTitle ?? item.source_title ?? item.title,
      chapter: item.chapter,
      section: item.section ?? item.section_name,
      license: item.license ?? item.license_name,
      version: item.sourceVersion ?? item.version,
      excerpt: String(item.content ?? item.excerpt ?? item.snippet ?? item.content_text ?? "").slice(0, 500),
      supportScore: item.score ?? item.finalScore,
    }));
}

function buildMindMapEnvelope(context, content, meta = {}) {
  const sourceMode = meta.sourceMode || "deterministic_fallback";
  const citations = array(meta.citations);
  return {
    resourceType: "mind_map",
    title: `${context.knowledgePoint}个性化思维导图`,
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
    retrievalRunId: meta.retrievalRunId || undefined,
    citations,
  };
}

function validateMindMapCitations(content, retrieval) {
  if (!array(retrieval?.results).length) return { approved: true, coverage: 0, issues: [], citations: [] };
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.citations) && node.citations.length) nodes.push(node);
    array(node.children).forEach(visit);
  };
  visit(content.content?.root || content.root);
  const claims = nodes.map((node) => ({
    locationKey: `mind_map.node.${node.id}`,
    text: `${node.label} ${node.description}`,
    chunkIds: node.citations,
  }));
  return validateCitations({ claims, retrieval });
}

function finalizeMindMapResult(result) {
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
    promptVersion: "mind-map-v1:quality-v1",
    generationId: fingerprint({
      studentId: result.envelope.studentId,
      title: result.envelope.title,
      checkedAt: result.quality.checkedAt,
    }),
  };
}

function parseFailureQuality(error) {
  return {
    passed: false,
    issues: [
      {
        code: "model_json_invalid",
        message: `模型输出无法解析为合法思维导图：${String(error.message || "未知错误").slice(0, 120)}`,
      },
    ],
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function qualityError(message, attempts) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = "MIND_MAP_QUALITY_REJECTED";
  error.publicMessage = "思维导图未通过结构质量检查，已拒绝保存为正式资源。";
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
  buildMindMap,
  generateMindMapResource,
  buildMindMapEnvelope,
  buildCitationCatalog,
  qualityError,
};
