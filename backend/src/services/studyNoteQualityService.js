/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const VALIDATOR_VERSION = "study-note-quality-v1";
const NORMAL_LIMITS = {
  minEffectiveChineseChars: 2500,
  meaningfulSectionCount: 14,
  exampleCount: 2,
  codeBlockCount: 1,
  mistakeCount: 3,
  exerciseCount: 3,
};
const DEEP_LIMITS = {
  minEffectiveChineseChars: 4000,
  meaningfulSectionCount: 14,
  exampleCount: 3,
  codeBlockCount: 2,
  mistakeCount: 5,
  exerciseCount: 5,
};
const PLACEHOLDER_PATTERN =
  /TODO|TBC|待补充|此处(?:插入|省略)|示例代码略|代码略|placeholder|\{\{[^}]+\}\}|\$\{[^}]+\}|\[待填写\]|未完成标题|继续生成|内容未完/i;
const INTERNAL_PATTERN =
  /(?:ResourceAgent|ReviewAgent|Prompt|system prompt|chain[- ]?of[- ]?thought|api[_-]?key|SPARK_API_KEY|数据库ID|retrievalRunId|chunkId)/i;

function validateStudyNoteQuality(input = {}) {
  const content = input.content;
  const context = input.context || {};
  const citations = Array.isArray(input.citations) ? input.citations : [];
  const retrievalResults = Array.isArray(input.retrieval?.results) ? input.retrieval.results : [];
  const limits = input.depth === "deep" ? DEEP_LIMITS : NORMAL_LIMITS;
  const sections = extractStudyNoteSections(content);
  const textParts = sections.flatMap((section) => section.parts);
  const publicText = textParts
    .filter((part) => part.kind !== "code")
    .map((part) => part.text)
    .join("\n");
  const allText = textParts.map((part) => part.text).join("\n");
  const profileFacts = extractProfileFacts(context);
  const profileMatches = matchedProfileFacts(profileFacts, sections);
  const citationCheck = validateCitationUse({ allText, citations, retrievalResults });
  const exerciseStats = countExercises(content);
  const truncationReason = isTruncated(allText, sections, exerciseStats);
  const metrics = {
    effectiveChineseChars: countEffectiveChinese(publicText),
    totalChars: allText.length,
    sectionCount: sections.length,
    meaningfulSectionCount: sections.filter(isMeaningfulSection).length,
    exampleCount: countExamples(content),
    codeBlockCount: countCodeBlocks(content, allText),
    mistakeCount: countMistakes(content),
    exerciseCount: exerciseStats.exerciseCount,
    answerCount: exerciseStats.answerCount,
    comprehensionCheckCount: countComprehensionChecks(content, allText),
    citationCount: citations.length,
    profileFactCount: profileMatches.count,
    personalizationAvailable: profileFacts.length > 0,
    placeholderMatches: countPattern(allText, PLACEHOLDER_PATTERN),
    emptySectionCount: sections.filter(isEmptySection).length,
    duplicateParagraphRatio: duplicateParagraphRatio(sections),
    truncated: Boolean(truncationReason),
    truncationReason,
  };
  const issues = [];
  requireMetric(
    issues,
    metrics.effectiveChineseChars >= limits.minEffectiveChineseChars,
    "effective_chinese_too_short",
    `有效中文字符数 ${metrics.effectiveChineseChars}，低于 ${limits.minEffectiveChineseChars}。`,
  );
  requireMetric(
    issues,
    metrics.meaningfulSectionCount >= limits.meaningfulSectionCount,
    "insufficient_meaningful_sections",
    `有意义教学区段 ${metrics.meaningfulSectionCount}，低于 ${limits.meaningfulSectionCount}。`,
  );
  requireMetric(
    issues,
    metrics.exampleCount >= limits.exampleCount,
    "insufficient_examples",
    `完整示例 ${metrics.exampleCount}，低于 ${limits.exampleCount}。`,
  );
  requireMetric(
    issues,
    metrics.codeBlockCount >= limits.codeBlockCount,
    "missing_code_block",
    `代码或伪代码块 ${metrics.codeBlockCount}，低于 ${limits.codeBlockCount}。`,
  );
  requireMetric(
    issues,
    metrics.mistakeCount >= limits.mistakeCount,
    "insufficient_mistakes",
    `具体易错点 ${metrics.mistakeCount}，低于 ${limits.mistakeCount}。`,
  );
  requireMetric(
    issues,
    metrics.exerciseCount >= limits.exerciseCount,
    "insufficient_exercises",
    `练习数 ${metrics.exerciseCount}，低于 ${limits.exerciseCount}。`,
  );
  requireMetric(
    issues,
    metrics.answerCount >= metrics.exerciseCount && metrics.answerCount >= limits.exerciseCount,
    "exercise_answer_mismatch",
    "练习题没有逐题对应答案或解析。",
  );
  requireMetric(
    issues,
    metrics.comprehensionCheckCount >= 1,
    "missing_comprehension_check",
    "缺少检查理解区域。",
  );
  requireMetric(issues, /总结|小结/.test(allText), "missing_summary", "缺少知识总结区域。");
  requireMetric(
    issues,
    /后续|下一步|进阶|复习建议/.test(allText),
    "missing_next_steps",
    "缺少后续学习建议。",
  );
  if (profileFacts.length > 0) {
    requireMetric(
      issues,
      metrics.profileFactCount >= 3,
      "insufficient_profile_facts",
      "已有学习画像时，讲义至少应使用 3 项真实画像事实。",
    );
    requireMetric(
      issues,
      profileMatches.sectionCount >= 2,
      "profile_facts_not_integrated",
      "画像事实需要分布在不同教学区段，而不是只在开头罗列。",
    );
  }
  if (retrievalResults.length > 0) {
    requireMetric(issues, citationCheck.valid, "invalid_citations", citationCheck.message);
  }
  requireMetric(
    issues,
    metrics.duplicateParagraphRatio < 0.28,
    "duplicate_content",
    `重复段落比例 ${metrics.duplicateParagraphRatio} 过高。`,
  );
  requireMetric(
    issues,
    metrics.placeholderMatches === 0,
    "placeholder_found",
    "内容包含未替换占位符或省略式占位文本。",
  );
  requireMetric(
    issues,
    !metrics.truncated,
    "content_truncated",
    `内容存在截断、未闭合代码块或练习答案不完整。${metrics.truncationReason || ""}`,
  );
  requireMetric(
    issues,
    metrics.emptySectionCount === 0,
    "empty_sections",
    "存在只有标题或正文不足的空区段。",
  );
  requireMetric(
    issues,
    !INTERNAL_PATTERN.test(allText),
    "internal_terms_leaked",
    "内容包含内部字段、Prompt、Agent 或检索实现细节。",
  );
  return {
    passed: issues.length === 0,
    ...metrics,
    citationsAvailable: retrievalResults.length > 0,
    issues,
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function extractStudyNoteSections(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const sections = [];
  addSection(sections, "学习目标", content.personalizedObjectives);
  addSection(sections, "适用对象与本次讲解方式", content.foundationSummary);
  for (const item of array(content.coreConcepts)) addSection(sections, item.title, item.explanation);
  for (const item of array(content.diagrams))
    addSection(sections, item.title, [item.description, ...(item.steps || [])]);
  for (const item of array(content.methodsAndFormulas)) {
    addSection(sections, item.title, [
      { text: item.expression, kind: looksLikeCode(item.expression) ? "code" : "text" },
      item.explanation,
      ...(item.conditions || []),
    ]);
  }
  for (const item of array(content.workedExamples))
    addSection(sections, item.question, [...(item.steps || []), item.answer], "example");
  for (const item of array(content.commonMistakes))
    addSection(sections, item.mistake, [item.reason, item.correction], "mistake");
  for (const item of array(content.practiceTasks))
    addSection(sections, item.prompt, [item.hint, item.answerGuide], "exercise");
  addSection(sections, "总结与后续学习建议", content.studyAdvice);
  addSection(sections, "参考资料", content.citationBasis);
  return sections;
}

function addSection(sections, title, value, role = "text") {
  const parts = normalizeParts(value);
  const normalizedTitle = String(title || "").trim();
  sections.push({ title: normalizedTitle, role, parts });
}

function normalizeParts(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [{ text: value.trim(), kind: "text" }].filter((part) => part.text);
  if (Array.isArray(value)) return value.flatMap((item) => normalizeParts(item));
  if (typeof value === "object" && value.text)
    return [{ text: String(value.text || "").trim(), kind: value.kind || "text" }].filter(
      (part) => part.text,
    );
  if (typeof value === "object") return Object.values(value).flatMap((item) => normalizeParts(item));
  return [{ text: String(value).trim(), kind: "text" }].filter((part) => part.text);
}

function isMeaningfulSection(section) {
  if (!section.title || PLACEHOLDER_PATTERN.test(section.title)) return false;
  const body = section.parts
    .filter((part) => part.kind !== "code")
    .map((part) => part.text)
    .join("\n");
  const chars = countEffectiveChinese(body);
  if (/参考资料|引用/.test(section.title)) return chars >= 25;
  if (section.role === "exercise")
    return chars >= 28 && /题|练习|判断|解释|比较|写出|分析|检查理解/.test(`${section.title}\n${body}`);
  if (section.role === "mistake")
    return chars >= 45 && /错|误区|原因|纠正|避免|修正/.test(`${section.title}\n${body}`);
  if (section.role === "example")
    return (
      chars >= 65 && /步骤|过程|答案|结论|状态|输入|输出|示例|例题|案例/.test(`${section.title}\n${body}`)
    );
  return chars >= 80;
}

function isEmptySection(section) {
  if (!section.title) return true;
  const body = section.parts
    .filter((part) => part.kind !== "code")
    .map((part) => part.text)
    .join("\n");
  return (
    countEffectiveChinese(body) < 20 &&
    !section.parts.some((part) => part.kind === "code" && String(part.text || "").trim().length >= 20)
  );
}

function countEffectiveChinese(text) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`{1,3}|#{1,6}|[*_>\-+|[\](){}$]/g, " ")
    .replace(/\bS\d+\b/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(PLACEHOLDER_PATTERN, " ")
    .replace(/\s+/g, " ");
  return (cleaned.match(/[\p{Script=Han}]/gu) || []).length;
}

function countExamples(content) {
  return array(content?.workedExamples).filter((item) => {
    const text = [item.question, ...(item.steps || []), item.answer].join("\n");
    return (
      countEffectiveChinese(text) >= 85 &&
      array(item.steps).length >= 3 &&
      countEffectiveChinese(item.answer) >= 25
    );
  }).length;
}

function countCodeBlocks(content, allText) {
  const fenced = Math.floor((String(allText || "").match(/```/g) || []).length / 2);
  const methodBlocks = array(content?.methodsAndFormulas).filter((item) =>
    looksLikeCode(item.expression),
  ).length;
  return fenced + methodBlocks;
}

function looksLikeCode(value) {
  return /(^|\n)\s*(?:for|while|if|else|return|function|void|int|class|case|switch|输入|输出|算法|伪代码|步骤)\b|->|<-|:=|O\(|\{|\}/i.test(
    String(value || ""),
  );
}

function countMistakes(content) {
  return array(content?.commonMistakes).filter((item) => {
    const text = [item.mistake, item.reason, item.correction].join("\n");
    return countEffectiveChinese(text) >= 35 && /错|误区|混淆|忽略|原因|纠正|避免|修正/.test(text);
  }).length;
}

function countExercises(content) {
  let exerciseCount = 0;
  let answerCount = 0;
  for (const item of array(content?.practiceTasks)) {
    const prompt = String(item.prompt || "");
    const answer = String(item.answerGuide || item.answer || "");
    const isExercise =
      countEffectiveChinese(prompt) >= 12 &&
      /题|练习|判断|解释|比较|写出|分析|检查理解|推导|设计/.test(prompt);
    if (isExercise) exerciseCount += 1;
    if (isExercise && countEffectiveChinese(answer) >= 20 && !/自行思考|略|见上文|无标准答案/.test(answer))
      answerCount += 1;
  }
  return { exerciseCount, answerCount };
}

function countComprehensionChecks(content, allText) {
  let count = /检查理解|理解检查|检验理解|自测|用自己的话|判断并说明/.test(allText) ? 1 : 0;
  count += array(content?.practiceTasks).filter((item) =>
    /检查理解|理解检查|检验理解|自测|用自己的话|判断并说明/.test(String(item.prompt || "")),
  ).length;
  return Math.min(count, 3);
}

function extractProfileFacts(context) {
  const direct = Array.isArray(context.profileFacts) ? context.profileFacts : [];
  const profile = context.profileSnapshot || context.profile || {};
  const facts = [
    context.major,
    context.grade,
    context.currentCourse,
    context.explanationPreference,
    context.paceAndTimeBudget?.pacePreference,
    context.paceAndTimeBudget?.weeklyTimeBudgetMinutes
      ? `每周 ${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}`
      : "",
    ...(context.priorKnowledge || []),
    ...(context.learningGoals || []),
    ...(context.resourcePreferences || []),
    profile.major,
    profile.grade,
    profile.currentCourse,
    ...(profile.priorKnowledge || []),
    ...(profile.learningGoals || []),
    profile.explanationPreference,
    ...(profile.resourcePreferences || []),
  ];
  return [
    ...new Set(
      [...direct, ...facts].map((item) => String(item || "").trim()).filter((item) => item.length >= 2),
    ),
  ];
}

function matchedProfileFacts(facts, sections) {
  const matched = new Set();
  const sectionIndexes = new Set();
  sections.forEach((section, index) => {
    const text = [section.title, ...section.parts.map((part) => part.text)].join("\n");
    facts.forEach((fact) => {
      // 画像事实可能是复合值（如「图示+代码」「先讲例子，再给练习」），模型通常只自然使用其中一部分，
      // 因此允许命中任一 2 字以上片段，避免因为标点差异判定「没有融入画像」。
      const hit = factVariants(fact).some((variant) => text.includes(variant));
      if (hit) {
        matched.add(fact);
        sectionIndexes.add(index);
      }
    });
  });
  return { count: matched.size, sectionCount: sectionIndexes.size };
}

function factVariants(fact) {
  const value = String(fact || "").trim();
  const parts = value
    .split(/[+、/,，;；|]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return [...new Set([value, ...parts].filter(Boolean))];
}

function validateCitationUse({ allText, citations, retrievalResults }) {
  if (!retrievalResults.length) return { valid: true, message: "知识库无命中，不强制引用。" };
  if (!citations.length) return { valid: false, message: "知识库有命中时至少需要 1 条真实引用。" };
  const retrievalIds = new Set(retrievalResults.map((item) => Number(item.chunkId)));
  const labels = new Set();
  for (const citation of citations) {
    if (!retrievalIds.has(Number(citation.chunkId)))
      return { valid: false, message: "引用包含本次检索之外的来源。" };
    if (!citation.label || labels.has(citation.label))
      return { valid: false, message: "引用编号缺失或重复。" };
    labels.add(citation.label);
    if (!citation.sourceTitle || !citation.excerpt)
      return { valid: false, message: "引用缺少来源标题或摘录。" };
  }
  const used = [...String(allText || "").matchAll(/\[S(\d+)\]/g)].map((match) => `S${match[1]}`);
  if (!used.length) return { valid: false, message: "正文没有使用可对应的引用标记。" };
  const dangling = used.filter((label) => !labels.has(label));
  return dangling.length
    ? { valid: false, message: `正文存在悬空引用：${dangling.join("、")}。` }
    : { valid: true, message: "引用可验证。" };
}

function duplicateParagraphRatio(sections) {
  const paragraphs = sections
    .flatMap((section) => section.parts.map((part) => part.text))
    .map((item) => item.replace(/\s+/g, "").trim())
    .filter((item) => countEffectiveChinese(item) >= 35);
  if (paragraphs.length < 2) return 0;
  const exactGroups = paragraphs.reduce(
    (map, paragraph) => map.set(paragraph, (map.get(paragraph) || 0) + 1),
    new Map(),
  );
  const maxExactGroup = Math.max(...exactGroups.values());
  let duplicate = paragraphs.length - exactGroups.size;
  for (let i = 0; i < paragraphs.length; i += 1) {
    for (let j = i + 1; j < paragraphs.length; j += 1) {
      if (paragraphs[i] !== paragraphs[j] && similarity(paragraphs[i], paragraphs[j]) >= 0.97) duplicate += 1;
    }
  }
  if (maxExactGroup >= 3) duplicate = Math.max(duplicate, Math.ceil(paragraphs.length * 0.35));
  return Number(Math.min(1, duplicate / paragraphs.length).toFixed(3));
}

function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function bigrams(text) {
  const value = String(text || "");
  const set = new Set();
  for (let index = 0; index < value.length - 1; index += 1) set.add(value.slice(index, index + 2));
  return set;
}

function isTruncated(allText, sections, exerciseStats) {
  const fenceCount = (String(allText || "").match(/```/g) || []).length;
  const reason =
    fenceCount % 2 !== 0
      ? `代码围栏数量为奇数（${fenceCount}），存在未闭合的代码块`
      : /未完待续|继续生成|内容截断|下文继续/i.test(allText)
        ? "正文包含未完成提示语"
        : sections.some((section) => section.title && !section.parts.length)
          ? `区段「${(sections.find((section) => section.title && !section.parts.length) || {}).title}」只有标题没有正文`
          : exerciseStats.exerciseCount > exerciseStats.answerCount
            ? `练习 ${exerciseStats.exerciseCount} 道但只有 ${exerciseStats.answerCount} 道有答案`
            : "";
  return reason;
}

function countPattern(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (String(text || "").match(new RegExp(pattern.source, flags)) || []).length;
}

function requireMetric(issues, passed, code, message) {
  if (!passed) issues.push({ code, message });
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  VALIDATOR_VERSION,
  validateStudyNoteQuality,
  countEffectiveChinese,
  extractStudyNoteSections,
};
