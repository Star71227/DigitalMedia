/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateTutorResponse } = require("../src/services/aiTutorService");
const { TutorAgent } = require("../src/services/agents/tutorAgent");
const { ReviewAgent } = require("../src/services/agents/reviewAgent");
const {
  analyzeChatIntent,
  resolveContextualQuestion,
  selectRelevantChatHistory,
  normalizeChatHistory,
  buildProfileSuggestions,
} = require("../src/services/chatIntentService");
const { validateAnswerCitations } = require("../src/services/groundedAnswerService");
const { runChat } = require("../src/services/agentOrchestrator");
const { validateChatResponse } = require("../src/services/chatResponseValidator");
const { retrieveKnowledge } = require("../src/services/knowledgeRetrievalService");

function tcpAnswer() {
  return `# 直接结论

TCP 使用三次握手而不是两次，是因为建立连接时双方不仅要知道对方能够收到报文，还要确认双方各自的初始序列号已经被对方接收。前两次只能让客户端完成这项确认，服务端必须收到第三次 ACK，才能确认客户端确实收到了服务端的 SYN 和序列号。

## 双方要同步的信息

客户端先发送 SYN，携带初始序列号 x。服务端收到后知道客户端到服务端方向可达，并回复 SYN+ACK：确认号为 x+1，同时给出自己的初始序列号 y。客户端收到第二次报文后，知道服务端能够接收自己的数据，也知道服务端到客户端方向可达，并记录 y。但是此时服务端只知道自己发出了 y，不知道客户端是否成功收到 y。

## 第三次 ACK 的作用

客户端发送 ACK，确认号为 y+1。服务端收到它以后，才能确认客户端具备接收服务端报文的能力，并确认本次连接使用的两个初始序列号已经在双方状态机中同步。第三次报文通常不再携带 SYN，因为客户端不需要再次申请建立连接，只需确认服务端的 SYN。

## 旧 SYN 和延迟报文风险

例如，某个旧连接请求 SYN 因网络拥塞长期滞留，后来才到达服务端。服务端会回复新的 SYN+ACK；若客户端并未发起这次连接，就不会用合法的第三次 ACK 完成握手。两次握手若在服务端发出 SYN+ACK 后立即建立连接，会为这类过期请求错误分配连接资源。三次握手结合序列号、状态和超时降低了这种误连接风险。

## ACK 丢失时会怎样

如果第三次 ACK 丢失，客户端通常已进入可发送状态，而服务端仍等待确认。服务端超时后会重传 SYN+ACK；客户端识别到这个重复报文后再次发送 ACK。TCP 依靠重传和状态机最终完成确认，而不是假定网络中的每个控制报文都不会丢失。

## 易错点

1. 把三次握手解释成单纯检查网络是否连通，忽略初始序列号同步。
2. 认为第二次握手后服务端已确认双向通信；实际上服务端尚未确认客户端收到 y。
3. 认为第三次 ACK 丢失就会产生两个连接；实际会触发 SYN+ACK 重传和再次确认。

## 检查理解

第二次报文已经带有 ACK，为什么它只能确认客户端的序列号 x，而不能让服务端确认客户端已经收到服务端的序列号 y？

## 下一步学习

可以继续比较连接建立与四次挥手的状态变化，也可以沿着 SYN_SENT、SYN_RECEIVED 和 ESTABLISHED 状态分析各类丢包重传。`;
}

function profileFixture() {
  return {
    profile: {
      majorAndGrade: { major: "计算机科学与技术", grade: "大二" },
      currentCourse: "数据结构",
      priorKnowledge: ["C语言", "二叉搜索树"],
      learningGoals: ["通过课程考试"],
      explanationPreference: "图示和分步骤",
      resourcePreferences: ["代码示例"],
      paceAndTimeBudget: { pacePreference: "较慢", weeklyTimeBudgetMinutes: 300 },
      knowledgeMastery: [{ subject: "数据结构", knowledgePoint: "红黑树左旋", mastery: 45 }],
      errorPatterns: [
        {
          subject: "数据结构",
          knowledgePoint: "红黑树左旋",
          errorType: "指针更新顺序",
          occurrenceCount: 2,
          confidence: 0.9,
        },
      ],
    },
  };
}

function emptyGrounding({ unsupported = false } = {}) {
  return {
    hasEvidence: false,
    unsupportedForRag: unsupported,
    context: null,
    warning: null,
    retrieval: {
      retrievalRunId: null,
      results: [],
      insufficient: true,
      unsupportedForRag: unsupported,
      confidence: "insufficient",
    },
  };
}

function evidenceGrounding() {
  const result = {
    chunkId: 12,
    sourceKey: "rbt-notes",
    sourceTitle: "红黑树课程讲义",
    chapter: "平衡树",
    section: "左旋",
    license: "CC-BY-4.0",
    sourceVersion: "1.0",
    content: "红黑树左旋以 x 的右孩子 y 为支点，B 子树移动到 x 的右侧，并保持 A、x、B、y、C 的中序顺序。",
  };
  return {
    hasEvidence: true,
    unsupportedForRag: false,
    warning: null,
    retrieval: {
      retrievalRunId: 7,
      results: [result],
      insufficient: false,
      unsupportedForRag: false,
      confidence: "medium",
    },
    context: { evidence: [{ label: "S1", ...result, source: result.sourceTitle }] },
  };
}

function generatedResult(answerMarkdown, citations = []) {
  return {
    answerMarkdown,
    citations,
    citationValidation: { approved: true, citations: [] },
    citationCoverage: citations.length ? 1 : 0,
    quality: {
      passed: true,
      characterCount: answerMarkdown.length,
      sectionCount: 8,
      codeBlockCount: 0,
      exampleCount: 1,
      misconceptionCount: 3,
      practiceCount: 1,
      placeholderMatches: 0,
      repeatedContentRatio: 0,
      issues: [],
    },
    codeBlocks: [],
    retryCount: 0,
    review: { passed: true, issues: [] },
  };
}

test("课程和知识点确定性识别覆盖红黑树与 TCP", () => {
  const tree = analyzeChatIntent("红黑树左旋为什么不会破坏二叉搜索树的顺序？");
  const tcp = analyzeChatIntent("TCP为什么是三次握手而不是两次？");
  assert.equal(tree.subject, "数据结构");
  assert.equal(tree.knowledgePoint, "红黑树左旋");
  assert.equal(tcp.subject, "计算机网络");
  assert.equal(tcp.knowledgePoint, "TCP三次握手");
  assert.equal(analyzeChatIntent("malloc返回的指针如何释放？").subject, "C语言");
  assert.equal(analyzeChatIntent("Python装饰器如何工作？").subject, "Python");
});

test("连续追问确定性继承课程、主题和上一问意图", () => {
  const history = [
    { role: "user", content: "红黑树左旋为什么不会破坏二叉搜索树的顺序？" },
    {
      role: "assistant",
      content: "左旋前后都满足 A < x < B < y < C。",
      subject: "数据结构",
      knowledgePoint: "红黑树左旋",
    },
  ];
  const resolution = resolveContextualQuestion({
    message: "那右旋呢？请沿用刚才相同的 A、x、B、y、C 关系解释。",
    history,
  });
  assert.equal(resolution.originalMessage, "那右旋呢？请沿用刚才相同的 A、x、B、y、C 关系解释。");
  assert.equal(resolution.isContextualFollowup, true);
  assert.equal(resolution.subject, "数据结构");
  assert.equal(resolution.knowledgePoint, "红黑树右旋");
  assert.match(resolution.resolvedQuestion, /红黑树右旋为什么不会破坏二叉搜索树的顺序/);
  assert.match(resolution.resolvedQuestion, /A、x、B、y、C/);
  assert.deepEqual(resolution.inheritedFromHistory, [
    "subject",
    "knowledgePoint",
    "questionIntent",
    "constraints",
  ]);

  const legacyClientResolution = resolveContextualQuestion({
    message: "那右旋呢？",
    history: [
      { sender: "user", text: "红黑树左旋为什么保持中序顺序？" },
      { sender: "assistant", parts: [{ agent: "TutorAgent", content: "左旋保持 A、x、B、y、C。" }] },
    ],
  });
  assert.equal(legacyClientResolution.subject, "数据结构");
  assert.equal(legacyClientResolution.knowledgePoint, "红黑树右旋");

  const emptySubtree = resolveContextualQuestion({ message: "那如果 B 是空节点呢？", history });
  assert.equal(emptySubtree.knowledgePoint, "红黑树左旋");
  assert.match(emptySubtree.resolvedQuestion, /红黑树左旋中，如果 B 是空节点会怎样/);

  const deletion = resolveContextualQuestion({ message: "那删除呢？", history });
  assert.equal(deletion.knowledgePoint, "红黑树删除修复");
  assert.match(deletion.resolvedQuestion, /红黑树删除修复为什么不会破坏二叉搜索树的顺序/);
});

test("复杂度和代码追问继承知识点，明确换题不继承", () => {
  const dijkstra = resolveContextualQuestion({
    message: "它的时间复杂度呢？",
    history: [
      { role: "user", content: "Dijkstra算法的基本过程是什么？" },
      {
        role: "assistant",
        content: "每次确定最短暂定距离。",
        subject: "数据结构",
        knowledgePoint: "Dijkstra算法",
      },
    ],
  });
  assert.equal(dijkstra.subject, "数据结构");
  assert.equal(dijkstra.knowledgePoint, "Dijkstra算法");
  assert.match(dijkstra.resolvedQuestion, /Dijkstra算法的时间复杂度/);
  const constrainedComplexity = resolveContextualQuestion({
    message: "它的时间复杂度呢？请按刚才的实现分析。",
    history: [
      { role: "user", content: "Dijkstra算法的基本过程是什么？" },
      { role: "assistant", content: "Dijkstra公开回答", subject: "数据结构", knowledgePoint: "Dijkstra算法" },
    ],
  });
  assert.match(constrainedComplexity.resolvedQuestion, /请按刚才的实现分析/);

  const linkedList = analyzeChatIntent("用 C 语言写出来。", {
    history: [
      { role: "user", content: "给我讲一下链表反转。" },
      {
        role: "assistant",
        content: "链表反转需要维护前驱和后继。",
        subject: "数据结构",
        knowledgePoint: "链表反转",
      },
    ],
  });
  assert.equal(linkedList.subject, "数据结构");
  assert.equal(linkedList.knowledgePoint, "链表反转");
  assert.match(linkedList.resolvedQuestion, /C 语言实现链表反转/);
  assert.equal(linkedList.requiresCode, true);
  const constrainedCode = resolveContextualQuestion({
    message: "用 C 语言写出来，并解释每个指针。",
    history: [
      { role: "user", content: "给我讲一下链表反转。" },
      { role: "assistant", content: "链表反转回答", subject: "数据结构", knowledgePoint: "链表反转" },
    ],
  });
  assert.match(constrainedCode.resolvedQuestion, /C 语言实现链表反转/);
  assert.match(constrainedCode.resolvedQuestion, /解释每个指针/);

  const switched = analyzeChatIntent("换个问题，TCP为什么需要三次握手？", {
    history: [{ role: "user", content: "红黑树左旋为什么保持中序顺序？" }],
  });
  assert.equal(switched.isContextualFollowup, false);
  assert.equal(switched.resolvedQuestion, "换个问题，TCP为什么需要三次握手？");
  assert.equal(switched.subject, "计算机网络");
  assert.equal(switched.knowledgePoint, "TCP三次握手");
  assert.doesNotMatch(switched.resolvedQuestion, /红黑树/);
});

test("无历史歧义问题要求澄清，完整独立问题不改写", () => {
  const ambiguous = analyzeChatIntent("那这个呢？", { history: [] });
  assert.equal(ambiguous.sourceMode, undefined);
  assert.equal(ambiguous.needsClarification, true);
  assert.equal(ambiguous.resolvedQuestion, "那这个呢？");

  const independent = analyzeChatIntent("Python 的生成器是什么？", {
    history: [{ role: "user", content: "红黑树左旋为什么保持中序顺序？" }],
  });
  assert.equal(independent.isContextualFollowup, false);
  assert.equal(independent.resolvedQuestion, "Python 的生成器是什么？");
  assert.equal(independent.subject, "Python");

  const sameSubjectSwitch = analyzeChatIntent("链表是什么？它如何反转？", {
    history: [
      { role: "user", content: "红黑树左旋为什么保持中序顺序？" },
      { role: "assistant", content: "左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    ],
  });
  assert.equal(sameSubjectSwitch.isContextualFollowup, false);
  assert.equal(sameSubjectSwitch.resolvedQuestion, "链表是什么？它如何反转？");
  assert.equal(sameSubjectSwitch.knowledgePoint, "链表反转");

  const dijkstraSwitch = analyzeChatIntent("Dijkstra 算法是什么？这个算法的复杂度是多少？", {
    history: [
      { role: "assistant", content: "红黑树左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    ],
  });
  assert.equal(dijkstraSwitch.isContextualFollowup, false);
  assert.equal(dijkstraSwitch.resolvedQuestion, "Dijkstra 算法是什么？这个算法的复杂度是多少？");
  assert.equal(dijkstraSwitch.knowledgePoint, "Dijkstra算法");

  const standaloneCode = analyzeChatIntent("请用代码解释一下快速排序。", { history: [] });
  assert.equal(standaloneCode.needsClarification, false);
  assert.equal(standaloneCode.resolvedQuestion, "请用代码解释一下快速排序。");
  assert.equal(standaloneCode.knowledgePoint, "排序算法");
  const standaloneCodeAfterTree = analyzeChatIntent("请用代码解释一下快速排序。", {
    history: [
      { role: "assistant", content: "红黑树左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    ],
  });
  assert.equal(standaloneCodeAfterTree.resolvedQuestion, "请用代码解释一下快速排序。");
  assert.equal(standaloneCodeAfterTree.knowledgePoint, "排序算法");

  const tcpCodeAfterTree = analyzeChatIntent("用 C 语言解释 TCP 三次握手。", {
    history: [
      { role: "assistant", content: "红黑树左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    ],
  });
  assert.equal(tcpCodeAfterTree.isContextualFollowup, false);
  assert.equal(tcpCodeAfterTree.subject, "计算机网络");
  assert.equal(tcpCodeAfterTree.knowledgePoint, "TCP三次握手");

  const wholeTree = analyzeChatIntent("红黑树这个结构为什么保持有序？", {
    history: [
      { role: "assistant", content: "红黑树左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    ],
  });
  assert.equal(wholeTree.resolvedQuestion, "红黑树这个结构为什么保持有序？");
  assert.equal(wholeTree.knowledgePoint, "红黑树");

  const deleteFix = analyzeChatIntent("红黑树删除时，它如何修复？", {
    history: [
      { role: "assistant", content: "红黑树左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    ],
  });
  assert.equal(deleteFix.isContextualFollowup, false);
  assert.equal(deleteFix.resolvedQuestion, "红黑树删除时，它如何修复？");
  assert.equal(deleteFix.knowledgePoint, "红黑树删除修复");

  const comparison = analyzeChatIntent("和刚才那个有什么区别？", {
    history: [
      { role: "user", content: "红黑树左旋是什么？" },
      { role: "assistant", content: "红黑树左旋回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
      { role: "user", content: "Dijkstra算法是什么？" },
      { role: "assistant", content: "Dijkstra回答", subject: "数据结构", knowledgePoint: "Dijkstra算法" },
    ],
  });
  assert.equal(comparison.isContextualFollowup, true);
  assert.equal(comparison.resolvedQuestion, "红黑树左旋和Dijkstra算法有什么区别？");
});

test("异常和过长历史只保留最近两轮公开对话", () => {
  assert.doesNotThrow(() => resolveContextualQuestion({ message: "那这个呢？", history: { invalid: true } }));
  const history = [];
  for (let index = 0; index < 12; index += 1) {
    history.push({ role: "user", content: `旧问题-${index}` });
    history.push({ role: "assistant", content: `旧回答-${index}`, trace: { prompt: "不得进入上下文" } });
  }
  history.push({ role: "user", content: "Dijkstra算法的基本过程是什么？" });
  history.push({
    role: "assistant",
    content: "Dijkstra公开回答".repeat(100),
    subject: "数据结构",
    knowledgePoint: "Dijkstra算法",
  });
  const selected = selectRelevantChatHistory(history, "它的时间复杂度呢？");
  assert.ok(selected.length <= 4);
  assert.equal(selected.at(-2).content, "Dijkstra算法的基本过程是什么？");
  assert.equal(selected.at(-1).content.length, 500);
  assert.equal(JSON.stringify(selected).includes("prompt"), false);
  const resolved = resolveContextualQuestion({ message: "它的时间复杂度呢？", history });
  assert.match(resolved.resolvedQuestion, /Dijkstra算法的时间复杂度/);

  const failedLatestTurn = resolveContextualQuestion({
    message: "它的时间复杂度呢？",
    history: [
      { role: "user", content: "红黑树左旋为什么保持顺序？" },
      { role: "assistant", content: "红黑树回答", subject: "数据结构", knowledgePoint: "红黑树左旋" },
      { role: "user", content: "Dijkstra算法的基本过程是什么？" },
    ],
  });
  assert.equal(failedLatestTurn.knowledgePoint, "Dijkstra算法");
  assert.match(failedLatestTurn.resolvedQuestion, /Dijkstra算法的时间复杂度/);
});

test("未纳入课程知识库的课程返回 unsupportedForRag 且不访问数据库", async () => {
  let queries = 0;
  const result = await retrieveKnowledge(
    {
      query: async () => {
        queries += 1;
        throw new Error("database should not be called");
      },
    },
    {
      studentId: 1,
      requestType: "chat",
      subject: "高等数学",
      knowledgePoint: "导数",
      query: "导数的几何意义是什么？",
    },
  );
  assert.equal(result.unsupportedForRag, true);
  assert.equal(result.insufficient, true);
  assert.deepEqual(result.results, []);
  assert.equal(queries, 0);
});

test("聊天历史只保留最近公开问答且忽略 trace 和非法项", () => {
  const history = normalizeChatHistory([
    { sender: "user", text: "第一个问题" },
    { sender: "assistant", answerMarkdown: "公开答案", trace: { secret: "internal" } },
    { role: "assistant", content: "数据库公开答案", subject: "数据结构", knowledgePoint: "红黑树左旋" },
    {
      sender: "assistant",
      parts: [
        { agent: "coordinator", content: "内部协调" },
        { agent: "TheoryAgent", content: "旧版公开答案" },
      ],
    },
    { sender: "invalid", text: "忽略" },
  ]);
  assert.deepEqual(
    history.map((item) => item.content),
    ["第一个问题", "公开答案", "数据库公开答案", "旧版公开答案"],
  );
  assert.equal(history[2].knowledgePoint, "红黑树左旋");
  assert.equal(JSON.stringify(history).includes("internal"), false);
  assert.ok(history.length <= 10);
});

test("TutorAgent 把历史和精简 learnerContext 传入模型 messages", async () => {
  let captured;
  const answer = await TutorAgent.generateChatAnswer(
    {
      message: "TCP为什么是三次握手？",
      history: [
        { role: "user", content: "上一轮问题" },
        { role: "assistant", content: "上一轮公开答案" },
      ],
      intent: analyzeChatIntent("TCP为什么是三次握手？"),
      learnerContext: { currentCourse: "计算机网络", explanationPreference: ["分步骤"], mastery: 55 },
      groundingContext: null,
    },
    {
      generateTextFn: async (options) => {
        captured = options;
        return tcpAnswer();
      },
    },
  );
  assert.match(answer, /第三次 ACK/);
  assert.equal(captured.messages[1].content, "上一轮问题");
  assert.equal(captured.messages[2].content, "上一轮公开答案");
  assert.match(captured.messages.at(-1).content, /"currentCourse":"计算机网络"/);
  assert.match(captured.messages.at(-1).content, /分步骤/);
  assert.match(captured.messages.at(-1).content, /第二次握手后，服务端仍无法确认客户端已经收到服务端的 SYN/);
});

test("TutorAgent 同时理解原话和独立问题且不重复当前用户消息", async () => {
  let captured;
  const originalMessage = "那右旋呢？请沿用刚才的符号关系解释。";
  const resolvedQuestion = "红黑树右旋为什么不会破坏二叉搜索树的中序顺序？请沿用 A、x、B、y、C 解释。";
  await TutorAgent.generateChatAnswer(
    {
      message: originalMessage,
      originalMessage,
      resolvedQuestion,
      history: [
        { role: "user", content: "红黑树左旋为什么不会破坏二叉搜索树的中序顺序？" },
        { role: "assistant", content: "左旋使用 A、x、B、y、C。" },
        { role: "user", content: originalMessage },
      ],
      intent: analyzeChatIntent(resolvedQuestion),
      learnerContext: {},
      groundingContext: null,
    },
    {
      generateTextFn: async (options) => {
        captured = options;
        return tcpAnswer();
      },
    },
  );
  assert.equal(captured.messages.filter((item) => item.role === "user").length, 2);
  assert.equal(
    captured.messages.some((item) => item.content === originalMessage),
    false,
  );
  const task = captured.messages.at(-1).content;
  assert.match(task, /【学生当前原话】那右旋呢/);
  assert.match(task, /【结合最近公开对话需回答的完整问题】红黑树右旋为什么/);
  assert.match(task, /A、x、B、y、C/);
  assert.doesNotMatch(task, /根据改写后的问题/);
});

test("第一次低质量响应触发一次重试并返回合格 TCP 回答", async () => {
  let calls = 0;
  const fixtureQuality = validateChatResponse({
    answerMarkdown: tcpAnswer(),
    message: "TCP为什么是三次握手而不是两次？",
    knowledgePoint: "TCP三次握手",
    complexity: true,
    requiresCode: false,
    followups: ["ACK丢失怎么办？", "四次挥手有何不同？"],
  });
  assert.equal(fixtureQuality.passed, true, JSON.stringify(fixtureQuality.issues));
  const result = await generateTutorResponse(
    {
      message: "TCP为什么是三次握手而不是两次？",
      history: [],
      intent: analyzeChatIntent("TCP为什么是三次握手而不是两次？"),
      learnerContext: {},
      sourceMode: "model_only",
      groundingContext: null,
      followups: ["ACK丢失怎么办？", "四次挥手有何不同？"],
      validateCitations: () => ({ approved: true, citations: [], issues: [], coverage: 0 }),
    },
    {
      generateTextFn: async () => {
        calls += 1;
        return calls === 1 ? "TCP需要三次握手。" : tcpAnswer();
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.quality.passed, true, JSON.stringify(result.quality.issues));
});

test("第二次仍低质量时返回可公开的 502 质量错误", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateTutorResponse(
        {
          message: "TCP为什么是三次握手而不是两次？",
          history: [],
          intent: analyzeChatIntent("TCP为什么是三次握手而不是两次？"),
          learnerContext: {},
          sourceMode: "model_only",
          groundingContext: null,
          followups: ["问题一", "问题二"],
          validateCitations: () => ({ approved: true, citations: [], issues: [], coverage: 0 }),
        },
        {
          generateTextFn: async () => {
            calls += 1;
            return "回答太短。";
          },
        },
      ),
    (error) => {
      assert.equal(error.code, "AI_RESPONSE_QUALITY_FAILED");
      assert.equal(error.statusCode, 502);
      assert.equal(String(error.message).includes("Prompt"), false);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("model_only Review 拒绝模型伪造本地引用标签", () => {
  const review = ReviewAgent.reviewChat({
    answerMarkdown: `${tcpAnswer()} [S1]`,
    sourceMode: "model_only",
    citations: [],
    quality: { issues: [], characterCount: 900, exampleCount: 1, misconceptionCount: 3, practiceCount: 1 },
  });
  assert.equal(review.passed, false);
  assert.ok(review.issues.some((item) => item.code === "model_only_fake_citation"));
});

test("引用只能来自本次检索结果", () => {
  const grounding = evidenceGrounding();
  assert.equal(validateAnswerCitations("左旋保持中序顺序 [S1]", grounding.retrieval).approved, true);
  const invalid = validateAnswerCitations("另一个结论 [S9]", grounding.retrieval);
  assert.equal(invalid.approved, false);
  assert.ok(invalid.issues.some((item) => item.type === "invalid_reference"));
});

test("runChat 在 RAG 命中且模型可用时返回 rag_model 和单一兼容 part", async () => {
  let captured;
  const citation = {
    label: "S1",
    chunkId: 12,
    sourceKey: "rbt-notes",
    sourceTitle: "红黑树课程讲义",
    license: "CC-BY-4.0",
    version: "1.0",
    excerpt: "左旋",
    supportScore: 0.9,
  };
  const result = await runChat(
    { studentId: 1, message: "红黑树左旋为什么不会破坏二叉搜索树的顺序？", history: [] },
    baseOptions({
      grounding: evidenceGrounding(),
      generate: async (input) => {
        captured = input;
        return generatedResult("# 红黑树左旋\n\n完整回答 [S1]", [citation]);
      },
    }),
  );
  assert.equal(result.sourceMode, "rag_model");
  assert.equal(result.subject, "数据结构");
  assert.equal(result.citations.length, 1);
  assert.equal(result.parts.length, 1);
  assert.equal(result.parts[0].agent, "TutorAgent");
  assert.equal(captured.learnerContext.mastery, 45);
  assert.deepEqual(captured.learnerContext.explanationPreference, ["图示和分步骤"]);
});

test("右旋连续追问用 resolvedQuestion 检索并返回 RAG 引用", async () => {
  let retrievalInput;
  let tutorInput;
  const citation = {
    label: "S1",
    chunkId: 12,
    sourceKey: "rbt-notes",
    sourceTitle: "红黑树课程讲义",
    license: "CC-BY-4.0",
    version: "1.0",
    excerpt: "右旋保持中序顺序",
    supportScore: 0.9,
  };
  const options = baseOptions({
    grounding: evidenceGrounding(),
    generate: async (input) => {
      tutorInput = input;
      return generatedResult("# 红黑树右旋\n\nA < x < B < y < C，右旋是左旋的镜像 [S1]", [citation]);
    },
  });
  options.prepareGroundingFn = async (_db, input) => {
    retrievalInput = input;
    return evidenceGrounding();
  };
  const result = await runChat(
    {
      studentId: 1,
      message: "那右旋呢？请沿用刚才相同的 A、x、B、y、C 关系解释。",
      history: [
        { role: "user", content: "红黑树左旋为什么不会破坏二叉搜索树的顺序？" },
        {
          role: "assistant",
          content: "A < x < B < y < C。",
          subject: "数据结构",
          knowledgePoint: "红黑树左旋",
        },
      ],
    },
    options,
  );
  assert.equal(retrievalInput.subject, "数据结构");
  assert.equal(retrievalInput.knowledgePoint, "红黑树右旋");
  assert.match(retrievalInput.query, /红黑树右旋为什么不会破坏二叉搜索树的顺序/);
  assert.equal(tutorInput.originalMessage.startsWith("那右旋呢"), true);
  assert.equal(tutorInput.resolvedQuestion, retrievalInput.query);
  assert.equal(result.sourceMode, "rag_model");
  assert.equal(result.knowledgePoint, "红黑树右旋");
  assert.equal(result.citations.length, 1);
  assert.ok(
    result.trace.steps.some((step) => step.name === "context_resolution" && step.status === "completed"),
  );
  assert.equal(/Prompt|systemPrompt|改写提示/.test(JSON.stringify(result.trace)), false);
});

test("TCP 和检索零结果仍调用模型并返回 model_only", async () => {
  let calls = 0;
  const result = await runChat(
    {
      studentId: 1,
      message: "TCP为什么是三次握手而不是两次？",
      history: [{ sender: "user", text: "先解释可靠传输" }],
    },
    baseOptions({
      grounding: emptyGrounding({ unsupported: true }),
      generate: async (input) => {
        calls += 1;
        assert.equal(input.history[0].content, "先解释可靠传输");
        return generatedResult(tcpAnswer());
      },
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.sourceMode, "model_only");
  assert.equal(result.subject, "计算机网络");
  assert.deepEqual(result.citations, []);
  assert.equal(result.knowledgeNotice, "本回答使用模型通识知识，暂未引用本地课程资料。");
  assert.equal(/拒绝|知识库没有/.test(result.answerMarkdown), false);
});

test("AI不可用时按证据分别返回 deterministic_fallback 或 503", async () => {
  const fallback = await runChat(
    { studentId: 1, message: "红黑树左旋的步骤是什么？", history: [] },
    baseOptions({
      grounding: evidenceGrounding(),
      aiEnabled: false,
    }),
  );
  assert.equal(fallback.sourceMode, "deterministic_fallback");
  assert.equal(fallback.modelAvailable, false);
  assert.ok(fallback.citations.length >= 1);
  assert.match(fallback.knowledgeNotice, /模型服务不可用/);

  await assert.rejects(
    () =>
      runChat(
        { studentId: 1, message: "TCP为什么是三次握手？", history: [] },
        baseOptions({
          grounding: emptyGrounding({ unsupported: true }),
          aiEnabled: false,
        }),
      ),
    (error) => error.code === "AI_SERVICE_UNAVAILABLE" && error.statusCode === 503,
  );
});

test("模型调用失败时有 RAG 降级、无 RAG 返回 503", async () => {
  const failedModel = async () => {
    throw new Error("provider timeout with hidden details");
  };
  const fallback = await runChat(
    { studentId: 1, message: "红黑树左旋的步骤是什么？", history: [] },
    baseOptions({
      grounding: evidenceGrounding(),
      generate: failedModel,
      aiEnabled: true,
    }),
  );
  assert.equal(fallback.sourceMode, "deterministic_fallback");
  assert.equal(fallback.modelAvailable, false);

  await assert.rejects(
    () =>
      runChat(
        { studentId: 1, message: "TCP为什么是三次握手？", history: [] },
        baseOptions({
          grounding: emptyGrounding({ unsupported: true }),
          generate: failedModel,
          aiEnabled: true,
        }),
      ),
    (error) => error.code === "AI_SERVICE_UNAVAILABLE" && !String(error.message).includes("provider timeout"),
  );
});

test("含糊短问题返回 clarification，明确偏好只生成建议不写库", async () => {
  const result = await runChat(
    { studentId: 1, message: "它？", history: [] },
    baseOptions({ grounding: emptyGrounding() }),
  );
  assert.equal(result.sourceMode, "clarification");
  assert.ok(result.followups.length >= 1 && result.followups.length <= 3);
  const suggestions = buildProfileSuggestions("以后讲慢一点，多给代码例子。");
  assert.deepEqual(suggestions[0].suggestedValue, ["较慢节奏", "分步骤讲解", "增加代码示例"]);
});

function baseOptions({ grounding, generate, aiEnabled = true }) {
  return {
    db: {},
    getCompleteProfileFn: async () => profileFixture(),
    getCurrentLearningPathFn: async () => ({
      stages: [
        {
          title: "红黑树阶段",
          subject: "数据结构",
          knowledgePoints: ["红黑树左旋"],
          progress: 20,
          status: "active",
        },
      ],
    }),
    prepareGroundingFn: async () => grounding,
    generateTutorResponseFn:
      generate ||
      (async () => {
        throw new Error("model should not be called");
      }),
    isAIEnabledFn: () => aiEnabled,
    persistGroundedCitationsFn: async () => true,
  };
}
