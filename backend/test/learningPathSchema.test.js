/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLearningPath } = require("../src/services/learningPathSchema");

const catalog = {
  questions: [{ questionId: "Q-1", subject: "数据结构", knowledgePoint: "树" }],
  codeExercises: [
    { exerciseId: "C-1", subject: "数据结构", knowledgePoint: "树", pathCompletionEligible: true },
  ],
  knowledgePoints: ["树"],
};

function validPath() {
  return {
    title: "数据结构路径",
    stages: [
      {
        key: "s1",
        title: "树基础",
        subject: "数据结构",
        durationMinutes: 45,
        goals: ["掌握树"],
        knowledgePoints: ["树"],
        questionIds: ["Q-1"],
        codeExerciseIds: [],
        completion: { type: "quiz", ids: ["Q-1"] },
        dependsOn: [],
      },
      {
        key: "s2",
        title: "树实践",
        subject: "数据结构",
        durationMinutes: 45,
        goals: ["实现树"],
        knowledgePoints: ["树"],
        questionIds: [],
        codeExerciseIds: ["C-1"],
        completion: { type: "codelab", ids: ["C-1"] },
        dependsOn: ["s1"],
      },
    ],
  };
}

test("学习路径只接受字段白名单和严格资源引用", () => {
  assert.deepEqual(validateLearningPath(validPath(), catalog), validPath());
  assert.throws(() => validateLearningPath({ ...validPath(), studentId: 1 }, catalog), /unknown fields/);
  const nonexistent = validPath();
  nonexistent.stages[0].questionIds = ["Q-NOT-EXISTS"];
  nonexistent.stages[0].completion.ids = ["Q-NOT-EXISTS"];
  assert.throws(() => validateLearningPath(nonexistent, catalog), /invalid question reference/);
});

test("PlannerAgent 输出不能混用其他学科资源或创造 CodeLab ID", () => {
  const wrongSubject = validPath();
  wrongSubject.stages[0].subject = "操作系统";
  assert.throws(() => validateLearningPath(wrongSubject, catalog), /unknown knowledge point/);
  const fakeCode = validPath();
  fakeCode.stages[1].codeExerciseIds = ["C-FAKE"];
  fakeCode.stages[1].completion.ids = ["C-FAKE"];
  assert.throws(() => validateLearningPath(fakeCode, catalog), /invalid CodeLab reference/);
});

test("拒绝循环依赖、重复阶段和重复引用", () => {
  const cyclic = validPath();
  cyclic.stages[0].dependsOn = ["s2"];
  assert.throws(() => validateLearningPath(cyclic, catalog), /dependency must precede|cyclic dependency/);
  const duplicateStage = validPath();
  duplicateStage.stages[1].key = "s1";
  assert.throws(() => validateLearningPath(duplicateStage, catalog), /duplicate stage key/);
  const duplicateRef = validPath();
  duplicateRef.stages[0].questionIds = ["Q-1", "Q-1"];
  assert.throws(() => validateLearningPath(duplicateRef, catalog), /contains duplicates/);
});

test("拒绝语义重复阶段和未接入真实判题器的 CodeLab 完成条件", () => {
  const duplicate = validPath();
  duplicate.stages[1] = { ...duplicate.stages[0], key: "s2", dependsOn: ["s1"] };
  assert.throws(() => validateLearningPath(duplicate, catalog), /duplicate semantic stage/);
  const unverifiedCatalog = {
    ...catalog,
    codeExercises: [{ ...catalog.codeExercises[0], pathCompletionEligible: false }],
  };
  assert.throws(() => validateLearningPath(validPath(), unverifiedCatalog), /verified judge/);
});
