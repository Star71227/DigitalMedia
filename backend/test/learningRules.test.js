/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateMasteryDelta, clampMastery } = require("../src/services/quizSubmissionService");
const { buildRecommendations } = require("../src/services/learningRecommendationService");

test("中等题答错掌握度降低 6", () => assert.equal(calculateMasteryDelta("提高", false), -6));
test("中等题答对掌握度增加 6", () => assert.equal(calculateMasteryDelta("medium", true), 6));
test("掌握度限制在 0 到 100", () => {
  assert.equal(clampMastery(-20), 0);
  assert.equal(clampMastery(120), 100);
});
test("推荐结果受到资源偏好影响", () => {
  const recommendations = buildRecommendations({
    profile: {
      resourcePreferences: ["代码练习"],
      explanationPreference: "代码示例",
      paceAndTimeBudget: { weeklyTimeBudgetMinutes: 300 },
    },
    masteryChanges: [{ knowledgePointName: "红黑树旋转" }],
    errorAttributions: [
      {
        knowledgePointName: "红黑树旋转",
        knowledgePointId: "红黑树旋转",
        errorType: "procedure_confusion",
        label: "操作顺序混淆",
      },
    ],
  });
  assert.equal(recommendations[0].resourceType, "code_lab");
  assert.ok(recommendations.every((item) => item.reason));
});
