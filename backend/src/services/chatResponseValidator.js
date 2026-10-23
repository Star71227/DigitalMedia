/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const PLACEHOLDER_PATTERNS = [
  /理解核心概念/g,
  /识别条件/g,
  /执行步骤/g,
  /验证结果/g,
  /注意边界情况/g,
  /根据定义判断/g,
  /通过练习加深理解/g,
  /逐步核对条件和结果/g,
];

function validateChatResponse(input = {}) {
  const answerMarkdown = String(input.answerMarkdown || "").trim();
  const plainText = stripMarkdown(answerMarkdown);
  const characterCount = Array.from(plainText.replace(/\s/g, "")).length;
  const sectionCount = (answerMarkdown.match(/^#{1,3}\s+\S+/gm) || []).length;
  const codeBlocks = extractCodeBlocks(answerMarkdown);
  const exampleCount = countMatches(answerMarkdown, /完整示例|具体示例|数值示例|举例|例如|例子/g);
  const misconceptionCount = countMisconceptions(answerMarkdown);
  const practiceCount = countMatches(answerMarkdown, /检查理解|理解检查|思考题|巩固练习|练习题/g);
  const placeholderMatches = PLACEHOLDER_PATTERNS.reduce(
    (count, pattern) => count + countMatches(answerMarkdown, pattern),
    0,
  );
  const repeatedContentRatio = calculateRepeatedContentRatio(answerMarkdown);
  const issues = [];
  const complex = input.complexity !== false && !input.conversational;

  if (input.conversational && /变式|出题|生成.{0,8}题|给出.{0,8}题/.test(input.message || "")) {
    const requested = String(input.message).match(/([1-9]|[一二三四五六七八九十])道/);
    const count = requested ? Number(requested[1]) || "一二三四五六七八九十".indexOf(requested[1]) + 1 : 0;
    const numbered = [
      ...answerMarkdown.matchAll(
        /(?:^|\n)\s*(?:#{1,3}\s*)?(?:第|题目|变式题|题)?\s*[1-9一二三四五六七八九十]+(?:[.、）:：题]|\s)/g,
      ),
    ].length;
    if (count > 1 && numbered < count)
      issues.push(issue("missing_questions", "用户要求多道题，请逐题编号，题量必须足够"));
    const stems = [
      ...answerMarkdown.matchAll(/^\s*(?:#{1,3}\s*)?(?:第)?[1-9一二三四五六七八九十]+[.、）题][^\n]*$/gm),
    ]
      .map((m) => m[0].replace(/^[\s#第1-9一二三四五六七八九十.、）题]+/, "").trim())
      .filter((s) => s.length > 10);
    const sections = answerMarkdown.split(/^### 第[1-9一二三四五六七八九十]+题\s*$/m).slice(1);
    const questionStems = sections
      .map((part) => (part.match(/[^\n？?]+[？?]/)?.[0] || "").replace(/[\s#【】题目]/g, ""))
      .filter(Boolean);
    if (new Set(questionStems).size < questionStems.length)
      issues.push(issue("duplicate_questions", "变式题重复了同一题干"));
    if (new Set(stems).size < stems.length)
      issues.push(issue("duplicate_questions", "变式题题干重复，请生成不同条件或考点的题目"));
  }
  if (!answerMarkdown) issues.push(issue("empty_answer", "回答内容为空"));
  if (complex && characterCount < 600)
    issues.push(issue("answer_too_short", `有效内容仅 ${characterCount} 个字符，复杂问题至少需要 600 个`));
  if (complex && sectionCount < 3)
    issues.push(issue("insufficient_sections", `有效小节仅 ${sectionCount} 个，复杂问题至少需要 3 个`));
  if (complex && exampleCount < 1) issues.push(issue("missing_example", "缺少完整具体示例"));
  if (complex && input.requiresCode && codeBlocks.length < 1)
    issues.push(issue("missing_code", "算法或编程问题缺少代码或完整伪代码"));
  if (complex && misconceptionCount < 3)
    issues.push(issue("insufficient_misconceptions", `具体易错点仅 ${misconceptionCount} 个，至少需要 3 个`));
  if (complex && practiceCount < 1) issues.push(issue("missing_comprehension_check", "缺少检查理解的问题"));
  if (complex && (!Array.isArray(input.followups) || input.followups.length < 2))
    issues.push(issue("missing_followups", "缺少至少两个可继续追问的问题"));
  if (containsEmptyMain(answerMarkdown)) issues.push(issue("empty_main_placeholder", "包含空 main 占位代码"));
  if (!/题|测验|选项/.test(input.message || "") && containsGenericFourOptions(answerMarkdown))
    issues.push(issue("generic_multiple_choice", "包含与回答无关的通用四选项模板"));
  if (/本次是出题任务|sourceIndex填|analysis只解释答案|返回一个 JSON 对象/.test(answerMarkdown))
    issues.push(issue("instruction_copy", "回答复述了格式指令，需要重新生成"));
  if (containsAgentLogs(answerMarkdown))
    issues.push(issue("agent_log_content", "回答中混入 Agent 或检索过程日志"));
  if (placeholderMatches >= 3) issues.push(issue("placeholder_heavy", "回答大量使用空泛模板短语"));
  if (repeatedContentRatio > 0.28) issues.push(issue("repeated_content", "回答存在较多重复内容"));
  // 相关性检查只在「问的确实是课程内容」时才执行。
  // 以前的写法对任何提问都强制要求：回答里必须出现问题或知识点里的词，否则判 answer_irrelevant。
  // 结果是学生问天气、让写首诗这类与课程无关的问题，模型答得好好的（甚至礼貌说明自己只管学习），
  // 却因为没有复述问题里的词被判不合格，前端直接收到 502 —— 表现就是"AI 助手很多问题答不了"。
  if (
    asksAboutCourseContent(input.message, input.knowledgePoint) &&
    !isRelevant(answerMarkdown, input.message, input.knowledgePoint)
  ) {
    issues.push(issue("answer_irrelevant", "回答与用户问题或知识点明显不一致"));
  }
  if (!input.conversational) issues.push(...validateTopicAcceptance(answerMarkdown, input.knowledgePoint));
  if (input.conversational && characterCount < 12)
    issues.push(issue("answer_too_short", "回答内容不足，请提供具体解释"));
  for (const citationIssue of input.citationIssues || []) {
    issues.push(issue("invalid_citation", publicCitationIssue(citationIssue)));
  }

  return {
    passed: issues.length === 0,
    characterCount,
    sectionCount,
    codeBlockCount: codeBlocks.length,
    exampleCount,
    misconceptionCount,
    practiceCount,
    placeholderMatches,
    repeatedContentRatio: Number(repeatedContentRatio.toFixed(3)),
    issues,
  };
}

function validateTopicAcceptance(answerMarkdown, knowledgePoint) {
  const answer = String(answerMarkdown || "");
  const point = String(knowledgePoint || "");
  const issues = [];
  if (/红黑树左旋/.test(point)) {
    const requirements = [
      [/A\s*<\s*x\s*<\s*B\s*<\s*y\s*<\s*C/i, "A < x < B < y < C 的大小关系"],
      [/y\s*=\s*x\s*->\s*right/i, "y = x->right"],
      [/x\s*->\s*right\s*=\s*y\s*->\s*left/i, "B 子树移动到 x->right"],
      [/(?:y\s*->\s*left|B)\s*->\s*parent\s*=\s*x|B.{0,20}父指针.{0,20}x/is, "B 子树父指针更新"],
      [/root\s*=\s*y|parent\s*->\s*(?:left|right)\s*=\s*y|原父结点.{0,30}y/is, "x 原父结点或 root 更新"],
      [/y\s*->\s*left\s*=\s*x/i, "y->left = x"],
      [/x\s*->\s*parent\s*=\s*y/i, "x->parent = y"],
      [/leftRotate|rotateLeft/i, "完整 leftRotate 或 rotateLeft 实现"],
      [/(?:x|键|key)\s*[=.：为]\s*10|10.{0,20}15.{0,20}20/is, "具体数值示例"],
    ];
    const missing = requirements.filter(([pattern]) => !pattern.test(answer)).map(([, label]) => label);
    if (missing.length)
      issues.push(issue("red_black_acceptance_missing", `红黑树硬验收缺少：${missing.join("、")}`));
  }
  if (/红黑树右旋/.test(point)) {
    const requirements = [
      [/A\s*<\s*x\s*<\s*B\s*<\s*y\s*<\s*C/i, "A < x < B < y < C 的大小关系"],
      [/镜像.{0,30}左旋|左旋.{0,30}镜像/is, "左右旋镜像关系"],
      [/x\s*=\s*y\s*->\s*left/i, "x = y->left"],
      [/y\s*->\s*left\s*=\s*x\s*->\s*right/i, "B 子树移动到 y->left"],
      [/x\s*->\s*right\s*=\s*y/i, "x->right = y"],
      [/y\s*->\s*parent\s*=\s*x/i, "y->parent = x"],
      [/rightRotate|rotateRight/i, "完整 rightRotate 或 rotateRight 实现"],
    ];
    const missing = requirements.filter(([pattern]) => !pattern.test(answer)).map(([, label]) => label);
    if (missing.length)
      issues.push(issue("red_black_right_acceptance_missing", `红黑树右旋硬验收缺少：${missing.join("、")}`));
  }
  if (/TCP三次握手/.test(point)) {
    const requirements = [
      [/初始序列号|\bISN\b|seq\s*=|序列号\s*[xy]/i, "双方初始序列号同步"],
      [/双向.{0,20}(?:收发|通信|发送|接收)|发送能力.{0,20}接收能力/is, "双向收发能力确认"],
      [
        /(?:第三次|最后一次).{0,20}ACK.{0,100}(?:客户端.{0,30}(?:收到|接收).{0,30}(?:服务端|SYN|序列号|y)|服务端.{0,30}确认.{0,30}客户端)/is,
        "第三次 ACK 确认客户端收到服务端 SYN/序列号",
      ],
      [/旧\s*SYN|延迟.{0,20}(?:SYN|报文)|过期.{0,20}(?:连接|请求)/is, "旧 SYN 或延迟报文风险"],
      [
        /第二次.{0,60}(?:无法|不能|尚未).{0,50}(?:收到|接收).{0,30}(?:服务端|序列号|y)/is,
        "第二次后服务端仍不能确认客户端收到服务端序列号",
      ],
      [/ACK.{0,20}(?:丢失|丢包).{0,80}重传|重传.{0,50}SYN\+?ACK/is, "ACK 丢失与重传行为"],
    ];
    const missing = requirements.filter(([pattern]) => !pattern.test(answer)).map(([, label]) => label);
    if (missing.length) issues.push(issue("tcp_acceptance_missing", `TCP 硬验收缺少：${missing.join("、")}`));
  }
  return issues;
}

function extractCodeBlocks(markdown) {
  const blocks = [];
  const pattern = /```([a-zA-Z0-9+#-]*)\s*\n?([\s\S]*?)```/g;
  let match = pattern.exec(String(markdown || ""));
  while (match) {
    blocks.push({ language: normalizeLanguage(match[1]), code: match[2].trim() });
    match = pattern.exec(String(markdown || ""));
  }
  return blocks;
}

function countMisconceptions(markdown) {
  const source = String(markdown || "");
  const heading = /^#{1,3}\s*(?:易错点|常见错误|常见误区)[^\n]*$/im.exec(source);
  let section = "";
  if (heading) {
    const remainder = source.slice(heading.index + heading[0].length).replace(/^\r?\n/, "");
    const nextHeading = remainder.search(/^#{1,3}\s+\S+/m);
    section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  }
  const listCount = (section.match(/^\s*(?:\d+[.)、]|[-*])\s+\S+/gm) || []).length;
  if (listCount) return listCount;
  return Math.min(10, countMatches(source, /易错|误区|不要|切勿|忘记|混淆/g));
}

function calculateRepeatedContentRatio(markdown) {
  const paragraphs = String(markdown || "")
    .split(/\n{2,}/)
    .map((item) => stripMarkdown(item).replace(/\s+/g, ""))
    .filter((item) => item.length >= 20);
  if (!paragraphs.length) return 0;
  const seen = new Set();
  let repeated = 0;
  let total = 0;
  for (const paragraph of paragraphs) {
    total += paragraph.length;
    if (seen.has(paragraph)) repeated += paragraph.length;
    seen.add(paragraph);
  }
  return total ? repeated / total : 0;
}

function containsEmptyMain(markdown) {
  return /int\s+main\s*\([^)]*\)\s*\{\s*(?:printf\s*\([^;]*\)\s*;\s*)?return\s+0\s*;\s*\}/is.test(
    String(markdown || ""),
  );
}

function containsGenericFourOptions(markdown) {
  const options = String(markdown || "").match(/^\s*[A-D][.、)]\s+.+$/gm) || [];
  return new Set(options.map((item) => item.trim()[0])).size === 4;
}

function containsAgentLogs(markdown) {
  return /多智能体协同|ProfileAgent|CodeAgent|ReviewAgent\s*审核|检索运行\s*#|Agent\s*日志|内部\s*trace/i.test(
    String(markdown || ""),
  );
}

const COURSE_CONTENT_PATTERN =
  /(?:tcp|udp|http|https|ip|cache|avl|bfs|dfs|python|malloc|sql|红黑树|二叉树|二叉搜索树|左旋|右旋|中序|前序|后序|握手|进程|线程|死锁|调度|虚拟内存|分页|段页|流水线|补码|原码|指针|结构体|生成器|装饰器|栈|队列|数组|链表|递归|算法|复杂度|排序|查找|哈希|散列|图|树|结点|节点|遍历|面试题|这道题|作业|考试|课程|知识点|答案|解析)/i;

function asksAboutCourseContent(message, knowledgePoint) {
  const text = `${String(message || "")} ${String(knowledgePoint || "")}`.trim();
  if (!text) return false;
  return COURSE_CONTENT_PATTERN.test(text);
}

function isRelevant(answer, message, knowledgePoint) {
  const source = String(answer || "").toLowerCase();
  const point = String(knowledgePoint || "").toLowerCase();
  const technicalTerms =
    `${point} ${String(message || "").toLowerCase()}`.match(
      /\b(?:tcp|udp|http|https|ip|cache|avl|bfs|dfs|python|malloc)\b|红黑树|二叉树|左旋|右旋|中序|握手|进程|线程|死锁|虚拟内存|流水线|补码|指针|结构体|生成器|装饰器|栈|队列|数组|链表|递归/gi,
    ) || [];
  if (technicalTerms.some((term) => source.includes(term.toLowerCase()))) return true;
  if (point && !/综合问题|综合知识/.test(point)) {
    const terms = point.match(/[a-z0-9]+|[\p{Script=Han}]{2,}/gu) || [];
    if (terms.some((term) => source.includes(term))) return true;
  }
  const terms =
    String(message || "")
      .toLowerCase()
      .match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,4}/gu) || [];
  return terms.some((term) => source.includes(term));
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[a-zA-Z0-9+#-]*\s*/g, "")
    .replace(/```/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>\[\]()~-]/g, " ");
}

function publicCitationIssue(value) {
  const type = String(value?.type || "invalid_reference");
  const labels = {
    citation_missing: "回答缺少本次检索证据引用",
    invalid_reference: "回答引用了不属于本次检索的资料",
    unsupported_claim: "引用内容不足以支持对应结论",
    insufficient_evidence: "本次检索没有有效证据",
  };
  return labels[type] || "引用验证未通过";
}

function normalizeLanguage(value) {
  const language = String(value || "text").toLowerCase();
  return language === "c++" ? "cpp" : language || "text";
}

function countMatches(value, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (String(value || "").match(new RegExp(pattern.source, flags)) || []).length;
}

function issue(code, message) {
  return { code, message };
}

module.exports = {
  validateChatResponse,
  validateTopicAcceptance,
  extractCodeBlocks,
  calculateRepeatedContentRatio,
  containsEmptyMain,
  containsGenericFourOptions,
};
