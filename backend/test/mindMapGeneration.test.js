/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateMindMapResource } = require("../src/services/mindMapService");
const { buildStructuredMindMapContent } = require("../src/services/mindMapFallbackService");

process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "true";

const context = {
  studentId: 7,
  resourceType: "mind_map",
  subject: "数据结构",
  knowledgePoint: "红黑树的结构、性质与插入修复",
  stageTitle: "红黑树阶段",
  stageGoals: ["理解红黑树性质", "掌握插入修复"],
  mastery: 45,
  errorPatterns: [{ errorType: "概念边界混淆", occurrenceCount: 2, confidence: 0.8 }],
  major: "软件工程",
  grade: "大二",
  currentCourse: "数据结构",
  priorKnowledge: ["C语言基础", "树与图基础薄弱"],
  learningGoals: ["准备408"],
  explanationPreference: "先图解后代码",
  resourcePreferences: ["思维导图", "代码示例"],
  paceAndTimeBudget: { pacePreference: "适中", weeklyTimeBudgetMinutes: 360 },
  estimatedMinutes: 40,
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

function goodContent(citations = []) {
  return buildStructuredMindMapContent(context, { citations });
}

function badQualityContent() {
  const content = goodContent();
  content.crossLinks = [];
  return content;
}

test("模型成功且质量通过时返回 rag_model 和真实节点引用", async () => {
  const content = goodContent([
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
  ]);
  const result = await generateMindMapResource(context, {
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

test("模型输出代码围栏JSON可安全解析", async () => {
  const result = await generateMindMapResource(context, {
    retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
    isAIEnabledFn: () => true,
    generateTextFn: async () => `\`\`\`json\n${JSON.stringify(goodContent())}\n\`\`\``,
  });
  assert.equal(result.sourceMode, "model_only");
  assert.equal(result.quality.passed, true);
});

test("模型输出前后解释可安全提取", async () => {
  const result = await generateMindMapResource(context, {
    retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
    isAIEnabledFn: () => true,
    generateTextFn: async () => `说明文字\n${JSON.stringify(goodContent())}\n结束说明`,
  });
  assert.equal(result.modelAvailable, true);
  assert.equal(result.quality.passed, true);
});

test("首次质量失败后使用反馈重试", async () => {
  let calls = 0;
  const result = await generateMindMapResource(context, {
    retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
    isAIEnabledFn: () => true,
    generateTextFn: async () => {
      calls += 1;
      return JSON.stringify(calls === 1 ? badQualityContent() : goodContent());
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.quality.passed, true);
});

test("模型连续低质量最多三次后拒绝", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateMindMapResource(context, {
        retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
        isAIEnabledFn: () => true,
        generateTextFn: async () => {
          calls += 1;
          return JSON.stringify(badQualityContent());
        },
      }),
    (error) => {
      assert.equal(error.code, "MIND_MAP_QUALITY_REJECTED");
      assert.equal(calls, 3);
      return true;
    },
  );
});

test("模型调用失败后进入确定性降级", async () => {
  const result = await generateMindMapResource(context, {
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

test("确定性降级不通过时拒绝", async () => {
  await assert.rejects(
    () =>
      generateMindMapResource(context, {
        retrieveKnowledgeFn: async () => ({ ...retrieval, results: [] }),
        isAIEnabledFn: () => false,
        fallbackBuilder: () => badQualityContent(),
      }),
    (error) => error.code === "MIND_MAP_QUALITY_REJECTED",
  );
});

test("知识库无命中时不生成假引用", async () => {
  const result = await generateMindMapResource(context, {
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
  assert.equal(JSON.stringify(result.content.content).includes("chunkId"), false);
});
