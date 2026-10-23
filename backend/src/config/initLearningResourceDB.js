/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
async function initLearningResourceDB(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_resources (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, student_id INT NOT NULL,
    subject VARCHAR(120) NOT NULL, knowledge_point VARCHAR(160) NOT NULL,
    resource_type VARCHAR(30) NOT NULL, title VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'generating', current_version INT NOT NULL DEFAULT 0,
    context_fingerprint CHAR(64) NOT NULL, content_fingerprint CHAR(64) NULL,
    source_type VARCHAR(60) NOT NULL DEFAULT 'agent', path_version INT NOT NULL,
    stage_key VARCHAR(80) NOT NULL, estimated_minutes INT NOT NULL DEFAULT 20,
    error_summary VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_resources_student (student_id),
    KEY idx_resources_stage (student_id,path_version,stage_key),
    KEY idx_resources_lookup (student_id,resource_type,context_fingerprint,status),
    UNIQUE KEY uq_resource_lineage (student_id,resource_type,path_version,stage_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_resource_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, resource_id BIGINT UNSIGNED NOT NULL,
    student_id INT NOT NULL, version INT NOT NULL, content_json JSON NOT NULL,
    review_json JSON NOT NULL, content_fingerprint CHAR(64) NOT NULL,
    generator_source VARCHAR(60) NOT NULL, model_name VARCHAR(120) NULL,
    prompt_version VARCHAR(40) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_resource_version (resource_id,version),
    KEY idx_resource_versions_student (student_id,resource_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_resource_files (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, resource_id BIGINT UNSIGNED NOT NULL,
    resource_version INT NOT NULL, student_id INT NOT NULL, file_type VARCHAR(30) NOT NULL,
    storage_path VARCHAR(500) NOT NULL, original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(160) NOT NULL, file_size BIGINT UNSIGNED NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_resource_file (resource_id,resource_version,file_type),
    KEY idx_resource_files_student (student_id,resource_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_resource_stage_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, student_id INT NOT NULL,
    resource_id BIGINT UNSIGNED NOT NULL, resource_version INT NOT NULL,
    path_version INT NOT NULL, stage_key VARCHAR(80) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_resource_stage_link (student_id,resource_id,resource_version),
    KEY idx_resource_stage_links (student_id,path_version,stage_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_resource_progress (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, student_id INT NOT NULL,
    resource_id BIGINT UNSIGNED NOT NULL, resource_version INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'not_started', progress_percent INT NOT NULL DEFAULT 0,
    opened_at DATETIME NULL, completed_at DATETIME NULL, last_activity_at DATETIME NULL,
    accumulated_seconds INT NOT NULL DEFAULT 0, downloaded_at DATETIME NULL, evidence_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_resource_progress (student_id,resource_id,resource_version),
    KEY idx_resource_progress_student (student_id,resource_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [versionColumns] = await pool.query("SHOW COLUMNS FROM learning_resource_versions");
  const existing = new Set(versionColumns.map((column) => column.Field));
  if (!existing.has("retrieval_run_id"))
    await pool.query(
      "ALTER TABLE learning_resource_versions ADD COLUMN retrieval_run_id BIGINT UNSIGNED NULL AFTER prompt_version",
    );
  if (!existing.has("citations_json"))
    await pool.query(
      "ALTER TABLE learning_resource_versions ADD COLUMN citations_json JSON NULL AFTER retrieval_run_id",
    );
  if (!existing.has("code_exercise_id"))
    await pool.query(
      "ALTER TABLE learning_resource_versions ADD COLUMN code_exercise_id VARCHAR(120) NULL AFTER citations_json",
    );
  if (!existing.has("code_case_candidate_key"))
    await pool.query(
      "ALTER TABLE learning_resource_versions ADD COLUMN code_case_candidate_key VARCHAR(100) NULL AFTER code_exercise_id",
    );
  const [indexes] = await pool.query("SHOW INDEX FROM learning_resource_versions");
  if (!indexes.some((index) => index.Key_name === "idx_resource_retrieval"))
    await pool.query(
      "ALTER TABLE learning_resource_versions ADD KEY idx_resource_retrieval(student_id,retrieval_run_id)",
    );
  if (!indexes.some((index) => index.Key_name === "idx_resource_code_exercise"))
    await pool.query(
      "ALTER TABLE learning_resource_versions ADD KEY idx_resource_code_exercise(student_id,code_exercise_id)",
    );
}
module.exports = { initLearningResourceDB };
