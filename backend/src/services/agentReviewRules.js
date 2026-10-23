/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 智能体产出的确定性审核规则
 * ---------------------------------------------------------------------------
 * 多智能体协作能不能形成「闭环」，关键不在于多叫几次模型，而在于**审核这一步能不能给出
 * 可判定的结论**：通过 / 不通过，以及不通过时具体哪里不合格。
 *
 * ReviewAgent.reviewChat 已经做到了这点（返回 { passed, issues, checks }），所以答疑流程
 * 天然是「生成 → 审核 → 打回重写」的闭环。本模块把同样的能力补齐给其它智能体产出：
 *
 *   - reviewResourceContent  讲义/资料：必需章节、篇幅、主题贴合、按科目要求代码示例
 *   - reviewQuestions        出题：选项数、答案下标合法性、题干重复、解析完整
 *   - reviewWrongQuestion    错题归因：是否给出知识点归因、原因与可执行建议
 *   - reviewAssessment       学情评估：结论里的数字必须与输入事实一致，不得编造
 *
 * 全部是纯函数、不调用模型：快、稳、可测试，因此可以放心地放在闭环里反复执行。
 */

const RESOURCE_REQUIRED_SECTIONS = [
  { key: "学习目标", patterns: [/学习目标/, /学习目的/, /目标/] },
  { key: "核心概念", patterns: [/核心概念/, /概念/, /知识梳理/] },
  { key: "例题讲解", patterns: [/例题/, /示例/, /案例/, /讲解/] },
  { key: "易错点", patterns: [/易错/, /常见错误/, /注意事项/, /误区/] },
  { key: "巩固练习", patterns: [/练习/, /巩固/, /习题/, /自测/] },
];

const CODE_SUBJECT_PATTERN = /(?:C\s*语言|C\+\+|数据结构|算法|Python|编程|代码)/i;
const CODE_HINT_PATTERN = /```[\s\S]*?```|#include|printf|def\s+\w+\(|int\s+main|for\s*\(|while\s*\(/;

function toText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function issue(code, message) {
  return { code, message };
}

function pushIf(list, condition, code, message) {
  if (condition) list.push(issue(code, message));
}

/**
 * 讲义 / 学习资料审核
 */
function reviewResourceContent(content, context = {}) {
  const text = toText(content);
  const issues = [];
  const checks = {};

  const length = text.trim().length;
  checks.length = length;
  pushIf(issues, length < 400, "resource_too_short", `资料正文只有 ${length} 字，内容过于单薄`);

  const missingSections = RESOURCE_REQUIRED_SECTIONS.filter(
    (section) => !section.patterns.some((pattern) => pattern.test(text)),
  ).map((section) => section.key);
  checks.missingSections = missingSections;
  pushIf(
    issues,
    missingSections.length > 0,
    "resource_missing_sections",
    `缺少必需章节：${missingSections.join("、")}`,
  );

  const subject = String(context.subject || "");
  const topic = String(context.topic || context.knowledgePoint || "");
  const needsCode = CODE_SUBJECT_PATTERN.test(`${subject} ${topic}`);
  checks.needsCode = needsCode;
  if (needsCode) {
    pushIf(
      issues,
      !CODE_HINT_PATTERN.test(text),
      "resource_missing_code",
      "该科目要求包含代码示例，但正文里没有可识别的代码块",
    );
  }

  if (topic && topic.length >= 2) {
    const mentioned = text.includes(topic) || text.slice(0, 600).includes(topic.slice(0, 2));
    checks.topicMentioned = mentioned;
    pushIf(issues, !mentioned, "resource_off_topic", `正文几乎没有提到主题「${topic}」，可能偏离了生成目标`);
  }

  // 模型把内部提示词/智能体名回吐给学生的经典事故，必须在闭环里挡掉
  const leaked =
    /(?:system prompt|systemPrompt|ResourceAgent|ReviewAgent|ProfileAgent|内部提示词|以下是提示词)/i.test(
      text,
    );
  pushIf(issues, leaked, "resource_prompt_leak", "正文里出现了内部提示词或智能体名称，属于泄漏");

  return { passed: issues.length === 0, issues, checks };
}

/**
 * 题目审核：结构合法性 + 重复检测
 */
function reviewQuestions(questions, context = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const issues = [];
  const checks = { count: list.length };

  pushIf(issues, list.length === 0, "quiz_empty", "没有生成任何题目");

  const seenStems = new Set(
    Array.isArray(context.existingStems) ? context.existingStems.map((item) => normalizeStem(item)) : [],
  );
  let duplicateCount = 0;

  list.forEach((question, index) => {
    const order = index + 1;
    const stem = String(question?.stem || question?.questionText || "").trim();
    const options = Array.isArray(question?.options)
      ? question.options.map((item) => String(item || "").trim())
      : [];
    const answerIndex = Number(question?.answerIndex);

    if (!stem) issues.push(issue("quiz_missing_stem", `第 ${order} 题缺少题干`));
    if (options.length !== 4)
      issues.push(issue("quiz_option_count", `第 ${order} 题选项数为 ${options.length}，必须为 4 个`));
    if (options.some((option) => !option))
      issues.push(issue("quiz_empty_option", `第 ${order} 题存在空选项`));
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      issues.push(issue("quiz_answer_index", `第 ${order} 题的正确答案下标不合法`));
    }
    if (!String(question?.analysis || question?.explanation || "").trim()) {
      issues.push(issue("quiz_missing_analysis", `第 ${order} 题缺少解析`));
    }

    const key = normalizeStem(stem);
    if (key && seenStems.has(key)) {
      duplicateCount += 1;
      issues.push(issue("quiz_duplicate_stem", `第 ${order} 题与已有题目重复`));
    }
    if (key) seenStems.add(key);
  });

  checks.duplicateCount = duplicateCount;
  return { passed: issues.length === 0, issues: dedupe(issues), checks };
}

function normalizeStem(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，。？！、；：""''（）()【】\[\]]/g, "")
    .slice(0, 60);
}

/**
 * 错题归因审核：必须给出知识点归因、错因和可执行建议，且不得声称使用了没给它的资料
 */
function reviewWrongQuestionFeedback(feedback, context = {}) {
  const text = toText(feedback);
  const issues = [];
  const checks = { length: text.trim().length };

  pushIf(issues, text.trim().length < 40, "wrong_question_too_short", "归因结果过于简短，无法支撑复习建议");

  const hasKnowledgePoint = /知识点|考点|章节/.test(text);
  const hasReason = /原因|错因|为什么|误区|混淆/.test(text);
  const hasSuggestion = /建议|下一步|复习|练习|改进/.test(text);
  checks.hasKnowledgePoint = hasKnowledgePoint;
  checks.hasReason = hasReason;
  checks.hasSuggestion = hasSuggestion;

  pushIf(issues, !hasKnowledgePoint, "wrong_question_missing_point", "没有明确指出对应的知识点");
  pushIf(issues, !hasReason, "wrong_question_missing_reason", "没有分析出错原因");
  pushIf(issues, !hasSuggestion, "wrong_question_missing_suggestion", "没有给出下一步复习建议");

  const evidenceProvided = Number(context.evidenceCount || 0) > 0;
  const claimsEvidence = /\[S\d+\]|根据(?:课程)?资料|依据(?:课程)?资料/.test(text);
  if (!evidenceProvided && claimsEvidence) {
    issues.push(issue("wrong_question_fake_evidence", "未提供课程证据却声称依据资料作答"));
  }

  return { passed: issues.length === 0, issues: dedupe(issues), checks };
}

/**
 * 学情评估审核：结论里的关键数字必须能对回输入事实
 */
function reviewAssessment(facts, context = {}) {
  const text = toText(facts);
  const issues = [];
  const checks = { length: text.trim().length };

  pushIf(issues, text.trim().length < 40, "assessment_too_short", "评估结论过于简短");

  const percentClaims = [...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
  const allowed = new Set(
    (Array.isArray(context.allowedPercentages) ? context.allowedPercentages : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.round(value * 10) / 10),
  );
  const unexpected = percentClaims.filter((value) => !allowed.has(Math.round(value * 10) / 10));
  checks.percentClaims = percentClaims;
  checks.unexpectedPercentages = unexpected;
  if (allowed.size > 0 && unexpected.length > 0) {
    issues.push(
      issue(
        "assessment_unsupported_number",
        `结论里出现了输入数据中不存在的百分比：${unexpected.slice(0, 3).join("%、")}%`,
      ),
    );
  }

  return { passed: issues.length === 0, issues: dedupe(issues), checks };
}

function dedupe(issues) {
  const seen = new Set();
  return issues.filter((item) => {
    const key = `${item.code}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  RESOURCE_REQUIRED_SECTIONS,
  reviewAssessment,
  reviewQuestions,
  reviewResourceContent,
  reviewWrongQuestionFeedback,
};
