/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { buildAssessmentInsights } = require("./assessmentInsightsService");
const { pool } = require("../config/db");
const access = require("./teacherAccessService");
const analytics = require("./teacherAnalyticsService");
const storage = require("./teacherReportStorageService");
const { generateAssessmentPdf } = require("./assessmentPdfService");

async function createReport(user, studentId, input = {}) {
  const id = await access.assertTeacherCanAccessStudent(user, studentId);
  const reportType = String(input.reportType || "period_assessment");
  if (!["student_summary", "period_assessment"].includes(reportType)) throw apiError("不支持的报告类型", 400);
  const rangeDays = Math.floor(Math.max(7, Math.min(180, Number(input.rangeDays) || 30)));
  const detail = await analytics.getStudentDetail(user, id, { reportDays: Math.floor(rangeDays) });
  const snapshot = JSON.parse(JSON.stringify(buildSnapshot(detail, rangeDays)));
  const fingerprint = sha(stableStringify(snapshot));
  const teacherId = Number(user.userId);
  const [[existing]] = await pool.query(
    "SELECT * FROM learning_assessment_reports WHERE teacher_id=? AND student_id=? AND report_type=? AND data_fingerprint=? LIMIT 1",
    [teacherId, id, reportType, fingerprint],
  );
  if (existing && existing.status !== "failed") return publicReport(existing);
  const [[versionRow]] = await pool.query(
    "SELECT COALESCE(MAX(report_version),0)+1 next_version FROM learning_assessment_reports WHERE teacher_id=? AND student_id=? AND report_type=?",
    [teacherId, id, reportType],
  );
  const reportVersion = existing ? Number(existing.report_version) : Number(versionRow.next_version);
  const report = buildReport(snapshot, { teacherId, reportType, reportVersion, rangeDays });
  let reportId;
  let tempPath;
  let finalPath;
  try {
    if (existing) {
      reportId = Number(existing.id);
      await pool.query(
        "UPDATE learning_assessment_reports SET status=\'generating\',report_json=?,error_summary=NULL WHERE id=?",
        [JSON.stringify(report), reportId],
      );
    } else {
      const [insert] = await pool.query(
        `INSERT INTO learning_assessment_reports (teacher_id,student_id,class_id,report_version,status,report_type,range_days,data_snapshot_json,report_json,data_fingerprint)
      VALUES (?,?,?,?,'generating',?,?,?,?,?)`,
        [
          teacherId,
          id,
          detail.student.classId || null,
          reportVersion,
          reportType,
          rangeDays,
          JSON.stringify(snapshot),
          JSON.stringify(report),
          fingerprint,
        ],
      );
      reportId = Number(insert.insertId);
    }
    tempPath = await storage.prepareTempFile();
    await generateAssessmentPdf(report, tempPath);
    const file = await storage.finalizeFile(tempPath, {
      teacherId,
      studentId: id,
      reportId,
      version: reportVersion,
    });
    tempPath = null;
    finalPath = file.absolutePath;
    await pool.query(
      `UPDATE learning_assessment_reports SET status='approved',storage_path=?,original_filename=?,mime_type='application/pdf',file_size=?,checksum_sha256=?,generated_at=CURRENT_TIMESTAMP,error_summary=NULL WHERE id=?`,
      [
        file.storagePath,
        safeName(detail.student.displayName, reportVersion),
        file.fileSize,
        file.checksum,
        reportId,
      ],
    );
    finalPath = null;
    return getReport(user, reportId);
  } catch (error) {
    await storage.cleanupFile(tempPath);
    await storage.cleanupFile(finalPath);
    if (reportId)
      await pool
        .query("UPDATE learning_assessment_reports SET status='failed',error_summary=? WHERE id=?", [
          String(error.message).slice(0, 255),
          reportId,
        ])
        .catch(() => undefined);
    if (error.code === "ER_DUP_ENTRY") {
      const [[row]] = await pool.query(
        "SELECT * FROM learning_assessment_reports WHERE teacher_id=? AND student_id=? AND report_type=? AND data_fingerprint=?",
        [teacherId, id, reportType, fingerprint],
      );
      if (row) return publicReport(row, true);
    }
    throw error;
  }
}
async function listReports(user, query = {}) {
  access.assertTeacherRole(user);
  const page = Math.max(1, Number(query.page) || 1),
    pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20));
  const where = [],
    params = [];
  if (user.role === "TEACHER") {
    where.push(
      "r.teacher_id=?",
      `EXISTS (SELECT 1 FROM teacher_class_students tcs JOIN teacher_classes tc ON tc.id=tcs.class_id AND tc.teacher_id=tcs.teacher_id WHERE tcs.teacher_id=r.teacher_id AND tcs.student_id=r.student_id AND tcs.status='active' AND tc.status='active')`,
    );
    params.push(user.userId);
  }
  if (query.studentId) {
    await access.assertTeacherCanAccessStudent(user, query.studentId);
    where.push("r.student_id=?");
    params.push(Number(query.studentId));
  }
  if (query.status) {
    const status = String(query.status);
    if (!["generating", "approved", "failed"].includes(status)) throw apiError("无效的报告状态", 400);
    where.push("r.status=?");
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[count]] = await pool.query(
    `SELECT COUNT(*) total FROM learning_assessment_reports r ${clause}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT r.*,u.display_name student_name,tu.display_name teacher_name FROM learning_assessment_reports r JOIN users u ON u.id=r.student_id JOIN users tu ON tu.id=r.teacher_id ${clause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { data: rows.map(publicReport), pagination: { page, pageSize, total: Number(count.total) } };
}
async function getReport(user, reportId) {
  access.assertTeacherRole(user);
  const id = access.positiveId(reportId, "reportId");
  const [[row]] = await pool.query(
    `SELECT r.*,u.display_name student_name,tu.display_name teacher_name FROM learning_assessment_reports r JOIN users u ON u.id=r.student_id JOIN users tu ON tu.id=r.teacher_id WHERE r.id=? LIMIT 1`,
    [id],
  );
  if (!row) throw apiError("报告不存在", 404);
  await access.assertTeacherCanAccessStudent(user, row.student_id);
  if (user.role === "TEACHER" && Number(row.teacher_id) !== Number(user.userId))
    throw apiError("无权访问该报告", 403);
  return publicReport(row, true);
}
async function getReportDownload(user, reportId) {
  const id = access.positiveId(reportId, "reportId");
  const [[row]] = await pool.query("SELECT * FROM learning_assessment_reports WHERE id=? LIMIT 1", [id]);
  if (!row) throw apiError("报告不存在", 404);
  await access.assertTeacherCanAccessStudent(user, row.student_id);
  if (user.role === "TEACHER" && Number(row.teacher_id) !== Number(user.userId))
    throw apiError("无权访问该报告", 403);
  if (row.status !== "approved" || !row.storage_path) throw apiError("报告文件不可下载", 409);
  const absolutePath = storage.resolveStoredFile(row.storage_path);
  await storage.verifyStoredFile(absolutePath, {
    fileSize: Number(row.file_size),
    checksum: row.checksum_sha256,
  });
  return { ...publicReport(row), absolutePath };
}
function buildSnapshot(detail, rangeDays) {
  const since = Date.now() - rangeDays * 86400000;
  const recent = (items, field) =>
    items.filter((item) => {
      const value = item?.[field];
      return value && new Date(value).getTime() >= since;
    });
  return {
    schemaVersion: 2,
    student: detail.student,
    rangeDays,
    profile: {
      currentVersion: detail.profile.currentVersion,
      history: recent(detail.profileHistory, "created_at"),
    },
    mastery: detail.mastery,
    errorPatterns: detail.errorPatterns,
    quizTrend: recent(detail.quizTrend, "submitted_at"),
    path: { ...detail.path, versions: recent(detail.path.versions, "created_at") },
    resources: recent(detail.resources, "updated_at"),
    retrievalActivity: recent(detail.retrievalActivity, "created_at"),
    citationAnswerCount: detail.citationAnswerCount,
    risk: detail.risk,
    recommendations: detail.recommendations,
  };
}
function buildReport(snapshot, meta) {
  const report = buildBaseReport(snapshot, meta);
  return { ...report, ...buildAssessmentInsights(snapshot, report) };
}
function pathStages(snapshot) {
  const stages = snapshot && snapshot.path ? snapshot.path.stages : null;
  return Array.isArray(stages) ? stages : [];
}
function accuracyDistribution(quiz) {
  const buckets = [
    { label: "优秀（≥90%）", min: 90, max: 101, count: 0 },
    { label: "良好（75%-90%）", min: 75, max: 90, count: 0 },
    { label: "及格（60%-75%）", min: 60, max: 75, count: 0 },
    { label: "待加强（<60%）", min: -1, max: 60, count: 0 },
  ];
  for (const row of quiz) {
    const total = Number(row.total_count || 0);
    if (!total) continue;
    const value = (Number(row.correct_count || 0) / total) * 100;
    const bucket = buckets.find((item) => value >= item.min && value < item.max);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}
function resourceBreakdown(resources) {
  const map = new Map();
  for (const row of resources || []) {
    const type = row.resource_type || "other";
    if (!map.has(type)) map.set(type, { type, total: 0, completed: 0, inProgress: 0 });
    const entry = map.get(type);
    entry.total += 1;
    if (row.progress_status === "completed") entry.completed += 1;
    else if (row.progress_status) entry.inProgress += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
function errorTypeBreakdown(patterns) {
  const map = new Map();
  for (const row of patterns || []) {
    const type = row.errorType || "other";
    map.set(type, (map.get(type) || 0) + Number(row.occurrenceCount || 0));
  }
  return [...map.entries()]
    .map(([errorType, occurrenceCount]) => ({ errorType, occurrenceCount }))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}
function buildBaseReport(snapshot, meta) {
  const quiz = snapshot.quizTrend || [],
    answered = quiz.reduce((s, x) => s + Number(x.total_count || 0), 0),
    correct = quiz.reduce((s, x) => s + Number(x.correct_count || 0), 0);
  const completed = (snapshot.resources || []).filter((x) => x.progress_status === "completed");
  const mastery = [...(snapshot.mastery || [])].sort((a, b) => a.mastery - b.mastery);
  return {
    reportMeta: { ...meta },
    student: snapshot.student,
    summary: {
      activeRecords:
        (snapshot.retrievalActivity || []).length + quiz.length + (snapshot.resources || []).length,
    },
    profileAnalysis: {
      currentVersion: snapshot.profile.currentVersion,
      historyCount: snapshot.profile.history.length,
    },
    masteryAnalysis: {
      knowledgePointCount: mastery.length,
      averageMastery: mastery.length ? mastery.reduce((s, x) => s + x.mastery, 0) / mastery.length : null,
      masteredCount: mastery.filter((x) => x.mastery >= 80).length,
      developingCount: mastery.filter((x) => x.mastery >= 60 && x.mastery < 80).length,
      weakCount: mastery.filter((x) => x.mastery < 60).length,
      topMastery: [...mastery]
        .reverse()
        .slice(0, 8)
        .map((x) => ({
          knowledgePoint: x.knowledgePoint,
          subject: x.subject || "",
          mastery: x.mastery,
          wrongCount: x.wrongCount,
          practiceCount: x.practiceCount,
        })),
    },
    errorProfile: {
      patternCount: (snapshot.errorPatterns || []).length,
      typeBreakdown: errorTypeBreakdown(snapshot.errorPatterns),
      topPatterns: (snapshot.errorPatterns || [])
        .slice(0, 8)
        .map((x) => ({
          errorType: x.errorType,
          knowledgePoint: x.knowledgePoint,
          occurrenceCount: x.occurrenceCount,
          confidence: x.confidence,
          lastSeenAt: x.lastSeenAt,
        })),
    },
    quizAnalysis: {
      attemptCount: quiz.length,
      averageAccuracy: answered ? (correct / answered) * 100 : null,
      answeredQuestionCount: answered,
      correctQuestionCount: correct,
      accuracyDistribution: accuracyDistribution(quiz),
      recentAttempts: [...quiz]
        .slice(0, 12)
        .map((x) => ({
          subject: x.subject || null,
          submittedAt: x.submitted_at || null,
          score: x.score == null ? null : Number(x.score),
          totalCount: Number(x.total_count || 0),
          correctCount: Number(x.correct_count || 0),
          accuracy: Number(x.total_count || 0)
            ? (Number(x.correct_count || 0) / Number(x.total_count || 0)) * 100
            : null,
        })),
    },
    pathAnalysis: {
      currentVersion: snapshot.path.currentVersion,
      progress: snapshot.path.progress,
      stageCount: pathStages(snapshot).length,
      completedStageCount: pathStages(snapshot).filter((x) => x.status === "completed").length,
      stages: pathStages(snapshot),
    },
    resourceAnalysis: {
      resourceCount: snapshot.resources.length,
      completedCount: completed.length,
      inProgressCount: (snapshot.resources || []).filter(
        (x) => x.progress_status === "in_progress" || x.progress_status === "learning",
      ).length,
      typeBreakdown: resourceBreakdown(snapshot.resources),
    },
    ragActivity: {
      retrievalCount: snapshot.retrievalActivity.length,
      citationAnswerCount: snapshot.citationAnswerCount,
    },
    riskAssessment: snapshot.risk,
    progressHighlights: mastery
      .filter((x) => x.mastery >= 80)
      .slice(0, 5)
      .map((x) => `${x.knowledgePoint}掌握度 ${Math.round(x.mastery)}%`),
    weaknesses: mastery
      .filter((x) => x.mastery < 60)
      .slice(0, 8)
      .map((x) => `${x.knowledgePoint}掌握度 ${Math.round(x.mastery)}%`),
    recommendations: snapshot.recommendations,
    dataSources: [
      "student_profiles",
      "student_profile_versions",
      "student_knowledge_mastery",
      "student_error_patterns",
      "quiz_attempts",
      "learning_path_versions",
      "learning_resources",
      "learning_resource_progress",
      "knowledge_retrieval_runs",
      "generation_citations",
    ],
    generatedAt: new Date().toISOString(),
  };
}
function publicReport(row, includeJson = false) {
  const value = {
    id: Number(row.id),
    teacherId: Number(row.teacher_id),
    studentId: Number(row.student_id),
    classId: row.class_id ? Number(row.class_id) : null,
    studentName: row.student_name,
    teacherName: row.teacher_name,
    reportVersion: Number(row.report_version),
    reportType: row.report_type,
    rangeDays: Number(row.range_days),
    status: row.status,
    dataFingerprint: row.data_fingerprint,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: row.file_size ? Number(row.file_size) : null,
    checksumSha256: row.checksum_sha256,
    errorSummary: row.error_summary,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
  if (includeJson) value.report = parse(row.report_json);
  return value;
}
function stableStringify(value) {
  if (value instanceof Date) return JSON.stringify(value.toJSON());
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item) ?? "null").join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => [k, stableStringify(value[k])])
      .filter(([, serialized]) => serialized !== undefined)
      .map(([k, serialized]) => `${JSON.stringify(k)}:${serialized}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function parse(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function safeName(name, version) {
  return `${String(name || "学生")
    .replace(/[\\/:*?"<>|\r\n]/g, "_")
    .slice(0, 60)}-学习评估-v${version}.pdf`;
}
function apiError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
module.exports = {
  createReport,
  listReports,
  getReport,
  getReportDownload,
  buildSnapshot,
  buildReport,
  stableStringify,
};
