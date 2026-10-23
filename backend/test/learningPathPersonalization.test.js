/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDeterministicCandidate } = require("../src/services/learningPathService");

test("deterministic path exposes evidence, time budget and personal goal", () => {
  const catalog = {
    questions: [
      { questionId: "q-rbt-1", subject: "数据结构", knowledgePoint: "红黑树旋转" },
      { questionId: "q-list-1", subject: "数据结构", knowledgePoint: "链表" },
    ],
    codeExercises: [],
    knowledgePoints: ["红黑树旋转", "链表"],
  };
  const path = buildDeterministicCandidate(catalog, {
    currentCourse: "数据结构",
    weeklyTimeBudgetMinutes: 180,
    learningGoals: ["通过数据结构课程考试"],
    resourcePreferences: ["图解"],
    mastery: [
      { subject: "数据结构", knowledgePoint: "红黑树旋转", mastery: 35 },
      { subject: "数据结构", knowledgePoint: "链表", mastery: 70 },
    ],
    wrongQuestions: [
      { subject: "数据结构", knowledgePoint: "红黑树旋转", count: 4, errorReasons: ["旋转方向混淆"] },
    ],
  });
  assert.match(path.title, /先攻克红黑树旋转/);
  assert.match(path.stages[0].goals.join("\n"), /错题 4 道/);
  assert.match(path.stages[0].goals.join("\n"), /掌握度 35%/);
  assert.match(path.stages[0].goals.join("\n"), /旋转方向混淆/);
  assert.match(path.stages[0].goals.join("\n"), /通过数据结构课程考试/);
  assert.ok(path.stages.every((stage) => stage.durationMinutes >= 20 && stage.durationMinutes <= 135));
});
