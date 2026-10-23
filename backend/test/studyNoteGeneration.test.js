/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateStudyNoteResource } = require("../src/services/studyNoteService");
const { buildDetailedStudyNoteContent } = require("../src/services/studyNoteFallbackService");

process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "true";

const context = {
  studentId: 7,
  resourceType: "study_note",
  subject: "数据结构",
  knowledgePoint: "红黑树的插入修复与旋转",
  stageTitle: "红黑树阶段",
  stageGoals: ["理解红黑树插入修复", "掌握旋转"],
  mastery: 45,
  weakPoints: ["红黑树"],
  errorPatterns: [{ errorType: "混淆旋转方向", occurrenceCount: 2, confidence: 0.8 }],
  major: "软件工程",
  grade: "大二",
  currentCourse: "数据结构",
  profileVersion: 3,
  priorKnowledge: ["C语言基础", "树与图基础薄弱"],
  learningGoals: ["准备408"],
  explanationPreference: "先图解后代码",
  resourcePreferences: ["学习讲义", "代码示例"],
  paceAndTimeBudget: { pacePreference: "适中", weeklyTimeBudgetMinutes: 360 },
  estimatedMinutes: 45,
  difficulty: "foundation",
  allowedQuestionIds: [],
  allowedCodeExerciseIds: [],
  questionEvidence: [],
  codeEvidence: [],
};
const retrieval = {
  retrievalRunId: 91,
  insufficient: false,
  unsupportedForRag: false,
  confidence: "high",
  results: [
    {
      chunkId: 12,
      sourceKey: "rbt",
      sourceTitle: "红黑树课程讲义",
      chapter: "红黑树",
      section: "插入修复",
      sourceVersion: "1.0",
      license: "CC-BY-4.0",
      content: "红黑树插入修复通过变色和旋转保持红黑性质，根节点最终为黑色。",
      score: 0.9,
    },
  ],
};

function retrieveKnowledgeFn() {
  return retrieval;
}

function badContent() {
  return {
    personalizedObjectives: ["理解红黑树"],
    foundationSummary: "太短。",
    coreConcepts: [{ title: "概念", explanation: "红黑树。", importance: "high" }],
    diagrams: [{ title: "图", description: "图。", steps: ["看图"] }],
    methodsAndFormulas: [
      { title: "方法", expression: "if red then rotate", explanation: "方法。", conditions: ["条件"] },
    ],
    workedExamples: [{ question: "例题", steps: ["一步"], answer: "答案" }],
    commonMistakes: [{ mistake: "错误", reason: "原因", correction: "纠正" }],
    practiceTasks: [{ prompt: "练习题：说明红黑树", hint: "提示", answerGuide: "答案" }],
    studyAdvice: ["总结。"],
    citationBasis: ["S1：红黑树课程讲义。[S1]"],
  };
}

test("模型成功且质量通过时返回 rag_model 和真实引用", async () => {
  const content = buildDetailedStudyNoteContent(context, {
    citations: [
      {
        label: "S1",
        chunkId: 12,
        sourceKey: "rbt",
        sourceTitle: "红黑树课程讲义",
        chapter: "红黑树",
        section: "插入修复",
        version: "1.0",
        license: "CC-BY-4.0",
        excerpt: "红黑树插入修复通过变色和旋转保持红黑性质，根节点最终为黑色。",
        supportScore: 0.9,
      },
    ],
  });
  const result = await generateStudyNoteResource(context, {
    retrieveKnowledgeFn,
    isAIEnabledFn: () => true,
    generateTextFn: async () => JSON.stringify(content),
  });
  assert.equal(result.sourceMode, "rag_model");
  assert.equal(result.modelAvailable, true);
  assert.equal(result.quality.passed, true);
  assert.equal(result.content.citations.length, 1);
  assert.equal(result.citationValidation.approved, true);
});

test("首次质量失败后使用质量反馈重试", async () => {
  let calls = 0;
  const result = await generateStudyNoteResource(context, {
    retrieveKnowledgeFn,
    isAIEnabledFn: () => true,
    generateTextFn: async () => {
      calls += 1;
      return JSON.stringify(
        calls === 1 ? badContent() : buildDetailedStudyNoteContent(context, { citations: [] }),
      );
    },
    retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
  });
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.quality.passed, true);
});

test("模型调用失败后进入确定性降级", async () => {
  const result = await generateStudyNoteResource(context, {
    retrieveKnowledgeFn,
    isAIEnabledFn: () => true,
    generateTextFn: async () => {
      throw new Error("Spark HTTP 401: secret");
    },
  });
  assert.equal(result.sourceMode, "deterministic_fallback");
  assert.equal(result.modelAvailable, false);
  assert.equal(result.quality.passed, true);
});

test("模型连续低质量最多三次后拒绝", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateStudyNoteResource(context, {
        retrieveKnowledgeFn,
        isAIEnabledFn: () => true,
        generateTextFn: async () => {
          calls += 1;
          return JSON.stringify(badContent());
        },
      }),
    (error) => {
      assert.equal(error.code, "RESOURCE_QUALITY_REJECTED");
      assert.equal(calls, 3);
      return true;
    },
  );
});

test("确定性降级不通过时也拒绝", async () => {
  await assert.rejects(
    () =>
      generateStudyNoteResource(context, {
        retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
        isAIEnabledFn: () => false,
        fallbackBuilder: () => badContent(),
      }),
    (error) => error.code === "RESOURCE_QUALITY_REJECTED",
  );
});

test("知识库无命中时不生成假引用", async () => {
  const result = await generateStudyNoteResource(context, {
    retrieveKnowledgeFn: async () => ({
      retrievalRunId: null,
      insufficient: true,
      unsupportedForRag: true,
      confidence: "insufficient",
      results: [],
    }),
    isAIEnabledFn: () => false,
  });
  assert.equal(result.content.citations.length, 0);
  assert.equal(result.quality.citationsAvailable, false);
  assert.equal(/\[S\d+\]/.test(JSON.stringify(result.content.content)), false);
});
