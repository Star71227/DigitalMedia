/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const mysql = require("mysql2/promise");
const { pool, databaseConfig, getDatabaseName, assertDatabaseConfig } = require("./db");
const { initLearningProfileDB } = require("./initLearningProfileDB");
const { initLearningPathDB } = require("./initLearningPathDB");
const { initLearningResourceDB } = require("./initLearningResourceDB");
const { initKnowledgeBaseDB } = require("./initKnowledgeBaseDB");
const { initTeacherAnalyticsDB } = require("./initTeacherAnalyticsDB");
const { initAssignmentDB } = require("./initAssignmentDB");
const { initChatDB } = require("./initChatDB");
const { initAILearningLoopDB } = require("./initAILearningLoopDB");
const { initCheckInDB } = require("./initCheckInDB");
const { initStudyTimeDB } = require("./initStudyTimeDB");
const { seedTrustedCodeCaseExercises } = require("./trustedCodeCaseSeeds");

function assertSafeDatabaseName(name) {
  if (!/^[A-Za-z0-9_$]+$/.test(name)) {
    throw new Error(`非法数据库名：${name}`);
  }
}

async function initDB() {
  assertDatabaseConfig();
  const databaseName = getDatabaseName();
  let serverConnection;

  try {
    assertSafeDatabaseName(databaseName);

    serverConnection = await mysql.createConnection({
      host: databaseConfig.host,
      port: databaseConfig.port,
      user: databaseConfig.user,
      password: databaseConfig.password,
      charset: "utf8mb4",
    });

    await serverConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await serverConnection.end();
    serverConnection = null;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_request_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        endpoint VARCHAR(64) NOT NULL,
        prompt_preview VARCHAR(255) NULL,
        used_fallback TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS question_bank (
        id INT NOT NULL AUTO_INCREMENT,
        question_id VARCHAR(100) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        chapter VARCHAR(100),
        knowledge_point VARCHAR(100),
        question_type VARCHAR(50) DEFAULT 'single_choice',
        difficulty VARCHAR(50),
        stem TEXT NOT NULL,
        code_context TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        -- 填空题可用 | 分隔多个可接受答案（如 "递增|升序|有序"），所以给到 200
        answer VARCHAR(200),
        analysis TEXT,
        hint TEXT,
        ability_dimension VARCHAR(100),
        tags JSON,
        stage VARCHAR(50),
        is_core TINYINT DEFAULT 1,
        source VARCHAR(100) DEFAULT 'system_seed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_question_bank_question_id (question_id),
        KEY idx_question_bank_subject (subject),
        KEY idx_question_bank_knowledge_point (knowledge_point),
        KEY idx_question_bank_difficulty (difficulty)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureQuestionBankSchema();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS open_question_bank (
        id INT NOT NULL AUTO_INCREMENT,
        question_id VARCHAR(120) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        chapter VARCHAR(100),
        knowledge_point VARCHAR(100),
        difficulty VARCHAR(50),
        prompt TEXT NOT NULL,
        followups JSON,
        checkpoints JSON,
        source VARCHAR(100) DEFAULT 'interview_grill_adapted',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_open_question_bank_question_id (question_id),
        KEY idx_open_question_bank_subject (subject),
        KEY idx_open_question_bank_knowledge_point (knowledge_point),
        KEY idx_open_question_bank_difficulty (difficulty)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureOpenQuestionBankSchema();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wrong_questions (
        id INT NOT NULL AUTO_INCREMENT,
        student_id INT NOT NULL,
        question_id VARCHAR(120) NOT NULL,
        subject VARCHAR(100),
        knowledge_point VARCHAR(100),
        difficulty VARCHAR(50),
        question_text TEXT,
        selected_answer VARCHAR(20),
        correct_answer VARCHAR(20),
        analysis TEXT,
        error_reason TEXT,
        feedback_suggestion TEXT,
        recommended_action TEXT,
        status VARCHAR(50) DEFAULT '待复习',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_wrong_questions_student_question (student_id, question_id),
        KEY idx_wrong_questions_student_status (student_id, status),
        KEY idx_wrong_questions_student_subject (student_id, subject)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureWrongQuestionsSchema();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_knowledge_mastery (
        id INT NOT NULL AUTO_INCREMENT,
        student_id INT NOT NULL,
        subject VARCHAR(100) NOT NULL,
        knowledge_point VARCHAR(100) NOT NULL,
        mastery INT DEFAULT 70,
        wrong_count INT DEFAULT 0,
        practice_count INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_student_knowledge_mastery_scope (student_id, subject, knowledge_point),
        KEY idx_student_knowledge_mastery_student_subject (student_id, subject),
        KEY idx_student_knowledge_mastery_weak (student_id, wrong_count, mastery)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureStudentKnowledgeMasterySchema();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_exercises (
        id INT NOT NULL AUTO_INCREMENT,
        exercise_id VARCHAR(120) NOT NULL,
        subject VARCHAR(100),
        knowledge_point VARCHAR(100),
        title VARCHAR(200),
        description TEXT,
        language VARCHAR(50),
        difficulty VARCHAR(50),
        starter_code LONGTEXT,
        sample_input TEXT,
        sample_output TEXT,
        explanation TEXT,
        tags JSON,
        source VARCHAR(100) DEFAULT 'system_seed',
        is_published TINYINT(1) NOT NULL DEFAULT 1,
        path_completion_eligible TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_code_exercises_exercise_id (exercise_id),
        KEY idx_code_exercises_subject (subject),
        KEY idx_code_exercises_knowledge_point (knowledge_point),
        KEY idx_code_exercises_difficulty (difficulty)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureCodeExercisesSchema();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_exercise_private (
        exercise_id VARCHAR(120) NOT NULL,
        language VARCHAR(50) NOT NULL DEFAULT 'c',
        reference_solution LONGTEXT NOT NULL,
        judge_config_json JSON,
        judge_verified TINYINT(1) NOT NULL DEFAULT 0,
        judge_verified_at DATETIME NULL,
        judge_fingerprint CHAR(64) NULL,
        judge_fingerprint_expires_at DATETIME NULL,
        judge_quality_json JSON,
        execution_mode VARCHAR(30) NULL,
        runner_protocol VARCHAR(60) NULL,
        runner_image VARCHAR(220) NULL,
        validator_version VARCHAR(60) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (exercise_id),
        CONSTRAINT fk_code_exercise_private_exercise
          FOREIGN KEY (exercise_id) REFERENCES code_exercises(exercise_id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_test_cases (
        id INT NOT NULL AUTO_INCREMENT,
        exercise_id VARCHAR(120) NOT NULL,
        visibility VARCHAR(20) NOT NULL,
        input_text TEXT,
        expected_output TEXT NOT NULL,
        order_index INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_code_test_case_order (exercise_id, visibility, order_index),
        KEY idx_code_test_cases_exercise_visibility (exercise_id, visibility),
        CONSTRAINT fk_code_test_cases_exercise
          FOREIGN KEY (exercise_id) REFERENCES code_exercises(exercise_id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureCodeJudgeSchema();
    await seedTrustedCodeCaseExercises(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_submissions (
        id INT NOT NULL AUTO_INCREMENT,
        student_id INT NOT NULL,
        exercise_id VARCHAR(120),
        language VARCHAR(50),
        source_code LONGTEXT,
        stdin TEXT,
        stdout TEXT,
        stderr TEXT,
        compile_output TEXT,
        status VARCHAR(50),
        time_used VARCHAR(50),
        memory_used VARCHAR(50),
        mode VARCHAR(20) DEFAULT 'run',
        passed_count INT NOT NULL DEFAULT 0,
        total_count INT NOT NULL DEFAULT 0,
        result_json JSON,
        idempotency_key VARCHAR(120),
        execution_mode VARCHAR(30),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_code_submissions_student (student_id),
        KEY idx_code_submissions_exercise (exercise_id),
        KEY idx_code_submissions_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureCodeSubmissionsSchema();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_run_logs (
        id INT NOT NULL AUTO_INCREMENT,
        agent_name VARCHAR(100) NOT NULL,
        task_type VARCHAR(100),
        input_text LONGTEXT,
        output_text LONGTEXT,
        status VARCHAR(50) DEFAULT 'success',
        duration_ms INT DEFAULT 0,
        source VARCHAR(50) DEFAULT 'agent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_agent_run_logs_created_at (created_at),
        KEY idx_agent_run_logs_agent_task (agent_name, task_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureAgentRunLogsSchema();
    await initLearningProfileDB(pool);
    await initChatDB(pool);
    await initLearningPathDB(pool);
    await initLearningResourceDB(pool);
    await initResourceProgressDB();
    await initKnowledgeBaseDB(pool);
    await initAILearningLoopDB(pool);
    await initTeacherAnalyticsDB(pool);
    await initAssignmentDB(pool);
    await initCheckInDB(pool);
    await initStudyTimeDB(pool);

    console.log(`MySQL 连接正常，数据库：${databaseName}，question_bank、open_question_bank 表已就绪`);
    return true;
  } catch (error) {
    if (serverConnection) await serverConnection.end().catch(() => undefined);
    console.error(
      [
        "MySQL 初始化失败：无法确认题库表是否已创建。",
        `数据库：${databaseName}`,
        `连接：${databaseConfig.host}:${databaseConfig.port}`,
        `错误：${error.message}`,
        "请检查 MySQL 服务、账号密码、DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME 配置。",
      ].join("\n"),
    );
    return false;
  }
}

async function initResourceProgressDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS resource_generation_jobs (
    job_id CHAR(36) NOT NULL,
    student_id INT NOT NULL,
    resource_type VARCHAR(30) NOT NULL,
    resource_id BIGINT UNSIGNED NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    current_stage VARCHAR(50) NOT NULL DEFAULT 'queued',
    progress_percent INT NOT NULL DEFAULT 0,
    input_json JSON NOT NULL,
    error_code VARCHAR(80) NULL,
    error_message VARCHAR(500) NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id),
    KEY idx_resource_jobs_owner (student_id, created_at),
    KEY idx_resource_jobs_active (student_id, resource_type, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS resource_generation_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id CHAR(36) NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    label VARCHAR(160) NOT NULL,
    message VARCHAR(500) NOT NULL,
    agent VARCHAR(80) NOT NULL,
    metadata_json JSON NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_resource_events_job (job_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureQuestionBankSchema() {
  const requiredColumns = {
    question_id: "VARCHAR(100) NOT NULL",
    subject: "VARCHAR(100) NOT NULL",
    chapter: "VARCHAR(100)",
    knowledge_point: "VARCHAR(100)",
    question_type: "VARCHAR(50) DEFAULT 'single_choice'",
    difficulty: "VARCHAR(50)",
    stem: "TEXT NOT NULL",
    code_context: "TEXT",
    option_a: "TEXT",
    option_b: "TEXT",
    option_c: "TEXT",
    option_d: "TEXT",
    answer: "VARCHAR(10)",
    analysis: "TEXT",
    hint: "TEXT",
    ability_dimension: "VARCHAR(100)",
    tags: "JSON",
    stage: "VARCHAR(50)",
    is_core: "TINYINT DEFAULT 1",
    source: "VARCHAR(100) DEFAULT 'system_seed'",
    is_published: "TINYINT(1) NOT NULL DEFAULT 1",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM question_bank");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE question_bank ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await ensureIndex(
    "question_bank",
    "uq_question_bank_question_id",
    "ALTER TABLE question_bank ADD UNIQUE KEY uq_question_bank_question_id (question_id)",
    {
      uniqueColumn: "question_id",
    },
  );
  await ensureIndex(
    "question_bank",
    "idx_question_bank_subject",
    "ALTER TABLE question_bank ADD KEY idx_question_bank_subject (subject)",
  );
  await ensureIndex(
    "question_bank",
    "idx_question_bank_knowledge_point",
    "ALTER TABLE question_bank ADD KEY idx_question_bank_knowledge_point (knowledge_point)",
  );
  await ensureIndex(
    "question_bank",
    "idx_question_bank_difficulty",
    "ALTER TABLE question_bank ADD KEY idx_question_bank_difficulty (difficulty)",
  );
}

async function ensureIndex(tableName, indexName, ddl, options = {}) {
  assertSafeTableName(tableName);

  const [indexes] = await pool.query(`SHOW INDEX FROM \`${tableName}\``);
  const hasNamedIndex = indexes.some((index) => index.Key_name === indexName);
  const hasEquivalentUniqueIndex =
    hasEquivalentIndex(indexes, options.uniqueColumns, true) ||
    (options.uniqueColumn
      ? indexes.some((index) => index.Non_unique === 0 && index.Column_name === options.uniqueColumn)
      : false);

  if (!hasNamedIndex && !hasEquivalentUniqueIndex) {
    try {
      await pool.query(ddl);
    } catch (error) {
      if (error && (error.code === "ER_DUP_KEYNAME" || error.errno === 1061)) {
        return;
      }

      throw error;
    }
  }
}

function hasEquivalentIndex(indexes, columns, uniqueOnly = false) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return false;
  }

  const grouped = indexes.reduce((result, index) => {
    const current = result.get(index.Key_name) || {
      nonUnique: index.Non_unique,
      columns: [],
    };

    current.columns[Number(index.Seq_in_index || 1) - 1] = index.Column_name;
    result.set(index.Key_name, current);
    return result;
  }, new Map());

  return Array.from(grouped.values()).some((index) => {
    if (uniqueOnly && index.nonUnique !== 0) {
      return false;
    }

    return (
      index.columns.length === columns.length &&
      index.columns.every((column, position) => column === columns[position])
    );
  });
}

function assertSafeTableName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`非法表名：${name}`);
  }
}

async function ensureOpenQuestionBankSchema() {
  const requiredColumns = {
    question_id: "VARCHAR(120) NOT NULL",
    subject: "VARCHAR(100) NOT NULL",
    chapter: "VARCHAR(100)",
    knowledge_point: "VARCHAR(100)",
    difficulty: "VARCHAR(50)",
    prompt: "TEXT NOT NULL",
    followups: "JSON",
    checkpoints: "JSON",
    source: "VARCHAR(100) DEFAULT 'interview_grill_adapted'",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM open_question_bank");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE open_question_bank ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await ensureIndex(
    "open_question_bank",
    "uq_open_question_bank_question_id",
    "ALTER TABLE open_question_bank ADD UNIQUE KEY uq_open_question_bank_question_id (question_id)",
    {
      uniqueColumn: "question_id",
    },
  );
  await ensureIndex(
    "open_question_bank",
    "idx_open_question_bank_subject",
    "ALTER TABLE open_question_bank ADD KEY idx_open_question_bank_subject (subject)",
  );
  await ensureIndex(
    "open_question_bank",
    "idx_open_question_bank_knowledge_point",
    "ALTER TABLE open_question_bank ADD KEY idx_open_question_bank_knowledge_point (knowledge_point)",
  );
  await ensureIndex(
    "open_question_bank",
    "idx_open_question_bank_difficulty",
    "ALTER TABLE open_question_bank ADD KEY idx_open_question_bank_difficulty (difficulty)",
  );
}

async function ensureWrongQuestionsSchema() {
  const requiredColumns = {
    student_id: "INT NOT NULL",
    question_id: "VARCHAR(120) NOT NULL",
    subject: "VARCHAR(100)",
    knowledge_point: "VARCHAR(100)",
    difficulty: "VARCHAR(50)",
    question_text: "TEXT",
    selected_answer: "VARCHAR(20)",
    correct_answer: "VARCHAR(20)",
    analysis: "TEXT",
    error_reason: "TEXT",
    feedback_suggestion: "TEXT",
    recommended_action: "TEXT",
    status: "VARCHAR(50) DEFAULT '待复习'",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM wrong_questions");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE wrong_questions ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await safeModifyColumn("wrong_questions", "student_id", "INT NOT NULL", existingColumns);
  await safeModifyColumn("wrong_questions", "question_id", "VARCHAR(120)", existingColumns);
  await safeModifyColumn("wrong_questions", "subject", "VARCHAR(100)", existingColumns);
  await safeModifyColumn("wrong_questions", "difficulty", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("wrong_questions", "status", "VARCHAR(50) DEFAULT '待复习'", existingColumns);
  await safeModifyColumn("wrong_questions", "question_content", "TEXT", existingColumns);
  await safeModifyColumn("wrong_questions", "question_type", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("wrong_questions", "correct_answer", "TEXT", existingColumns);
  await normalizeWrongQuestionStatuses();

  await mergeDuplicateWrongQuestionRows();
  await ensureIndex(
    "wrong_questions",
    "uq_wrong_questions_student_question",
    "ALTER TABLE wrong_questions ADD UNIQUE KEY uq_wrong_questions_student_question (student_id, question_id)",
    { uniqueColumns: ["student_id", "question_id"] },
  );
  await ensureIndex(
    "wrong_questions",
    "idx_wrong_questions_student_status",
    "ALTER TABLE wrong_questions ADD KEY idx_wrong_questions_student_status (student_id, status)",
  );
  await ensureIndex(
    "wrong_questions",
    "idx_wrong_questions_student_subject",
    "ALTER TABLE wrong_questions ADD KEY idx_wrong_questions_student_subject (student_id, subject)",
  );
}

async function ensureStudentKnowledgeMasterySchema() {
  const requiredColumns = {
    student_id: "INT NOT NULL",
    subject: "VARCHAR(100) NOT NULL",
    knowledge_point: "VARCHAR(100) NOT NULL",
    mastery: "INT DEFAULT 70",
    wrong_count: "INT DEFAULT 0",
    practice_count: "INT DEFAULT 0",
    last_updated: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM student_knowledge_mastery");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE student_knowledge_mastery ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await safeModifyColumn("student_knowledge_mastery", "student_id", "INT NOT NULL", existingColumns);
  await safeModifyColumn("student_knowledge_mastery", "knowledge_point_id", "INT NULL", existingColumns);
  await safeModifyColumn("student_knowledge_mastery", "mastery", "INT DEFAULT 70", existingColumns);
  await safeModifyColumn("student_knowledge_mastery", "wrong_count", "INT DEFAULT 0", existingColumns);
  await safeModifyColumn("student_knowledge_mastery", "practice_count", "INT DEFAULT 0", existingColumns);

  await mergeDuplicateKnowledgeMasteryRows();
  await ensureIndex(
    "student_knowledge_mastery",
    "uq_student_knowledge_mastery_scope",
    "ALTER TABLE student_knowledge_mastery ADD UNIQUE KEY uq_student_knowledge_mastery_scope (student_id, subject, knowledge_point)",
    { uniqueColumns: ["student_id", "subject", "knowledge_point"] },
  );
  await ensureIndex(
    "student_knowledge_mastery",
    "idx_student_knowledge_mastery_student_subject",
    "ALTER TABLE student_knowledge_mastery ADD KEY idx_student_knowledge_mastery_student_subject (student_id, subject)",
  );
  await ensureIndex(
    "student_knowledge_mastery",
    "idx_student_knowledge_mastery_weak",
    "ALTER TABLE student_knowledge_mastery ADD KEY idx_student_knowledge_mastery_weak (student_id, wrong_count, mastery)",
  );
}

async function ensureAgentRunLogsSchema() {
  const requiredColumns = {
    agent_name: "VARCHAR(100) NOT NULL",
    task_type: "VARCHAR(100)",
    input_text: "LONGTEXT",
    output_text: "LONGTEXT",
    status: "VARCHAR(50) DEFAULT 'success'",
    duration_ms: "INT DEFAULT 0",
    source: "VARCHAR(50) DEFAULT 'agent'",
    // 多智能体协作：一次用户请求会依次（或并发）调用多个智能体，
    // trace_id 把同一次协作的所有智能体运行串起来，step_index 记录它在流水线中的次序。
    trace_id: "VARCHAR(64)",
    step_index: "INT DEFAULT 0",
    agent_role: "VARCHAR(50)",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM agent_run_logs");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE agent_run_logs ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await safeModifyColumn("agent_run_logs", "status", "VARCHAR(50) DEFAULT 'success'", existingColumns);
  await safeModifyColumn("agent_run_logs", "duration_ms", "INT DEFAULT 0", existingColumns);
  await safeModifyColumn("agent_run_logs", "source", "VARCHAR(50) DEFAULT 'agent'", existingColumns);
  await normalizeAgentRunLogStatuses();
  await ensureIndex(
    "agent_run_logs",
    "idx_agent_run_logs_created_at",
    "ALTER TABLE agent_run_logs ADD KEY idx_agent_run_logs_created_at (created_at)",
  );
  await ensureIndex(
    "agent_run_logs",
    "idx_agent_run_logs_agent_task",
    "ALTER TABLE agent_run_logs ADD KEY idx_agent_run_logs_agent_task (agent_name, task_type)",
  );
  await ensureIndex(
    "agent_run_logs",
    "idx_agent_run_logs_trace",
    "ALTER TABLE agent_run_logs ADD KEY idx_agent_run_logs_trace (trace_id, step_index)",
  );
}

async function ensureCodeExercisesSchema() {
  const requiredColumns = {
    exercise_id: "VARCHAR(120)",
    subject: "VARCHAR(100)",
    knowledge_point: "VARCHAR(100)",
    title: "VARCHAR(200)",
    description: "TEXT",
    language: "VARCHAR(50)",
    difficulty: "VARCHAR(50)",
    starter_code: "LONGTEXT",
    sample_input: "TEXT",
    sample_output: "TEXT",
    explanation: "TEXT",
    tags: "JSON",
    source: "VARCHAR(100) DEFAULT 'system_seed'",
    is_published: "TINYINT(1) NOT NULL DEFAULT 1",
    path_completion_eligible: "TINYINT(1) NOT NULL DEFAULT 0",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM code_exercises");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE code_exercises ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await safeModifyColumn("code_exercises", "exercise_id", "VARCHAR(120)", existingColumns);
  await safeModifyColumn("code_exercises", "subject", "VARCHAR(100)", existingColumns);
  await safeModifyColumn("code_exercises", "knowledge_point", "VARCHAR(100)", existingColumns);
  await safeModifyColumn("code_exercises", "title", "VARCHAR(200)", existingColumns);
  await safeModifyColumn("code_exercises", "language", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("code_exercises", "difficulty", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("code_exercises", "source", "VARCHAR(100) DEFAULT 'system_seed'", existingColumns);
  await safeModifyColumn("code_exercises", "is_published", "TINYINT(1) NOT NULL DEFAULT 1", existingColumns);
  await safeModifyColumn(
    "code_exercises",
    "path_completion_eligible",
    "TINYINT(1) NOT NULL DEFAULT 0",
    existingColumns,
  );

  await ensureIndex(
    "code_exercises",
    "uq_code_exercises_exercise_id",
    "ALTER TABLE code_exercises ADD UNIQUE KEY uq_code_exercises_exercise_id (exercise_id)",
    { uniqueColumn: "exercise_id" },
  );
  await ensureIndex(
    "code_exercises",
    "idx_code_exercises_subject",
    "ALTER TABLE code_exercises ADD KEY idx_code_exercises_subject (subject)",
  );
  await ensureIndex(
    "code_exercises",
    "idx_code_exercises_knowledge_point",
    "ALTER TABLE code_exercises ADD KEY idx_code_exercises_knowledge_point (knowledge_point)",
  );
  await ensureIndex(
    "code_exercises",
    "idx_code_exercises_difficulty",
    "ALTER TABLE code_exercises ADD KEY idx_code_exercises_difficulty (difficulty)",
  );
}

async function ensureCodeSubmissionsSchema() {
  const requiredColumns = {
    student_id: "INT NOT NULL",
    exercise_id: "VARCHAR(120)",
    language: "VARCHAR(50)",
    source_code: "LONGTEXT",
    stdin: "TEXT",
    stdout: "TEXT",
    stderr: "TEXT",
    compile_output: "TEXT",
    status: "VARCHAR(50)",
    time_used: "VARCHAR(50)",
    memory_used: "VARCHAR(50)",
    mode: "VARCHAR(20) DEFAULT 'run'",
    passed_count: "INT NOT NULL DEFAULT 0",
    total_count: "INT NOT NULL DEFAULT 0",
    result_json: "JSON",
    idempotency_key: "VARCHAR(120)",
    execution_mode: "VARCHAR(30)",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  };

  const [columns] = await pool.query("SHOW COLUMNS FROM code_submissions");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE code_submissions ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  await safeModifyColumn("code_submissions", "student_id", "INT NOT NULL", existingColumns);
  await safeModifyColumn("code_submissions", "exercise_id", "VARCHAR(120)", existingColumns);
  await safeModifyColumn("code_submissions", "language", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("code_submissions", "status", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("code_submissions", "time_used", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("code_submissions", "memory_used", "VARCHAR(50)", existingColumns);
  await safeModifyColumn("code_submissions", "mode", "VARCHAR(20) DEFAULT 'run'", existingColumns);
  await safeModifyColumn("code_submissions", "passed_count", "INT NOT NULL DEFAULT 0", existingColumns);
  await safeModifyColumn("code_submissions", "total_count", "INT NOT NULL DEFAULT 0", existingColumns);
  await safeModifyColumn("code_submissions", "execution_mode", "VARCHAR(30)", existingColumns);

  await ensureIndex(
    "code_submissions",
    "idx_code_submissions_student",
    "ALTER TABLE code_submissions ADD KEY idx_code_submissions_student (student_id)",
  );
  await ensureIndex(
    "code_submissions",
    "idx_code_submissions_exercise",
    "ALTER TABLE code_submissions ADD KEY idx_code_submissions_exercise (exercise_id)",
  );
  await ensureIndex(
    "code_submissions",
    "idx_code_submissions_created_at",
    "ALTER TABLE code_submissions ADD KEY idx_code_submissions_created_at (created_at)",
  );
  await ensureIndex(
    "code_submissions",
    "idx_code_submissions_owner_mode",
    "ALTER TABLE code_submissions ADD KEY idx_code_submissions_owner_mode (student_id, mode, created_at)",
  );
  await ensureIndex(
    "code_submissions",
    "uq_code_submissions_idempotency",
    "ALTER TABLE code_submissions ADD UNIQUE KEY uq_code_submissions_idempotency (student_id, idempotency_key)",
    { uniqueColumns: ["student_id", "idempotency_key"] },
  );
}

async function ensureCodeJudgeSchema() {
  const [privateColumns] = await pool.query("SHOW COLUMNS FROM code_exercise_private");
  const privateExisting = new Set(privateColumns.map((column) => column.Field));
  const privateRequired = {
    exercise_id: "VARCHAR(120) NOT NULL",
    language: "VARCHAR(50) NOT NULL DEFAULT 'c'",
    reference_solution: "LONGTEXT NOT NULL",
    judge_config_json: "JSON",
    judge_verified: "TINYINT(1) NOT NULL DEFAULT 0",
    judge_verified_at: "DATETIME NULL",
    judge_fingerprint: "CHAR(64) NULL",
    judge_fingerprint_expires_at: "DATETIME NULL",
    judge_quality_json: "JSON",
    execution_mode: "VARCHAR(30) NULL",
    runner_protocol: "VARCHAR(60) NULL",
    runner_image: "VARCHAR(220) NULL",
    validator_version: "VARCHAR(60) NULL",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };
  for (const [columnName, definition] of Object.entries(privateRequired)) {
    if (!privateExisting.has(columnName))
      await pool.query(`ALTER TABLE code_exercise_private ADD COLUMN \`${columnName}\` ${definition}`);
  }

  const [caseColumns] = await pool.query("SHOW COLUMNS FROM code_test_cases");
  const caseExisting = new Set(caseColumns.map((column) => column.Field));
  const caseRequired = {
    exercise_id: "VARCHAR(120) NOT NULL",
    visibility: "VARCHAR(20) NOT NULL",
    input_text: "TEXT",
    expected_output: "TEXT NOT NULL",
    order_index: "INT NOT NULL DEFAULT 1",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };
  for (const [columnName, definition] of Object.entries(caseRequired)) {
    if (!caseExisting.has(columnName))
      await pool.query(`ALTER TABLE code_test_cases ADD COLUMN \`${columnName}\` ${definition}`);
  }

  await ensureIndex(
    "code_test_cases",
    "idx_code_test_cases_exercise_visibility",
    "ALTER TABLE code_test_cases ADD KEY idx_code_test_cases_exercise_visibility (exercise_id, visibility)",
  );
}

async function seedDefaultCodeJudgeData() {
  const exerciseId = "DS_CODE_RBT_001";
  const [[exercise]] = await pool.query(
    "SELECT exercise_id FROM code_exercises WHERE exercise_id=? LIMIT 1",
    [exerciseId],
  );
  if (!exercise) return;

  const referenceSolution = [
    "#include <stdio.h>",
    "",
    "typedef struct Node { int key; struct Node *left, *right, *parent; } Node;",
    "",
    "void rotateLeft(Node **root, Node *x) {",
    "    Node *y = x->right;",
    "    if (!y) return;",
    "    x->right = y->left;",
    "    if (y->left) y->left->parent = x;",
    "    y->parent = x->parent;",
    "    if (!x->parent) *root = y;",
    "    else if (x == x->parent->left) x->parent->left = y;",
    "    else x->parent->right = y;",
    "    y->left = x;",
    "    x->parent = y;",
    "}",
    "",
    "int main(void) {",
    "    int xKey = 0, yKey = 0, betaKey = 0;",
    '    if (scanf("%d %d %d", &xKey, &yKey, &betaKey) != 3) return 1;',
    "    Node x = {xKey, 0, 0, 0}, y = {yKey, 0, 0, 0}, beta = {betaKey, 0, 0, 0};",
    "    x.right = &y; y.parent = &x; y.left = &beta; beta.parent = &y;",
    "    Node *root = &x;",
    "    rotateLeft(&root, &x);",
    "    if (root != &y || y.left != &x || x.parent != &y || x.right != &beta || beta.parent != &x) {",
    '        printf("invalid");',
    "        return 0;",
    "    }",
    '    printf("%d %d %d", root->key, root->left->key, root->left->right->key);',
    "    return 0;",
    "}",
  ].join("\n");

  await pool.query(
    `INSERT INTO code_exercise_private (exercise_id,language,reference_solution,judge_config_json)
     VALUES (?, 'c', ?, ?)
     ON DUPLICATE KEY UPDATE language=VALUES(language),reference_solution=VALUES(reference_solution),judge_config_json=VALUES(judge_config_json)`,
    [
      exerciseId,
      referenceSolution,
      JSON.stringify({ judgeVersion: "2.4a-c-v1", outputComparison: "line_endings_and_trailing_line_space" }),
    ],
  );

  const tests = [
    ["public", "10 20 15", "20 10 15"],
    ["public", "1 2 0", "2 1 0"],
    ["public", "-5 7 3", "7 -5 3"],
    ["hidden", "4 9 6", "9 4 6"],
    ["hidden", "100 200 150", "200 100 150"],
    ["hidden", "0 1 -1", "1 0 -1"],
    ["hidden", "8 13 11", "13 8 11"],
    ["hidden", "-20 -5 -10", "-5 -20 -10"],
    ["hidden", "42 99 77", "99 42 77"],
  ];
  for (const [visibility, input, expectedOutput] of tests) {
    const orderIndex =
      tests.filter((item) => item[0] === visibility).findIndex((item) => item[1] === input) + 1;
    await pool.query(
      `INSERT INTO code_test_cases (exercise_id,visibility,input_text,expected_output,order_index)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE input_text=VALUES(input_text),expected_output=VALUES(expected_output)`,
      [exerciseId, visibility, input, expectedOutput, orderIndex],
    );
  }
}

async function mergeDuplicateWrongQuestionRows() {
  const [groups] = await pool.query(`
    SELECT student_id, question_id, MAX(id) AS keep_id
    FROM wrong_questions
    GROUP BY student_id, question_id
    HAVING COUNT(*) > 1
  `);

  for (const group of groups) {
    await pool.query(
      `
        DELETE FROM wrong_questions
        WHERE student_id <=> ? AND question_id <=> ? AND id <> ?
      `,
      [group.student_id, group.question_id, group.keep_id],
    );
  }
}

async function normalizeWrongQuestionStatuses() {
  await pool.query(`
    UPDATE wrong_questions
    SET status = CASE
      WHEN status IN ('已掌握', 'resolved') THEN '已掌握'
      ELSE '待复习'
    END
    WHERE status IS NULL OR status NOT IN ('待复习', '已掌握')
  `);
}

async function normalizeAgentRunLogStatuses() {
  await pool.query(`
    UPDATE agent_run_logs
    SET status = 'success'
    WHERE status IS NULL OR status NOT IN ('success', 'fallback', 'failed')
  `);
}

async function mergeDuplicateKnowledgeMasteryRows() {
  const [groups] = await pool.query(`
    SELECT
      student_id,
      subject,
      knowledge_point,
      MIN(id) AS keep_id,
      ROUND(AVG(COALESCE(mastery, 70))) AS mastery,
      SUM(COALESCE(wrong_count, 0)) AS wrong_count,
      SUM(COALESCE(practice_count, 0)) AS practice_count
    FROM student_knowledge_mastery
    GROUP BY student_id, subject, knowledge_point
    HAVING COUNT(*) > 1
  `);

  for (const group of groups) {
    await pool.query(
      `
        UPDATE student_knowledge_mastery
        SET mastery = ?, wrong_count = ?, practice_count = ?
        WHERE id = ?
      `,
      [
        clampMastery(group.mastery),
        Number(group.wrong_count || 0),
        Number(group.practice_count || 0),
        group.keep_id,
      ],
    );

    await pool.query(
      `
        DELETE FROM student_knowledge_mastery
        WHERE student_id <=> ?
          AND subject <=> ?
          AND knowledge_point <=> ?
          AND id <> ?
      `,
      [group.student_id, group.subject, group.knowledge_point, group.keep_id],
    );
  }
}

function clampMastery(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 70;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

async function safeModifyColumn(tableName, columnName, definition, existingColumns) {
  assertSafeTableName(tableName);
  assertSafeTableName(columnName);

  if (existingColumns && !existingColumns.has(columnName)) {
    return;
  }

  await pool.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${definition}`);
}

module.exports = {
  initDB,
};
