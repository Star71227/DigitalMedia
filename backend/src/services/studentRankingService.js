/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { getCurrentLearningPath } = require("./learningPathService");

async function getClassRanking(studentId, executor = pool, pathLoader = getCurrentLearningPath) {
  const id = positiveId(studentId);
  const [classRows] = await executor.query(
    `SELECT tc.id,class_name
       FROM teacher_class_students tcs
       JOIN teacher_classes tc ON tc.id=tcs.class_id
      WHERE tcs.student_id=? AND tcs.status='active' AND tc.status='active'
      ORDER BY tcs.joined_at DESC,tc.id DESC LIMIT 1`,
    [id],
  );
  const activeClass = classRows[0];
  if (!activeClass) return emptyRanking();

  const [members] = await executor.query(
    `SELECT u.id,u.display_name
       FROM teacher_class_students tcs
       JOIN users u ON u.id=tcs.student_id
      WHERE tcs.class_id=? AND tcs.status='active' AND COALESCE(u.role,'STUDENT')='STUDENT'
      ORDER BY u.id`,
    [activeClass.id],
  );
  const ids = members.map((item) => Number(item.id)).filter(Number.isInteger);
  if (!ids.length) return { ...emptyRanking(), className: activeClass.class_name || "我的班级" };

  const placeholders = ids.map(() => "?").join(",");
  const [quizRows, focusRows, pathSnapshots, codeRows, checkInRows, livePaths] = await Promise.all([
    executor.query(
      `SELECT student_id,SUM(correct_count) correct_count,SUM(total_count) total_count,AVG(score) average_score
         FROM quiz_attempts WHERE student_id IN (${placeholders}) GROUP BY student_id`,
      ids,
    ),
    executor.query(
      `SELECT student_id,COALESCE(SUM(minutes),0) study_minutes
         FROM focus_sessions WHERE student_id IN (${placeholders}) AND session_date>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)
        GROUP BY student_id`,
      ids,
    ),
    executor.query(
      `SELECT p.student_id,v.snapshot_json
         FROM student_learning_paths p
         JOIN learning_path_versions v ON v.student_id=p.student_id AND v.version=p.current_version
        WHERE p.student_id IN (${placeholders})`,
      ids,
    ),
    executor.query(
      `SELECT student_id,SUM(CASE WHEN mode='submit' AND status='accepted' THEN 1 ELSE 0 END) accepted_count
         FROM code_submissions WHERE student_id IN (${placeholders}) GROUP BY student_id`,
      ids,
    ),
    executor.query(
      `SELECT student_id,check_in_date FROM daily_check_ins
        WHERE student_id IN (${placeholders}) AND check_in_date>=DATE_SUB(CURDATE(),INTERVAL 60 DAY)
        ORDER BY student_id,check_in_date DESC`,
      ids,
    ),
    loadLivePathProgress(ids, pathLoader),
  ]);

  const pathRows = mergePathProgress(pathSnapshots[0], livePaths);

  return buildRanking({
    className: activeClass.class_name || "我的班级",
    currentStudentId: id,
    members,
    quizRows: quizRows[0],
    focusRows: focusRows[0],
    pathRows,
    codeRows: codeRows[0],
    checkInRows: checkInRows[0],
  });
}

async function loadLivePathProgress(ids, pathLoader) {
  const rows = [];
  for (const studentId of ids) {
    try {
      const path = await pathLoader(studentId);
      if (path) rows.push({ student_id: studentId, progress: clampPercent(path.progress) });
    } catch {
      // 排名接口仍可使用路径快照和其余学习数据，避免单个学生的路径异常拖垮整班。
    }
  }
  return rows;
}

function mergePathProgress(snapshotRows = [], liveRows = []) {
  const live = new Map(liveRows.map((item) => [Number(item.student_id), item.progress]));
  return snapshotRows.map((item) => {
    const studentId = Number(item.student_id);
    if (!live.has(studentId)) return item;
    const snapshot = parseObject(item.snapshot_json);
    return { ...item, snapshot_json: { ...snapshot, progress: live.get(studentId) } };
  });
}

function buildRanking({
  className,
  currentStudentId,
  members,
  quizRows,
  focusRows,
  pathRows,
  codeRows,
  checkInRows,
}) {
  const quiz = toMap(quizRows);
  const focus = toMap(focusRows);
  const paths = toMap(pathRows);
  const code = toMap(codeRows);
  const streaks = buildStreaks(checkInRows);
  const items = members
    .map((member) => {
      const studentId = Number(member.id);
      const quizItem = quiz.get(studentId) || {};
      const correct = Number(quizItem.correct_count || 0);
      const total = Number(quizItem.total_count || 0);
      const mastery = total ? Math.round((correct / total) * 100) : 0;
      const studyMinutes = Math.round(Number(focus.get(studentId)?.study_minutes || 0));
      const pathProgress = readPathProgress(paths.get(studentId)?.snapshot_json);
      const acceptedCount = Number(code.get(studentId)?.accepted_count || 0);
      const score = Math.round(
        mastery * 30 + pathProgress * 20 + Math.min(studyMinutes, 1200) * 2 + acceptedCount * 60,
      );
      return {
        studentId: String(studentId),
        name: member.display_name || "同学",
        score,
        studyMinutes,
        pathProgress,
        mastery,
        streak: streaks.get(studentId) || 0,
        weeklyChange: null,
        isCurrent: studentId === Number(currentStudentId),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.mastery - a.mastery ||
        b.studyMinutes - a.studyMinutes ||
        Number(a.studentId) - Number(b.studentId),
    );

  return {
    className,
    updatedAt: new Date().toISOString(),
    myRank: items.findIndex((item) => item.isCurrent) + 1 || null,
    total: items.length,
    items,
  };
}

function toMap(rows = []) {
  return new Map(rows.map((item) => [Number(item.student_id), item]));
}

function readPathProgress(value) {
  const snapshot = parseObject(value);
  const direct = Number(snapshot.progress);
  if (Number.isFinite(direct)) return clampPercent(direct);
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  if (!stages.length) return 0;
  return clampPercent(stages.reduce((sum, item) => sum + Number(item.progress || 0), 0) / stages.length);
}

function buildStreaks(rows = [], today = new Date()) {
  const byStudent = new Map();
  for (const row of rows) {
    const id = Number(row.student_id);
    const date = toDateKey(row.check_in_date);
    if (!date) continue;
    if (!byStudent.has(id)) byStudent.set(id, new Set());
    byStudent.get(id).add(date);
  }
  const result = new Map();
  for (const [id, dates] of byStudent) {
    let streak = 0;
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    while (dates.has(toDateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    result.set(id, streak);
  }
  return result;
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseObject(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}
function positiveId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("无效学生身份");
    error.statusCode = 400;
    throw error;
  }
  return id;
}
function emptyRanking() {
  return { className: "我的班级", updatedAt: new Date().toISOString(), myRank: null, total: 0, items: [] };
}

module.exports = { getClassRanking, buildRanking, readPathProgress, buildStreaks };
