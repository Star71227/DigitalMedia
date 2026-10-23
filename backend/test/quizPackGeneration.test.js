/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateQuizPackResource, buildQuizPack } = require("../src/services/quizPackService");

process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "true";

function context() {
  const mechanisms = [
    "左旋指针",
    "右旋镜像",
    "黑高约束",
    "插入修复",
    "删除修复",
    "颜色变换",
    "BST次序",
    "NIL叶子",
    "复杂度分析",
    "场景推演",
    "误区辨析",
    "代码过程",
    "边界条件",
    "状态验证",
  ];
  const questionEvidence = mechanisms.map((mechanism, index) => ({
    questionId: `QG-${index + 1}`,
    questionType: "single_choice",
    stem: `${mechanism}场景题：当执行过程发生状态变化时，应该如何判断下一步？`,
    optionA: `${mechanism}符合题干条件的处理`,
    optionB: `${mechanism}混淆概念边界的处理`,
    optionC: `${mechanism}忽略执行顺序的处理`,
    optionD: `${mechanism}错误套用其他场景的处理`,
    answer: "A",
    analysis: `本题考查${mechanism}，需要先确认题干中的对象、状态、限制条件和执行顺序，再把四个选项逐一核对。错误选项通常混淆概念边界、忽略关键条件或错用其他场景，复盘时应画出过程线并说明为什么正确机制满足题干限制。`,
    hint: `先回到${mechanism}的条件和过程，再排除混淆概念或跳过步骤的选项。`,
    difficulty: index < 6 ? "基础" : index < 10 ? "提高" : "综合",
    knowledgePoint: "红黑树旋转",
    abilityDimension: mechanism,
    tags: [mechanism, index % 3 === 0 ? "场景题" : index % 3 === 1 ? "误区辨析" : "过程推演"],
    optionErrorTypes: { B: "concept_misunderstanding", C: "procedure_confusion", D: "scenario_confusion" },
  }));
  return {
    studentId: 7,
    resourceType: "quiz_pack",
    subject: "数据结构",
    knowledgePoint: "红黑树旋转",
    stageTitle: "红黑树阶段",
    stageGoals: ["理解红黑树旋转", "应用旋转修复"],
    mastery: 45,
    errorPatterns: [{ errorType: "概念混淆", occurrenceCount: 2, confidence: 0.8 }],
    explanationPreference: "图解",
    resourcePreferences: ["练习包"],
    priorKnowledge: [],
    paceAndTimeBudget: { pacePreference: "适中" },
    estimatedMinutes: 30,
    difficulty: "foundation",
    allowedQuestionIds: questionEvidence.map((item) => item.questionId),
    allowedCodeExerciseIds: [],
    questionEvidence,
    codeEvidence: [],
  };
}

test("模型只选择题号时返回 question_bank_model 且系统重建真实题目", async () => {
  const ctx = context();
  const selectedQuestionIds = ctx.allowedQuestionIds.slice(0, 14);
  const result = await generateQuizPackResource(ctx, {
    isAIEnabledFn: () => true,
    generateTextFn: async () => JSON.stringify({ selectedQuestionIds }),
  });
  assert.equal(result.sourceMode, "question_bank_model");
  assert.equal(result.modelAvailable, true);
  assert.equal(result.quality.passed, true);
  assert.equal(result.content.content.questions.length, 14);
  assert.equal(result.content.content.questions[0].stem.includes("模型"), false);
  assert.equal(result.content.content.questions[0].correctAnswer, "A");
});

test("模型无效题号会重试，第二次合格后通过", async () => {
  const ctx = context();
  let calls = 0;
  const result = await generateQuizPackResource(ctx, {
    isAIEnabledFn: () => true,
    generateTextFn: async () => {
      calls += 1;
      return calls === 1
        ? JSON.stringify({ selectedQuestionIds: ["FAKE"] })
        : JSON.stringify({ selectedQuestionIds: ctx.allowedQuestionIds.slice(0, 14) });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.quality.passed, true);
});

test("模型连续低质量最多三次后拒绝", async () => {
  const ctx = context();
  let calls = 0;
  await assert.rejects(
    () =>
      generateQuizPackResource(ctx, {
        isAIEnabledFn: () => true,
        generateTextFn: async () => {
          calls += 1;
          return JSON.stringify({ selectedQuestionIds: ctx.allowedQuestionIds.slice(0, 8) });
        },
      }),
    (error) => {
      assert.equal(error.code, "QUIZ_PACK_QUALITY_REJECTED");
      assert.equal(calls, 3);
      return true;
    },
  );
});

test("模型服务失败后使用确定性回退", async () => {
  const ctx = context();
  const result = await generateQuizPackResource(ctx, {
    isAIEnabledFn: () => true,
    generateTextFn: async () => {
      throw new Error("Spark HTTP 401: secret");
    },
  });
  assert.equal(result.sourceMode, "deterministic_fallback");
  assert.equal(result.modelAvailable, false);
  assert.equal(result.quality.passed, true);
});

test("确定性回退不通过时拒绝", async () => {
  const ctx = context();
  await assert.rejects(
    () =>
      generateQuizPackResource(ctx, {
        isAIEnabledFn: () => false,
        fallbackBuilder: () => {
          const pack = buildQuizPack(ctx);
          pack.questions = pack.questions.slice(0, 6);
          pack.difficultyDistribution = { foundation: 2, intermediate: 2, advanced: 2 };
          return pack;
        },
      }),
    (error) => error.code === "QUIZ_PACK_QUALITY_REJECTED",
  );
});
