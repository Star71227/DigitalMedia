/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
process.env.JWT_SECRET = "teacher-report-download-test-secret-32-chars";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { pool } = require("../src/config/db");
const { initTeacherAnalyticsDB } = require("../src/config/initTeacherAnalyticsDB");
const storage = require("../src/services/teacherReportStorageService");

const suffix = `${Date.now()}-${process.pid}`;
let teacherId, otherTeacherId, studentId, classId, reportId, traversalReportId, reportFile;
const token = (id, role) =>
  jwt.sign({ userId: id, role }, process.env.JWT_SECRET, { subject: String(id), expiresIn: "1h" });

test.before(async () => {
  await initTeacherAnalyticsDB(pool);
  const insertUser = async (name, role) =>
    Number(
      (
        await pool.query(
          "INSERT INTO users(student_no,username,display_name,password_hash,role) VALUES(?,?,?,?,?)",
          [`R-${name}`, name, name, "test-only", role],
        )
      )[0].insertId,
    );
  teacherId = await insertUser(`report-teacher-${suffix}`, "TEACHER");
  otherTeacherId = await insertUser(`report-other-${suffix}`, "TEACHER");
  studentId = await insertUser(`report-student-${suffix}`, "STUDENT");
  classId = Number(
    (
      await pool.query(
        "INSERT INTO teacher_classes(teacher_id,class_name,subject,status) VALUES(?,?,?,'active')",
        [teacherId, `Report-${suffix}`, "数据结构"],
      )
    )[0].insertId,
  );
  await pool.query(
    "INSERT INTO teacher_class_students(class_id,teacher_id,student_id,status) VALUES(?,?,?,'active')",
    [classId, teacherId, studentId],
  );
  reportId = Number(
    (
      await pool.query(
        `INSERT INTO learning_assessment_reports(teacher_id,student_id,class_id,report_version,status,report_type,range_days,data_snapshot_json,report_json,data_fingerprint) VALUES(?,?,?,1,'generating','period_assessment',30,'{}','{}',?)`,
        [teacherId, studentId, classId, "a".repeat(64)],
      )
    )[0].insertId,
  );
  const temp = await storage.prepareTempFile();
  await fs.writeFile(temp, Buffer.from("%PDF-1.7\nacceptance-report\n%%EOF"));
  reportFile = await storage.finalizeFile(temp, { teacherId, studentId, reportId, version: 1 });
  await pool.query(
    "UPDATE learning_assessment_reports SET status='approved',storage_path=?,original_filename=?,mime_type='application/pdf',file_size=?,checksum_sha256=? WHERE id=?",
    [reportFile.storagePath, "测试报告.pdf", reportFile.fileSize, reportFile.checksum, reportId],
  );
  traversalReportId = Number(
    (
      await pool.query(
        `INSERT INTO learning_assessment_reports(teacher_id,student_id,class_id,report_version,status,report_type,range_days,data_snapshot_json,report_json,data_fingerprint,storage_path,original_filename,mime_type,file_size,checksum_sha256) VALUES(?,?,?,2,'approved','period_assessment',30,'{}','{}',?,'../../private.pdf','bad.pdf','application/pdf',10,?)`,
        [teacherId, studentId, classId, "b".repeat(64), "c".repeat(64)],
      )
    )[0].insertId,
  );
});

test("报告下载要求认证并执行角色与教师学生关系校验", async () => {
  assert.equal((await request(app).get(`/api/teacher/reports/${reportId}/download`)).status, 401);
  assert.equal(
    (
      await request(app)
        .get(`/api/teacher/reports/${reportId}/download`)
        .set("Authorization", `Bearer ${token(studentId, "STUDENT")}`)
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/teacher/reports/${reportId}/download`)
        .set("Authorization", `Bearer ${token(otherTeacherId, "TEACHER")}`)
    ).status,
    403,
  );
});

test("合法教师下载返回真实 PDF、安全文件名和稳定校验内容", async () => {
  const response = await request(app)
    .get(`/api/teacher/reports/${reportId}/download`)
    .set("Authorization", `Bearer ${token(teacherId, "TEACHER")}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^application\/pdf/);
  assert.match(response.headers["content-disposition"], /filename\*=UTF-8''/);
  assert.equal(response.body.subarray(0, 5).toString("ascii"), "%PDF-");
});

test("数据库中的路径穿越值也会在下载层被拒绝", async () => {
  const response = await request(app)
    .get(`/api/teacher/reports/${traversalReportId}/download`)
    .set("Authorization", `Bearer ${token(teacherId, "TEACHER")}`);
  assert.equal(response.status, 500);
  assert.equal(response.body.error, "教师端操作失败");
});

test.after(async () => {
  await pool.query("DELETE FROM learning_assessment_reports WHERE id IN (?,?)", [
    reportId || 0,
    traversalReportId || 0,
  ]);
  await pool.query("DELETE FROM teacher_class_students WHERE class_id=?", [classId || 0]);
  await pool.query("DELETE FROM teacher_classes WHERE id=?", [classId || 0]);
  await pool.query("DELETE FROM users WHERE username LIKE ?", [`report-%-${suffix}`]);
  if (reportFile?.absolutePath) await storage.cleanupFile(reportFile.absolutePath);
  await pool.end();
});
