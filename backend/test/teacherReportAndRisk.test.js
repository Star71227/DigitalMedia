/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { calculateStudentRisk } = require("../src/services/studentRiskService");
const { stableStringify, buildReport } = require("../src/services/teacherReportService");
const { generateAssessmentPdf } = require("../src/services/assessmentPdfService");
const storage = require("../src/services/teacherReportStorageService");
test("风险规则由真实指标确定且返回原因", () => {
  assert.equal(
    calculateStudentRisk({ recentQuizAccuracy: 42, lastActivityAt: new Date().toISOString(), mastery: [] })
      .level,
    "high",
  );
  const medium = calculateStudentRisk({
    recentQuizAccuracy: 65,
    lastActivityAt: new Date().toISOString(),
    mastery: [],
  });
  assert.equal(medium.level, "medium");
  assert.match(medium.reasons[0], /65/);
});
test("报告快照稳定序列化不受对象键顺序影响", () => {
  assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
});
test("报告指纹序列化与 JSON 保存语义一致", () => {
  const value = {
    kept: 1,
    omitted: undefined,
    array: [1, undefined],
    createdAt: new Date("2026-07-13T00:00:00Z"),
  };
  assert.equal(stableStringify(value), stableStringify(JSON.parse(JSON.stringify(value))));
});
test("确定性报告只使用快照数值", () => {
  const snapshot = {
    student: { displayName: "测试学生" },
    profile: { currentVersion: 2, history: [] },
    mastery: [{ knowledgePoint: "树", mastery: 40 }],
    errorPatterns: [],
    quizTrend: [{ correct_count: 3, total_count: 5 }],
    path: { currentVersion: 1, progress: 50 },
    resources: [],
    retrievalActivity: [],
    citationAnswerCount: 0,
    risk: { level: "medium", reasons: ["掌握度偏低"] },
    recommendations: ["复习树"],
  };
  const report = buildReport(snapshot, {
    teacherId: 1,
    reportType: "period_assessment",
    reportVersion: 1,
    rangeDays: 30,
  });
  assert.equal(report.quizAnalysis.averageAccuracy, 60);
  assert.deepEqual(report.weaknesses, ["树掌握度 40%"]);
});
test("真实 PDF 以 %PDF- 开头并包含内容", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "learnmate-pdf-")),
    file = path.join(dir, "report.pdf");
  try {
    await generateAssessmentPdf(
      {
        student: { displayName: "测试学生" },
        reportMeta: { rangeDays: 30 },
        generatedAt: new Date().toISOString(),
        profileAnalysis: { currentVersion: 1 },
        pathAnalysis: { currentVersion: 1, progress: 50 },
        quizAnalysis: { averageAccuracy: 60 },
        resourceAnalysis: { completedCount: 1 },
        ragActivity: { retrievalCount: 2 },
        riskAssessment: { level: "medium", reasons: ["测试原因"] },
        progressHighlights: [],
        weaknesses: ["树掌握度 40%"],
        recommendations: ["继续练习"],
      },
      file,
    );
    const bytes = await fs.readFile(file);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(bytes.length > 1000);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("报告存储拒绝路径穿越", () => {
  assert.throws(() => storage.resolveStoredFile("../../private.pdf"), /invalid|escapes/);
  assert.throws(() => storage.resolveStoredFile("C:/private.pdf"), /invalid|escapes/);
});
