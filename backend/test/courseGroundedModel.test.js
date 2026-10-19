/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateGroundedAnswer } = require("../src/services/groundedAnswerService");
const evidence = {
  retrievalRunId: 1,
  confidence: "medium",
  insufficient: false,
  results: [
    {
      chunkId: 12,
      sourceKey: "course",
      sourceTitle: "课程讲义",
      license: "CC-BY-4.0",
      sourceVersion: "1",
      content: "左旋只改变局部父子关系，并保持二叉搜索树中序遍历的键顺序。",
    },
  ],
};
const db = { query: async () => [[]] };
const input = { studentId: 1, subject: "数据结构", query: "左旋会改变键的顺序吗" };
test("模型结论引用有效证据后才标记 AI 生成", async () => {
  const result = await generateGroundedAnswer(db, input, {
    retrieveKnowledgeFn: async () => evidence,
    generateJsonFn: async () => ({
      claims: [{ text: "左旋保持二叉搜索树中序遍历的键顺序", chunkIds: [12] }],
    }),
  });
  assert.equal(result.sourceMode, "rag_model");
  assert.match(result.answer, /\[S1\]/);
  assert.equal(result.citations[0].chunkId, 12);
});
test("模型引用伪造知识块时回退，不能冒充 AI 成功", async () => {
  const result = await generateGroundedAnswer(db, input, {
    retrieveKnowledgeFn: async () => evidence,
    generateJsonFn: async () => ({ claims: [{ text: "无依据答案", chunkIds: [999] }] }),
  });
  assert.equal(result.sourceMode, "deterministic_fallback");
  assert.ok(!result.answer.includes("无依据答案"));
});
test("证据不足时不调用模型；检索保留用户选择的课程", async () => {
  let called = false,
    subject;
  const result = await generateGroundedAnswer(
    db,
    { ...input, subject: "操作系统" },
    {
      retrieveKnowledgeFn: async (_, payload) => {
        subject = payload.subject;
        return { ...evidence, insufficient: true, results: [] };
      },
      generateJsonFn: async () => {
        called = true;
      },
    },
  );
  assert.equal(subject, "操作系统");
  assert.equal(called, false);
  assert.equal(result.status, "insufficient");
});
test("模型连接失败仍保留合法教材引用", async () => {
  const result = await generateGroundedAnswer(db, input, {
    retrieveKnowledgeFn: async () => evidence,
    generateJsonFn: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(result.sourceMode, "deterministic_fallback");
  assert.ok(result.citations.length);
});
