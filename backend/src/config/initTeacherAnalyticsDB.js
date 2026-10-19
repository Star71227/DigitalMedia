/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { ensureDemoAccount } = require("../services/demoAccountService");
const { normalizeNodeEnv } = require("./runtimeConfig");
const crypto = require("crypto");

async function ensureColumn(pool, table, column, definition) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function initTeacherAnalyticsDB(pool) {
  await ensureColumn(pool, "users", "role", "VARCHAR(20) NOT NULL DEFAULT 'STUDENT'");
  await pool.query("UPDATE users SET role='STUDENT' WHERE role IS NULL OR role='' ");

  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_classes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    teacher_id INT NOT NULL, class_name VARCHAR(160) NOT NULL, subject VARCHAR(120) NOT NULL,
    description TEXT NULL, status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_teacher_classes_teacher (teacher_id,status),
    UNIQUE KEY uq_teacher_class_name (teacher_id,class_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_class_students (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    class_id BIGINT UNSIGNED NOT NULL, teacher_id INT NOT NULL, student_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', joined_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_teacher_class_student (class_id,student_id),
    KEY idx_teacher_students_teacher (teacher_id,status), KEY idx_teacher_students_student (student_id,status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_class_join_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    class_id BIGINT UNSIGNED NOT NULL, teacher_id INT NOT NULL, student_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', message VARCHAR(200) NULL,
    review_note VARCHAR(200) NULL, reviewed_by INT NULL, reviewed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_join_requests_teacher (teacher_id,status,created_at),
    KEY idx_join_requests_student (student_id,status,created_at),
    KEY idx_join_requests_class (class_id,status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS learning_assessment_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    teacher_id INT NOT NULL, student_id INT NOT NULL, class_id BIGINT UNSIGNED NULL,
    report_version INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'generating',
    report_type VARCHAR(30) NOT NULL, range_days INT NOT NULL DEFAULT 30,
    data_snapshot_json LONGTEXT NOT NULL, report_json LONGTEXT NULL, data_fingerprint CHAR(64) NOT NULL,
    storage_path VARCHAR(500) NULL, original_filename VARCHAR(255) NULL, mime_type VARCHAR(160) NULL,
    file_size BIGINT UNSIGNED NULL, checksum_sha256 CHAR(64) NULL, error_summary VARCHAR(255) NULL,
    generated_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_report_version (teacher_id,student_id,report_type,report_version),
    UNIQUE KEY uq_report_fingerprint (teacher_id,student_id,report_type,data_fingerprint),
    KEY idx_reports_teacher_created (teacher_id,created_at), KEY idx_reports_student (student_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await ensureColumn(pool, "learning_resources", "requested_by_teacher_id", "INT NULL");
  await ensureColumn(pool, "agent_run_logs", "student_id", "INT NULL");
  await ensureColumn(pool, "agent_run_logs", "resource_id", "BIGINT UNSIGNED NULL");
  await ensureColumn(pool, "agent_run_logs", "path_version", "INT NULL");
  await repairReportFingerprints(pool);
}

async function repairReportFingerprints(pool) {
  const [rows] = await pool.query(
    "SELECT id,data_snapshot_json,data_fingerprint FROM learning_assessment_reports",
  );
  for (const row of rows) {
    let snapshot;
    try {
      snapshot =
        typeof row.data_snapshot_json === "string"
          ? JSON.parse(row.data_snapshot_json)
          : row.data_snapshot_json;
    } catch {
      continue;
    }
    const fingerprint = crypto.createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
    if (fingerprint === row.data_fingerprint) continue;
    try {
      await pool.query("UPDATE learning_assessment_reports SET data_fingerprint=? WHERE id=?", [
        fingerprint,
        row.id,
      ]);
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
    }
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item) ?? "null").join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJson(value[key])])
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${JSON.stringify(key)}:${item}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

async function seedTeacherDemo(pool) {
  const password = String(process.env.DEMO_PASSWORD || "").trim();
  const minimumLength = normalizeNodeEnv(process.env.NODE_ENV) === "production" ? 12 : 6;
  if (password.length < minimumLength || /^change[-_ ]?me/i.test(password) || password.startsWith("请设置")) {
    throw new Error(
      `DEMO_PASSWORD must contain at least ${minimumLength} non-placeholder characters before seeding the demo teacher`,
    );
  }
  await ensureDemoAccount(pool, {
    studentNo: "TEACHER-DEMO",
    username: "teacher_demo",
    displayName: "李老师",
    role: "TEACHER",
    password,
  });
  const [[teacher]] = await pool.query(
    "SELECT id FROM users WHERE username='teacher_demo' AND is_demo=1 LIMIT 1",
  );
  if (!teacher) return;
  await pool.query(
    `INSERT INTO teacher_classes (teacher_id,class_name,subject,description,status)
    VALUES (?,'数据结构 1班','数据结构','数据结构课程教学班','active')
    ON DUPLICATE KEY UPDATE subject=VALUES(subject),description=VALUES(description),status='active'`,
    [teacher.id],
  );
  const [[classRow]] = await pool.query(
    "SELECT id FROM teacher_classes WHERE teacher_id=? AND class_name='数据结构 1班'",
    [teacher.id],
  );
  const [students] = await pool.query(
    "SELECT id FROM users WHERE username IN ('zhangsan','lisi') AND is_demo=1 AND COALESCE(role,'STUDENT')='STUDENT'",
  );
  for (const student of students) {
    await pool.query(
      `INSERT INTO teacher_class_students (class_id,teacher_id,student_id,status)
      VALUES (?,?,?,'active') ON DUPLICATE KEY UPDATE teacher_id=VALUES(teacher_id),status='active'`,
      [classRow.id, teacher.id, student.id],
    );
  }
}

module.exports = { initTeacherAnalyticsDB, seedTeacherDemo, repairReportFingerprints };
