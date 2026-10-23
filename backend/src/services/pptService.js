/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText, isAIEnabled } = require("./aiService");
const { validateCitations } = require("./citationValidationService");
const { validateResourceEnvelope, fingerprint } = require("./resourceSchema");
const { PROMPT_VERSION, buildPptPrompt, parsePptDeckJson } = require("./pptPromptService");
const {
  buildContextOnlySourceBundle,
  buildDeterministicPptDeckContent,
  buildPptSourceBundle,
} = require("./pptDeckPlanningService");
const { VALIDATOR_VERSION, validatePptDeckQuality } = require("./pptQualityService");

const MAX_GENERATION_ATTEMPTS = 3;

async function generatePptxResource(context, options = {}) {
  const sourceBundle = await buildPptSourceBundle(context, options);
  const citations = array(sourceBundle.citations);
  const retrieval = sourceBundle.retrieval || { retrievalRunId: null, results: [] };
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
        const prompt = buildPptPrompt(context, sourceBundle, { qualityFeedback: feedback });
        raw = await (options.generateTextFn || generateText)({
          capability: "resource",
          messages: [
            {
              role: "system",
              content: "You generate one Chinese PPTX deck content JSON object. Return strict JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: attempt === 0 ? 0.2 : 0.08,
          maxTokens: 20000,
          jsonMode: true,
        });
      } catch (error) {
        console.error(`[pptx] 模型调用失败：${error?.message || error}`);
        providerFailed = true;
        break;
      }

      try {
        const sourceMode = citations.length ? "rag_model" : "model_only";
        const content = normalizeDeckContent(parsePptDeckJson(raw), context, sourceBundle, {
          sourceMode,
          modelAvailable: true,
        });
        const envelope = buildPptxEnvelope(context, content, {
          sourceMode,
          citations,
          retrievalRunId: retrieval.retrievalRunId,
        });
        const validated = validateResourceEnvelope(envelope, context);
        const quality = validatePptDeckQuality({ content: validated.content, context, citations, retrieval });
        qualityAttempts.push({
          attempt: attempt + 1,
          sourceMode,
          passed: quality.passed,
          issues: quality.issues,
        });
        await options.onQualityAttempt?.({ attempt: attempt + 1, sourceMode, quality });
        if (quality.passed) {
          return finalizePptxResult({
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
            citationValidation: validatePptCitations(validated.content, retrieval),
            knowledgeNotice: sourceBundle.knowledgeNotice || "PPT已结合当前可用公开来源规划。",
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
    // 同 study_note：模型三段都过不了质量门禁时不要直接抛错，先落到确定性兜底，
    // 否则「模型排版不够好」等于「学生拿不到课件」。
    console.warn(
      `[pptx] 模型三段未通过质量门禁${providerFailed ? "（上游请求失败）" : ""}，改用确定性兜底。未通过项：${qualityAttempts
        .map(
          (item) =>
            `${item.sourceMode}#${item.attempt}:${(item.issues || []).map((issue) => issue.code || issue.message).join("+") || "unknown"}`,
        )
        .join(" | ")}`,
    );
  }

  let validatedFallback;
  let fallbackQuality;
  try {
    const fallbackContent = buildDeterministicPptDeckContent(context, sourceBundle, {
      sourceMode: "deterministic_fallback",
      modelAvailable: false,
    });
    const fallbackEnvelope = buildPptxEnvelope(context, fallbackContent, {
      sourceMode: "deterministic_fallback",
      citations,
      retrievalRunId: retrieval.retrievalRunId,
    });
    validatedFallback = validateResourceEnvelope(fallbackEnvelope, context);
    fallbackQuality = validatePptDeckQuality({
      content: validatedFallback.content,
      context,
      citations,
      retrieval,
    });
  } catch (error) {
    const quality = parseFailureQuality(error, "deterministic_pptx_invalid");
    qualityAttempts.push({
      attempt: qualityAttempts.length + 1,
      sourceMode: "deterministic_fallback",
      passed: false,
      issues: quality.issues,
    });
    await options.onQualityAttempt?.({
      attempt: qualityAttempts.length,
      sourceMode: "deterministic_fallback",
      quality,
    });
    throw qualityError("确定性教学课件未通过质量门禁。", qualityAttempts);
  }

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
    console.error(`[pptx] 确定性兜底未通过质量门禁：${JSON.stringify(fallbackQuality.issues)}`);
    throw qualityError("在线模型与确定性兜底都未通过质量门禁。", qualityAttempts);
  }
  return finalizePptxResult({
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
    citationValidation: validatePptCitations(validatedFallback.content, retrieval),
    knowledgeNotice: citations.length
      ? "在线模型未生成可用结果，已依据本地课程资料、已批准资源和确定性教学结构生成。"
      : "在线模型未生成可用结果，且当前课程知识库无可用命中；课件使用确定性教学结构，不包含虚假引用。",
  });
}

function buildPptxFallbackContent(context) {
  return buildDeterministicPptDeckContent(context, buildContextOnlySourceBundle(context), {
    sourceMode: "deterministic_fallback",
    modelAvailable: false,
  });
}

function buildPptxEnvelope(context, content, meta = {}) {
  const sourceMode = meta.sourceMode || "deterministic_fallback";
  const citations = array(meta.citations);
  return {
    resourceType: "pptx",
    title: content.title || `${context.knowledgePoint}教学课件`,
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
    estimatedMinutes: Math.max(10, Math.min(120, Number(context.estimatedMinutes) || 30)),
    generationRationale: [
      `路径阶段：${context.stageTitle}`,
      `当前掌握度：${context.mastery}`,
      context.errorPatterns?.[0] ? `主要错误模式：${context.errorPatterns[0].errorType}` : "暂无高频错误模式",
      `资源偏好：${array(context.resourcePreferences).join("、") || "结构化资源"}`,
      sourceMode === "rag_model"
        ? `知识库引用：${citations.map((item) => item.label).join("、")}`
        : "未伪造课程资料引用",
      `已批准资源来源：${array(content.sourceSummary?.usedResourceTypes).join("、") || "当前学习路径元数据"}`,
    ],
    content,
    retrievalRunId: meta.retrievalRunId || undefined,
    citations,
  };
}

function normalizeDeckContent(content, context, sourceBundle, meta = {}) {
  const base = content && typeof content === "object" && !Array.isArray(content) ? content : {};
  const references = array(base.references).length ? base.references : array(sourceBundle.references);
  const usedResourceTypes = array(sourceBundle.usedResourceTypes);
  const missingResourceTypes = array(sourceBundle.missingResourceTypes);
  const slides = array(base.slides).map((slide, index) => ({
    ...slide,
    id: slide?.id || `slide-${index + 1}`,
    sourceRefs: array(slide?.sourceRefs).length
      ? slide.sourceRefs
      : [references[0]?.sourceKey].filter(Boolean),
  }));
  return {
    title: base.title || `${context.knowledgePoint}教学课件`,
    subtitle: base.subtitle || `${context.subject} · ${context.stageTitle || "当前学习阶段"}`,
    course: base.course || context.subject,
    knowledgePoint: base.knowledgePoint || context.knowledgePoint,
    audience: base.audience || "当前学习路径学生",
    theme: base.theme || { name: "academic-blue", primaryTone: "blue", density: "medium" },
    slides,
    references,
    sourceSummary: {
      sourceMode: meta.sourceMode || "model_only",
      modelAvailable: Boolean(meta.modelAvailable),
      usedResourceTypes,
      missingResourceTypes,
      knowledgeNotice: sourceBundle.knowledgeNotice || "",
    },
    generationMeta: {
      deckFormatVersion: PROMPT_VERSION,
      depth: "normal",
      normalSlideRange: "14-18",
      sourceMode: meta.sourceMode || "model_only",
      modelAvailable: Boolean(meta.modelAvailable),
      usedResourceTypes,
      missingResourceTypes,
      profileFactsUsed: selectProfileFacts(context),
      contentHash: fingerprint(
        slides.map((slide) => ({ type: slide.slideType, title: slide.title, refs: slide.sourceRefs })),
      ),
    },
  };
}

function validatePptCitations(content, retrieval) {
  if (!array(retrieval?.results).length) return { approved: true, coverage: 0, issues: [], citations: [] };
  const claims = array(content?.slides).flatMap((slide, index) => {
    const chunkIds = array(slide?.citations).map(Number).filter(Number.isFinite);
    if (!chunkIds.length) return [];
    return [
      {
        locationKey: `pptx.slides[${index}]`,
        text: [
          slide.title,
          slide.body,
          ...array(slide.bullets),
          ...array(slide.steps).flatMap((step) => [step?.title, step?.description]),
          ...array(slide.items).flatMap((item) => [
            item?.title,
            item?.description,
            item?.mistake,
            item?.correction,
          ]),
          slide.explanation,
        ]
          .filter(Boolean)
          .join("\n"),
        chunkIds,
      },
    ];
  });
  return validateCitations({ claims, retrieval });
}

function finalizePptxResult(result) {
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
    promptVersion: `${PROMPT_VERSION}:${VALIDATOR_VERSION}`,
    quality: result.quality,
    qualityAttempts: result.qualityAttempts,
    retryCount: result.retryCount,
    retrieval: result.retrieval,
    citationValidation: result.citationValidation,
    knowledgeNotice: result.knowledgeNotice,
    generationId: fingerprint({
      studentId: result.envelope.studentId,
      title: result.envelope.title,
      checkedAt: result.quality.checkedAt,
      contentHash: result.quality.contentHash,
    }),
  };
}

function parseFailureQuality(error, fallbackCode = "model_json_invalid") {
  return {
    passed: false,
    issues: [
      {
        code: error?.code || fallbackCode,
        message: `PPT内容无法通过解析或结构校验：${String(error.message || "未知错误").slice(0, 160)}`,
      },
    ],
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function qualityError(message, attempts) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = "PPTX_QUALITY_REJECTED";
  error.publicMessage = "教学课件未通过质量检查，已拒绝保存为正式资源。";
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

function selectProfileFacts(context) {
  return [
    context.major,
    context.grade,
    context.currentCourse,
    Number.isFinite(Number(context.mastery)) ? `掌握度${Number(context.mastery)}` : "",
    context.explanationPreference ? `偏好${context.explanationPreference}` : "",
    context.paceAndTimeBudget?.pacePreference ? `学习节奏${context.paceAndTimeBudget.pacePreference}` : "",
    context.paceAndTimeBudget?.weeklyTimeBudgetMinutes
      ? `每周${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}分钟`
      : "",
    ...array(context.priorKnowledge).slice(0, 2),
    ...array(context.learningGoals).slice(0, 2),
    ...array(context.resourcePreferences).slice(0, 2),
    ...array(context.errorPatterns)
      .map((item) => item?.errorType)
      .filter(Boolean)
      .slice(0, 2),
  ]
    .map((item) => String(item || "").trim())
    .filter((item) => item.length >= 2)
    .slice(0, 6);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  MAX_GENERATION_ATTEMPTS,
  PROMPT_VERSION,
  VALIDATOR_VERSION,
  buildPptxEnvelope,
  buildPptxFallbackContent,
  generatePptxResource,
  qualityError,
  validatePptCitations,
};
