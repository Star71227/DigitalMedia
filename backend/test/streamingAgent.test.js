/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readModelStream } = require("../src/services/modelStream");
const { validateChatResponse } = require("../src/services/chatResponseValidator");
const { validateGeneratedQuestions } = require("../src/services/personalizedQuizService");
const { createHandleChat } = require("../src/controllers/chatController");
const { orchestrateChat } = require("../src/services/agentOrchestrator");
test("UTF8 split chunks stream only public content", async () => {
  const bytes = Buffer.from(
    'data: {"choices":[{"delta":{"reasoning_content":"hidden","content":"第一行\\n第二行"}}]}\n\ndata: [DONE]\n',
  );
  async function* chunks() {
    for (let i = 0; i < bytes.length; i += 3) yield bytes.subarray(i, i + 3);
  }
  const seen = [];
  assert.equal(await readModelStream(chunks(), (s) => seen.push(s)), "第一行\n第二行");
  assert.deepEqual(seen, ["第一行\n第二行"]);
});
test("incomplete stream is rejected", async () => {
  async function* chunks() {
    yield Buffer.from('data: {"choices":[{"delta":{"content":"unfinished"}}]}\n');
  }
  await assert.rejects(
    readModelStream(chunks(), () => {}),
    /interrupted/,
  );
});
test("valid short answer is not rejected for lacking tutorial headings", () => {
  assert.equal(
    validateChatResponse({
      conversational: true,
      message: "栈有什么特点",
      knowledgePoint: "栈",
      answerMarkdown: "栈遵循后进先出原则：最后压入的元素会最先弹出。",
    }).passed,
    true,
  );
});
test("exercise requests must not silently return one of three requested questions", () => {
  const result = validateChatResponse({
    conversational: true,
    message: "给出三道栈的选择题",
    knowledgePoint: "栈",
    answerMarkdown: "栈后进先出。A. 正确 B.错误。正确答案是A，因为最后进入的元素最先离开。",
  });
  assert.ok(result.issues.some((i) => i.code === "missing_questions"));
});
test("source index must reference a real retrieved source", () => {
  const item = {
    stem: "栈的访问顺序是什么？",
    options: ["后进先出", "先进先出", "随机访问", "均不正确"],
    answer: "A",
    analysis: "栈的操作仅在栈顶进行，因此后进先出。",
  };
  assert.throws(() => validateGeneratedQuestions([item], 1, [{ url: "https://example.org" }], 1));
  assert.equal(validateGeneratedQuestions([{ ...item, sourceIndex: 0 }], 1, [{}], 1).length, 1);
});
test("NDJSON route emits partial answer then persists and finalizes", async () => {
  const events = [];
  let saved = false;
  const sessions = {
    createSession: async () => ({ id: 1 }),
    saveUserMessage: async () => ({ id: 2 }),
    buildSessionHistory: async () => [],
    saveAssistantMessage: async () => {
      saved = true;
    },
    saveFailedAssistantMessage: async () => {},
  };
  const handle = createHandleChat({
    sessionService: sessions,
    runChatFn: async ({ onDelta }) => {
      onDelta("栈");
      onDelta("后进先出");
      return { answerMarkdown: "栈后进先出", sourceMode: "model_only", citations: [] };
    },
  });
  const res = {
    headersSent: false,
    writableEnded: false,
    status() {
      return this;
    },
    set() {
      return this;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    on() {},
    write(s) {
      events.push(JSON.parse(s));
    },
    end() {
      this.writableEnded = true;
    },
  };
  await handle({ body: { stream: true, message: "栈的特点" }, user: { studentId: 1 } }, res, (e) => {
    throw e;
  });
  assert.equal(saved, true);
  assert.deepEqual(
    events.filter((e) => e.type === "delta").map((e) => e.text),
    ["栈", "后进先出"],
  );
  assert.equal(events.at(-1).type, "done");
});
test("NDJSON errors after headers remain structured and retain user message", async () => {
  let failed = false;
  const events = [];
  const sessions = {
    createSession: async () => ({ id: 1 }),
    saveUserMessage: async () => ({ id: 2 }),
    buildSessionHistory: async () => [],
    saveFailedAssistantMessage: async () => {
      failed = true;
    },
  };
  const handle = createHandleChat({
    sessionService: sessions,
    runChatFn: async () => {
      throw Object.assign(new Error("private trace"), {
        code: "AI_SERVICE_UNAVAILABLE",
        publicMessage: "模型未就绪",
        statusCode: 503,
      });
    },
  });
  const res = {
    headersSent: false,
    writableEnded: false,
    status() {
      return this;
    },
    set() {
      return this;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    on() {},
    write(s) {
      events.push(JSON.parse(s));
    },
    end() {
      this.writableEnded = true;
    },
  };
  await handle({ body: { stream: true, message: "栈的特点" }, user: { studentId: 1 } }, res, (e) => {
    throw e;
  });
  assert.equal(failed, true);
  assert.equal(events.at(-1).type, "error");
  assert.equal(events.at(-1).message, "模型未就绪");
});

test("orchestrator forwards stream callbacks and abort signal to tutor generation", async () => {
  const deltas = [];
  const resets = [];
  const controller = new AbortController();
  let received;
  const answer = await orchestrateChat(
    {
      studentId: 1,
      message: "请解释栈的后进先出原理并举例",
      history: [],
      onDelta: (text) => deltas.push(text),
      onReset: (text) => resets.push(text),
      signal: controller.signal,
    },
    {
      getCompleteProfileFn: async () => ({ profile: { currentCourse: "数据结构" } }),
      getCurrentLearningPathFn: async () => null,
      prepareGroundingFn: async () => ({
        hasEvidence: false,
        context: { evidence: [] },
        warning: null,
        retrieval: null,
      }),
      isAIEnabledFn: () => true,
      generateTutorResponseFn: async (_input, options) => {
        received = options;
        options.onDelta("增量");
        return {
          answerMarkdown: "栈是后进先出的线性结构。",
          citations: [],
          citationValidation: null,
          citationCoverage: 0,
          quality: { passed: true, issues: [] },
          codeBlocks: [],
          retryCount: 0,
          review: { passed: true, issues: [] },
        };
      },
    },
  );
  assert.equal(answer.answerMarkdown, "栈是后进先出的线性结构。");
  assert.equal(received.signal, controller.signal);
  assert.equal(typeof received.onReset, "function");
  assert.deepEqual(deltas, ["增量"]);
  assert.deepEqual(resets, []);
});
