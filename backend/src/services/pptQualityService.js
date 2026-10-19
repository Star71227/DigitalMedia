/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { expandSlides } = require("./ppt/textUtils");

const VALIDATOR_VERSION = "ppt-deck-quality-v1";
const NORMAL_LIMITS = {
  minSlides: 14,
  maxSlides: 18,
  minCoreSlides: 4,
  minExamples: 2,
  minVisualStructures: 2,
  minCodeOrProcess: 1,
  minPractice: 1,
  minAnswers: 1,
  minNotesCoverage: 0.8,
  maxEffectiveCharsPerSlide: 300,
  maxSerializedCharsPerSlide: 1900,
  maxBullets: 6,
  maxCodeLines: 24,
  maxTitleChars: 42,
};
const DEEP_LIMITS = {
  ...NORMAL_LIMITS,
  minSlides: 18,
  maxSlides: 24,
  minExamples: 3,
  minCodeOrProcess: 2,
  minPractice: 2,
};
const CANONICAL_SLIDE_TYPES = new Set([
  "cover",
  "objectives",
  "roadmap",
  "concept",
  "mechanism",
  "process",
  "example",
  "code",
  "comparison",
  "mistakes",
  "practice",
  "answers",
  "summary",
  "references",
]);
const LEGACY_SLIDE_TYPE_ALIASES = {
  title: "cover",
  misconception: "mistakes",
  misconceptions: "mistakes",
  quiz: "practice",
  next_steps: "summary",
};
const RENDER_SLIDE_TYPES = new Set([...CANONICAL_SLIDE_TYPES, ...Object.keys(LEGACY_SLIDE_TYPE_ALIASES)]);
const PLACEHOLDER_PATTERN =
  /TODO|TBC|待补充|此处(?:插入|省略)|placeholder|\{\{[^}]+\}\}|\$\{[^}]+\}|\[待填写\]|未完成标题|继续生成|内容未完|示例A|知识点\d+/i;
const UNSAFE_PATTERN =
  /<\/?(?:script|iframe|object|embed|svg|form|style|img|a|video|audio)\b|\bon\w+\s*=|javascript:|data:text\/html|vbscript:|https?:\/\//i;
const INTERNAL_TEXT_PATTERN =
  /(?:ResourceAgent|ReviewAgent|system prompt|chain[- ]?of[- ]?thought|SPARK_API_KEY|API Key|Token|password|数据库ID|retrievalRunId|qualityAttempts|correctedContent|reference solution|hidden tests|judge config|runner image|container image|参考实现|隐藏测试|判题配置|Docker镜像|服务器路径|绝对路径|私有答案)/i;
const PRIVATE_KEYS = new Set([
  "correctAnswer",
  "answerKey",
  "standardAnswer",
  "referenceSolution",
  "hiddenTests",
  "privateTests",
  "judgeConfig",
  "compilerCommand",
  "runCommand",
  "containerImage",
  "workingDirectory",
  "systemPrompt",
  "prompt",
  "profileSnapshot",
  "requestSnapshot",
  "qualityAttempts",
  "correctedContent",
  "modelRawOutput",
  "retrievalRunId",
  "chunkId",
  "reference_solution",
  "hidden_tests",
  "judge_config",
  "runner_image",
]);

function validatePptDeckQuality(input = {}) {
  const content = input.content && input.content.content ? input.content.content : input.content;
  const context = input.context || {};
  const limits =
    context.depth === "deep" || content?.generationMeta?.depth === "deep" ? DEEP_LIMITS : NORMAL_LIMITS;
  const issues = [];
  if (!content || typeof content !== "object" || Array.isArray(content))
    return failed("invalid_content", "PPT内容必须是对象。", limits);
  const slides = Array.isArray(content.slides) ? content.slides : [];
  const expandedSlides = expandSlides(slides);
  const normalizedTypes = slides.map((slide) => normalizeSlideType(slide?.slideType));
  const typeCounts = countValues(normalizedTypes);
  const textBySlide = slides.map(slidePublicText);
  const bodyKeys = textBySlide.map(normalizeText).filter((text) => countEffectiveChinese(text) >= 24);
  const titleKeys = slides.map((slide) => normalizeText(slide?.title)).filter(Boolean);
  const references = Array.isArray(content.references) ? content.references : [];
  const profileFacts = extractProfileFacts(context, content);
  const profileFactCount = countProfileFactMatches(profileFacts, slides);
  const sourceKeys = new Set(
    references.map((reference) => String(reference?.sourceKey || "").trim()).filter(Boolean),
  );
  const danglingSourceRefs = slides.flatMap((slide, index) =>
    array(slide?.sourceRefs)
      .filter((ref) => !sourceKeys.has(String(ref)))
      .map((ref) => ({ index, ref })),
  );
  const serialized = safeStringify(content);
  const privateHits = scanPrivateKeys(content);
  const titleOnly = slides.filter((slide) => isTitleOnlySlide(slide));
  const emptySlides = slides.filter(
    (slide) => countEffectiveChinese(slidePublicText(slide)) < 10 && !String(slide?.code || "").trim(),
  );
  const duplicateTitleCount = titleKeys.length - new Set(titleKeys).size;
  const duplicateBodyCount = bodyKeys.length - new Set(bodyKeys).size;
  const overdenseSlides = slides.filter(
    (slide) =>
      countEffectiveChinese(slidePublicText(slide)) > limits.maxEffectiveCharsPerSlide ||
      safeStringify(slide).length > limits.maxSerializedCharsPerSlide,
  );
  const bulletOverLimit = slides.filter(
    (slide) =>
      array(slide?.bullets).length > limits.maxBullets ||
      array(slide?.items).length > limits.maxBullets ||
      array(slide?.steps).length > 8,
  );
  const codeLineOverLimit = slides.filter(
    (slide) =>
      String(slide?.code || "")
        .split(/\r?\n/)
        .filter((line) => line.trim()).length > limits.maxCodeLines,
  );
  const titleTooLong = slides.filter(
    (slide) => String(slide?.title || "").trim().length > limits.maxTitleChars,
  );
  const notesEligible = slides.filter((slide) => normalizeSlideType(slide?.slideType) !== "cover");
  const notesCount = notesEligible.filter((slide) => countEffectiveChinese(slide?.speakerNotes) >= 20).length;
  const notesCoverage = notesEligible.length ? Number((notesCount / notesEligible.length).toFixed(3)) : 0;
  const metrics = {
    slideCount: slides.length,
    expandedSlideCount: expandedSlides.length,
    coverCount: typeCounts.cover || 0,
    objectiveSlideCount: typeCounts.objectives || 0,
    roadmapSlideCount: typeCounts.roadmap || 0,
    coreContentSlideCount: ["concept", "mechanism", "process", "code"].reduce(
      (sum, type) => sum + (typeCounts[type] || 0),
      0,
    ),
    exampleSlideCount: typeCounts.example || 0,
    visualStructureCount: ["roadmap", "process", "comparison", "code"].reduce(
      (sum, type) => sum + (typeCounts[type] || 0),
      0,
    ),
    codeOrProcessSlideCount: (typeCounts.code || 0) + (typeCounts.process || 0),
    mistakeSlideCount: typeCounts.mistakes || 0,
    comparisonSlideCount: typeCounts.comparison || 0,
    practiceSlideCount: typeCounts.practice || 0,
    answerSlideCount: typeCounts.answers || 0,
    summarySlideCount: typeCounts.summary || 0,
    referenceSlideCount: typeCounts.references || 0,
    speakerNotesCount: notesCount,
    notesCoverage,
    citationCount: references.length,
    profileFactCount,
    emptySlideCount: emptySlides.length,
    titleOnlySlideCount: titleOnly.length,
    duplicateTitleCount,
    duplicateBodyCount,
    overdenseSlideCount: overdenseSlides.length,
    bulletOverLimitCount: bulletOverLimit.length,
    titleTooLongCount: titleTooLong.length,
    codeLineOverLimitCount: codeLineOverLimit.length,
    overflowRiskCount:
      overdenseSlides.length + bulletOverLimit.length + codeLineOverLimit.length + titleTooLong.length,
    placeholderMatches: countPattern(serialized, PLACEHOLDER_PATTERN),
    unsafeMatches: countPattern(serialized, UNSAFE_PATTERN),
    internalTermMatches: countPattern(serialized, INTERNAL_TEXT_PATTERN),
    privateFieldLeakCount: privateHits.length,
    danglingSourceRefCount: danglingSourceRefs.length,
    contentHash: sha256(
      slides
        .map((slide) => `${normalizeSlideType(slide.slideType)}:${slide.title}:${slidePublicText(slide)}`)
        .join("\n"),
    ),
  };

  requireMetric(
    issues,
    metrics.slideCount >= limits.minSlides && metrics.slideCount <= limits.maxSlides,
    "invalid_slide_count",
    `普通PPT页数 ${metrics.slideCount}，应为 ${limits.minSlides} 至 ${limits.maxSlides} 页。`,
  );
  requireMetric(
    issues,
    metrics.coverCount === 1,
    "invalid_cover_count",
    `封面页数量 ${metrics.coverCount}，必须恰好为1。`,
  );
  requireMetric(issues, metrics.objectiveSlideCount >= 1, "missing_objectives", "缺少学习目标页。");
  requireMetric(issues, metrics.roadmapSlideCount >= 1, "missing_roadmap", "缺少知识路线或概念图页。");
  requireMetric(
    issues,
    metrics.coreContentSlideCount >= limits.minCoreSlides,
    "insufficient_core_content",
    `核心教学页 ${metrics.coreContentSlideCount}，低于 ${limits.minCoreSlides}。`,
  );
  requireMetric(
    issues,
    metrics.exampleSlideCount >= limits.minExamples,
    "insufficient_examples",
    `具体示例页 ${metrics.exampleSlideCount}，低于 ${limits.minExamples}。`,
  );
  requireMetric(
    issues,
    metrics.codeOrProcessSlideCount >= limits.minCodeOrProcess,
    "missing_code_or_process",
    "缺少代码、伪代码、流程或状态变化页。",
  );
  requireMetric(issues, metrics.mistakeSlideCount >= 1, "missing_mistakes", "缺少常见错误与易混点页。");
  requireMetric(issues, metrics.comparisonSlideCount >= 1, "missing_comparison", "缺少对比或跨知识联系页。");
  requireMetric(
    issues,
    metrics.practiceSlideCount >= limits.minPractice,
    "missing_practice",
    "缺少自我检查或练习页。",
  );
  requireMetric(
    issues,
    metrics.answerSlideCount >= limits.minAnswers,
    "missing_answers",
    "缺少答案与解析页。",
  );
  requireMetric(issues, metrics.summarySlideCount >= 1, "missing_summary", "缺少总结页。");
  requireMetric(
    issues,
    metrics.referenceSlideCount >= 1 && references.length >= 1,
    "missing_references",
    "缺少真实参考资料页或参考来源。",
  );
  requireMetric(
    issues,
    metrics.notesCoverage >= limits.minNotesCoverage,
    "insufficient_speaker_notes",
    `speaker notes覆盖率 ${Math.round(metrics.notesCoverage * 100)}%，低于80%。`,
  );
  requireMetric(
    issues,
    metrics.visualStructureCount >= limits.minVisualStructures,
    "insufficient_visual_structures",
    `非纯文字视觉结构 ${metrics.visualStructureCount}，低于 ${limits.minVisualStructures}。`,
  );
  requireMetric(
    issues,
    metrics.emptySlideCount === 0,
    "empty_slide",
    `存在 ${metrics.emptySlideCount} 个空页。`,
  );
  requireMetric(
    issues,
    metrics.titleOnlySlideCount === 0,
    "title_only_slide",
    `存在 ${metrics.titleOnlySlideCount} 个只有标题的教学页。`,
  );
  requireMetric(
    issues,
    metrics.duplicateTitleCount === 0,
    "duplicate_titles",
    `重复标题数量 ${metrics.duplicateTitleCount}。`,
  );
  requireMetric(
    issues,
    metrics.duplicateBodyCount === 0,
    "duplicate_body",
    `重复正文数量 ${metrics.duplicateBodyCount}。`,
  );
  requireMetric(
    issues,
    metrics.overdenseSlideCount === 0,
    "overdense_slide",
    `内容过密页 ${metrics.overdenseSlideCount}。`,
  );
  requireMetric(
    issues,
    metrics.bulletOverLimitCount === 0,
    "too_many_bullets",
    `项目或步骤过多页 ${metrics.bulletOverLimitCount}。`,
  );
  requireMetric(
    issues,
    metrics.titleTooLongCount === 0,
    "title_too_long",
    `标题过长页 ${metrics.titleTooLongCount}。`,
  );
  requireMetric(
    issues,
    metrics.codeLineOverLimitCount === 0,
    "code_too_long",
    `代码超长页 ${metrics.codeLineOverLimitCount}。`,
  );
  requireMetric(issues, metrics.placeholderMatches === 0, "placeholder_found", "内容包含未替换占位符。");
  requireMetric(issues, metrics.unsafeMatches === 0, "unsafe_content", "内容包含HTML、脚本、SVG或外部URL。");
  requireMetric(
    issues,
    metrics.internalTermMatches === 0,
    "internal_terms_leaked",
    "内容包含内部字段、Prompt、私有判题或路径信息。",
  );
  requireMetric(
    issues,
    metrics.privateFieldLeakCount === 0,
    "private_field_leaked",
    `存在 ${metrics.privateFieldLeakCount} 个私有字段泄漏。`,
  );
  requireMetric(
    issues,
    metrics.danglingSourceRefCount === 0,
    "dangling_source_ref",
    "幻灯片sourceRefs指向不存在的参考来源。",
  );
  if (profileFacts.length)
    requireMetric(
      issues,
      metrics.profileFactCount >= 3,
      "insufficient_profile_facts",
      `已有画像时PPT至少应使用3项真实画像事实。当前命中 ${metrics.profileFactCount} 项；候选：${profileFacts
        .slice(0, 8)
        .map((item) => String(item).slice(0, 24))
        .join("、")}`,
    );

  return {
    passed: issues.length === 0,
    ...metrics,
    usedSlideTypes: [...new Set(normalizedTypes)],
    issues,
    checks: buildChecks(metrics, limits, profileFacts.length > 0),
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function failed(code, message, limits) {
  return {
    passed: false,
    slideCount: 0,
    expandedSlideCount: 0,
    coverCount: 0,
    objectiveSlideCount: 0,
    roadmapSlideCount: 0,
    coreContentSlideCount: 0,
    exampleSlideCount: 0,
    visualStructureCount: 0,
    codeOrProcessSlideCount: 0,
    practiceSlideCount: 0,
    answerSlideCount: 0,
    speakerNotesCount: 0,
    notesCoverage: 0,
    citationCount: 0,
    profileFactCount: 0,
    emptySlideCount: 0,
    titleOnlySlideCount: 0,
    duplicateTitleCount: 0,
    duplicateBodyCount: 0,
    overdenseSlideCount: 0,
    overflowRiskCount: 0,
    privateFieldLeakCount: 0,
    issues: [{ code, message }],
    checks: buildChecks({}, limits, false),
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function normalizeSlideType(value) {
  const raw = String(value || "").trim();
  return LEGACY_SLIDE_TYPE_ALIASES[raw] || raw;
}

function isAllowedSlideType(value) {
  return RENDER_SLIDE_TYPES.has(String(value || "").trim());
}

function slidePublicText(slide = {}) {
  return [
    slide.title,
    slide.subtitle,
    slide.body,
    ...array(slide.bullets),
    ...array(slide.nextSteps),
    ...array(slide.steps).flatMap((item) => [item?.title, item?.description]),
    ...array(slide.items).flatMap((item) =>
      typeof item === "string" ? [item] : [item?.mistake, item?.correction, item?.title, item?.description],
    ),
    slide.left?.title,
    ...array(slide.left?.items),
    slide.right?.title,
    ...array(slide.right?.items),
    slide.explanation,
    ...array(slide.references).flatMap((item) => [
      item?.sourceKey,
      item?.title,
      item?.chapter,
      item?.section,
    ]),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function isTitleOnlySlide(slide = {}) {
  const type = normalizeSlideType(slide.slideType);
  if (type === "cover" || type === "references") return false;
  const text = slidePublicText({ ...slide, title: "" });
  const hasStructure =
    array(slide.steps).length ||
    array(slide.items).length ||
    array(slide.bullets).length ||
    String(slide.code || "").trim();
  return countEffectiveChinese(text) < 24 && !hasStructure;
}

function countEffectiveChinese(text) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`{1,3}|#{1,6}|[*_>\-+|[\](){}$]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(PLACEHOLDER_PATTERN, " ")
    .replace(/\s+/g, " ");
  return (cleaned.match(/[\p{Script=Han}]/gu) || []).length;
}

function extractProfileFacts(context = {}, content = {}) {
  const metaFacts = array(content?.generationMeta?.profileFactsUsed);
  const facts = [
    ...metaFacts,
    context.major,
    context.grade,
    context.currentCourse,
    Number.isFinite(Number(context.mastery)) ? `掌握度 ${Number(context.mastery)}` : "",
    context.explanationPreference,
    context.paceAndTimeBudget?.pacePreference,
    context.paceAndTimeBudget?.weeklyTimeBudgetMinutes
      ? `${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}`
      : "",
    ...array(context.priorKnowledge),
    ...array(context.learningGoals),
    ...array(context.resourcePreferences),
    ...array(context.errorPatterns).map((item) => item?.errorType || item),
  ]
    .map((item) => String(item || "").trim())
    .filter((item) => item.length >= 2);
  return [...new Set(facts)];
}

function countProfileFactMatches(facts, slides) {
  // slidePublicText 不包含 speakerNotes，但学生在讲义场景里也确实会通过讲稿感知画像，
  // 因此统计画像事实时额外把讲稿文本算进来（其他校验仍只看正文）。
  const corpus = slides.map((slide) => `${slidePublicText(slide)}\n${slide?.speakerNotes || ""}`).join("\n");
  const compactCorpus = corpus.replace(/\s+/g, "");
  return facts.filter((fact) => {
    const variants = [
      fact,
      fact.replace(/^掌握度\s*/, ""),
      ...String(fact)
        .split(/[+、/,，;；|]/)
        .map((item) => item.trim()),
    ]
      .map((item) => String(item || "").trim())
      .filter((item) => item.length >= 2);
    // 复合画像值（如「图示+代码」「先讲例子，再给练习」）允许命中任一 2 字以上片段；
    // 同时忽略空格差异，避免「掌握度55」与「掌握度 55」被判定为不同事实。
    return [...new Set(variants)].some(
      (variant) => corpus.includes(variant) || compactCorpus.includes(variant.replace(/\s+/g, "")),
    );
  }).length;
}

function scanPrivateKeys(value, path = "$", seen = new Set(), hits = []) {
  if (!value || typeof value !== "object" || seen.has(value)) return hits;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPrivateKeys(item, `${path}[${index}]`, seen, hits));
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_KEYS.has(key)) hits.push(`${path}.${key}`);
    scanPrivateKeys(child, `${path}.${key}`, seen, hits);
  }
  return hits;
}

function buildChecks(metrics = {}, limits, requireProfileFacts) {
  return [
    {
      name: "页数范围",
      passed: (metrics.slideCount || 0) >= limits.minSlides && (metrics.slideCount || 0) <= limits.maxSlides,
      detail: `页数 ${metrics.slideCount || 0}`,
    },
    {
      name: "教学结构",
      passed:
        (metrics.coverCount || 0) === 1 &&
        (metrics.objectiveSlideCount || 0) >= 1 &&
        (metrics.roadmapSlideCount || 0) >= 1 &&
        (metrics.coreContentSlideCount || 0) >= limits.minCoreSlides,
      detail: `封面 ${metrics.coverCount || 0}，目标 ${metrics.objectiveSlideCount || 0}，路线 ${metrics.roadmapSlideCount || 0}，核心 ${metrics.coreContentSlideCount || 0}`,
    },
    {
      name: "例题与练习",
      passed:
        (metrics.exampleSlideCount || 0) >= limits.minExamples &&
        (metrics.practiceSlideCount || 0) >= limits.minPractice &&
        (metrics.answerSlideCount || 0) >= limits.minAnswers,
      detail: `示例 ${metrics.exampleSlideCount || 0}，练习 ${metrics.practiceSlideCount || 0}，答案 ${metrics.answerSlideCount || 0}`,
    },
    {
      name: "过程与视觉结构",
      passed:
        (metrics.codeOrProcessSlideCount || 0) >= limits.minCodeOrProcess &&
        (metrics.visualStructureCount || 0) >= limits.minVisualStructures,
      detail: `过程/代码 ${metrics.codeOrProcessSlideCount || 0}，视觉结构 ${metrics.visualStructureCount || 0}`,
    },
    {
      name: "speaker notes",
      passed: (metrics.notesCoverage || 0) >= limits.minNotesCoverage,
      detail: `覆盖率 ${Math.round((metrics.notesCoverage || 0) * 100)}%`,
    },
    {
      name: "密度与溢出风险",
      passed:
        (metrics.overflowRiskCount || 0) === 0 &&
        (metrics.emptySlideCount || 0) === 0 &&
        (metrics.titleOnlySlideCount || 0) === 0,
      detail: `风险 ${metrics.overflowRiskCount || 0}，空页 ${metrics.emptySlideCount || 0}，标题页 ${metrics.titleOnlySlideCount || 0}`,
    },
    {
      name: "安全字段扫描",
      passed:
        (metrics.privateFieldLeakCount || 0) === 0 &&
        (metrics.internalTermMatches || 0) === 0 &&
        (metrics.unsafeMatches || 0) === 0,
      detail: `私有字段 ${metrics.privateFieldLeakCount || 0}`,
    },
    {
      name: "画像事实使用",
      passed: !requireProfileFacts || (metrics.profileFactCount || 0) >= 3,
      detail: requireProfileFacts ? `画像事实 ${metrics.profileFactCount || 0}` : "无画像时不强制",
    },
  ];
}

function requireMetric(issues, passed, code, message) {
  if (!passed) issues.push({ code, message });
}

function countValues(values) {
  return values.reduce((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), {});
}

function countPattern(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (String(text || "").match(new RegExp(pattern.source, flags)) || []).length;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function safeStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function sha256(value) {
  return require("crypto")
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  CANONICAL_SLIDE_TYPES,
  RENDER_SLIDE_TYPES,
  VALIDATOR_VERSION,
  NORMAL_LIMITS,
  DEEP_LIMITS,
  countEffectiveChinese,
  isAllowedSlideType,
  normalizeSlideType,
  validatePptDeckQuality,
};
