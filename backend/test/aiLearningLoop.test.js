/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { splitText, queryTerms } = require("../src/services/personalKnowledgeService");
const { calculateNextReview } = require("../src/services/reviewScheduleService");
const { normalizeResults, normalizeBaiduHtml } = require("../src/services/webSearchService");
const {
  validateGeneratedQuestions,
  rankVerifiedQuestions,
  normalizeQuestionSelection,
  isSafeVerifiedQuestion,
} = require("../src/services/personalizedQuizService");
const { assertImageDataUrl } = require("../src/services/wrongQuestionRecognitionService");
const { createHandleChat } = require("../src/controllers/chatController");

test("personal knowledge splitter keeps every paragraph and bounded chunks", () => {
  const content = `# 红黑树\n\n${"左旋保持中序次序。".repeat(120)}\n\n## 删除修复\n\n双黑结点需要按兄弟颜色分类处理。`;
  const chunks = splitText(content);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((item) => item.content.length <= 1600));
  assert.match(chunks.map((item) => item.content).join("\n"), /双黑结点/);
});

test("Chinese query expansion produces useful terms", () => {
  const terms = queryTerms("红黑树左旋为什么保持中序遍历不变");
  assert.ok(terms.includes("红黑树左旋为什么保持中序遍历不变"));
  assert.ok(terms.includes("红黑"));
  assert.ok(terms.includes("左旋"));
});

test("rolling review resets failed recall and expands successful recall", () => {
  assert.deepEqual(
    calculateNextReview({ quality: 1, repetitionCount: 4, intervalDays: 20, easeFactor: 2.5 }),
    {
      intervalDays: 1,
      repetitionCount: 0,
      easeFactor: 1.96,
    },
  );
  const passed = calculateNextReview({ quality: 5, repetitionCount: 2, intervalDays: 6, easeFactor: 2.5 });
  assert.equal(passed.repetitionCount, 3);
  assert.equal(passed.intervalDays, 15);
  assert.equal(passed.easeFactor, 2.6);
});

test("web search adapter accepts supported shapes and rejects unsafe URLs", () => {
  const results = normalizeResults({
    results: [
      { title: "公开题目说明", url: "https://example.edu/exam", snippet: "题源摘要" },
      { title: "本地文件", url: "file:///secret", snippet: "不应使用" },
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].url, "https://example.edu/exam");
});

test("Baidu HTML search adapter extracts safe educational results", () => {
  const html = `<div class="result c-container xpath-log new-pmd"><h3><a href="https://example.edu/red-black-tree"><em>红黑树</em>插入</a></h3><div class="c-abstract">红黑树插入需要通过变色和旋转恢复性质。</div></div>`;
  assert.deepEqual(normalizeBaiduHtml(html), [
    {
      title: "红黑树 插入",
      url: "https://example.edu/red-black-tree",
      snippet: "红黑树插入需要通过变色和旋转恢复性质。",
      publishedAt: null,
      sourceName: "百度公开搜索摘要",
    },
  ]);
});

test("personalized quiz validator rejects answer leaks and malformed choices", () => {
  const source = [{ title: "公开来源", url: "https://example.edu" }];
  const good = Array.from({ length: 3 }, (_, index) => ({
    stem: `关于红黑树性质的第 ${index + 1} 道应用题，以下说法正确的是？`,
    options: ["选项甲", "选项乙", "选项丙", `选项丁${index}`],
    answer: "A",
    analysis: "依据节点颜色约束和任一路径黑高相同的性质进行逐项判断。",
    knowledgePoint: "红黑树",
    difficulty: "提高",
    sourceIndex: 0,
  }));
  assert.equal(validateGeneratedQuestions(good, 3, source).length, 3);
  assert.throws(
    () => validateGeneratedQuestions([{ ...good[0], options: ["相同", "相同", "相同", "相同"] }], 3, source),
    /未通过/,
  );
});

test("personalized quiz ranks verified weak-point questions and fills invalid AI selections deterministically", () => {
  const candidates = [
    { question_id: "q-general", knowledge_point: "数组", difficulty: "提高", is_core: true },
    { question_id: "q-path", knowledge_point: "链表", difficulty: "基础", is_core: false },
    { question_id: "q-weak", knowledge_point: "红黑树旋转", difficulty: "提高", is_core: false },
  ];
  const context = {
    knowledgePoint: "红黑树旋转",
    wrongPoints: ["红黑树旋转"],
    learningPath: [{ knowledgePoints: ["链表"] }],
  };
  const ranked = rankVerifiedQuestions(candidates, context, "提高");
  assert.deepEqual(
    ranked.map((item) => item.question_id),
    ["q-weak", "q-path", "q-general"],
  );
  assert.deepEqual(
    normalizeQuestionSelection({ questionIds: ["q-weak", "fake", "q-weak", "q-path"] }, candidates, 3),
    ["q-weak", "q-path"],
  );
});

test("personalized quiz excludes malformed or poorly explained bank questions", () => {
  const safe = {
    stem: "红黑树进行左旋后，哪一种遍历序列保持不变？",
    option_a: "先序",
    option_b: "中序",
    option_c: "后序",
    option_d: "层序",
    answer: "B",
    analysis: "左旋只改变局部父子关系，不改变键值的相对大小次序，因此中序序列保持不变。",
  };
  assert.equal(isSafeVerifiedQuestion(safe), true);
  assert.equal(isSafeVerifiedQuestion({ ...safe, option_d: "中序" }), false);
  assert.equal(isSafeVerifiedQuestion({ ...safe, analysis: "因为定义如此。" }), false);
});

test("wrong-question image input only accepts supported image data URLs", () => {
  assert.doesNotThrow(() => assertImageDataUrl("data:image/png;base64,aGVsbG8="));
  assert.throws(() => assertImageDataUrl("data:text/html;base64,aGVsbG8="), /PNG/);
});

test("assistant chat accepts a wrong-question attachment and returns grounded teaching content", async () => {
  const handler = createHandleChat({
    runChatFn: async () => {
      throw new Error("normal chat should not run");
    },
    analyzeWrongQuestionFn: async () => ({
      wrongQuestionId: 12,
      recognizedText: "红黑树左旋后中序序列是否改变？",
      subject: "数据结构",
      knowledgePoints: ["红黑树左旋"],
      errorReason: "混淆了结构调整与键值次序。",
      explanation: "左旋只调整局部父子关系。",
      confidence: "high",
      model: "vision-model",
      citations: [
        {
          label: "T1",
          chunkId: 8,
          sourceKey: "ds",
          sourceTitle: "数据结构讲义",
          excerpt: "旋转保持中序次序",
          score: 0.9,
          scope: "course",
        },
      ],
    }),
  });
  const req = {
    user: { studentId: 7 },
    body: { wrongQuestion: { subject: "数据结构", imageDataUrl: "data:image/png;base64,aGVsbG8=" } },
  };
  let payload;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };
  await handler(req, res, (error) => {
    throw error;
  });
  assert.equal(res.statusCode, 200);
  assert.match(payload.answerMarkdown, /红黑树左旋/);
  assert.match(payload.answerMarkdown, /\[T1\]/);
});
