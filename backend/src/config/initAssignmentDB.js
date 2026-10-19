/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("./db");

async function initAssignmentDB(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      teacher_id INT NOT NULL,
      class_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(160) NOT NULL,
      description TEXT NULL,
      subject VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'published',
      due_at DATETIME NULL,
      question_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_assignments_class (class_id, status),
      KEY idx_assignments_teacher (teacher_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS assignment_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assignment_id BIGINT UNSIGNED NOT NULL,
      question_id VARCHAR(100) NOT NULL,
      order_index INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_assignment_question (assignment_id, question_id),
      KEY idx_assignment_questions_order (assignment_id, order_index),
      CONSTRAINT fk_assignment_questions_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureQuizAttemptAssignmentColumn(db);
  await ensureQuestionBankOwnerTeacherColumn(db);
  await ensureAssignmentCodeExercisesTable(db);
  await ensureCodeSubmissionAssignmentColumn(db);
  // 填空题支持：加宽答案列（老库里这些列太窄，存不下填空文本）
  await ensureFillBlankAnswerColumnWidths(db);
  return true;
}

// 填空题的答案是表达式/术语（如 "n/2"、"递增|升序|有序|递增有序"），
// 而这两个答案列最初是按单选题设计的：quiz_attempt_answers 是 VARCHAR(20)、
// question_bank.answer 是 VARCHAR(10)，长度不够会插入失败。
// 这里在启动时做幂等加宽，组员拉下代码后直接重启即可，不必手工跑迁移脚本。
async function ensureFillBlankAnswerColumnWidths(db = pool) {
  let changed = false;

  const [attemptColumns] = await db.query(
    `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_attempt_answers'
        AND COLUMN_NAME IN ('selected_answer', 'correct_answer')`,
  );
  for (const column of attemptColumns) {
    if (Number(column.CHARACTER_MAXIMUM_LENGTH || 0) < 255) {
      const name = column.COLUMN_NAME === "correct_answer" ? "correct_answer" : "selected_answer";
      await db.query(`ALTER TABLE quiz_attempt_answers MODIFY ${name} VARCHAR(255) NOT NULL`);
      changed = true;
    }
  }

  const [answerColumns] = await db.query(
    `SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'answer'`,
  );
  if (answerColumns.length && Number(answerColumns[0].CHARACTER_MAXIMUM_LENGTH || 0) < 200) {
    await db.query("ALTER TABLE question_bank MODIFY answer VARCHAR(200) NULL");
    changed = true;
  }

  return changed;
}

// 作业提交复用 quiz_attempts：只补一个可空的 assignment_id 关联列
async function ensureQuizAttemptAssignmentColumn(db = pool) {
  const [columns] = await db.query("SHOW COLUMNS FROM quiz_attempts LIKE 'assignment_id'");
  if (columns.length) return false;
  await db.query(
    "ALTER TABLE quiz_attempts ADD COLUMN assignment_id BIGINT UNSIGNED NULL, ADD KEY idx_quiz_attempts_assignment (assignment_id)",
  );
  return true;
}

// 教师自建题库：question_bank 增加归属教师列（用于区分「我的题」并保护删除权限）
async function ensureQuestionBankOwnerTeacherColumn(db = pool) {
  const [columns] = await db.query("SHOW COLUMNS FROM question_bank LIKE 'owner_teacher_id'");
  if (columns.length) return false;
  await db.query(
    "ALTER TABLE question_bank ADD COLUMN owner_teacher_id INT NULL, ADD KEY idx_question_bank_owner_teacher (owner_teacher_id)",
  );
  return true;
}

// 作业里的代码题：作业与 CodeLab 练习的关联表（代码题本身仍存在 code_exercises）
async function ensureAssignmentCodeExercisesTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS assignment_code_exercises (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assignment_id BIGINT UNSIGNED NOT NULL,
      exercise_id VARCHAR(120) NOT NULL,
      order_index INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_assignment_code_exercise (assignment_id, exercise_id),
      KEY idx_assignment_code_order (assignment_id, order_index),
      CONSTRAINT fk_assignment_code_exercises_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 简答题（主观题）：题库在 open_question_bank，与单选/填空不在同一张表，所以单独挂到作业上
  await db.query(`
    CREATE TABLE IF NOT EXISTS assignment_open_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assignment_id BIGINT UNSIGNED NOT NULL,
      open_question_id VARCHAR(120) NOT NULL,
      order_index INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_assignment_open_questions_assignment (assignment_id),
      KEY idx_assignment_open_questions_question (open_question_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 简答题的学生作答：主观题不自动判分，先落库供教师端查看
  await db.query(`
    CREATE TABLE IF NOT EXISTS assignment_open_answers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assignment_id BIGINT UNSIGNED NOT NULL,
      student_id INT NOT NULL,
      open_question_id VARCHAR(120) NOT NULL,
      answer_text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_assignment_open_answers (assignment_id, student_id, open_question_id),
      KEY idx_assignment_open_answers_student (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  return true;
}

// 代码题提交复用 code_submissions：补一个可空的 assignment_id，区分「练习提交」与「作业提交」
async function ensureCodeSubmissionAssignmentColumn(db = pool) {
  const [columns] = await db.query("SHOW COLUMNS FROM code_submissions LIKE 'assignment_id'");
  if (columns.length) return false;
  await db.query(
    "ALTER TABLE code_submissions ADD COLUMN assignment_id BIGINT UNSIGNED NULL, ADD KEY idx_code_submissions_assignment (assignment_id, student_id)",
  );
  return true;
}

module.exports = {
  initAssignmentDB,
  ensureQuestionBankOwnerTeacherColumn,
  ensureQuizAttemptAssignmentColumn,
  ensureAssignmentCodeExercisesTable,
  ensureCodeSubmissionAssignmentColumn,
  ensureFillBlankAnswerColumnWidths,
};
