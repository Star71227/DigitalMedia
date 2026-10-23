/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const REVIEW_VERSION = "resource-review-v1";
const PASS_THRESHOLD = 75;
const { validateMindMapQuality } = require("./mindMapQualityService");
const { validateQuizPackQuality } = require("./quizPackQualityService");
const { validatePptDeckQuality } = require("./pptQualityService");

const DIMENSIONS = [
  ["factuality", "事实准确性与引用", 30],
  ["structure", "结构完整性", 20],
  ["personalization", "个性化程度", 20],
  ["readability", "可读性与呈现", 15],
  ["difficulty", "难度匹配", 10],
  ["safety", "安全与格式", 5],
];

function reviewResourceRules(resource = {}, context = {}) {
  const issues = [];
  const evidence = [];
  const checks = [];
  const add = (passed, rule, dimension, severity, message, location = "content", proof = "") => {
    checks.push({ name: rule, passed: Boolean(passed), detail: proof || message });
    if (passed) {
      if (proof) evidence.push({ dimension, rule, detail: proof });
      return;
    }
    issues.push({
      severity,
      category: categoryFor(dimension),
      dimension,
      location,
      message,
      suggestedFix: `修复“${rule}”后重新审核。`,
      source: "deterministic",
    });
  };

  const type = resource.resourceType;
  const content = isObject(resource.content) ? resource.content : {};
  add(
    ["study_note", "mind_map", "pptx", "quiz_pack", "code_case"].includes(type),
    "资源类型受支持",
    "structure",
    "critical",
    "资源类型缺失或不受支持。",
    "resource",
    type || "未提供资源类型",
  );
  add(
    Boolean(resource.subject && resource.knowledgePoint && context.subject && context.knowledgePoint) &&
      resource.subject === context.subject &&
      resource.knowledgePoint === context.knowledgePoint,
    "课程和知识点一致",
    "factuality",
    "critical",
    "资源课程或知识点与当前学习阶段不一致。",
    "resource",
    `${resource.subject || "未提供"} / ${resource.knowledgePoint || "未提供"}`,
  );
  const citations = Array.isArray(resource.citations) ? resource.citations : [];
  const allowedCitationIds = new Set(
    (context.allowedCitationIds || context.retrievedChunkIds || []).map(Number),
  );
  const citationsValid = citations.every(
    (item) =>
      Number.isInteger(Number(item?.chunkId)) &&
      item?.sourceKey &&
      item?.sourceTitle &&
      (allowedCitationIds.size === 0 || allowedCitationIds.has(Number(item.chunkId))),
  );
  add(
    citationsValid,
    "引用ID真实存在",
    "factuality",
    "critical",
    "发现无法由本次检索结果证明的引用ID。",
    "citations",
    citations.length ? `核验 ${citations.length} 条引用` : "资源未声明检索引用",
  );

  const required = {
    study_note: [
      "personalizedObjectives",
      "foundationSummary",
      "coreConcepts",
      "workedExamples",
      "commonMistakes",
      "practiceTasks",
      "studyAdvice",
      "citationBasis",
    ],
    mind_map: ["root", "recommendedSequence"],
    pptx: ["theme", "slides"],
    quiz_pack: ["difficultyDistribution", "generationBasis", "questions"],
    code_case: [
      "caseBackground",
      "learningObjectives",
      "starterCode",
      "tasks",
      "testCases",
      "verificationStatus",
    ],
  };
  const requiredFields = required[type] || [];
  const missing = requiredFields.filter((key) => content[key] === undefined || content[key] === null);
  add(
    requiredFields.length > 0 && missing.length === 0,
    "资源类型结构完整",
    "structure",
    "high",
    `缺少必需字段：${missing.join("、") || "未知资源类型"}`,
    "content",
    `已检查 ${requiredFields.length} 个必需字段`,
  );

  if (type === "quiz_pack") {
    const ids = array(content.questions)
      .map((item) => item?.questionId)
      .filter(Boolean);
    const allowed = new Set(context.allowedQuestionIds || []);
    const invalid = ids.filter((id) => !allowed.has(id));
    add(
      ids.length > 0 && invalid.length === 0,
      "quiz_pack题目ID真实",
      "factuality",
      "critical",
      `无效题目ID：${invalid.join("、") || "题目为空"}`,
      "content.questions",
      `核验 ${ids.length} 个题库ID`,
    );
    const quality = validateQuizPackQuality({ content, context });
    add(
      quality.passed,
      "quiz_pack专用测验质量门禁",
      "structure",
      "critical",
      `智能测验质量未通过：${quality.issues
        .slice(0, 5)
        .map((item) => item.message)
        .join("；")}`,
      "content",
      `题量 ${quality.questionCount}，机制 ${quality.knowledgePointCount}，场景流程 ${quality.scenarioProcessCount}，误区 ${quality.misconceptionCount}`,
    );
    for (const issue of quality.issues.slice(0, 12)) {
      const dimension =
        issue.code.includes("answer") ||
        issue.code.includes("unsafe") ||
        issue.code.includes("citation") ||
        issue.code.includes("internal")
          ? "safety"
          : issue.code.includes("question_ids") || issue.code.includes("mismatch")
            ? "factuality"
            : issue.code.includes("understanding")
              ? "difficulty"
              : "structure";
      add(
        false,
        `quiz_pack:${issue.code}`,
        dimension,
        issue.code.includes("answer") ||
          issue.code.includes("invalid_question_ids") ||
          issue.code.includes("unsupported")
          ? "critical"
          : "high",
        issue.message,
        "content.questions",
      );
    }
  }
  if (type === "code_case") {
    const status = content.verificationStatus;
    const id = content.codeExerciseId;
    const allowed = new Set(context.allowedCodeExerciseIds || []);
    const valid =
      status === "generated" ? id === null || id === undefined : status === "verified" && allowed.has(id);
    add(
      valid,
      "code_case练习ID与验证状态真实",
      "factuality",
      "critical",
      status === "generated"
        ? "generated代码不能标记或绑定为verified练习。"
        : `无效练习ID：${id || "未提供"}`,
      "content.codeExerciseId",
      status === "generated" ? "生成代码不构成路径完成证据" : `已核验练习ID ${id || ""}`,
    );
  }
  if (type === "code_case") {
    const id = content.codeExerciseId;
    const allowed = new Set(context.allowedCodeExerciseIds || []);
    const verifiedTrusted = content.verificationStatus === "verified" && allowed.has(id);
    add(
      verifiedTrusted,
      "code_case must be trusted verified",
      "factuality",
      "critical",
      "code_case must be rebuilt from a trusted CodeLab exercise, not generated.",
      "content.codeExerciseId",
      verifiedTrusted ? `trusted exercise ${id}` : "",
    );
    const quality = isObject(content.qualitySummary) ? content.qualitySummary : {};
    const trustedQuality =
      quality.trusted === true &&
      quality.executionMode === "docker" &&
      Number(quality.publicTestCount || 0) >= 3 &&
      Number(quality.hiddenTestCount || 0) >= 6 &&
      Array.isArray(quality.boundaryCategories) &&
      quality.boundaryCategories.length >= 3 &&
      quality.referenceAccepted === true &&
      quality.knownBugCaught === true &&
      quality.fixedOutputCaught === true;
    add(
      trustedQuality,
      "code_case trusted Docker quality gate",
      "factuality",
      "critical",
      "code_case lacks trusted Docker judge evidence.",
      "content.qualitySummary",
      trustedQuality
        ? `public=${quality.publicTestCount}; hidden=${quality.hiddenTestCount}; executionMode=${quality.executionMode}`
        : "",
    );
  }
  if (type === "mind_map") {
    const quality = validateMindMapQuality({
      content,
      context,
      citations,
      retrieval: { results: context.retrievalResults || [] },
    });
    add(
      quality.passed,
      "mind_map专用结构质量门",
      "structure",
      "critical",
      `思维导图结构质量未通过：${quality.issues
        .slice(0, 5)
        .map((item) => item.message)
        .join("；")}`,
      "content",
      `root ${quality.rootCount}，节点 ${quality.totalNodes}，一级 ${quality.firstLevelNodes}，二级 ${quality.secondLevelNodes}，有效跨链接 ${quality.validCrossLinks}`,
    );
    for (const issue of quality.issues.slice(0, 12)) {
      const dimension =
        issue.code === "invalid_citations"
          ? "factuality"
          : issue.code.includes("profile")
            ? "personalization"
            : issue.code.includes("unsafe") || issue.code.includes("internal")
              ? "safety"
              : "structure";
      add(
        false,
        `mind_map:${issue.code}`,
        dimension,
        issue.code.includes("unsafe") || issue.code.includes("citation") || issue.code.includes("root")
          ? "critical"
          : "high",
        issue.message,
        "content",
      );
    }
  }

  const serialized = safeStringify(content);
  add(
    serialized.length >= 200 && serialized.length <= 50000,
    "文本总长度限制",
    "readability",
    "medium",
    `内容长度 ${serialized.length}，超出允许范围。`,
    "content",
    `结构化内容长度 ${serialized.length}`,
  );
  const arrays = collectArrays(content);
  const oversized = arrays.filter((item) => item.length > 40);
  add(
    oversized.length === 0,
    "数组长度限制",
    "structure",
    "high",
    "存在超过40项的数组。",
    "content",
    `检查 ${arrays.length} 个数组`,
  );
  const duplicate = duplicateRatio(content);
  add(
    duplicate < 0.35,
    "无重复段落",
    "readability",
    "medium",
    `重复文本比例 ${Math.round(duplicate * 100)}%。`,
    "content",
    `重复比例 ${Math.round(duplicate * 100)}%`,
  );
  const unsafe =
    /<\/?(?:script|iframe|object|embed|svg|form)\b|\bon\w+\s*=|javascript:|data:text\/html|vbscript:/i.test(
      serialized,
    );
  const externalUrl = /https?:\/\//i.test(serialized);
  add(
    !unsafe && !externalUrl,
    "无危险HTML、脚本和外部URL",
    "safety",
    "critical",
    unsafe ? "发现危险HTML或脚本内容。" : "发现未经允许的外部URL。",
    "content",
    "未发现脚本注入或外部URL",
  );

  if (type === "pptx") {
    const quality = validatePptDeckQuality({ content, context });
    add(
      quality.passed,
      "pptx专用教学课件质量门",
      "structure",
      "critical",
      `教学课件质量未通过：${quality.issues
        .slice(0, 5)
        .map((item) => item.message)
        .join("；")}`,
      "content",
      `页数 ${quality.slideCount}，核心 ${quality.coreContentSlideCount}，示例 ${quality.exampleSlideCount}，讲稿覆盖 ${Math.round((quality.notesCoverage || 0) * 100)}%`,
    );
    for (const issue of quality.issues.slice(0, 14)) {
      const dimension =
        issue.code.includes("citation") || issue.code.includes("source_ref")
          ? "factuality"
          : issue.code.includes("unsafe") || issue.code.includes("private") || issue.code.includes("internal")
            ? "safety"
            : issue.code.includes("profile")
              ? "personalization"
              : issue.code.includes("dense") ||
                  issue.code.includes("bullet") ||
                  issue.code.includes("long") ||
                  issue.code.includes("empty") ||
                  issue.code.includes("title")
                ? "readability"
                : "structure";
      add(
        false,
        `pptx:${issue.code}`,
        dimension,
        dimension === "safety" || dimension === "factuality" ? "critical" : "high",
        issue.message,
        "content.slides",
      );
    }
  }

  const rationale = array(resource.generationRationale).join(" ");
  const profileSignals = [context.mastery, context.stageTitle, context.explanationPreference].filter(
    (value) => value !== undefined && value !== null && String(value).trim(),
  );
  const matchedSignals = profileSignals.filter(
    (value) =>
      rationale.includes(String(value)) ||
      String(resource.targetLearnerSummary || "").includes(String(value)),
  );
  add(
    profileSignals.length > 0 && matchedSignals.length >= Math.min(2, profileSignals.length),
    "个性化字段来自学习画像",
    "personalization",
    "high",
    "生成依据未能对应当前画像、阶段或讲解偏好。",
    "generationRationale",
    `匹配 ${matchedSignals.length}/${profileSignals.length} 个画像证据`,
  );
  const difficulty = difficultyMatches(content, type, Number(context.mastery));
  add(
    difficulty.passed,
    "难度匹配掌握度",
    "difficulty",
    "medium",
    difficulty.detail,
    "content",
    difficulty.detail,
  );

  return finalizeRuleReview({ issues, checks, evidence });
}

function finalizeRuleReview({ issues, checks, evidence }) {
  const deductions = { low: 1, medium: 3, high: 6, critical: 12 };
  const dimensions = DIMENSIONS.map(([dimension, label, maxScore]) => {
    const dimensionIssues = issues.filter((issue) => issue.dimension === dimension);
    const score = Math.max(
      0,
      maxScore - dimensionIssues.reduce((sum, issue) => sum + deductions[issue.severity], 0),
    );
    return {
      dimension,
      label,
      score: finite(score),
      maxScore,
      status: dimensionIssues.length ? "failed" : "passed",
      evidence: evidence.filter((item) => item.dimension === dimension),
      issues: dimensionIssues,
      suggestions: dimensionIssues.map((item) => item.suggestedFix),
    };
  });
  const totalScore = finite(dimensions.reduce((sum, item) => sum + item.score, 0));
  const factuality = dimensions.find((item) => item.dimension === "factuality")?.score || 0;
  const safety = dimensions.find((item) => item.dimension === "safety")?.score || 0;
  const critical = issues.some((item) => item.severity === "critical");
  const passed = totalScore >= PASS_THRESHOLD && factuality >= 20 && safety === 5 && !critical;
  return {
    status: passed ? "approved" : "rejected",
    passed,
    score: totalScore,
    totalScore,
    passThreshold: PASS_THRESHOLD,
    dimensions,
    issues,
    ruleIssues: issues,
    modelIssues: [],
    citationEvidence: evidence.filter((item) => item.dimension === "factuality"),
    checks,
    correctedContent: null,
    summary: passed
      ? "规则审核通过，资源满足事实、结构、个性化、呈现、难度与安全要求。"
      : "规则审核未通过，请根据审核证据修复后重试。",
    modelReviewExecuted: false,
    modelReviewStatus: "not_requested",
    reviewVersion: REVIEW_VERSION,
    reviewedAt: new Date().toISOString(),
  };
}

function difficultyMatches(content, type, mastery) {
  if (!Number.isFinite(mastery))
    return { passed: true, detail: "当前画像未提供有效掌握度，保留结构规则结果。" };
  if (type !== "quiz_pack") return { passed: true, detail: `资源依据当前掌握度 ${mastery} 生成。` };
  const distribution = isObject(content.difficultyDistribution) ? content.difficultyDistribution : {};
  const target = mastery < 50 ? "foundation" : mastery < 75 ? "intermediate" : "advanced";
  const values = ["foundation", "intermediate", "advanced"].map((key) => Number(distribution[key]) || 0);
  const targetValue = Number(distribution[target]) || 0;
  return {
    passed: targetValue > 0 && targetValue === Math.max(...values),
    detail: `掌握度 ${mastery}，目标难度 ${target}，分布 ${values.join("/")}。`,
  };
}

function categoryFor(dimension) {
  return (
    {
      factuality: "factuality",
      structure: "structure",
      personalization: "relevance",
      readability: "clarity",
      difficulty: "difficulty",
      safety: "safety",
    }[dimension] || "formatting"
  );
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function safeStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}
function finite(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}
function collectArrays(value, result = []) {
  if (Array.isArray(value)) {
    result.push(value);
    value.forEach((item) => collectArrays(item, result));
  } else if (isObject(value)) Object.values(value).forEach((item) => collectArrays(item, result));
  return result;
}
function duplicateRatio(value) {
  const strings = [];
  collectStrings(value, strings);
  const normalized = strings.map((item) => item.trim()).filter((item) => item.length >= 12);
  return normalized.length < 2 ? 0 : (normalized.length - new Set(normalized).size) / normalized.length;
}
function collectStrings(value, result) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, result));
  else if (isObject(value)) Object.values(value).forEach((item) => collectStrings(item, result));
}

module.exports = { REVIEW_VERSION, PASS_THRESHOLD, DIMENSIONS, reviewResourceRules, finalizeRuleReview };
