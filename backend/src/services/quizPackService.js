/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText, isAIEnabled } = require("./aiService");
const { validateResourceEnvelope, fingerprint } = require("./resourceSchema");
const {
  PROMPT_VERSION,
  buildQuizPackPrompt,
  parseQuizPackSelectionJson,
} = require("./quizPackPromptService");
const { validateQuizPackQuality, MIN_QUESTIONS, MAX_QUESTIONS } = require("./quizPackQualityService");

const MAX_GENERATION_ATTEMPTS = 3;
const BROAD_TAGS = new Set([
  "数据结构",
  "操作系统",
  "计算机网络",
  "408",
  "学习闭环",
  "核心",
  "选择题",
  "单选题",
  "练习包",
  "红黑树",
  "进程线程",
  "TCP",
]);

async function generateQuizPackResource(context, options = {}) {
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
        const prompt = buildQuizPackPrompt(context, { qualityFeedback: feedback });
        raw = await (options.generateTextFn || generateText)({
          capability: "quiz",
          messages: [
            {
              role: "system",
              content: "You select trusted LearnMate quiz question IDs. Return strict JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: attempt === 0 ? 0.18 : 0.08,
          maxTokens: 12000,
          jsonMode: true,
        });
      } catch (error) {
        console.error(`[quiz_pack] 模型调用失败：${error?.message || error}`);
        providerFailed = true;
        break;
      }

      try {
        const selectedQuestionIds = parseQuizPackSelectionJson(raw);
        const content = buildQuizPack(context, { selectedQuestionIds });
        const envelope = buildQuizPackEnvelope(context, content, { sourceMode: "question_bank_model" });
        const validated = validateResourceEnvelope(envelope, context);
        const quality = validateQuizPackQuality({ content: validated.content, context });
        qualityAttempts.push({
          attempt: attempt + 1,
          sourceMode: "question_bank_model",
          passed: quality.passed,
          issues: quality.issues,
        });
        await options.onQualityAttempt?.({
          attempt: attempt + 1,
          sourceMode: "question_bank_model",
          quality,
        });
        if (quality.passed) {
          return finalizeQuizPackResult({
            envelope: validated,
            source: "question_bank_model",
            model:
              process.env.LLM_QUIZ_MODEL ||
              process.env.LLM_MODEL ||
              process.env.SPARK_MODEL ||
              process.env.AI_MODEL ||
              null,
            sourceMode: "question_bank_model",
            modelAvailable: true,
            quality,
            qualityAttempts,
            retryCount: attempt,
            knowledgeNotice: "已基于真实题库题号组卷；模型只参与选题，不改写题干、选项、答案或解析。",
          });
        }
        feedback = quality.issues.map((item) => item.message).slice(0, 10);
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
    // 同 study_note / mind_map / pptx：模型三段没过质量门禁时也要落到确定性兜底，
    // 不要把「模型出的题不够好」变成「学生拿不到练习」。
    console.warn(
      `[quiz_pack] 模型三段未通过质量门禁${providerFailed ? "（上游请求失败）" : ""}，改用确定性兜底。未通过项：${qualityAttempts
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
    const fallbackContent = (options.fallbackBuilder || buildQuizPack)(context);
    const fallbackEnvelope = buildQuizPackEnvelope(context, fallbackContent, {
      sourceMode: "deterministic_fallback",
    });
    validatedFallback = validateResourceEnvelope(fallbackEnvelope, context);
    fallbackQuality = validateQuizPackQuality({ content: validatedFallback.content, context });
  } catch (error) {
    const quality = parseFailureQuality(error, "fallback_schema_invalid");
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
    throw qualityError("deterministic quiz_pack failed quality gate.", qualityAttempts);
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
    console.error(`[quiz_pack] 确定性兜底未通过质量门禁：${JSON.stringify(fallbackQuality.issues)}`);
    throw qualityError("在线模型与确定性兜底都未通过质量门禁。", qualityAttempts);
  }
  return finalizeQuizPackResult({
    envelope: validatedFallback,
    source: "deterministic_fallback",
    model: null,
    sourceMode: "deterministic_fallback",
    modelAvailable: false,
    quality: fallbackQuality,
    qualityAttempts,
    retryCount: Math.max(0, qualityAttempts.length - 1),
    knowledgeNotice: "在线模型未生成可用组卷结果，已使用真实题库的确定性组卷。",
  });
}

function buildQuizPack(context, options = {}) {
  const evidence = normalizeEvidence(context).filter(isUsableEvidence);
  if (evidence.length < MIN_QUESTIONS) {
    throw evidenceError(
      `当前课程与知识点仅找到 ${evidence.length} 道真实可作答选择题，生成测验至少需要 ${MIN_QUESTIONS} 道，请先补充题库或调整学习路径。`,
      { available: evidence.length, minimum: MIN_QUESTIONS },
    );
  }
  const requestedCount = Math.max(
    MIN_QUESTIONS,
    Number(options.questionCount || context.quizQuestionCount || 14) || 14,
  );
  const targetCount = Math.min(MAX_QUESTIONS, requestedCount, evidence.length);
  const selected = selectBalanced(
    options.selectedQuestionIds ? orderBySelectedIds(evidence, options.selectedQuestionIds) : evidence,
    context,
    targetCount,
  );
  if (selected.length < MIN_QUESTIONS) {
    throw evidenceError(`当前题库覆盖的机制不足，最多只能安全组出 ${selected.length} 道题。`, {
      available: selected.length,
      minimum: MIN_QUESTIONS,
    });
  }
  const counts = { foundation: 0, intermediate: 0, advanced: 0 };
  const questions = selected.map((item) => {
    const difficulty = normalizeDifficulty(item.difficulty);
    counts[difficulty] += 1;
    const options = [item.optionA, item.optionB, item.optionC, item.optionD].map((value) =>
      String(value || "").trim(),
    );
    const knowledgePoints = extractQuestionKnowledgePoints(item, context);
    return {
      questionId: item.questionId,
      questionType: "single_choice",
      stem: buildStem(item),
      options,
      scoringPoints: [],
      correctAnswer: String(item.answer || "")
        .trim()
        .toUpperCase(),
      analysis: buildAnalysis(context, item, knowledgePoints),
      personalizedHint: personalizedHint(context, item, knowledgePoints),
      knowledgePoints,
      difficulty,
    };
  });
  return {
    title: `${context.knowledgePoint}可信测验包`,
    difficultyDistribution: counts,
    generationBasis: [
      `当前掌握度：${context.mastery}`,
      `路径目标：${array(context.stageGoals).slice(0, 3).join("；") || `掌握${context.knowledgePoint}`}`,
      context.errorPatterns?.[0] ? `高频错误：${context.errorPatterns[0].errorType}` : "暂无高频错误模式",
      `真实题库可用题目数：${evidence.length}`,
      `本次组卷题目数：${questions.length}`,
    ],
    questions,
    evidenceStatus: "sufficient",
  };
}

function normalizeEvidence(context) {
  return uniqueBy(array(context.questionEvidence), (item) => item.questionId).map((item) => ({
    ...item,
    questionId: String(item.questionId || "").trim(),
    questionType: String(item.questionType || "single_choice").trim(),
    stem: String(item.stem || "").trim(),
    optionA: String(item.optionA || "").trim(),
    optionB: String(item.optionB || "").trim(),
    optionC: String(item.optionC || "").trim(),
    optionD: String(item.optionD || "").trim(),
    answer: String(item.answer || "")
      .trim()
      .toUpperCase(),
    analysis: String(item.analysis || "").trim(),
    hint: String(item.hint || "").trim(),
    difficulty: String(item.difficulty || "").trim(),
    knowledgePoint: String(item.knowledgePoint || context.knowledgePoint || "").trim(),
    codeContext: String(item.codeContext || "").trim(),
    chapter: String(item.chapter || "").trim(),
    abilityDimension: String(item.abilityDimension || "").trim(),
    tags: normalizeArray(item.tags),
    optionErrorTypes: normalizeObject(item.optionErrorTypes),
  }));
}

function isUsableEvidence(item) {
  const options = [item.optionA, item.optionB, item.optionC, item.optionD].filter((value) => value);
  return Boolean(
    item.questionId &&
    item.questionType === "single_choice" &&
    item.stem &&
    /^[A-D]$/.test(item.answer) &&
    item.analysis &&
    options.length === 4 &&
    new Set(options.map(normalizeText)).size === 4,
  );
}

function orderBySelectedIds(evidence, selectedIds) {
  const byId = new Map(evidence.map((item) => [item.questionId, item]));
  const missing = selectedIds.filter((id) => !byId.has(String(id)));
  if (missing.length)
    throw new Error(`model selected unknown question IDs: ${missing.slice(0, 5).join(",")}`);
  const selected = selectedIds.map((id) => byId.get(String(id))).filter(Boolean);
  if (selected.length < MIN_QUESTIONS)
    throw new Error(`model selected only ${selected.length} usable question IDs`);
  const selectedSet = new Set(selected.map((item) => item.questionId));
  return [...selected, ...evidence.filter((item) => !selectedSet.has(item.questionId))];
}

function selectBalanced(items, context, targetCount) {
  const targetDifficulty = difficultyPreference(context.mastery);
  const scored = items
    .map((item, index) => ({
      item,
      index,
      primary: extractQuestionKnowledgePoints(item, context)[0],
      difficulty: normalizeDifficulty(item.difficulty),
      selectedByModel: index,
    }))
    .sort((a, b) => {
      const difficultyDelta = targetDifficulty.indexOf(a.difficulty) - targetDifficulty.indexOf(b.difficulty);
      if (difficultyDelta !== 0) return difficultyDelta;
      return a.index - b.index;
    });
  const selected = [];
  const primaryCounts = new Map();
  const maxPerPrimary = Math.max(1, Math.floor(targetCount * 0.4));
  for (const candidate of scored) {
    const current = primaryCounts.get(candidate.primary) || 0;
    if (current >= maxPerPrimary) continue;
    selected.push(candidate.item);
    primaryCounts.set(candidate.primary, current + 1);
    if (selected.length === targetCount) return selected;
  }
  for (const candidate of scored) {
    if (selected.some((item) => item.questionId === candidate.item.questionId)) continue;
    selected.push(candidate.item);
    if (selected.length === targetCount) break;
  }
  return selected;
}

function extractQuestionKnowledgePoints(item, context = {}) {
  const blocked = new Set([
    normalizeText(context.subject),
    normalizeText(context.knowledgePoint),
    normalizeText(item.knowledgePoint),
  ]);
  const values = [
    ...normalizeArray(item.tags),
    item.abilityDimension,
    item.chapter,
    item.knowledgePoint,
    context.knowledgePoint,
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value.length >= 2)
    .filter((value) => !BROAD_TAGS.has(value))
    .filter((value) => !blocked.has(normalizeText(value)))
    .slice(0, 5);
  return uniqueBy(
    values.length ? values : [item.knowledgePoint || context.knowledgePoint],
    normalizeText,
  ).slice(0, 5);
}

function buildStem(item) {
  const code = String(item.codeContext || "").trim();
  if (!code) return item.stem;
  return `${item.stem}\n\n代码片段：\n\`\`\`\n${code.slice(0, 700)}\n\`\`\``;
}

function buildAnalysis(context, item, knowledgePoints) {
  const base = item.analysis.replace(/\s+/g, " ").trim();
  const answer = String(item.answer || "")
    .trim()
    .toUpperCase();
  const options = [item.optionA, item.optionB, item.optionC, item.optionD];
  const correctOption = options[answer.charCodeAt(0) - 65] || "对应选项";
  const mechanism = knowledgePoints[0] || item.knowledgePoint || context.knowledgePoint;
  const extension = [
    `本题考查${mechanism}，需要先确认题干给出的条件，再把相关概念或执行过程与四个选项逐一对照。`,
    `正确判断的依据是“${correctOption}”对应的机制能够同时满足题干限制和${context.knowledgePoint}的核心规则；其他选项通常混淆了适用条件、执行顺序或结果边界。`,
    `复盘时建议把题干中的状态、对象和约束单独列出来，再检查自己是否把概念记忆替代了过程推演。`,
  ].join("");
  return ensureChineseLength(base, extension, isScenarioLike(item) ? 110 : 60);
}

function personalizedHint(context, item, knowledgePoints) {
  const mechanism = knowledgePoints[0] || item.knowledgePoint || context.knowledgePoint;
  const error = context.errorPatterns?.[0]?.errorType;
  const base = error
    ? `先判断本题是否再次落入“${error}”，再回到${mechanism}的定义、条件和执行顺序逐项排除。`
    : `先抓住${mechanism}的适用条件，再比较四个选项中哪些改变了对象、顺序或边界。`;
  if (isScenarioLike(item))
    return `${base}遇到过程题时，先画状态变化或报文/指针/调度时间线，不要直接猜选项。`;
  return base;
}

function isScenarioLike(item) {
  return /场景|案例|代码|流程|过程|如果|当|模拟|执行|状态|报文|握手|释放|插入|删除|旋转|调度|上下文|时间片|序列号|ACK|SYN|FIN|TIME_WAIT|伪代码|指针/.test(
    [item.stem, item.analysis, item.codeContext, ...normalizeArray(item.tags)].join("\n"),
  );
}

function buildQuizPackEnvelope(context, content, meta = {}) {
  const sourceMode = meta.sourceMode || "deterministic_fallback";
  return {
    resourceType: "quiz_pack",
    title: `${context.knowledgePoint}可信测验包`,
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
      .join("；"),
    estimatedMinutes: context.estimatedMinutes,
    generationRationale: [
      `路径阶段：${context.stageTitle}`,
      `当前掌握度：${context.mastery}`,
      context.errorPatterns?.[0] ? `主要错误模式：${context.errorPatterns[0].errorType}` : "暂无高频错误模式",
      `资源偏好：${array(context.resourcePreferences).join("、") || "结构化资源"}`,
      sourceMode === "question_bank_model"
        ? "模型仅选择真实题库题号，系统重建题干、选项、答案与解析。"
        : "未伪造题目，使用真实题库确定性组卷。",
    ],
    content,
    citations: [],
  };
}

function finalizeQuizPackResult(result) {
  return {
    content: result.envelope,
    source: result.source,
    model: result.model,
    sourceMode: result.sourceMode,
    modelAvailable: result.modelAvailable,
    quality: result.quality,
    qualityAttempts: result.qualityAttempts,
    retryCount: result.retryCount,
    retrieval: { retrievalRunId: null, results: [] },
    citationValidation: { approved: true, coverage: 0, issues: [], citations: [] },
    knowledgeNotice: result.knowledgeNotice,
    promptVersion: PROMPT_VERSION,
    generationId: fingerprint({
      studentId: result.envelope.studentId,
      title: result.envelope.title,
      checkedAt: result.quality.checkedAt,
    }),
  };
}

function parseFailureQuality(error, fallbackCode = "model_json_invalid") {
  const code = error?.code || fallbackCode;
  return {
    passed: false,
    issues: [
      {
        code,
        message: `模型输出无法解析为合法测验选题：${String(error.message || "未知错误").slice(0, 120)}`,
      },
    ],
    checkedAt: new Date().toISOString(),
    validatorVersion: "quiz-pack-quality-v1",
  };
}

function qualityError(message, attempts) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = "QUIZ_PACK_QUALITY_REJECTED";
  error.publicMessage = "智能测验未通过题库真实性、答案安全或结构质量检查，已拒绝保存为正式资源。";
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

function evidenceError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "INSUFFICIENT_QUESTION_EVIDENCE";
  error.details = { evidenceStatus: "insufficient", minimum: MIN_QUESTIONS, ...details };
  return error;
}

function normalizeDifficulty(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (["提高", "medium", "intermediate", "advanced"].includes(text)) return "intermediate";
  if (["综合", "冲刺", "hard", "challenge", "expert"].includes(text)) return "advanced";
  return "foundation";
}

function difficultyPreference(mastery) {
  return Number(mastery) < 50
    ? ["foundation", "intermediate", "advanced"]
    : Number(mastery) < 75
      ? ["intermediate", "foundation", "advanced"]
      : ["advanced", "intermediate", "foundation"];
}

function ensureChineseLength(base, extension, minLength) {
  const value = base.endsWith("。") || base.endsWith(".") ? base : `${base}。`;
  if (countEffectiveChinese(value) >= minLength) return value;
  const combined = `${value}${extension}`;
  if (countEffectiveChinese(combined) >= minLength) return combined;
  return `${combined}最后用一个反例检查：如果去掉题干中的关键条件，选项结论是否仍然成立；若不成立，说明该条件正是判题核心。`;
}

function countEffectiveChinese(text) {
  return (
    String(text || "")
      .replace(/\s+/g, " ")
      .match(/[\p{Script=Han}]/gu) || []
  ).length;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  MAX_GENERATION_ATTEMPTS,
  buildQuizPack,
  buildQuizPackEnvelope,
  generateQuizPackResource,
  normalizeDifficulty,
  extractQuestionKnowledgePoints,
  qualityError,
};
