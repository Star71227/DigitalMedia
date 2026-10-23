/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const SUBJECT_RULES = [
  {
    subject: "计算机网络",
    pattern: /\b(?:tcp|udp|http|https|ip|icmp|arp|dns)\b|路由|网络协议|三次握手|四次挥手|拥塞控制/i,
  },
  {
    subject: "操作系统",
    pattern:
      /进程|线程|虚拟内存|页面置换|死锁|调度算法|信号量|互斥锁|银行家算法|页表|缺页|分页|分段|临界区|生产者消费者|系统调用|文件系统|磁盘调度|作业调度|周转时间/i,
  },
  { subject: "计算机组成原理", pattern: /\bcache\b|缓存命中|流水线|指令周期|补码|主存|寄存器|总线/i },
  {
    subject: "数据结构",
    pattern:
      /红黑树|\bavl\b|\bdijkstra\b|迪杰斯特拉|最短路径|二叉树|二叉搜索树|链表|栈|队列|图论|图遍历|图的|^图$|拓扑排序|哈希|散列|排序|堆|并查集|左旋|右旋|查找|顺序表|平衡树|哈夫曼|关键路径|最小生成树/i,
  },
  { subject: "C语言", pattern: /C\s*语言|指针|结构体|\bmalloc\b|\bfree\b|预处理器|头文件/i },
  { subject: "Python", pattern: /\bpython\b|列表|字典|生成器|装饰器|推导式|迭代器/i },
  { subject: "软件工程", pattern: /软件工程|需求分析|设计模式|单元测试|持续集成|敏捷开发|重构/i },
];

const KNOWLEDGE_POINT_RULES = [
  [/红黑树.*右旋|右旋.*红黑树/i, "红黑树右旋"],
  [/红黑树.*左旋|左旋.*红黑树/i, "红黑树左旋"],
  [/红黑树.*删除/i, "红黑树删除修复"],
  [/红黑树.*插入/i, "红黑树插入修复"],
  [/红黑树旋转/i, "红黑树旋转"],
  [/红黑树/i, "红黑树"],
  [/\bavl\b|平衡二叉树/i, "AVL树"],
  [/\bdijkstra\b|迪杰斯特拉/i, "Dijkstra算法"],
  [/链表.*(?:反转|逆置)|(?:反转|逆置).*链表/i, "链表反转"],
  [/三次握手|tcp.*握手|握手.*tcp/i, "TCP三次握手"],
  [/\btcp\b/i, "TCP"],
  [/\budp\b/i, "UDP"],
  [/虚拟内存/i, "虚拟内存"],
  [/死锁/i, "死锁"],
  [/进程|线程/i, "进程与线程"],
  [/\bcache\b|缓存/i, "Cache"],
  [/指针/i, "指针"],
  [/列表|字典/i, "Python容器"],
  [/排序/i, "排序算法"],
  [/栈/i, "栈"],
  [/队列/i, "队列"],
  [/图遍历|\bbfs\b|\bdfs\b/i, "图遍历"],
];

const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_CHARACTERS = 8000;
const MAX_HISTORY_ITEM_CHARACTERS = 2000;
const MAX_CONTEXT_HISTORY_ITEMS = 4;
const MAX_CONTEXT_USER_CHARACTERS = 1000;
const MAX_CONTEXT_ASSISTANT_CHARACTERS = 500;
const GENERIC_SUBJECT = "通用计算机学习";

const CONTEXT_DEPENDENCY_PATTERN =
  /(?:^|[，。！？?\s])(?:那|那么)(?:[^，。！？?]{0,24})(?:呢|怎么办|如何|怎么样)|这个|那个|它(?:的|是|呢|为什么)?|刚才|上一(?:轮|问|个)|沿用|按.*(?:符号|例子|关系).*继续|继续用|再(?:举|讲|解释|简单)|类似题|第三步|第[一二三四五六七八九十\d]+步|写出来|用(?:\s*C\s*语言|C\+\+|Python|Java|JavaScript|代码)解释/i;
const TOPIC_SWITCH_PATTERN =
  /换个(?:问题|话题)|另一个(?:问题|话题)|接下来(?:问|说|聊)|不谈这个|先不说|重新问|说说\s*(?:TCP|UDP|HTTP|Python|操作系统|计算机网络)/i;
const IMPLEMENTATION_FOLLOWUP_PATTERN =
  /^(?:请)?\s*用\s*(?:C\s*语言|C\+\+|Python|Java|JavaScript|代码)(?:写|实现|解释|表示|改写)/i;

function analyzeChatIntent(message, options = {}) {
  const history = selectRelevantChatHistory(options.history, message);
  const resolution =
    options.contextResolution ||
    resolveContextualQuestion({
      message,
      history,
      currentCourse: options.currentCourse,
      previousSubject: options.previousSubject,
      previousKnowledgePoint: options.previousKnowledgePoint,
    });
  const text = resolution.resolvedQuestion;
  const clarificationQuestions = buildClarificationQuestions(resolution.originalMessage, history, resolution);
  const subject = resolution.subject || detectSubject(text, options.currentCourse);
  const knowledgePoint = resolution.knowledgePoint || detectKnowledgePoint(text, subject);
  const questionType = detectQuestionType(text);

  return {
    originalMessage: resolution.originalMessage,
    resolvedQuestion: text,
    isContextualFollowup: resolution.isContextualFollowup,
    inheritedFromHistory: resolution.inheritedFromHistory,
    contextConfidence: resolution.confidence,
    contextSourceKnowledgePoint: resolution.previousKnowledgePoint || "",
    subject,
    knowledgePoint,
    questionType,
    complexity: isComplexQuestion(text),
    requiresCode: requiresCode(text, questionType, knowledgePoint),
    needsClarification: clarificationQuestions.length > 0,
    clarificationQuestions,
  };
}

function detectSubject(message, currentCourse = "") {
  const text = cleanText(message, 2000);
  const matched = findExplicitSubject(text);
  if (matched) return matched.subject;

  const normalizedCourse = cleanText(currentCourse, 120);
  const supported = SUBJECT_RULES.find((rule) => rule.subject === normalizedCourse);
  return supported ? supported.subject : GENERIC_SUBJECT;
}

function detectKnowledgePoint(message, subject) {
  const text = cleanText(message, 2000);
  for (const [pattern, knowledgePoint] of KNOWLEDGE_POINT_RULES) {
    if (pattern.test(text)) return knowledgePoint;
  }
  return subject === GENERIC_SUBJECT ? "综合问题" : `${subject}综合知识`;
}

function resolveContextualQuestion(input = {}) {
  const originalMessage = cleanText(input.message, 2000);
  const history = selectRelevantChatHistory(input.history, originalMessage);
  const previous = findPreviousContext(history, input);
  const explicitSubject = findExplicitSubject(originalMessage)?.subject || "";
  const contextDependent = isContextDependent(originalMessage);
  const fallbackSubject = explicitSubject || detectSubject(originalMessage, input.currentCourse);
  const fallbackKnowledgePoint = detectKnowledgePoint(originalMessage, fallbackSubject);
  const explicitKnowledgePoint = isSpecificKnowledgePoint(fallbackKnowledgePoint, fallbackSubject)
    ? fallbackKnowledgePoint
    : "";
  const topicSwitch = isTopicSwitch({
    message: originalMessage,
    explicitSubject,
    previousSubject: previous.subject,
    explicitKnowledgePoint,
  });

  if (!contextDependent || topicSwitch || !previous.hasUsableContext) {
    return {
      originalMessage,
      resolvedQuestion: originalMessage,
      isContextualFollowup: false,
      subject: fallbackSubject,
      knowledgePoint: fallbackKnowledgePoint,
      inheritedFromHistory: [],
      confidence: contextDependent && !previous.hasUsableContext ? "low" : "high",
      previousKnowledgePoint: previous.knowledgePoint,
    };
  }

  const completed = buildDeterministicResolution(originalMessage, previous);
  if (!completed.resolvedQuestion || completed.resolvedQuestion === originalMessage) {
    return {
      originalMessage,
      resolvedQuestion: originalMessage,
      isContextualFollowup: false,
      subject: fallbackSubject,
      knowledgePoint: fallbackKnowledgePoint,
      inheritedFromHistory: [],
      confidence: "low",
      previousKnowledgePoint: previous.knowledgePoint,
    };
  }

  const subject =
    previous.subject !== GENERIC_SUBJECT
      ? previous.subject
      : detectSubject(completed.resolvedQuestion, input.currentCourse);
  const detectedPoint = detectKnowledgePoint(completed.resolvedQuestion, subject);
  const knowledgePoint =
    completed.knowledgePoint ||
    (isSpecificKnowledgePoint(detectedPoint, subject) ? detectedPoint : previous.knowledgePoint);
  const inheritedFromHistory = ["subject", "knowledgePoint"];
  if (completed.inheritedQuestionIntent) inheritedFromHistory.push("questionIntent");
  if (/刚才|上一轮|符号|例子|关系|继续/.test(originalMessage)) inheritedFromHistory.push("constraints");

  return {
    originalMessage,
    resolvedQuestion: cleanText(completed.resolvedQuestion, 2000),
    isContextualFollowup: true,
    subject,
    knowledgePoint,
    inheritedFromHistory: [...new Set(inheritedFromHistory)],
    confidence: completed.confidence || "high",
    previousKnowledgePoint: previous.knowledgePoint,
  };
}

function selectRelevantChatHistory(history, currentMessage = "") {
  const normalized = normalizeChatHistory(history);
  const current = cleanText(currentMessage, 2000);
  const withoutCurrent = normalized.filter((item, index) => {
    if (item.role !== "user" || item.content !== current) return true;
    return normalized.slice(index + 1).some((later) => later.role === "assistant");
  });
  return withoutCurrent.slice(-MAX_CONTEXT_HISTORY_ITEMS).map((item) => ({
    role: item.role,
    content: item.content.slice(
      0,
      item.role === "assistant" ? MAX_CONTEXT_ASSISTANT_CHARACTERS : MAX_CONTEXT_USER_CHARACTERS,
    ),
    ...(item.role === "assistant" && item.subject ? { subject: item.subject } : {}),
    ...(item.role === "assistant" && item.knowledgePoint ? { knowledgePoint: item.knowledgePoint } : {}),
  }));
}

function findPreviousContext(history, input) {
  const previousUserIndex = history.findLastIndex((item) => item.role === "user");
  const previousAssistantIndex = history.findLastIndex((item) => item.role === "assistant");
  const previousUser = previousUserIndex >= 0 ? history[previousUserIndex] : null;
  const previousAssistant =
    previousAssistantIndex >= 0 && (previousUserIndex < 0 || previousAssistantIndex > previousUserIndex)
      ? history[previousAssistantIndex]
      : null;
  const suppliedSubject = cleanText(input.previousSubject, 120);
  const assistantSubject = cleanText(previousAssistant?.subject, 120);
  const userSubject = findExplicitSubject(previousUser?.content || "")?.subject || "";
  const answerSubject = findExplicitSubject(previousAssistant?.content || "")?.subject || "";
  const subject = suppliedSubject || assistantSubject || userSubject || answerSubject || GENERIC_SUBJECT;
  const suppliedPoint = cleanText(input.previousKnowledgePoint, 180);
  const assistantPoint = cleanText(previousAssistant?.knowledgePoint, 180);
  const userPoint = detectKnowledgePoint(previousUser?.content || "", subject);
  const answerPoint = detectKnowledgePoint(previousAssistant?.content || "", subject);
  const knowledgePoint =
    suppliedPoint ||
    assistantPoint ||
    (isSpecificKnowledgePoint(userPoint, subject) ? userPoint : "") ||
    (isSpecificKnowledgePoint(answerPoint, subject) ? answerPoint : "");
  const recentKnowledgePoints = [];
  for (const item of history) {
    const itemSubject =
      item.role === "assistant" && item.subject
        ? item.subject
        : findExplicitSubject(item.content)?.subject || GENERIC_SUBJECT;
    const detectedPoint =
      item.role === "assistant" && item.knowledgePoint
        ? item.knowledgePoint
        : detectKnowledgePoint(item.content, itemSubject);
    if (!isSpecificKnowledgePoint(detectedPoint, itemSubject)) continue;
    if (recentKnowledgePoints.at(-1) !== detectedPoint) recentKnowledgePoints.push(detectedPoint);
  }
  return {
    subject,
    knowledgePoint,
    question: cleanText(previousUser?.content, MAX_CONTEXT_USER_CHARACTERS),
    answer: cleanText(previousAssistant?.content, MAX_CONTEXT_ASSISTANT_CHARACTERS),
    recentKnowledgePoints: [...new Set(recentKnowledgePoints)].slice(-2),
    hasUsableContext: Boolean(previousUser?.content || knowledgePoint || previousAssistant?.content),
  };
}

function buildDeterministicResolution(message, previous) {
  const previousQuestion = previous.question;
  const previousPoint = previous.knowledgePoint || inferTopicLabel(previousQuestion, previous.subject);
  const rotation = message.match(/(左旋|右旋)/);
  if (rotation) {
    const operation = rotation[1];
    const opposite = operation === "右旋" ? "左旋" : "右旋";
    const knowledgePoint = /红黑树/.test(`${previousPoint} ${previousQuestion}`)
      ? `红黑树${operation}`
      : replaceOperation(previousPoint, opposite, operation);
    let inherited = previousQuestion
      ? replaceOperation(previousQuestion, opposite, operation)
      : `${knowledgePoint}的原理是什么？`;
    if (inherited === previousQuestion && knowledgePoint && !inherited.includes(knowledgePoint)) {
      inherited = `${knowledgePoint}${extractQuestionIntent(previousQuestion) || "的原理是什么？"}`;
    }
    const remainder = message
      .replace(new RegExp(`^(?:那|那么)?\\s*${operation}(?:呢|又如何|怎么样)?[？?，,。！!\\s]*`, "i"), "")
      .trim();
    return {
      resolvedQuestion: appendConstraint(inherited, remainder),
      knowledgePoint,
      inheritedQuestionIntent: Boolean(previousQuestion),
      confidence: "high",
    };
  }

  if (/时间复杂度|空间复杂度|复杂度(?:呢|是多少|如何)/.test(message)) {
    const complexity = message.includes("空间复杂度")
      ? "空间复杂度"
      : message.includes("时间复杂度")
        ? "时间复杂度"
        : "时间复杂度";
    const remainder = message
      .replace(/^(?:它|这个|那个)?\s*的?\s*(?:时间|空间)?复杂度(?:呢|是多少|如何)?[？?，,。！!\s]*/i, "")
      .trim();
    return {
      resolvedQuestion: appendConstraint(`${previousPoint}的${complexity}是多少？`, remainder),
      knowledgePoint: previousPoint,
      inheritedQuestionIntent: true,
      confidence: "high",
    };
  }

  const language = message.match(/用\s*(C\s*语言|C\+\+|Python|JavaScript|Java|代码)/i);
  if (language && /写|实现|解释|表示|改写/.test(message)) {
    const normalizedLanguage = language[1].replace(/\s+/g, " ");
    const action = /写|实现|编写/.test(message) ? "实现" : "解释";
    const remainder = message
      .replace(
        /^(?:请)?\s*用\s*(?:C\s*语言|C\+\+|Python|JavaScript|Java|代码)\s*(?:写出来|写一下|实现|编写|解释一下|解释|表示|改写)[？?，,。！!\s]*/i,
        "",
      )
      .trim();
    return {
      resolvedQuestion: appendConstraint(`请用${normalizedLanguage}${action}${previousPoint}。`, remainder),
      knowledgePoint: previousPoint,
      inheritedQuestionIntent: true,
      confidence: "high",
    };
  }

  if (/^(?:那|那么)?\s*(?:如果|当|假设)/.test(message)) {
    const condition = message.replace(/^(?:那|那么)?\s*/, "").replace(/呢[？?。！!]*$/, "会怎样？");
    return {
      resolvedQuestion: `${previousPoint}中，${condition}`,
      knowledgePoint: previousPoint,
      inheritedQuestionIntent: false,
      confidence: "high",
    };
  }

  const ellipticalTopic = message.match(
    /^(?:那|那么)\s*((?:删除|插入|查找|遍历|合并|分裂|更新|修复|递归|迭代))(?:呢|怎么办|如何|怎么样)[？?。！!]*(.*)$/i,
  );
  if (ellipticalTopic) {
    const nextPart = cleanText(ellipticalTopic[1], 80);
    const baseEntity = previousPoint.replace(/(?:左旋|右旋|插入|删除|查找|遍历|反转|逆置)$/, "");
    const knowledgePoint =
      baseEntity && !previousPoint.includes(nextPart)
        ? /红黑树/.test(baseEntity) && /删除|插入/.test(nextPart)
          ? `${baseEntity}${nextPart}修复`
          : `${baseEntity}${nextPart}`
        : previousPoint;
    const inherited = previousQuestion
      ? replaceKnowledgePoint(previousQuestion, previousPoint, knowledgePoint)
      : `${knowledgePoint}${extractQuestionIntent(previousQuestion) || "是什么？"}`;
    return {
      resolvedQuestion: appendConstraint(inherited, ellipticalTopic[2]),
      knowledgePoint,
      inheritedQuestionIntent: Boolean(previousQuestion),
      confidence: "medium",
    };
  }

  const topic = previousPoint || inferTopicLabel(previousQuestion, previous.subject);
  if (/^和刚才那个有什么区别[？?。！!]*$/.test(message)) {
    if (previous.recentKnowledgePoints.length >= 2) {
      const [left, right] = previous.recentKnowledgePoints.slice(-2);
      return {
        resolvedQuestion: `${left}和${right}有什么区别？`,
        knowledgePoint: right,
        inheritedQuestionIntent: true,
        confidence: "high",
      };
    }
    return { resolvedQuestion: "", knowledgePoint: "", inheritedQuestionIntent: false, confidence: "low" };
  }
  const replacements = [
    [/^(?:这个|那个|它)[？?。！!]*$/i, `请继续解释${topic}。`],
    [/^(?:这个|那个|它)为什么[？?。！!]*$/i, `${topic}为什么会这样？`],
    [/^(?:它|这个|那个)的(.+?)[？?。！!]*$/i, `${topic}的$1？`],
    [/^(?:能)?再举一个例子(?:吗)?[？?。！!]*$/i, `请再举一个${topic}的例子。`],
    [/^用代码解释一下[。！!]*$/i, `请用代码解释${topic}。`],
    [/^为什么(第.+?步.+)$/i, `${topic}中为什么$1`],
    [/^再简单一点[。！!]*$/i, `请更简单地解释${topic}。`],
    [/^(?:按|沿用)刚才(.+?)[。！!]*$/i, `请继续解释${topic}，并沿用刚才$1。`],
    [/^给我一道类似题[。！!]*$/i, `请给我一道与${topic}类似的题。`],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(message)) {
      return {
        resolvedQuestion: message.replace(pattern, replacement),
        knowledgePoint: topic,
        inheritedQuestionIntent: true,
        confidence: "high",
      };
    }
  }

  if (/刚才|上一轮|继续|这个|那个|它/.test(message)) {
    return {
      resolvedQuestion: `${topic}：${message.replace(/刚才那个|这个|那个|它/g, topic)}`,
      knowledgePoint: topic,
      inheritedQuestionIntent: false,
      confidence: "medium",
    };
  }
  return { resolvedQuestion: "", knowledgePoint: "", inheritedQuestionIntent: false, confidence: "low" };
}

function isContextDependent(message) {
  const text = cleanText(message, 2000);
  return Boolean(text && CONTEXT_DEPENDENCY_PATTERN.test(text));
}

function isTopicSwitch({ message, explicitSubject, previousSubject, explicitKnowledgePoint }) {
  if (TOPIC_SWITCH_PATTERN.test(message)) return true;
  const implementationFollowup = IMPLEMENTATION_FOLLOWUP_PATTERN.test(message);
  if (
    explicitKnowledgePoint &&
    mentionsKnowledgePoint(message, explicitKnowledgePoint) &&
    !/^(?:那|那么)/.test(message)
  ) {
    if (implementationFollowup && explicitKnowledgePoint === "指针") return false;
    return true;
  }
  if (implementationFollowup) return false;
  return Boolean(
    explicitSubject &&
    previousSubject &&
    previousSubject !== GENERIC_SUBJECT &&
    explicitSubject !== previousSubject,
  );
}

function mentionsKnowledgePoint(message, knowledgePoint) {
  const source = String(message || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const point = String(knowledgePoint || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const base = point.replace(/算法$/, "");
  if (point && (source.includes(point) || (base.length >= 2 && source.includes(base)))) return true;
  const composite = point.match(/^(.+?)(左旋|右旋|旋转|反转|逆置|插入|删除|查找|遍历|修复)$/);
  return Boolean(composite && source.includes(composite[1]) && source.includes(composite[2]));
}

function findExplicitSubject(message) {
  const text = cleanText(message, 2000);
  return SUBJECT_RULES.find((rule) => rule.pattern.test(text));
}

function isSpecificKnowledgePoint(point, subject) {
  return Boolean(point && point !== "综合问题" && point !== `${subject}综合知识`);
}

function inferTopicLabel(question, subject) {
  const detected = detectKnowledgePoint(question, subject);
  return isSpecificKnowledgePoint(detected, subject) ? detected : subject || "当前知识点";
}

function replaceOperation(value, from, to) {
  const text = String(value || "");
  if (text.includes(from)) return text.replaceAll(from, to);
  if (/红黑树旋转/.test(text)) return text.replace(/红黑树旋转/g, `红黑树${to}`);
  return text;
}

function replaceKnowledgePoint(question, previousPoint, nextPoint) {
  const source = String(question || "");
  if (previousPoint && source.includes(previousPoint)) return source.replaceAll(previousPoint, nextPoint);
  const previousOperation = previousPoint.match(/左旋|右旋|插入|删除|查找|遍历|反转|逆置/)?.[0];
  const nextOperation = nextPoint.slice(previousPoint.replace(previousOperation || "", "").length);
  if (previousOperation && source.includes(previousOperation))
    return source.replaceAll(previousOperation, nextOperation);
  return `${nextPoint}${extractQuestionIntent(source) || "是什么？"}`;
}

function extractQuestionIntent(question) {
  const match = String(question || "").match(
    /(为什么[^。！？?]*[？?]?|如何[^。！？?]*[？?]?|怎么[^。！？?]*[？?]?|的基本过程是什么[？?]?|的复杂度[^。！？?]*[？?]?|有什么区别[？?]?)/,
  );
  if (!match) return "";
  return /^[为什么如何怎么]/.test(match[1]) ? match[1] : match[1];
}

function appendConstraint(question, constraint) {
  const base = cleanText(question, 1600);
  const suffix = cleanText(constraint, 400);
  if (!suffix) return base;
  return `${base}${/[？?。！!]$/.test(base) ? " " : "；"}${suffix}`;
}

function detectQuestionType(message) {
  const text = cleanText(message, 2000);
  if (/报错|错误|bug|调试|为什么运行失败/i.test(text)) return "debugging";
  if (/实现|代码|伪代码|函数|算法|复杂度|左旋|右旋/i.test(text)) return "algorithm";
  if (/区别|对比|比较|而不是/i.test(text)) return "comparison";
  if (/证明|推导|为什么|原理|如何|怎么/i.test(text)) return "explanation";
  return "concept";
}

function isComplexQuestion(message) {
  const text = cleanText(message, 2000);
  return text.length >= 12 || /为什么|如何|怎么|原理|实现|证明|推导|区别|比较|代码|算法/i.test(text);
}

function requiresCode(message, questionType, knowledgePoint) {
  if (questionType === "algorithm" || questionType === "debugging") return true;
  return /代码|伪代码|实现|算法|左旋|右旋|排序|链表|树|栈|队列|指针/i.test(`${message} ${knowledgePoint}`);
}

/**
 * 是否要先反问用户。
 *
 * 以前这里会在"消息长度 < 4""出现这个/那个/它""只发了怎么办"等情况下直接返回澄清问题，
 * 于是学生发「你好」「它呢」「这个怎么理解」时根本不会走到模型，只会收到一句
 * 「请补充具体问题」，用起来就像 AI 助手坏了、什么都不会答。
 *
 * 现在的原则：**能用模型答就直接答**。只有消息本身是空的（真的没有任何内容可回答）
 * 才反问；含糊的问题交给模型，模型自己会补一句澄清或给出通用解释。
 */
function buildClarificationQuestions(message, history = [], resolution = {}) {
  const text = String(message || "").trim();
  if (!text) return ["你想了解哪个具体课程或知识点？"];
  // 纯标点/表情等没有任何语义内容的输入才反问
  if (!/[\p{Script=Han}A-Za-z0-9]/u.test(text)) {
    return ["你想了解哪个具体课程或知识点？"];
  }
  return [];
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  const candidates = history
    .slice(-MAX_HISTORY_ITEMS * 2)
    .map(normalizeHistoryItem)
    .filter(Boolean);
  const selected = [];
  let characters = 0;

  for (let index = candidates.length - 1; index >= 0 && selected.length < MAX_HISTORY_ITEMS; index -= 1) {
    const item = candidates[index];
    if (characters + item.content.length > MAX_HISTORY_CHARACTERS) {
      const remaining = MAX_HISTORY_CHARACTERS - characters;
      if (remaining >= 80) selected.unshift({ ...item, content: item.content.slice(-remaining) });
      break;
    }
    selected.unshift(item);
    characters += item.content.length;
  }
  return selected;
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;
  const rawRole = String(item.role || item.sender || "").toLowerCase();
  const role = rawRole === "assistant" ? "assistant" : rawRole === "user" ? "user" : "";
  if (!role) return null;
  let content = "";
  const nestedAnswer =
    item.answer && typeof item.answer === "object" && !Array.isArray(item.answer) ? item.answer : {};
  if (role === "assistant") {
    content =
      item.answerMarkdown ||
      item.content ||
      item.text ||
      nestedAnswer.answerMarkdown ||
      extractLegacyAssistantAnswer(item.parts);
  } else {
    content = item.text || item.content || item.message;
  }
  content = cleanText(content, MAX_HISTORY_ITEM_CHARACTERS);
  if (!content) return null;
  if (role === "user") return { role, content };
  const subject = cleanText(item.subject || nestedAnswer.subject, 120);
  const knowledgePoint = cleanText(
    item.knowledgePoint || item.knowledge_point || nestedAnswer.knowledgePoint,
    180,
  );
  return {
    role,
    content,
    ...(subject ? { subject } : {}),
    ...(knowledgePoint ? { knowledgePoint } : {}),
  };
}

function extractLegacyAssistantAnswer(parts) {
  if (!Array.isArray(parts)) return "";
  const answer = parts.find((part) => ["TutorAgent", "TheoryAgent"].includes(part?.agent));
  return answer?.content || "";
}

function buildProfileSuggestions(message) {
  const text = cleanText(message, 1000);
  const values = [];
  if (/讲慢|慢一点|节奏慢|详细一点/.test(text)) values.push("较慢节奏", "分步骤讲解");
  if (/多给.*代码|代码例子|代码示例/.test(text)) values.push("增加代码示例");
  if (/画图|图示|结构图/.test(text)) values.push("增加文本结构图");
  if (!values.length || !/(以后|之后|希望|请|偏好|喜欢|多给|讲慢)/.test(text)) return [];
  return [
    {
      dimension: "explanationPreference",
      suggestedValue: [...new Set(values)],
      evidence: text,
      reason: "学生明确表达了新的讲解偏好",
    },
  ];
}

function buildFollowups(intent) {
  const point = intent.knowledgePoint || intent.subject;
  return [
    `能否用另一个具体例子验证“${point}”的核心结论？`,
    `“${point}”在代码实现或考试题中最常见的变式是什么？`,
  ];
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

module.exports = {
  SUBJECT_RULES,
  analyzeChatIntent,
  resolveContextualQuestion,
  selectRelevantChatHistory,
  detectSubject,
  detectKnowledgePoint,
  normalizeChatHistory,
  buildProfileSuggestions,
  buildFollowups,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_CHARACTERS,
};
