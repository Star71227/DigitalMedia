/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
async function initAILearningLoopDB(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS student_knowledge_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NULL,
      mime_type VARCHAR(120) NOT NULL DEFAULT 'text/plain',
      subject VARCHAR(120) NOT NULL,
      source_type VARCHAR(40) NOT NULL DEFAULT 'student_upload',
      content_text LONGTEXT NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_student_document_checksum (student_id, checksum_sha256),
      KEY idx_student_documents_scope (student_id, subject, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS student_knowledge_chunks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      document_id BIGINT UNSIGNED NOT NULL,
      student_id INT NOT NULL,
      subject VARCHAR(120) NOT NULL,
      chunk_index INT NOT NULL,
      heading VARCHAR(255) NULL,
      content_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_student_document_chunk (document_id, chunk_index),
      KEY idx_student_chunks_scope (student_id, subject),
      CONSTRAINT fk_student_chunk_document FOREIGN KEY (document_id)
        REFERENCES student_knowledge_documents(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS wrong_question_ai_analyses (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      wrong_question_id INT NULL,
      subject VARCHAR(120) NOT NULL,
      recognized_text LONGTEXT NOT NULL,
      student_answer TEXT NULL,
      correct_answer TEXT NULL,
      knowledge_points_json JSON NOT NULL,
      explanation_text LONGTEXT NOT NULL,
      citations_json JSON NOT NULL,
      retrieval_context_json JSON NOT NULL,
      source_mode VARCHAR(40) NOT NULL,
      model_name VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_wrong_ai_student (student_id, created_at),
      KEY idx_wrong_ai_question (student_id, wrong_question_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_learning_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      run_type VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL,
      input_summary_json JSON NOT NULL,
      output_summary_json JSON NULL,
      provider VARCHAR(80) NULL,
      model_name VARCHAR(120) NULL,
      error_code VARCHAR(80) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_ai_learning_runs_student (student_id, run_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS review_schedule_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      subject VARCHAR(120) NOT NULL,
      knowledge_point VARCHAR(180) NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id VARCHAR(120) NOT NULL,
      interval_days INT NOT NULL DEFAULT 1,
      repetition_count INT NOT NULL DEFAULT 0,
      ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.50,
      priority INT NOT NULL DEFAULT 50,
      due_at DATETIME NOT NULL,
      last_reviewed_at DATETIME NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_review_source (student_id, source_type, source_id),
      KEY idx_review_due (student_id, status, due_at, priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureQuestionBankOwnership(db);
}

async function ensureQuestionBankOwnership(db) {
  const [columns] = await db.query("SHOW COLUMNS FROM question_bank");
  const names = new Set(columns.map((item) => item.Field));
  const additions = {
    owner_student_id: "INT NULL AFTER source",
    source_url: "VARCHAR(1000) NULL AFTER owner_student_id",
    source_title: "VARCHAR(255) NULL AFTER source_url",
    source_kind: "VARCHAR(50) NULL AFTER source_title",
    source_verified_at: "DATETIME NULL AFTER source_kind",
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!names.has(name)) await db.query(`ALTER TABLE question_bank ADD COLUMN \`${name}\` ${definition}`);
  }
  const [indexes] = await db.query("SHOW INDEX FROM question_bank");
  if (!indexes.some((item) => item.Key_name === "idx_question_bank_owner")) {
    await db.query(
      "ALTER TABLE question_bank ADD KEY idx_question_bank_owner(owner_student_id, subject, knowledge_point)",
    );
  }
}

module.exports = { initAILearningLoopDB };
