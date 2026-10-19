/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
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

// mysql2 默认把 DATE 列解析为 JS Date（本地午夜），此处统一成 'YYYY-MM-DD' 字符串再比较
function dateKeyOf(value) {
  if (!value) return "";
  if (typeof value === "string") return String(value).slice(0, 10);
  return formatDateKey(new Date(value));
}

async function recordDailyCheckIn(studentId) {
  const [result] = await pool.query(
    "INSERT IGNORE INTO daily_check_ins (student_id, check_in_date) VALUES (?, ?)",
    [Number(studentId), todayKey()],
  );
  return { newlyCheckedIn: result.affectedRows === 1 };
}

async function getCheckInSummary(studentId) {
  const [rows] = await pool.query(
    "SELECT check_in_date FROM daily_check_ins WHERE student_id = ? ORDER BY check_in_date DESC LIMIT 400",
    [Number(studentId)],
  );
  const checked = new Set(rows.map((row) => dateKeyOf(row.check_in_date)).filter(Boolean));
  const today = todayKey();
  const todayCheckedIn = checked.has(today);

  // 连续天数：从今天（已签）或昨天（未签）起向前数连续日期，遇到第一个断档即停
  let currentStreak = 0;
  let cursor = todayCheckedIn ? today : shiftDate(today, -1);
  while (checked.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDate(cursor, -1);
  }

  // 当前自然月（1 号到月末，含未来日期 checked=false，升序）
  const [year, month] = today.split("-").map(Number);
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: lastDayOfMonth }, (_, index) => {
    const date = formatDateKey(new Date(year, month - 1, index + 1));
    return { date, checked: checked.has(date) };
  });

  return { todayCheckedIn, currentStreak, totalCount: rows.length, monthDays };
}

module.exports = { recordDailyCheckIn, getCheckInSummary, todayKey };
