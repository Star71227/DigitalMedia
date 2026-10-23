/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
async function initChatDB(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      title VARCHAR(60) NOT NULL DEFAULT '新对话',
      status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      last_message_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      KEY idx_chat_sessions_student_status_activity (student_id, status, last_message_at),
      KEY idx_chat_sessions_student_created (student_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      session_id BIGINT UNSIGNED NOT NULL,
      student_id INT NOT NULL,
      public_message_id VARCHAR(64) NULL,
      role ENUM('user', 'assistant') NOT NULL,
      content_text MEDIUMTEXT NOT NULL,
      answer_json JSON NULL,
      source_mode ENUM('rag_model', 'model_only', 'deterministic_fallback', 'clarification') NULL,
      subject VARCHAR(120) NULL,
      knowledge_point VARCHAR(180) NULL,
      status ENUM('completed', 'failed') NOT NULL DEFAULT 'completed',
      error_code VARCHAR(80) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_chat_messages_public_id (student_id, public_message_id),
      KEY idx_chat_messages_session_created (session_id, created_at, id),
      KEY idx_chat_messages_student_created (student_id, created_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureLegacyChatMessagesCompatibility(db);
}

async function ensureLegacyChatMessagesCompatibility(db) {
  const [existing] = await db.query("SHOW COLUMNS FROM chat_messages");
  const columns = new Map(existing.map((column) => [column.Field, column]));
  const requiredColumns = {
    session_id: "BIGINT UNSIGNED NULL AFTER id",
    public_message_id: "VARCHAR(64) NULL AFTER student_id",
    content_text: "MEDIUMTEXT NULL AFTER role",
    answer_json: "JSON NULL AFTER content_text",
    source_mode:
      "ENUM('rag_model', 'model_only', 'deterministic_fallback', 'clarification') NULL AFTER answer_json",
    subject: "VARCHAR(120) NULL AFTER source_mode",
    knowledge_point: "VARCHAR(180) NULL AFTER subject",
    status: "ENUM('completed', 'failed') NOT NULL DEFAULT 'completed' AFTER knowledge_point",
    error_code: "VARCHAR(80) NULL AFTER status",
  };

  for (const [name, definition] of Object.entries(requiredColumns)) {
    if (!columns.has(name)) {
      await db.query(`ALTER TABLE chat_messages ADD COLUMN \`${name}\` ${definition}`);
    }
  }

  const role = columns.get("role");
  if (role && !String(role.Type || "").includes("assistant")) {
    await db.query("ALTER TABLE chat_messages MODIFY COLUMN role ENUM('user', 'assistant', 'ai') NOT NULL");
  }
  if (columns.get("conversation_id")?.Null === "NO") {
    await db.query("ALTER TABLE chat_messages MODIFY COLUMN conversation_id VARCHAR(100) NULL");
  }
  if (columns.get("content")?.Null === "NO") {
    await db.query("ALTER TABLE chat_messages MODIFY COLUMN content TEXT NULL");
  }

  if (columns.has("content")) {
    await db.query("UPDATE chat_messages SET content_text = content WHERE content_text IS NULL");
  }
  const [[missingContent]] = await db.query(
    "SELECT COUNT(*) count FROM chat_messages WHERE content_text IS NULL",
  );
  if (
    (!columns.has("content_text") || columns.get("content_text").Null === "YES") &&
    Number(missingContent.count) === 0
  ) {
    await db.query("ALTER TABLE chat_messages MODIFY COLUMN content_text MEDIUMTEXT NOT NULL");
  }

  await ensureIndex(
    db,
    "chat_messages",
    "uq_chat_messages_public_id",
    "ALTER TABLE chat_messages ADD UNIQUE KEY uq_chat_messages_public_id (student_id, public_message_id)",
  );
  await ensureIndex(
    db,
    "chat_messages",
    "idx_chat_messages_session_created",
    "ALTER TABLE chat_messages ADD KEY idx_chat_messages_session_created (session_id, created_at, id)",
  );
  await ensureIndex(
    db,
    "chat_messages",
    "idx_chat_messages_student_created",
    "ALTER TABLE chat_messages ADD KEY idx_chat_messages_student_created (student_id, created_at, id)",
  );
}

async function ensureIndex(db, table, name, ddl) {
  const [indexes] = await db.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
  if (indexes.length === 0) await db.query(ddl);
}

module.exports = { initChatDB };
