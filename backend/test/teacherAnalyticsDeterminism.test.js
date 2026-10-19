/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathProgress } = require("../src/services/teacherAnalyticsService");
const { calculateStudentRisk } = require("../src/services/studentRiskService");

test("路径进度只使用真实完成证据，并遵守阶段依赖", () => {
  const snapshot = {
    stages: [
      { key: "stage-1", dependsOn: [], completion: { type: "quiz", ids: ["q1", "q2"] } },
      { key: "stage-2", dependsOn: ["stage-1"], completion: { type: "resource", ids: ["mind_map"] } },
    ],
  };
  const partial = { quiz: new Map([["q1", "2026-07-01T00:00:00Z"]]), code: new Map(), resource: new Map() };
  assert.equal(pathProgress(snapshot, 1, partial), 25);
  const complete = {
    quiz: new Map([
      ["q1", "2026-07-01T00:00:00Z"],
      ["q2", "2026-07-02T00:00:00Z"],
    ]),
    code: new Map(),
    resource: new Map([["1:stage-2", new Map([["mind_map", "2026-07-03T00:00:00Z"]])]]),
  };
  assert.equal(pathProgress(snapshot, 1, complete), 100);
});

test("低风险规则不会把缺失测验或路径进度误判为零分", () => {
  const result = calculateStudentRisk({
    recentQuizAccuracy: null,
    pathProgress: null,
    lastActivityAt: new Date().toISOString(),
    mastery: [],
  });
  assert.equal(result.level, "low");
});
