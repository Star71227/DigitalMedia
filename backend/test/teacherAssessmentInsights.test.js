/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReport } = require("../src/services/teacherReportService");
const { buildHtml } = require("../src/services/assessmentHtmlService");
const { quizFilters } = require("../src/services/teacherQuizFilters");
const snapshot = {
  student: { displayName: "<测试学生>" },
  profile: { currentVersion: 2, history: [] },
  mastery: [
    { knowledgePoint: "树", mastery: 45 },
    { knowledgePoint: "栈", mastery: 90 },
  ],
  quizTrend: [
    { correct_count: 1, total_count: 2 },
    { correct_count: 9, total_count: 10 },
  ],
  path: { currentVersion: 1, progress: 0 },
  resources: [],
  retrievalActivity: [],
  risk: { level: "medium", reasons: ["树掌握度偏低"] },
  recommendations: ["复习树"],
};
test("报告正确率加权并为薄弱知识点生成可复测计划", () => {
  const r = buildReport(snapshot, { rangeDays: 30 });
  assert.equal(r.quizAnalysis.averageAccuracy, (10 / 12) * 100);
  assert.equal(r.evidence.answeredCount, 12);
  assert.equal(r.actionPlan[0].knowledgePoint, "树");
  assert.equal(r.evidence.masteredCount, 1);
  assert.match(r.dataQuality.note, /最新状态/);
  assert.equal(r.pathAnalysis.progress, 0);
});
test("无数据报告不虚构零分或优势，并提出建立基线", () => {
  const r = buildReport({ ...snapshot, mastery: [], quizTrend: [] }, { rangeDays: 7 });
  assert.equal(r.quizAnalysis.averageAccuracy, null);
  assert.deepEqual(r.progressHighlights, []);
  assert.equal(r.actionPlan[0].knowledgePoint, "建立评估基线");
  assert.ok(r.dataQuality.gaps.length >= 2);
});
test("PDF 模板转义学生输入并保留诊断与行动计划", () => {
  const html = buildHtml(buildReport(snapshot, { rangeDays: 30 }));
  assert.match(html, /&lt;测试学生&gt;/);
  assert.ok(!html.includes("<测试学生>"));
  assert.match(html, /教学跟进与复习计划/);
  assert.match(html, /知识点诊断/);
});
test("测验筛选使用参数绑定并拒绝无效周期", () => {
  const f = quizFilters({ rangeDays: 7, subject: "数据结构' OR 1=1" });
  assert.deepEqual(f.params, [7, "数据结构' OR 1=1"]);
  assert.ok(!f.sql.includes("OR 1=1"));
  assert.throws(() => quizFilters({ rangeDays: 0 }), /无效/);
  assert.throws(() => quizFilters({ rangeDays: NaN }), /无效/);
});
