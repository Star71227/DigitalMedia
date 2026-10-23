/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return formatDateKey(new Date());
}

function shiftDate(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  return formatDateKey(new Date(year, month - 1, day + days));
}

// mysql2 默认把 DATE 列解析为 JS Date（本地午夜），此处统一成 'YYYY-MM-DD' 字符串再合并
function dateKeyOf(value) {
  if (!value) return "";
  if (typeof value === "string") return String(value).slice(0, 10);
  return formatDateKey(new Date(value));
}

const DAY_SUM_CAP_MINUTES = 180; // 单日测验用时上限，防异常大值撑爆纵轴

async function recordFocusSession(studentId, minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 1 || value > 600) {
    const error = new Error("专注时长需为 1-600 分钟");
    error.statusCode = 400;
    throw error;
  }

  await pool.query("INSERT INTO focus_sessions (student_id, session_date, minutes) VALUES (?, ?, ?)", [
    Number(studentId),
    todayKey(),
    Math.round(value),
  ]);
  return { recorded: true };
}

async function getDailyStudyTime(studentId, days) {
  const windowDays = Math.max(1, Math.min(90, Number(days) || 30));
  const since = windowDays - 1; // 含今天共 windowDays 天
  const minutesByDate = new Map();
  const add = (row) => {
    const key = dateKeyOf(row.d);
    if (!key) return;
    minutesByDate.set(key, (minutesByDate.get(key) || 0) + Number(row.m || 0));
  };

  // 1) 专注计时（新增上报）
  const [focusRows] = await pool.query(
    `SELECT session_date AS d, SUM(minutes) AS m
       FROM focus_sessions
      WHERE student_id = ? AND session_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY session_date`,
    [Number(studentId), since],
  );
  focusRows.forEach(add);

  // 2) 测验用时（有 started_at：TIMESTAMPDIFF 算耗时）
  const [quizRows] = await pool.query(
    `SELECT DATE(submitted_at) AS d,
            SUM(LEAST(${DAY_SUM_CAP_MINUTES}, GREATEST(0, TIMESTAMPDIFF(MINUTE, started_at, submitted_at)))) AS m
       FROM quiz_attempts
      WHERE student_id = ? AND started_at IS NOT NULL
        AND submitted_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(submitted_at)`,
    [Number(studentId), since],
  );
  quizRows.forEach(add);

  // 3) 测验兜底（started_at 为空：用每题秒数汇总，避免与 2 重复计）
  const [answerRows] = await pool.query(
    `SELECT DATE(q.submitted_at) AS d,
            SUM(LEAST(${DAY_SUM_CAP_MINUTES}, GREATEST(0, ROUND(a.duration_seconds / 60)))) AS m
       FROM quiz_attempt_answers a
       JOIN quiz_attempts q ON q.id = a.attempt_id
      WHERE q.student_id = ? AND q.started_at IS NULL
        AND q.submitted_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(q.submitted_at)`,
    [Number(studentId), since],
  );
  answerRows.forEach(add);

  // 零填充：升序 windowDays 天，末位今天
  const today = todayKey();
  const daysList = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    daysList.push({ date, minutes: Math.round(minutesByDate.get(date) || 0) });
  }

  return { days: daysList };
}

module.exports = { recordFocusSession, getDailyStudyTime, todayKey };
