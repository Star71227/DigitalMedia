/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const {
  RESOURCE_TYPES,
  groupCourses,
  resourceTypeCounts,
  buildActivities,
} = require("../src/services/studentInsightService");

test("课程概览只聚合真实掌握记录并保留计数", () => {
  const courses = groupCourses([
    { subject: "数据结构", mastery: 40, practiceCount: 2, wrongCount: 1 },
    { subject: "数据结构", mastery: 80, practiceCount: 3, wrongCount: 0 },
    { subject: "", mastery: 100, practiceCount: 99, wrongCount: 0 },
  ]);
  assert.deepEqual(courses, [
    { subject: "数据结构", mastery: 60, practiceCount: 5, wrongCount: 1, knowledgePointCount: 2 },
  ]);
});

test("最近活动按真实时间倒序且不产生固定记录", () => {
  const activities = buildActivities({
    events: [],
    quizzes: [{ subject: "数据结构", score: 60, submitted_at: "2026-01-01T08:00:00Z" }],
    resources: [{ title: "树", completed_at: "2026-01-02T08:00:00Z" }],
    codeSubmissions: [{ exercise_id: "DS-1", status: "success", created_at: "2026-01-03T08:00:00Z" }],
  });
  assert.deepEqual(
    activities.map((item) => item.type),
    ["codelab", "resource", "quiz"],
  );
});

test("学生统计始终返回五类资源且未验证完成不计入路径证据", () => {
  const counts = resourceTypeCounts([
    { resource_type: "study_note", progress_status: "completed" },
    { resource_type: "code_case", progress_status: "completed_unverified" },
    { resource_type: "pptx", progress_status: "in_progress" },
  ]);
  assert.deepEqual(Object.keys(counts), RESOURCE_TYPES);
  assert.equal(counts.study_note.completedCount, 1);
  assert.equal(counts.code_case.generatedCount, 1);
  assert.equal(counts.code_case.completedCount, 0);
  assert.equal(counts.pptx.inProgressCount, 1);
  assert.deepEqual(counts.quiz_pack, { generatedCount: 0, completedCount: 0, inProgressCount: 0 });
});

test("学生概览与评估接口要求登录", async () => {
  const [overview, assessment] = await Promise.all([
    request(app).get("/api/student/overview"),
    request(app).get("/api/student/assessment"),
  ]);
  assert.equal(overview.status, 401);
  assert.equal(assessment.status, 401);
});
