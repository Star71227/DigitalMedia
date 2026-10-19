/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizePublicAnswer,
  trimHistoryRows,
  buildAutomaticTitle,
  normalizeTitle,
  redactSensitiveText,
  HISTORY_LIMIT,
  HISTORY_CHARACTER_LIMIT,
} = require("../src/services/chatSessionService");
const { validateChatResponse } = require("../src/services/chatResponseValidator");

test("自动标题移除 HTML、折叠换行并限制为 36 个字符", () => {
  const title = buildAutomaticTitle(`<script>alert(1)</script>\n${"红黑树左旋问题".repeat(10)}`);
  assert.equal(title.includes("<"), false);
  assert.equal(title.includes(">"), false);
  assert.ok(Array.from(title).length <= 36);
  assert.match(title, /alert/);
});

test("手工标题拒绝空白、HTML 和超过 60 个字符的值", () => {
  assert.equal(normalizeTitle("  红黑树旋转复习  "), "红黑树旋转复习");
  assert.throws(() => normalizeTitle("   "), /1 至 60/);
  assert.throws(() => normalizeTitle("<b>标题</b>"), /HTML/);
  assert.throws(() => normalizeTitle("题".repeat(61)), /1 至 60/);
});

test("公开回答只保留允许字段并清理敏感嵌套内容", () => {
  const publicAnswer = sanitizePublicAnswer({
    answerMarkdown: "# 安全公开答案",
    sourceMode: "model_only",
    subject: "计算机网络",
    knowledgePoint: "TCP三次握手",
    knowledgeNotice: "公开提示",
    citations: [{ label: "S1", chunkId: 7, sourceTitle: "讲义", apiKey: "SPARK_API_KEY=secret-value" }],
    codeBlocks: [{ language: "text", code: "Authorization: Bearer secret-token" }],
    followups: ["继续追问"],
    profileSuggestions: [
      {
        dimension: "explanationPreference",
        suggestedValue: ["分步骤"],
        evidence: "请讲慢一点",
        reason: "明确偏好",
        learnerContext: { secret: true },
      },
    ],
    trace: {
      collapsed: false,
      summary: "公开摘要",
      steps: [{ name: "TutorAgent", status: "completed", detail: "完成", prompt: "system prompt" }],
      rawPrompt: "secret",
    },
    quality: { passed: true, characterCount: 10, issues: [], providerResponse: "secret" },
    modelAvailable: true,
    systemPrompt: "do-not-store",
    providerRequest: { Authorization: "Bearer do-not-store" },
    learnerContext: { databaseRows: [1, 2, 3] },
    parts: [{ hiddenReasoning: "do-not-store" }],
  });
  const serialized = JSON.stringify(publicAnswer);
  assert.equal(serialized.includes("do-not-store"), false);
  assert.equal(serialized.includes("SPARK_API_KEY"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("rawPrompt"), false);
  assert.equal(serialized.includes("learnerContext"), false);
  assert.equal(serialized.includes("providerResponse"), false);
  assert.equal(publicAnswer.trace.collapsed, true);
});

test("数据库历史只保留最近 10 条并按时间正序返回", () => {
  const rowsNewestFirst = Array.from({ length: 14 }, (_, index) => ({
    id: 14 - index,
    role: index % 2 ? "user" : "assistant",
    content_text: `消息-${14 - index}`,
  }));
  const history = trimHistoryRows(rowsNewestFirst);
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].content, "消息-5");
  assert.equal(history.at(-1).content, "消息-14");
});

test("数据库助手历史只附带公开课程和知识点元数据", () => {
  const history = trimHistoryRows([
    {
      role: "assistant",
      content_text: "右旋与左旋互为镜像。",
      subject: "数据结构",
      knowledge_point: "红黑树右旋",
      answer_json: JSON.stringify({ systemPrompt: "不得进入历史" }),
    },
    { role: "user", content_text: "那右旋呢？", subject: "伪造课程", knowledge_point: "伪造知识点" },
  ]);
  assert.deepEqual(history, [
    { role: "user", content: "那右旋呢？" },
    { role: "assistant", content: "右旋与左旋互为镜像。", subject: "数据结构", knowledgePoint: "红黑树右旋" },
  ]);
  assert.equal(JSON.stringify(history).includes("systemPrompt"), false);
});

test("数据库历史总字符数严格限制为 8000", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? "user" : "assistant",
    content_text: `${index}-${"内".repeat(1200)}`,
  }));
  const history = trimHistoryRows(rows);
  const characters = history.reduce((sum, item) => sum + Array.from(item.content).length, 0);
  assert.equal(characters, HISTORY_CHARACTER_LIMIT);
});

test("公开文本会移除签名头、环境密钥赋值和本机绝对路径", () => {
  const text = redactSensitiveText(
    "Authorization: Bearer abcdefghijklmnop\nSPARK_API_SECRET=secret-value\nC:\\Users\\tester\\prompt.txt",
  );
  assert.equal(text.includes("abcdefghijklmnop"), false);
  assert.equal(text.includes("secret-value"), false);
  assert.equal(text.includes("C:\\Users"), false);
});

test("连续追问中的右旋关键词不会被相关性检查误拒绝", () => {
  const quality = validateChatResponse({
    answerMarkdown: "# 右旋回答\n\n右旋是左旋的镜像操作，并沿用上一轮 A、x、B、y、C 的局部结构。",
    message: "那右旋呢？请沿用刚才的符号关系解释。",
    knowledgePoint: "数据结构综合知识",
    complexity: false,
    followups: [],
  });
  assert.equal(quality.passed, true);
});
