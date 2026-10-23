/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

async function updateMasteryAfterAnswer({ studentId, subject, knowledgePoint, isCorrect }) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const normalizedSubject = ensureProfileText(subject, "未分类科目");
  const normalizedKnowledgePoint = ensureProfileText(knowledgePoint, "综合知识点");
  const correct = Boolean(isCorrect);
  const initialMastery = correct ? 75 : 60;
  const initialWrongCount = correct ? 0 : 1;

  await pool.query(
    `
      INSERT INTO student_knowledge_mastery (
        student_id,
        subject,
        knowledge_point,
        mastery,
        wrong_count,
        practice_count
      )
      VALUES (?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        mastery = CASE
          WHEN ? THEN LEAST(100, mastery + 3)
          ELSE GREATEST(0, mastery - 6)
        END,
        wrong_count = wrong_count + ?,
        practice_count = practice_count + 1,
        last_updated = CURRENT_TIMESTAMP
    `,
    [
      normalizedStudentId,
      normalizedSubject,
      normalizedKnowledgePoint,
      initialMastery,
      initialWrongCount,
      correct,
      correct ? 0 : 1,
    ],
  );

  const [rows] = await pool.query(
    `
      SELECT
        subject,
        knowledge_point,
        mastery,
        wrong_count,
        practice_count,
        last_updated
      FROM student_knowledge_mastery
      WHERE student_id = ? AND subject = ? AND knowledge_point = ?
      LIMIT 1
    `,
    [normalizedStudentId, normalizedSubject, normalizedKnowledgePoint],
  );

  return rows[0] || null;
}

async function listKnowledgeMastery({ studentId, subject } = {}) {
  const where = ["student_id = ?", "subject <> ''", "knowledge_point <> ''"];
  const params = [normalizeStudentId(studentId)];

  if (subject) {
    where.push("subject = ?");
    params.push(String(subject).trim());
  }

  const [rows] = await pool.query(
    `
      SELECT
        subject,
        knowledge_point,
        mastery,
        wrong_count,
        practice_count,
        last_updated
      FROM student_knowledge_mastery
      WHERE ${where.join(" AND ")}
      ORDER BY subject ASC, mastery ASC, wrong_count DESC, last_updated DESC
    `,
    params,
  );

  return attachCanonicalKnowledgePoints(rows);
}

// 掌握度表里存的是测验使用的原始知识点名，而知识图谱用的是规范名，
// 两者并不总是一致（例如掌握度「红黑树旋转」对应图谱节点「红黑树」）。
// 这里按「精确名或已登记别名」把原始名解析成规范名，附加到 knowledge_point_canonical 字段，
// 供知识图谱叠加掌握度。解析不到时为 null（新增字段，不影响既有调用方）。
function knowledgeBaseSubject(subject) {
  const value = String(subject || "").trim();
  if (value === "C 语言程序设计" || value === "C语言程序设计") return "C语言";
  if (value === "计算机组成") return "计算机组成原理";
  return value;
}

let canonicalPointCache = null;
let canonicalPointCachedAt = 0;
const CANONICAL_CACHE_TTL_MS = 60000;

async function canonicalPointMap() {
  const now = Date.now();
  if (canonicalPointCache && now - canonicalPointCachedAt < CANONICAL_CACHE_TTL_MS) {
    return canonicalPointCache;
  }
  const [rows] = await pool.query(
    `SELECT kp.subject,kp.name,a.alias FROM knowledge_points kp
       LEFT JOIN knowledge_point_aliases a ON a.knowledge_point_id = kp.id
      WHERE kp.status = 'active'`,
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.subject + "::" + row.name, row.name);
    if (row.alias) map.set(row.subject + "::" + row.alias, row.name);
  }
  canonicalPointCache = map;
  canonicalPointCachedAt = now;
  return map;
}

async function attachCanonicalKnowledgePoints(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  try {
    const map = await canonicalPointMap();
    return rows.map((row) => ({
      ...row,
      knowledge_point_canonical:
        map.get(knowledgeBaseSubject(row.subject) + "::" + row.knowledge_point) || null,
    }));
  } catch (error) {
    // 解析失败不应影响掌握度本身可用
    return rows.map((row) => ({ ...row, knowledge_point_canonical: null }));
  }
}

async function getWeakPoints({ studentId, limit } = {}) {
  const [rows] = await pool.query(
    `
      SELECT
        subject,
        knowledge_point,
        mastery,
        wrong_count,
        practice_count,
        last_updated
      FROM student_knowledge_mastery
      WHERE student_id = ? AND subject <> '' AND knowledge_point <> ''
      ORDER BY wrong_count DESC, mastery ASC, last_updated DESC
      LIMIT ?
    `,
    [normalizeStudentId(studentId), normalizeLimit(limit)],
  );

  return rows;
}

function normalizeStudentId(studentId) {
  const value = Number(studentId);
  if (!Number.isInteger(value) || value <= 0) throw new Error("studentId 无效");
  return value;
}

function normalizeLimit(limit) {
  const value = Number(limit || 5);
  if (!Number.isFinite(value) || value <= 0) {
    return 5;
  }

  return Math.min(Math.floor(value), 50);
}

function ensureProfileText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

module.exports = {
  updateMasteryAfterAnswer,
  listKnowledgeMastery,
  getWeakPoints,
};
