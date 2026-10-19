/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const access = require("./teacherAccessService");

const DAY_SUM_CAP_MINUTES = 180; // 单日测验用时上限，与学生端 studyTimeService 口径一致

function placeholders(values) {
  return values.map(() => "?").join(",");
}

// mysql2 默认把 DATE/DATETIME 列解析为 JS Date（本地时区），统一成 'YYYY-MM-DD' 再比较
function dateKeyOf(value) {
  if (!value) return "";
  if (typeof value === "string") return String(value).slice(0, 10);
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getTeacherStudyOverview(user, days) {
  const windowDays = Math.max(1, Math.min(90, Number(days) || 30));
  const since = windowDays - 1; // 含今天共 windowDays 天
  const ids = await access.listManagedStudentIds(user);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daily = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    daily.push({ date: dateKeyOf(date), checkInCount: 0, studyMinutes: 0 });
  }
  const dayIndex = new Map(daily.map((item, index) => [item.date, index]));

  if (!ids.length) {
    return {
      days: windowDays,
      summary: { studentCount: 0, checkedInStudentCount: 0, checkInTotal: 0, studyMinutesTotal: 0 },
      daily,
      students: [],
    };
  }
  const ph = placeholders(ids);
  const studentMap = new Map(); // studentId -> { checkInDays, studyMinutes }
  const checkersByDay = new Map(); // date -> Set(studentId)，当日打卡去重
  const addMinutes = (key, studentId, value) => {
    if (!key) return;
    const day = dayIndex.get(key);
    if (day !== undefined) daily[day].studyMinutes += value;
    if (!studentMap.has(studentId)) studentMap.set(studentId, { checkInDays: 0, studyMinutes: 0 });
    studentMap.get(studentId).studyMinutes += value;
  };

  // 1) 签到：每生日数 + 每日去重人数
  const [checkRows] = await pool.query(
    `SELECT student_id, check_in_date FROM daily_check_ins
      WHERE student_id IN (${ph}) AND check_in_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [...ids, since],
  );
  for (const row of checkRows) {
    const studentId = Number(row.student_id);
    if (!studentMap.has(studentId)) studentMap.set(studentId, { checkInDays: 0, studyMinutes: 0 });
    studentMap.get(studentId).checkInDays += 1;
    const key = dateKeyOf(row.check_in_date);
    const day = dayIndex.get(key);
    if (day !== undefined) {
      if (!checkersByDay.has(key)) checkersByDay.set(key, new Set());
      checkersByDay.get(key).add(studentId);
      daily[day].checkInCount = checkersByDay.get(key).size;
    }
  }

  // 2) 专注计时
  const [focusRows] = await pool.query(
    `SELECT student_id, session_date, minutes FROM focus_sessions
      WHERE student_id IN (${ph}) AND session_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [...ids, since],
  );
  for (const row of focusRows)
    addMinutes(dateKeyOf(row.session_date), Number(row.student_id), Number(row.minutes || 0));

  // 3) 测验用时（有 started_at）
  const [quizRows] = await pool.query(
    `SELECT student_id, DATE(submitted_at) AS d,
            LEAST(${DAY_SUM_CAP_MINUTES}, GREATEST(0, TIMESTAMPDIFF(MINUTE, started_at, submitted_at))) AS m
       FROM quiz_attempts
      WHERE student_id IN (${ph}) AND started_at IS NOT NULL
        AND submitted_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [...ids, since],
  );
  for (const row of quizRows) addMinutes(dateKeyOf(row.d), Number(row.student_id), Number(row.m || 0));

  // 4) 测验兜底（started_at 为空，用每题秒数，避免与 3 重复计）
  const [answerRows] = await pool.query(
    `SELECT q.student_id, DATE(q.submitted_at) AS d,
            LEAST(${DAY_SUM_CAP_MINUTES}, GREATEST(0, ROUND(a.duration_seconds / 60))) AS m
       FROM quiz_attempt_answers a
       JOIN quiz_attempts q ON q.id = a.attempt_id
      WHERE q.student_id IN (${ph}) AND q.started_at IS NULL
        AND q.submitted_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [...ids, since],
  );
  for (const row of answerRows) addMinutes(dateKeyOf(row.d), Number(row.student_id), Number(row.m || 0));

  // 5) 学生姓名与班级
  const [userRows] = await pool.query(
    `SELECT u.id, u.username, u.display_name,
            COALESCE(MAX(tc.class_name), '') AS class_name
       FROM users u
       LEFT JOIN teacher_class_students tcs ON tcs.student_id = u.id AND tcs.status = 'active'
       LEFT JOIN teacher_classes tc ON tc.id = tcs.class_id AND tc.teacher_id = tcs.teacher_id
      WHERE u.id IN (${ph})
      GROUP BY u.id, u.username, u.display_name`,
    ids,
  );
  const userById = new Map(userRows.map((row) => [Number(row.id), row]));

  const students = ids
    .map((id) => {
      const stats = studentMap.get(id) || { checkInDays: 0, studyMinutes: 0 };
      const row = userById.get(id) || {};
      return {
        studentId: id,
        username: row.username || "",
        displayName: row.display_name || row.username || "",
        className: row.class_name || "",
        checkInDays: stats.checkInDays,
        studyMinutes: Math.round(stats.studyMinutes),
      };
    })
    .sort(
      (a, b) =>
        b.studyMinutes - a.studyMinutes ||
        b.checkInDays - a.checkInDays ||
        a.username.localeCompare(b.username),
    );

  for (const item of daily) item.studyMinutes = Math.round(item.studyMinutes);

  return {
    days: windowDays,
    summary: {
      studentCount: students.length,
      checkedInStudentCount: students.filter((item) => item.checkInDays > 0).length,
      checkInTotal: students.reduce((sum, item) => sum + item.checkInDays, 0),
      studyMinutesTotal: students.reduce((sum, item) => sum + item.studyMinutes, 0),
    },
    daily,
    students,
  };
}

module.exports = { getTeacherStudyOverview };
