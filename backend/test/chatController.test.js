/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createHandleChat } = require("../src/controllers/chatController");
const app = require("../src/app");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("chatController 调用 runChat 并原样返回统一 ChatAnswer", async () => {
  let input;
  const expected = {
    messageId: "m-1",
    answerMarkdown: "# 完整回答",
    sourceMode: "model_only",
    subject: "计算机网络",
    knowledgePoint: "TCP三次握手",
    citations: [],
    parts: [],
  };
  const handleChat = createHandleChat({
    runChatFn: async (value) => {
      input = value;
      return expected;
    },
  });
  const req = {
    body: {
      message: "TCP为什么是三次握手？",
      history: [{ sender: "user", text: "上一问" }],
      subject: "数据结构",
    },
    user: { studentId: 7 },
    requestId: "request-test-1",
  };
  const res = responseRecorder();
  await handleChat(req, res, (error) => {
    throw error;
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, expected);
  assert.deepEqual(input, { studentId: 7, message: "TCP为什么是三次握手？", history: req.body.history });
  assert.equal(
    Object.prototype.hasOwnProperty.call(input, "subject"),
    false,
    "Controller 不得再固定数据结构",
  );
});

test("持久化会话只保存 originalMessage 且不会保存内部改写", async () => {
  const savedMessages = [];
  let runInput;
  const sessionService = {
    createSession: async () => ({ id: 31, status: "active" }),
    saveUserMessage: async (_studentId, _sessionId, message) => {
      savedMessages.push(message);
      return { id: 88, content: message };
    },
    buildSessionHistory: async (_studentId, _sessionId, options) => {
      assert.equal(options.excludeMessageId, 88);
      return [];
    },
    saveAssistantMessage: async () => undefined,
    saveFailedAssistantMessage: async () => undefined,
  };
  const handleChat = createHandleChat({
    sessionService,
    runChatFn: async (input) => {
      runInput = input;
      return {
        messageId: "m-original",
        answerMarkdown: "# 回答",
        sourceMode: "model_only",
        subject: "数据结构",
        knowledgePoint: "红黑树右旋",
        citations: [],
      };
    },
  });
  const originalMessage = "那右旋呢？";
  const legacyHistory = [
    { role: "user", content: "红黑树左旋为什么保持中序顺序？" },
    { role: "assistant", content: "左旋保持中序顺序。" },
  ];
  const res = responseRecorder();
  await handleChat(
    {
      body: {
        message: originalMessage,
        history: legacyHistory,
      },
      user: { studentId: 7 },
    },
    res,
    (error) => {
      throw error;
    },
  );
  assert.deepEqual(savedMessages, [originalMessage]);
  assert.equal(runInput.message, originalMessage);
  assert.deepEqual(runInput.history, legacyHistory);
  assert.equal(JSON.stringify(savedMessages).includes("红黑树右旋为什么"), false);
});

test("chatController 把模型不可用错误映射为安全 503", async () => {
  const error = new Error("secret prompt SPARK_API_KEY=do-not-leak stack");
  error.code = "AI_SERVICE_UNAVAILABLE";
  error.statusCode = 503;
  error.publicMessage = "当前模型服务不可用，本地知识库也未覆盖该问题，请检查AI配置后重试。";
  const handleChat = createHandleChat({
    runChatFn: async () => {
      throw error;
    },
  });
  const req = { body: { message: "TCP为什么三次握手" }, user: { studentId: 1 }, requestId: "request-test-2" };
  const res = responseRecorder();
  await handleChat(req, res, (unexpected) => {
    throw unexpected;
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "AI_SERVICE_UNAVAILABLE");
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes("SPARK_API_KEY"), false);
  assert.equal(serialized.includes("secret prompt"), false);
  assert.equal(serialized.includes("stack"), false);
});

test("chatController 对第二次质量失败返回安全 502", async () => {
  const error = new Error("internal quality prompt");
  error.code = "AI_RESPONSE_QUALITY_FAILED";
  error.statusCode = 502;
  error.publicMessage = "模型连续两次未生成符合教学质量要求的回答，请稍后重试。";
  const handleChat = createHandleChat({
    runChatFn: async () => {
      throw error;
    },
  });
  const res = responseRecorder();
  await handleChat({ body: { message: "解释红黑树" }, user: { studentId: 1 } }, res, (unexpected) => {
    throw unexpected;
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.message, error.publicMessage);
  assert.equal(JSON.stringify(res.body).includes("internal quality prompt"), false);
});

test("无效 message 返回 400 且不调用 runChat", async () => {
  let called = false;
  const handleChat = createHandleChat({
    runChatFn: async () => {
      called = true;
    },
  });
  const res = responseRecorder();
  await handleChat(
    { body: { message: "   ", history: "invalid" }, user: { studentId: 1 } },
    res,
    () => undefined,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test("未登录调用真实路由仍返回 401", async () => {
  const response = await request(app).post("/api/chat").send({ message: "TCP为什么是三次握手？" });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, "AUTH_REQUIRED");
});
