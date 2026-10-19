/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const VALIDATOR_VERSION = "quiz-pack-quality-v1";
const MIN_QUESTIONS = 12;
const MAX_QUESTIONS = 16;
const MIN_KNOWLEDGE_POINTS = 5;
const MAX_SINGLE_KNOWLEDGE_POINT_SHARE = 0.4;
const MIN_UNDERSTANDING_APPLICATION_SHARE = 0.3;
const MIN_SCENARIO_PROCESS_QUESTIONS = 2;
const MIN_MISCONCEPTION_QUESTIONS = 3;
const MIN_ANALYSIS_CHINESE_CHARS = 50;
const MIN_KEY_ANALYSIS_CHINESE_CHARS = 100;
const SIMILAR_STEM_THRESHOLD = 0.96;
const UNSAFE_PATTERN =
  /<\/?(?:script|iframe|object|embed|svg|form|style|img|a)\b|\bon\w+\s*=|javascript:|data:text\/html|vbscript:|https?:\/\//i;
const INTERNAL_PATTERN =
  /(?:ResourceAgent|ReviewAgent|Prompt|system prompt|chain[- ]?of[- ]?thought|api[_-]?key|SPARK_API_KEY|数据库ID|retrievalRunId|chunkId|generation_id|provider)/i;
const FAKE_CITATION_PATTERN = /\[S\d+\]|sourceRef|citation|引用\s*\d+/i;

function validateQuizPackQuality(input = {}) {
  const content = input.content && input.content.content ? input.content.content : input.content;
  const context = input.context || {};
  const issues = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return failedResult("invalid_content", "quiz_pack 内容必须是对象。", context);
  }

  const questions = Array.isArray(content.questions) ? content.questions : [];
  const evidenceById = new Map(
    (context.questionEvidence || []).map((item) => [String(item.questionId), item]),
  );
  const allowedIds = new Set(context.allowedQuestionIds || []);
  const ids = questions.map((question) => String(question?.questionId || "").trim()).filter(Boolean);
  const duplicateIds = countDuplicates(ids);
  const invalidIds = ids.filter((id) => !allowedIds.has(id) || !evidenceById.has(id));
  const difficultyTotal = sumDifficultyDistribution(content.difficultyDistribution);
  const primaryKnowledgePoints = questions
    .map((question) => normalizeKnowledgePoint(question?.knowledgePoints?.[0]))
    .filter(Boolean);
  const primaryCounts = countValues(primaryKnowledgePoints);
  const maxPrimaryCount = primaryCounts.size ? Math.max(...primaryCounts.values()) : 0;
  const understandingApplication = questions.filter(isUnderstandingOrApplicationQuestion).length;
  const scenarioProcess = questions.filter(isScenarioProcessQuestion).length;
  const misconception = questions.filter(isMisconceptionQuestion).length;
  const allTexts = questions.map((question) => questionText(question)).join("\n");
  const optionIssues = questions.filter((question) => !hasFourDistinctOptions(question)).length;
  const answerIssues = questions.filter(
    (question) => !hasValidAnswer(question, evidenceById.get(String(question?.questionId || ""))),
  ).length;
  const hintLeakIssues = questions.filter((question) => leaksAnswerInPromptOrHint(question)).length;
  const analysisTooShort = questions.filter(
    (question) => countEffectiveChinese(question?.analysis) < MIN_ANALYSIS_CHINESE_CHARS,
  ).length;
  const keyAnalysisTooShort = questions.filter(
    (question) =>
      isScenarioProcessQuestion(question) &&
      countEffectiveChinese(question?.analysis) < MIN_KEY_ANALYSIS_CHINESE_CHARS,
  ).length;
  const unsupportedTypes = questions.filter(
    (question) => String(question?.questionType || "").trim() !== "single_choice",
  ).length;
  const scoringPointLeaks = questions.filter(
    (question) => Array.isArray(question?.scoringPoints) && question.scoringPoints.length > 0,
  ).length;
  const normalizedStems = questions
    .map((question) => normalizeText(question?.stem))
    .filter((item) => item.length >= 12);
  const duplicateStemCount = countDuplicates(normalizedStems);
  const duplicateStemRatio = duplicateTextRatio(questions.map((question) => question?.stem));
  const similarStemPairs = countSimilarPairs(normalizedStems, SIMILAR_STEM_THRESHOLD);
  const publicTextUnsafe = UNSAFE_PATTERN.test(allTexts);
  const internalTerms = INTERNAL_PATTERN.test(allTexts);
  const fakeCitations = FAKE_CITATION_PATTERN.test(allTexts);

  requireMetric(
    issues,
    questions.length >= MIN_QUESTIONS && questions.length <= MAX_QUESTIONS,
    "invalid_question_count",
    `题量 ${questions.length}，应为 ${MIN_QUESTIONS} 到 ${MAX_QUESTIONS} 道。`,
  );
  requireMetric(
    issues,
    difficultyTotal === questions.length,
    "difficulty_distribution_mismatch",
    `难度分布合计 ${difficultyTotal}，题量 ${questions.length}。`,
  );
  requireMetric(
    issues,
    invalidIds.length === 0,
    "invalid_question_ids",
    `发现无效或不在当前上下文允许范围内的题号：${invalidIds.slice(0, 5).join("、") || "空题号"}`,
  );
  requireMetric(issues, duplicateIds === 0, "duplicate_question_ids", `重复题号数量 ${duplicateIds}。`);
  requireMetric(
    issues,
    unsupportedTypes === 0,
    "unsupported_question_type",
    "当前答题链路只支持 single_choice。",
  );
  requireMetric(
    issues,
    optionIssues === 0,
    "invalid_options",
    `存在 ${optionIssues} 道题没有四个互不重复的选项。`,
  );
  requireMetric(
    issues,
    answerIssues === 0,
    "answer_mismatch",
    `存在 ${answerIssues} 道题答案不是 A-D 或与真实题库答案不一致。`,
  );
  requireMetric(
    issues,
    scoringPointLeaks === 0,
    "scoring_points_not_supported",
    "选择题练习包不得暴露主观评分点。",
  );
  requireMetric(
    issues,
    primaryCounts.size >= MIN_KNOWLEDGE_POINTS,
    "insufficient_knowledge_coverage",
    `知识点或机制数量 ${primaryCounts.size}，低于 ${MIN_KNOWLEDGE_POINTS}。`,
  );
  requireMetric(
    issues,
    questions.length === 0 || maxPrimaryCount / questions.length <= MAX_SINGLE_KNOWLEDGE_POINT_SHARE,
    "single_knowledge_point_overweight",
    `单一知识点最高占比 ${questions.length ? Math.round((maxPrimaryCount / questions.length) * 100) : 0}%。`,
  );
  requireMetric(
    issues,
    questions.length === 0 ||
      understandingApplication / questions.length >= MIN_UNDERSTANDING_APPLICATION_SHARE,
    "insufficient_understanding_application",
    `理解/应用题占比 ${questions.length ? Math.round((understandingApplication / questions.length) * 100) : 0}%。`,
  );
  requireMetric(
    issues,
    scenarioProcess >= MIN_SCENARIO_PROCESS_QUESTIONS,
    "insufficient_scenario_process_questions",
    `场景、代码、流程或状态推演题 ${scenarioProcess} 道。`,
  );
  requireMetric(
    issues,
    misconception >= MIN_MISCONCEPTION_QUESTIONS,
    "insufficient_misconception_questions",
    `误区辨析题 ${misconception} 道。`,
  );
  requireMetric(
    issues,
    analysisTooShort === 0,
    "analysis_too_short",
    `存在 ${analysisTooShort} 道题解析低于 ${MIN_ANALYSIS_CHINESE_CHARS} 个有效中文字符。`,
  );
  requireMetric(
    issues,
    keyAnalysisTooShort === 0,
    "key_analysis_too_short",
    `存在 ${keyAnalysisTooShort} 道关键应用题解析低于 ${MIN_KEY_ANALYSIS_CHINESE_CHARS} 个有效中文字符。`,
  );
  requireMetric(
    issues,
    hintLeakIssues === 0,
    "answer_leak_in_stem_or_hint",
    `存在 ${hintLeakIssues} 道题在题干或提示中泄露答案。`,
  );
  requireMetric(
    issues,
    duplicateStemCount === 0 && similarStemPairs === 0,
    "duplicate_or_similar_questions",
    `重复题干数量 ${duplicateStemCount}，重复题干比例 ${duplicateStemRatio}，相似题干对 ${similarStemPairs}。`,
  );
  requireMetric(issues, !publicTextUnsafe, "unsafe_content", "测验包包含 HTML、脚本或外部 URL。");
  requireMetric(
    issues,
    !internalTerms,
    "internal_terms_leaked",
    "测验包包含内部实现字段、Prompt 或 Agent 名称。",
  );
  requireMetric(issues, !fakeCitations, "fake_citations", "测验包不得生成虚构引用或课程资料编号。");

  return {
    passed: issues.length === 0,
    questionCount: questions.length,
    difficultyTotal,
    uniqueQuestionIds: new Set(ids).size,
    invalidQuestionIds: invalidIds,
    duplicateQuestionIds: duplicateIds,
    knowledgePointCount: primaryCounts.size,
    maxKnowledgePointShare: questions.length ? Number((maxPrimaryCount / questions.length).toFixed(3)) : 0,
    understandingApplicationCount: understandingApplication,
    understandingApplicationShare: questions.length
      ? Number((understandingApplication / questions.length).toFixed(3))
      : 0,
    scenarioProcessCount: scenarioProcess,
    misconceptionCount: misconception,
    answerMismatchCount: answerIssues,
    answerLeakCount: hintLeakIssues,
    analysisTooShortCount: analysisTooShort,
    keyAnalysisTooShortCount: keyAnalysisTooShort,
    duplicateStemCount,
    duplicateStemRatio,
    similarStemPairs,
    issues,
    checks: buildChecks({
      questionCount: questions.length,
      invalidIds,
      duplicateIds,
      primaryCounts,
      maxPrimaryCount,
      understandingApplication,
      scenarioProcess,
      misconception,
      answerIssues,
      hintLeakIssues,
      analysisTooShort,
      keyAnalysisTooShort,
      duplicateStemCount,
      duplicateStemRatio,
      similarStemPairs,
    }),
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function failedResult(code, message, context) {
  const issues = [{ code, message }];
  return {
    passed: false,
    questionCount: 0,
    difficultyTotal: 0,
    uniqueQuestionIds: 0,
    invalidQuestionIds: [],
    duplicateQuestionIds: 0,
    knowledgePointCount: 0,
    maxKnowledgePointShare: 0,
    understandingApplicationCount: 0,
    understandingApplicationShare: 0,
    scenarioProcessCount: 0,
    misconceptionCount: 0,
    answerMismatchCount: 0,
    answerLeakCount: 0,
    analysisTooShortCount: 0,
    keyAnalysisTooShortCount: 0,
    duplicateStemCount: 0,
    duplicateStemRatio: 0,
    similarStemPairs: 0,
    issues,
    checks: buildChecks({
      questionCount: 0,
      invalidIds: [],
      duplicateIds: 0,
      primaryCounts: new Map(),
      maxPrimaryCount: 0,
      understandingApplication: 0,
      scenarioProcess: 0,
      misconception: 0,
      answerIssues: 0,
      hintLeakIssues: 0,
      analysisTooShort: 0,
      keyAnalysisTooShort: 0,
      duplicateStemCount: 0,
      duplicateStemRatio: 0,
      similarStemPairs: 0,
    }),
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
    contextSubject: context.subject,
    contextKnowledgePoint: context.knowledgePoint,
  };
}

function buildChecks(metrics) {
  const total = metrics.questionCount || 0;
  return [
    { name: "题量范围", passed: total >= MIN_QUESTIONS && total <= MAX_QUESTIONS, detail: `题量 ${total}` },
    {
      name: "真实题库题号",
      passed: metrics.invalidIds.length === 0 && metrics.duplicateIds === 0,
      detail: `无效 ${metrics.invalidIds.length}，重复 ${metrics.duplicateIds}`,
    },
    { name: "作答兼容", passed: metrics.answerIssues === 0, detail: `答案不一致 ${metrics.answerIssues}` },
    {
      name: "知识点覆盖",
      passed:
        metrics.primaryCounts.size >= MIN_KNOWLEDGE_POINTS &&
        (!total || metrics.maxPrimaryCount / total <= MAX_SINGLE_KNOWLEDGE_POINT_SHARE),
      detail: `机制 ${metrics.primaryCounts.size}，最高占比 ${total ? Math.round((metrics.maxPrimaryCount / total) * 100) : 0}%`,
    },
    {
      name: "理解应用比例",
      passed: total > 0 && metrics.understandingApplication / total >= MIN_UNDERSTANDING_APPLICATION_SHARE,
      detail: `理解/应用 ${metrics.understandingApplication}/${total}`,
    },
    {
      name: "场景流程与误区",
      passed:
        metrics.scenarioProcess >= MIN_SCENARIO_PROCESS_QUESTIONS &&
        metrics.misconception >= MIN_MISCONCEPTION_QUESTIONS,
      detail: `场景流程 ${metrics.scenarioProcess}，误区 ${metrics.misconception}`,
    },
    {
      name: "解析与答案安全",
      passed:
        metrics.analysisTooShort === 0 && metrics.keyAnalysisTooShort === 0 && metrics.hintLeakIssues === 0,
      detail: `短解析 ${metrics.analysisTooShort}，关键短解析 ${metrics.keyAnalysisTooShort}，泄露 ${metrics.hintLeakIssues}`,
    },
    {
      name: "重复相似题控制",
      passed: metrics.duplicateStemCount === 0 && metrics.similarStemPairs === 0,
      detail: `重复 ${metrics.duplicateStemCount}，重复比例 ${metrics.duplicateStemRatio}，相似题 ${metrics.similarStemPairs}`,
    },
  ];
}

function hasFourDistinctOptions(question) {
  const options = Array.isArray(question?.options) ? question.options.map(normalizeText).filter(Boolean) : [];
  return options.length === 4 && new Set(options).size === 4;
}

function hasValidAnswer(question, evidence) {
  const answer = String(question?.correctAnswer || "")
    .trim()
    .toUpperCase();
  if (!/^[A-D]$/.test(answer)) return false;
  if (!evidence) return false;
  return (
    answer ===
    String(evidence.answer || "")
      .trim()
      .toUpperCase()
  );
}

function leaksAnswerInPromptOrHint(question) {
  const answer = String(question?.correctAnswer || "")
    .trim()
    .toUpperCase();
  const options = Array.isArray(question?.options) ? question.options : [];
  const correctOption = options[answer.charCodeAt(0) - 65] || "";
  const visible = `${question?.stem || ""}\n${question?.personalizedHint || ""}`;
  if (
    answer &&
    new RegExp(`(?:答案|正确选项|应选|选择|选)\\s*(?:是|为|[:：])?\\s*${answer}(?![A-Za-z])`, "i").test(
      visible,
    )
  )
    return true;
  if (
    correctOption &&
    normalizeText(correctOption).length >= 8 &&
    normalizeText(visible).includes(normalizeText(correctOption))
  )
    return true;
  return false;
}

function isUnderstandingOrApplicationQuestion(question) {
  const text = questionText(question);
  return /理解|分析|推演|判断|应用|场景|过程|为什么|如何|比较|计算|设计|执行|状态|变化|条件|边界|案例|代码|报文|调度/.test(
    text,
  );
}

function isScenarioProcessQuestion(question) {
  const text = questionText(question);
  return /场景|案例|代码|流程|过程|如果|当|模拟|执行|状态|报文|握手|释放|插入|删除|旋转|调度|上下文|时间片|序列号|ACK|SYN|FIN|TIME_WAIT|伪代码|指针/.test(
    text,
  );
}

function isMisconceptionQuestion(question) {
  const text = questionText(question);
  return /错误|误区|混淆|不正确|不是|不能|避免|原因|忽略|误判|陷阱|反例|纠正|区分/.test(text);
}

function questionText(question) {
  return [
    question?.stem,
    ...(Array.isArray(question?.options) ? question.options : []),
    question?.analysis,
    question?.personalizedHint,
    ...(Array.isArray(question?.knowledgePoints) ? question.knowledgePoints : []),
  ]
    .map((item) => String(item || ""))
    .join("\n");
}

function sumDifficultyDistribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return ["foundation", "intermediate", "advanced"].reduce((sum, key) => sum + safeInt(value[key]), 0);
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function duplicateTextRatio(values) {
  const normalized = values.map(normalizeText).filter((item) => item.length >= 12);
  if (normalized.length < 2) return 0;
  return Number(((normalized.length - new Set(normalized).size) / normalized.length).toFixed(3));
}

function countSimilarPairs(values, threshold) {
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i] !== values[j] && similarity(values[i], values[j]) >= threshold) count += 1;
    }
  }
  return count;
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

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeKnowledgePoint(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

function countEffectiveChinese(text) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`{1,3}|#{1,6}|[*_>\-+|[\](){}$]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  return (cleaned.match(/[\p{Script=Han}]/gu) || []).length;
}

function requireMetric(issues, passed, code, message) {
  if (!passed) issues.push({ code, message });
}

function safeInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

module.exports = {
  VALIDATOR_VERSION,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  validateQuizPackQuality,
  countEffectiveChinese,
};
