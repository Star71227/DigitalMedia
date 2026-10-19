/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
async function initLearningPathDB(pool) {
  const [eligibilityColumns] = await pool.query(
    "SHOW COLUMNS FROM code_exercises LIKE 'path_completion_eligible'",
  );
  if (eligibilityColumns.length === 0) {
    await pool.query(
      "ALTER TABLE code_exercises ADD COLUMN path_completion_eligible TINYINT(1) NOT NULL DEFAULT 0",
    );
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_learning_paths (
      student_id INT NOT NULL,
      current_version INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_path_versions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      version INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      snapshot_json JSON NOT NULL,
      semantic_fingerprint CHAR(64) NOT NULL,
      change_reason VARCHAR(255) NOT NULL,
      source_type VARCHAR(60) NOT NULL,
      source_event_id VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_learning_path_student_version (student_id, version),
      KEY idx_learning_path_student_created (student_id, created_at),
      KEY idx_learning_path_student_fingerprint (student_id, semantic_fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_path_adjustment_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      source_type VARCHAR(60) NOT NULL,
      source_event_id VARCHAR(120) NOT NULL,
      path_version INT NULL,
      status VARCHAR(30) NOT NULL,
      error_message VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_path_adjustment_event (student_id, source_type, source_event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { initLearningPathDB };
