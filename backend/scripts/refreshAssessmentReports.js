/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 重新生成某个班级全部学生的「学习评估报告」。
 *
 * 报告用教师端同一套 buildSnapshot / buildReport 生成，所以正文里的进度、作答、
 * 知识点掌握、错因、复习计划与图表数据都来自库里的真实记录；同一位老师 + 同一名学生
 * 只保留一份报告，重复执行不会把报告档案刷满。
 *
 * 用法：
 *   node scripts/refreshAssessmentReports.js --class=42 --teacher=12
 *   node scripts/refreshAssessmentReports.js --class=1  --teacher=4 --rangeDays=30
 *   node scripts/refreshAssessmentReports.js --student=8 --teacher=12
 */
require("dotenv").config();
const fs = require("fs");
const { pool } = require("../src/config/db");
const storage = require("../src/services/teacherReportStorageService");
const { seedAssessmentReport } = require("./seedDemoCohort");

function parseArgs(argv) {
  const options = {};
  for (const item of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (!match) continue;
    options[match[1]] = match[2] === undefined ? true : match[2];
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const teacherId = Number(options.teacher);
  const classId = options.class ? Number(options.class) : null;
  const studentId = options.student ? Number(options.student) : null;
  const rangeDays = Number(options.rangeDays) || 30;
  if (!teacherId) throw new Error("必须用 --teacher=<教师ID> 指定报告归属的教师");
  if (!classId && !studentId)
    throw new Error("请用 --class=<班级ID> 或 --student=<学生ID> 指定要生成报告的学生");

  let students;
  let resolvedClassId = classId;
  if (studentId) {
    const [rows] = await pool.query("SELECT id student_id,display_name FROM users WHERE id=?", [studentId]);
    students = rows;
  } else {
    const [rows] = await pool.query(
      `SELECT u.id student_id,u.display_name FROM teacher_class_students tcs JOIN users u ON u.id=tcs.student_id
        WHERE tcs.class_id=? AND tcs.teacher_id=? AND tcs.status='active' ORDER BY u.id`,
      [classId, teacherId],
    );
    students = rows;
  }
  console.log(
    `准备生成 ${students.length} 份学习评估报告（教师 ${teacherId}${resolvedClassId ? ` / 班级 #${resolvedClassId}` : ""} / 最近 ${rangeDays} 天）`,
  );

  const connection = await pool.getConnection();
  let ok = 0;
  const failures = [];
  const force = !process.argv.includes("--keep");
  try {
    for (const student of students) {
      const [[member]] = await connection.query(
        "SELECT class_id FROM teacher_class_students WHERE teacher_id=? AND student_id=? LIMIT 1",
        [teacherId, student.student_id],
      );
      if (force) {
        // 先删旧报告（含磁盘上的 PDF），否则 createReport 会因快照指纹相同直接复用旧文件
        const [old] = await connection.query(
          "SELECT id,storage_path FROM learning_assessment_reports WHERE teacher_id=? AND student_id=?",
          [teacherId, student.student_id],
        );
        await connection.query(
          "DELETE FROM learning_assessment_reports WHERE teacher_id=? AND student_id=?",
          [teacherId, student.student_id],
        );
        for (const row of old) {
          if (!row.storage_path) continue;
          try {
            fs.rmSync(storage.resolveStoredFile(row.storage_path), { force: true });
          } catch {
            /* 文件已不在也无妨 */
          }
        }
      }
      const result = await seedAssessmentReport(
        connection,
        teacherId,
        Number(student.student_id),
        resolvedClassId || member?.class_id || null,
        { rangeDays, reportVersion: 1 },
      );
      if (result.ok) {
        ok += 1;
        const r = result.report;
        console.log(
          `  ✓ ${student.display_name}（#${student.student_id}）正确率 ${r.quizAnalysis.averageAccuracy === null ? "—" : `${Math.round(r.quizAnalysis.averageAccuracy * 10) / 10}%`} · 掌握度 ${r.masteryAnalysis.averageMastery === null ? "—" : `${Math.round(r.masteryAnalysis.averageMastery * 10) / 10}%`} · 路径 ${Math.round(Number(r.pathAnalysis.progress || 0) * 10) / 10}% · 知识点 ${r.masteryAnalysis.knowledgePointCount} · 薄弱 ${r.masteryAnalysis.weakCount}`,
        );
      } else {
        failures.push(`${student.display_name}（#${student.student_id}）：${result.reason}`);
      }
    }
  } finally {
    connection.release();
  }
  console.log(
    `完成：成功 ${ok} 份${failures.length ? `，失败 ${failures.length} 份\n  ${failures.join("\n  ")}` : ""}`,
  );
  await pool.end();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("生成报告失败：", error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { main };
