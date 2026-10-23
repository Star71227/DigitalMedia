/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseProfileAgentResponse,
  analyzeProfileDialogue,
  extractExplicitProfilePatch,
} = require("../src/services/agents/profileDialogueAgent");
const { emptyProfileDraft } = require("../src/services/profileSchema");

test("ProfileAgent 解析合法 JSON", () => {
  const parsed = parseProfileAgentResponse(
    JSON.stringify({
      profilePatch: {
        currentCourse: { value: "数据结构", confidence: 0.9, evidence: "我正在学数据结构" },
      },
    }),
  );
  assert.equal(parsed.profilePatch.currentCourse.value, "数据结构");
});

test("ProfileAgent 清理 Markdown 代码围栏", () => {
  const parsed = parseProfileAgentResponse(
    '```json\n{"profilePatch":{"learningGoals":{"value":["通过考试"],"confidence":0.8,"evidence":"希望通过考试"}}}\n```',
  );
  assert.deepEqual(parsed.profilePatch.learningGoals.value, ["通过考试"]);
});

test("ProfileAgent 拒绝未知字段", () => {
  const parsed = parseProfileAgentResponse(
    JSON.stringify({
      profilePatch: {
        learningAbility: { value: "高", confidence: 1, evidence: "模型猜测" },
        currentCourse: { value: "数据结构", confidence: 0.9, evidence: "学生原话" },
      },
    }),
  );
  assert.equal(parsed.profilePatch.learningAbility, undefined);
  assert.equal(parsed.profilePatch.currentCourse.value, "数据结构");
});

test("ProfileAgent 不覆盖高置信度已有字段", () => {
  const parsed = parseProfileAgentResponse(
    JSON.stringify({
      profilePatch: {
        currentCourse: { value: "操作系统", confidence: 0.8, evidence: "含糊表达" },
      },
    }),
    {},
    { currentCourse: { confidence: 0.95 } },
  );
  assert.equal(parsed.profilePatch.currentCourse, undefined);
});

test("ProfileAgent 模型失败时只保留明确表达并降级", async () => {
  const previous = process.env.SPARK_API_KEY;
  delete process.env.SPARK_API_KEY;
  const result = await analyzeProfileDialogue({
    currentDraft: emptyProfileDraft(),
    message: "我是计算机科学与技术大二学生，目前学习数据结构",
    roundCount: 0,
  });
  assert.equal(result.modelAvailable, false);
  assert.equal(result.profilePatch.currentCourse.value, "数据结构");
  if (previous) process.env.SPARK_API_KEY = previous;
});

test("显式规则提取每周时间且不猜测能力", () => {
  const patch = extractExplicitProfilePatch("我喜欢图解和代码示例，每周大约5小时，稳步学习");
  assert.equal(patch.paceAndTimeBudget.value.weeklyTimeBudgetMinutes, 300);
  assert.equal(patch.learningAbility, undefined);
});
