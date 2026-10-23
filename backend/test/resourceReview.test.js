/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { reviewResourceRules } = require("../src/services/resourceReviewRules");
const { mergeModelReview } = require("../src/services/resourceReviewService");

function context(overrides = {}) {
  return {
    subject: "数据结构",
    knowledgePoint: "栈",
    mastery: 62,
    stageTitle: "栈的应用",
    explanationPreference: "图示讲解",
    allowedQuestionIds: ["q1", "q2", "q3", "q4", "q5"],
    allowedCodeExerciseIds: ["ex1"],
    allowedCitationIds: [1],
    ...overrides,
  };
}
function envelope(type, content, overrides = {}) {
  return {
    resourceType: type,
    subject: "数据结构",
    knowledgePoint: "栈",
    generationRationale: ["栈的应用", "当前掌握度：62", "图示讲解"],
    targetLearnerSummary: "掌握度62，偏好图示讲解",
    citations: [],
    content,
    ...overrides,
  };
}
function note() {
  return envelope("study_note", {
    personalizedObjectives: ["理解栈"],
    foundationSummary: "栈是后进先出的线性结构，学习时需要结合入栈和出栈状态变化。",
    coreConcepts: [{ title: "后进先出", explanation: "最后进入的元素最先离开。", importance: "high" }],
    workedExamples: [{ question: "模拟序列", steps: ["入栈", "出栈"], answer: "得到逆序" }],
    commonMistakes: [{ mistake: "混淆栈顶", reason: "方向判断错误", correction: "逐步记录栈顶" }],
    practiceTasks: [{ prompt: "完成模拟", hint: "画栈", answerGuide: "核对状态" }],
    studyAdvice: ["逐步练习"],
    citationBasis: ["当前学习路径与画像"],
  });
}

test("规则审核返回六个维度、75分阈值且数值有限", () => {
  const review = reviewResourceRules(note(), context());
  assert.equal(review.dimensions.length, 6);
  assert.equal(review.passThreshold, 75);
  assert.ok(review.dimensions.every((item) => Number.isFinite(item.score)));
  assert.ok(Number.isFinite(review.totalScore));
});
test("可选字段缺失不会抛出500或产生NaN", () => {
  const review = reviewResourceRules({}, {});
  assert.equal(review.status, "rejected");
  assert.ok(Number.isFinite(review.score));
});
test("无效题目ID导致quiz_pack审核失败", () => {
  const questions = [1, 2, 3, 4, 5].map((id) => ({ questionId: id === 5 ? "fake" : `q${id}` }));
  const review = reviewResourceRules(
    envelope("quiz_pack", {
      difficultyDistribution: { foundation: 1, intermediate: 3, advanced: 1 },
      generationBasis: ["画像"],
      questions,
    }),
    context(),
  );
  assert.equal(review.passed, false);
  assert.ok(review.issues.some((item) => item.message.includes("无效题目ID")));
});
test("无效练习ID导致verified code_case审核失败", () => {
  const review = reviewResourceRules(
    envelope("code_case", {
      caseBackground: "练习栈操作并验证输入输出。",
      learningObjectives: ["实现栈"],
      starterCode: "int main(){return 0;}",
      tasks: ["实现"],
      testCases: [{ input: "1", expectedOutput: "1", description: "基础" }],
      verificationStatus: "verified",
      codeExerciseId: "fake",
    }),
    context(),
  );
  assert.equal(review.passed, false);
  assert.ok(review.issues.some((item) => item.message.includes("无效练习ID")));
});
test("generated code_case不冒充verified且证据说明不可完成路径", () => {
  const review = reviewResourceRules(
    envelope("code_case", {
      caseBackground: "这是生成案例，用于理解栈操作和边界条件。",
      learningObjectives: ["实现栈"],
      starterCode: "int main(){return 0;}",
      tasks: ["实现并测试"],
      testCases: [{ input: "1", expectedOutput: "1", description: "基础输入" }],
      verificationStatus: "generated",
      codeExerciseId: null,
    }),
    context(),
  );
  assert.ok(
    review.checks.some((item) => item.name.includes("练习ID") && item.detail.includes("不构成路径完成证据")),
  );
});
test("危险HTML或脚本导致安全审核失败", () => {
  const resource = note();
  resource.content.foundationSummary += "<script>alert(1)</script>";
  const review = reviewResourceRules(resource, context());
  assert.equal(review.passed, false);
  assert.equal(review.dimensions.find((item) => item.dimension === "safety").score, 0);
});
test("外部URL导致安全审核失败", () => {
  const resource = note();
  resource.content.foundationSummary += " https://evil.example";
  assert.equal(reviewResourceRules(resource, context()).passed, false);
});
test("无效引用不能通过审核", () => {
  const resource = note();
  resource.citations = [{ chunkId: 999, sourceKey: "x", sourceTitle: "x" }];
  const review = reviewResourceRules(resource, context());
  assert.equal(review.passed, false);
  assert.ok(review.issues.some((item) => item.message.includes("引用ID")));
});
test("模型问题只能扣分且不会固定回退90分", () => {
  const base = reviewResourceRules(note(), context());
  const merged = mergeModelReview(base, {
    summary: "发现问题",
    issues: [
      {
        severity: "high",
        dimension: "factuality",
        category: "factuality",
        location: "content",
        message: "事实待核验",
        suggestedFix: "补充证据",
        source: "ai",
      },
    ],
  });
  assert.notEqual(merged.score, 90);
  assert.ok(merged.score < base.score);
  assert.equal(merged.modelReviewExecuted, true);
});
test("2.4B generated code_case is rejected by the trusted gate", () => {
  const review = reviewResourceRules(
    envelope("code_case", {
      caseBackground: "Generated placeholder",
      learningObjectives: ["Implement stack"],
      starterCode: "int main(void){return 0;}",
      tasks: ["Implement"],
      testCases: [{ input: "1", expectedOutput: "1", description: "sample" }],
      verificationStatus: "generated",
      codeExerciseId: null,
    }),
    context(),
  );
  assert.equal(review.passed, false);
  assert.ok(review.issues.some((item) => String(item.message).includes("trusted CodeLab")));
});

test("2.4B trusted code_case quality summary passes factuality gate", () => {
  const review = reviewResourceRules(
    envelope("code_case", {
      caseBackground: "Trusted C CodeLab case with public examples and hidden judge evidence.",
      learningObjectives: ["Implement stack"],
      starterCode: "int main(void){return 0;}",
      tasks: ["Implement"],
      testCases: [
        { input: "1", expectedOutput: "1", description: "case 1" },
        { input: "2", expectedOutput: "2", description: "case 2" },
        { input: "3", expectedOutput: "3", description: "case 3" },
      ],
      boundaryConditions: ["empty", "single", "large"],
      verificationStatus: "verified",
      codeExerciseId: "ex1",
      qualitySummary: {
        trusted: true,
        executionMode: "docker",
        publicTestCount: 3,
        hiddenTestCount: 6,
        boundaryCategories: ["empty", "single", "large"],
        referenceAccepted: true,
        knownBugCaught: true,
        fixedOutputCaught: true,
      },
    }),
    context(),
  );
  assert.equal(
    review.issues.some((item) => String(item.message).includes("trusted Docker judge")),
    false,
  );
});
