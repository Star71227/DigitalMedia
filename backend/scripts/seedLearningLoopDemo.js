/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const path = require("path");
require("dotenv").config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});
const { initDB } = require("../src/config/initDB");
const { seedDemoUsers, seedRedBlackTreeDemo } = require("../src/config/initLearningProfileDB");
const { pool } = require("../src/config/db");

async function resetDemo() {
  const initialized = await initDB();
  if (!initialized) throw new Error("数据库初始化失败");
  await seedDemoUsers(pool);
  await seedRedBlackTreeDemo(pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query("SELECT id FROM users WHERE username='zhangsan' LIMIT 1");
    if (!users[0]) throw new Error("未找到 zhangsan，请先配置 DEMO_PASSWORD");
    const studentId = users[0].id;
    const [attempts] = await connection.query(
      `SELECT DISTINCT qa.attempt_id AS id
         FROM quiz_attempt_answers qa JOIN quiz_attempts a ON a.id=qa.attempt_id
        WHERE a.student_id=? AND qa.question_id='DS-RBT-ROTATE-001'`,
      [studentId],
    );
    const ids = attempts.map((item) => item.id);
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      await connection.query(`DELETE FROM quiz_attempt_answers WHERE attempt_id IN (${placeholders})`, ids);
      await connection.query(
        `DELETE FROM student_learning_events WHERE student_id=? AND event_type='quiz_submitted' AND JSON_EXTRACT(payload_json,'$.attemptId') IN (${placeholders})`,
        [studentId, ...ids],
      );
      await connection.query(
        `DELETE FROM student_profile_versions WHERE student_id=? AND source_type='quiz_submission' AND JSON_EXTRACT(evidence_json,'$.attemptId') IN (${placeholders})`,
        [studentId, ...ids],
      );
      await connection.query(`DELETE FROM quiz_attempts WHERE id IN (${placeholders})`, ids);
    }
    await connection.query(
      "DELETE FROM wrong_questions WHERE student_id=? AND question_id='DS-RBT-ROTATE-001'",
      [studentId],
    );
    await connection.query(
      "DELETE FROM student_error_patterns WHERE student_id=? AND subject='数据结构' AND knowledge_point='红黑树旋转'",
      [studentId],
    );
    await connection.query(
      `INSERT INTO student_knowledge_mastery (student_id,subject,knowledge_point,mastery,wrong_count,practice_count)
       VALUES (?,'数据结构','红黑树旋转',45,0,0)
       ON DUPLICATE KEY UPDATE mastery=45,wrong_count=0,practice_count=0,last_updated=CURRENT_TIMESTAMP`,
      [studentId],
    );
    const [[latest]] = await connection.query(
      "SELECT COALESCE(MAX(version),1) AS version FROM student_profile_versions WHERE student_id=?",
      [studentId],
    );
    await connection.query("UPDATE student_profiles SET current_version=? WHERE student_id=?", [
      latest.version,
      studentId,
    ]);
    await connection.commit();
    console.log("学习闭环已复位：zhangsan / 数据结构 / 红黑树旋转 / mastery=45");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

resetDemo().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
