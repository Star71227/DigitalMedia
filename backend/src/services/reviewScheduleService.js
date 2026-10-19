/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

async function scheduleReview(
  { studentId, subject, knowledgePoint, sourceType, sourceId, priority = 70, dueAt = new Date() },
  executor = pool,
) {
  const due = validDate(dueAt) || new Date();
  await executor.query(
    `INSERT INTO review_schedule_items
      (student_id,subject,knowledge_point,source_type,source_id,priority,due_at,status)
     VALUES(?,?,?,?,?,?,?,'pending')
     ON DUPLICATE KEY UPDATE subject=VALUES(subject),knowledge_point=VALUES(knowledge_point),
       priority=GREATEST(priority,VALUES(priority)),due_at=LEAST(due_at,VALUES(due_at)),status='pending'`,
    [
      Number(studentId),
      String(subject || "待分类").slice(0, 120),
      String(knowledgePoint || "待识别知识点").slice(0, 180),
      String(sourceType || "manual").slice(0, 40),
      String(sourceId).slice(0, 120),
      clamp(priority, 1, 100),
      due,
    ],
  );
}

async function listDueReviews(studentId, { limit = 20, includeFuture = false } = {}) {
  const params = [Number(studentId)];
  const dueFilter = includeFuture ? "" : " AND due_at<=NOW()";
  params.push(clamp(Number(limit) || 20, 1, 100));
  const [rows] = await pool.query(
    `SELECT id,subject,knowledge_point,source_type,source_id,interval_days,repetition_count,
            ease_factor,priority,due_at,last_reviewed_at,status
       FROM review_schedule_items
      WHERE student_id=? AND status='pending'${dueFilter}
      ORDER BY due_at ASC,priority DESC LIMIT ?`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    subject: row.subject,
    knowledgePoint: row.knowledge_point,
    sourceType: row.source_type,
    sourceId: row.source_id,
    intervalDays: Number(row.interval_days),
    repetitionCount: Number(row.repetition_count),
    easeFactor: Number(row.ease_factor),
    priority: Number(row.priority),
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at,
    status: row.status,
  }));
}

async function recordReviewResult({ studentId, itemId, quality }) {
  const score = clamp(Number(quality), 0, 5);
  const [[item]] = await pool.query(
    "SELECT * FROM review_schedule_items WHERE id=? AND student_id=? LIMIT 1",
    [Number(itemId), Number(studentId)],
  );
  if (!item) return null;
  const next = calculateNextReview({
    quality: score,
    repetitionCount: Number(item.repetition_count),
    intervalDays: Number(item.interval_days),
    easeFactor: Number(item.ease_factor),
  });
  const dueAt = new Date(Date.now() + next.intervalDays * 86400000);
  await pool.query(
    `UPDATE review_schedule_items SET interval_days=?,repetition_count=?,ease_factor=?,
       priority=?,due_at=?,last_reviewed_at=NOW(),status='pending' WHERE id=? AND student_id=?`,
    [
      next.intervalDays,
      next.repetitionCount,
      next.easeFactor,
      score < 3 ? 90 : Math.max(20, Number(item.priority) - 10),
      dueAt,
      Number(itemId),
      Number(studentId),
    ],
  );
  return { ...next, dueAt };
}

function calculateNextReview({ quality, repetitionCount, intervalDays, easeFactor }) {
  const score = clamp(Number(quality), 0, 5);
  let repetitions = Number(repetitionCount) || 0;
  let interval = Number(intervalDays) || 1;
  let ease = Number(easeFactor) || 2.5;
  if (score < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(interval * ease));
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)));
  return { intervalDays: interval, repetitionCount: repetitions, easeFactor: Number(ease.toFixed(2)) };
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = { scheduleReview, listDueReviews, recordReviewResult, calculateNextReview };
