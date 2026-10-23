/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
async function initStudyTimeDB(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      session_date DATE NOT NULL,
      minutes INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_focus_sessions_student_date (student_id, session_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { initStudyTimeDB };
