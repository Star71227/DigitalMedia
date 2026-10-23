/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const access = require("./teacherAccessService");
const { calculateStudentRisk } = require("./studentRiskService");

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}
function placeholders(items) {
  return items.map(() => "?").join(",");
}
function pathStageStates(snapshotValue, pathVersion, evidence = {}) {
  const stages = parseJson(snapshotValue, {}).stages || [];
  if (!stages.length) return [];
  const state = new Map();
  const decorate = (stage, progress, completedAt) => ({
    key: stage.key || null,
    title: stage.title || null,
    subject: stage.subject || null,
    durationMinutes: stage.durationMinutes == null ? null : Number(stage.durationMinutes),
    completionType: stage.completion?.type || null,
    evidenceCount: (stage.completion?.ids || []).length,
    goals: Array.isArray(stage.goals) ? stage.goals : [],
    knowledgePoints: Array.isArray(stage.knowledgePoints) ? stage.knowledgePoints : [],
    progress,
    completedAt: completedAt || null,
    status: progress === 100 ? "completed" : progress > 0 ? "in_progress" : "pending",
  });
  return stages.map((stage) => {
    const dependencies = (stage.dependsOn || []).map((key) => state.get(key));
    if (dependencies.some((item) => !item || item.progress !== 100)) {
      const locked = { progress: 0, completedAt: null };
      state.set(stage.key, locked);
      return decorate(stage, 0, null);
    }
    const unlockAt = dependencies.reduce((latest, item) => laterDate(latest, item.completedAt), null);
    const ids = stage.completion?.ids || [];
    const source =
      stage.completion?.type === "quiz"
        ? evidence.quiz
        : stage.completion?.type === "codelab"
          ? evidence.code
          : evidence.resource?.get(`${pathVersion}:${stage.key}`);
    const completed = ids.map(String).filter((id) => {
      const completedAt = source?.get(id);
      return completedAt && (!unlockAt || new Date(completedAt) > new Date(unlockAt));
    });
    const progress = ids.length ? Math.round((completed.length / ids.length) * 100) : 0;
    const completedAt =
      progress === 100 ? completed.reduce((latest, id) => laterDate(latest, source.get(id)), null) : null;
    state.set(stage.key, { progress, completedAt });
    return decorate(stage, progress, completedAt);
  });
}

function pathProgress(snapshotValue, pathVersion, evidence = {}) {
  const states = pathStageStates(snapshotValue, pathVersion, evidence);
  if (!states.length) return null;
  return states.reduce((sum, item) => sum + item.progress, 0) / states.length;
}

function relationSubquery(user, classId) {
  const role = access.assertTeacherRole(user);
  const conditions = ["tcs.status='active'", "tc.status='active'"];
  const params = [];
  if (role === "TEACHER") {
    conditions.push("tcs.teacher_id=?", "tc.teacher_id=?");
    params.push(user.userId, user.userId);
  }
  if (classId) {
    conditions.push("tcs.class_id=?");
    params.push(Number(classId));
  }
  return {
    sql: `SELECT tcs.student_id,MIN(tcs.class_id) AS class_id FROM teacher_class_students tcs
          JOIN teacher_classes tc ON tc.id=tcs.class_id AND tc.teacher_id=tcs.teacher_id
          WHERE ${conditions.join(" AND ")} GROUP BY tcs.student_id`,
    params,
  };
}

async function loadStudentMetrics(user, { classId } = {}) {
  const scope = relationSubquery(user, classId);
  const [rows] = await pool.query(
    `SELECT u.id AS student_id,u.username,u.display_name,r.class_id,tc.class_name,tc.subject,
      sp.current_course,sp.current_version AS profile_version,sp.updated_at AS profile_updated_at,
      slp.current_version AS path_version,lpv.snapshot_json AS path_snapshot,lpv.created_at AS path_updated_at,
      qa.correct_count,qa.answer_count,qa.last_quiz_at,rp.completed_resources,rp.last_resource_at,kr.last_retrieval_at
    FROM (${scope.sql}) r JOIN users u ON u.id=r.student_id
    JOIN teacher_classes tc ON tc.id=r.class_id
    LEFT JOIN student_profiles sp ON sp.student_id=u.id
    LEFT JOIN student_learning_paths slp ON slp.student_id=u.id
    LEFT JOIN learning_path_versions lpv ON lpv.student_id=u.id AND lpv.version=slp.current_version
    LEFT JOIN (SELECT q.student_id,SUM(a.is_correct) correct_count,COUNT(a.id) answer_count,MAX(q.submitted_at) last_quiz_at
      FROM quiz_attempts q LEFT JOIN quiz_attempt_answers a ON a.attempt_id=q.id GROUP BY q.student_id) qa ON qa.student_id=u.id
    LEFT JOIN (SELECT student_id,SUM(status='completed') completed_resources,MAX(last_activity_at) last_resource_at
      FROM learning_resource_progress GROUP BY student_id) rp ON rp.student_id=u.id
    LEFT JOIN (SELECT student_id,MAX(created_at) last_retrieval_at FROM knowledge_retrieval_runs GROUP BY student_id) kr ON kr.student_id=u.id
    WHERE COALESCE(u.role,'STUDENT')='STUDENT'`,
    scope.params,
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => Number(row.student_id));
  const [masteryRows, errorRows, pathEvidence] = await Promise.all([
    pool.query(
      `SELECT student_id,subject,knowledge_point,mastery,wrong_count,practice_count,last_updated AS updated_at
      FROM student_knowledge_mastery WHERE student_id IN (${placeholders(ids)}) ORDER BY mastery ASC`,
      ids,
    ),
    pool.query(
      `SELECT student_id,error_type,knowledge_point,occurrence_count,confidence,last_seen_at
      FROM student_error_patterns WHERE student_id IN (${placeholders(ids)}) ORDER BY occurrence_count DESC`,
      ids,
    ),
    loadPathEvidence(ids),
  ]);
  const masteryBy = groupBy(masteryRows[0], "student_id");
  const errorsBy = groupBy(errorRows[0], "student_id");
  const prepared = rows.map((row) => {
    const quizAccuracy = Number(row.answer_count)
      ? (Number(row.correct_count) / Number(row.answer_count)) * 100
      : null;
    const progress = pathProgress(
      row.path_snapshot,
      Number(row.path_version || 0),
      pathEvidence.get(String(row.student_id)),
    );
    const lastActivityAt = latestDate(
      row.last_quiz_at,
      row.last_resource_at,
      row.last_retrieval_at,
      row.profile_updated_at,
      row.path_updated_at,
    );
    const mastery = (masteryBy.get(String(row.student_id)) || []).map((item) => ({
      subject: item.subject,
      knowledgePoint: item.knowledge_point,
      mastery: Number(item.mastery),
      wrongCount: Number(item.wrong_count),
      practiceCount: Number(item.practice_count),
      updatedAt: item.updated_at,
    }));
    const errorPatterns = (errorsBy.get(String(row.student_id)) || []).map((item) => ({
      errorType: item.error_type,
      knowledgePoint: item.knowledge_point,
      occurrenceCount: Number(item.occurrence_count),
      confidence: Number(item.confidence),
      lastSeenAt: item.last_seen_at,
    }));
    return {
      ...row,
      studentId: Number(row.student_id),
      classId: Number(row.class_id),
      profileVersion: Number(row.profile_version || 0),
      pathVersion: Number(row.path_version || 0),
      pathProgress: progress,
      recentQuizAccuracy: quizAccuracy,
      quizCorrectCount: Number(row.correct_count || 0),
      quizAnswerCount: Number(row.answer_count || 0),
      completedResourceCount: Number(row.completed_resources || 0),
      lastActivityAt,
      mastery,
      errorPatterns,
    };
  });
  const classAverages = new Map();
  for (const item of prepared) {
    const list = classAverages.get(item.classId) || [];
    if (item.pathProgress !== null) list.push(item.pathProgress);
    classAverages.set(item.classId, list);
  }
  return prepared.map((item) => {
    const values = classAverages.get(item.classId) || [];
    const classAveragePathProgress = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return { ...item, risk: calculateStudentRisk({ ...item, classAveragePathProgress }) };
  });
}

async function getDashboardOverview(user) {
  const students = await loadStudentMetrics(user);
  const ids = students.map((item) => item.studentId);
  const teacher = await teacherSummary(user);
  const now = Date.now();
  const active = students.filter(
    (item) => item.lastActivityAt && now - new Date(item.lastActivityAt).getTime() <= 7 * 86400000,
  );
  const quizAnswerCount = students.reduce((sum, item) => sum + item.quizAnswerCount, 0);
  const quizCorrectCount = students.reduce((sum, item) => sum + item.quizCorrectCount, 0);
  const pathValues = students.map((item) => item.pathProgress).filter((value) => value !== null);
  const weaknesses = aggregate(
    students.flatMap((item) => item.mastery.filter((m) => m.mastery < 60)),
    "knowledgePoint",
    "mastery",
    true,
  );
  const errors = aggregate(
    students.flatMap((item) => item.errorPatterns),
    "errorType",
    "occurrenceCount",
    false,
  );
  const [recentResources, recentQuizActivity] = ids.length
    ? await Promise.all([
        pool.query(
          `SELECT r.id,r.student_id,u.display_name,r.title,r.resource_type,r.status,r.updated_at
      FROM learning_resources r JOIN users u ON u.id=r.student_id WHERE r.student_id IN (${placeholders(ids)}) ORDER BY r.updated_at DESC LIMIT 8`,
          ids,
        ),
        pool.query(
          `SELECT q.id,q.student_id,u.display_name,q.subject,q.score,q.correct_count,q.total_count,q.submitted_at
      FROM quiz_attempts q JOIN users u ON u.id=q.student_id WHERE q.student_id IN (${placeholders(ids)}) ORDER BY q.submitted_at DESC LIMIT 8`,
          ids,
        ),
      ])
    : [[[]], [[]]];
  return {
    teacher,
    summary: {
      managedStudentCount: students.length,
      activeStudentCount7d: active.length,
      averageQuizAccuracy: quizAnswerCount
        ? Math.round((quizCorrectCount / quizAnswerCount) * 1000) / 10
        : null,
      averagePathProgress: average(pathValues),
      completedResourceCount: students.reduce((sum, item) => sum + item.completedResourceCount, 0),
      highRiskStudentCount: students.filter((item) => item.risk.level === "high").length,
    },
    recentActivity: students
      .filter((item) => item.lastActivityAt)
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
      .slice(0, 8)
      .map(publicStudentCard),
    topWeaknesses: weaknesses.slice(0, 8),
    errorPatternDistribution: errors.slice(0, 8),
    recentResources: recentResources[0],
    recentQuizActivity: recentQuizActivity[0],
  };
}

async function getDashboardTrends(user, range = "30d") {
  const ids = await access.listManagedStudentIds(user);
  const days = range === "7d" ? 7 : range === "6w" ? 42 : 30;
  if (!ids.length) return { range, data: [] };
  const [rows] = await pool.query(
    `SELECT DATE(submitted_at) date,SUM(correct_count) correct,SUM(total_count) total,COUNT(DISTINCT student_id) students
    FROM quiz_attempts WHERE student_id IN (${placeholders(ids)}) AND submitted_at>=DATE_SUB(CURDATE(),INTERVAL ? DAY)
    GROUP BY DATE(submitted_at) ORDER BY date`,
    [...ids, days - 1],
  );
  const map = new Map(rows.map((row) => [dateKey(row.date), row]));
  const data = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = dateKey(date);
    const row = map.get(key);
    data.push({
      date: key,
      accuracy: row && Number(row.total) ? (Number(row.correct) / Number(row.total)) * 100 : null,
      activeStudents: Number(row?.students || 0),
    });
  }
  return { range, data };
}

async function listClasses(user) {
  const role = access.assertTeacherRole(user);
  const params = role === "TEACHER" ? [user.userId] : [];
  const [rows] = await pool.query(
    `SELECT tc.id,tc.class_name,tc.subject,tc.description,tc.status,tc.teacher_id,u.display_name AS teacher_name,
    COUNT(DISTINCT CASE WHEN tcs.status='active' THEN tcs.student_id END) student_count
    FROM teacher_classes tc JOIN users u ON u.id=tc.teacher_id LEFT JOIN teacher_class_students tcs ON tcs.class_id=tc.id AND tcs.teacher_id=tc.teacher_id
    WHERE tc.status='active' ${role === "TEACHER" ? "AND tc.teacher_id=?" : ""} GROUP BY tc.id,u.display_name ORDER BY tc.created_at`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    className: row.class_name,
    subject: row.subject,
    description: row.description,
    status: row.status,
    teacherId: Number(row.teacher_id),
    teacherName: row.teacher_name,
    studentCount: Number(row.student_count),
  }));
}

async function getClassAnalytics(user, classId, range = "30d") {
  const classRow = await access.assertTeacherCanAccessClass(user, classId);
  const students = await loadStudentMetrics(user, { classId });
  const overview = summaryFromStudents(students);
  const trends = await getClassTrends(
    students.map((x) => x.studentId),
    range,
  );
  const knowledgePoints = [...new Set(students.flatMap((x) => x.mastery.map((m) => m.knowledgePoint)))];
  return {
    class: { id: Number(classRow.id), className: classRow.class_name, subject: classRow.subject },
    summary: overview,
    trends,
    radar: knowledgePoints.map((point) => {
      const values = students.flatMap((x) =>
        x.mastery.filter((m) => m.knowledgePoint === point).map((m) => m.mastery),
      );
      return { knowledgePoint: point, mastery: average(values) };
    }),
    weaknesses: aggregate(
      students.flatMap((x) => x.mastery.filter((m) => m.mastery < 60)),
      "knowledgePoint",
      "mastery",
      true,
    ),
    errorPatternDistribution: aggregate(
      students.flatMap((x) => x.errorPatterns),
      "errorType",
      "occurrenceCount",
      false,
    ),
    masteryMatrix: students.map((student) => ({
      studentId: student.studentId,
      displayName: student.display_name,
      values: student.mastery.map((m) => ({
        ...m,
        grade: m.mastery >= 80 ? "A" : m.mastery >= 60 ? "B" : "C",
      })),
    })),
    riskDistribution: ["high", "medium", "low"].map((level) => ({
      level,
      count: students.filter((x) => x.risk.level === level).length,
    })),
    recentResourceCompletion: students.map((x) => ({
      studentId: x.studentId,
      displayName: x.display_name,
      completedCount: x.completedResourceCount,
    })),
  };
}

async function listStudents(user, query = {}) {
  const page = Math.max(1, Number(query.page) || 1),
    pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20));
  if (String(query.keyword || "").length > 100 || String(query.weakKnowledgePoint || "").length > 160)
    throw apiError("搜索条件过长", 400);
  let data = await loadStudentMetrics(user, { classId: query.classId });
  const keyword = String(query.keyword || "")
    .trim()
    .toLowerCase();
  if (keyword)
    data = data.filter(
      (x) =>
        x.username.toLowerCase().includes(keyword) || String(x.display_name).toLowerCase().includes(keyword),
    );
  if (query.subject)
    data = data.filter((x) => x.subject === query.subject || x.current_course === query.subject);
  if (query.riskLevel) data = data.filter((x) => x.risk.level === query.riskLevel);
  if (query.weakKnowledgePoint)
    data = data.filter((x) =>
      x.mastery.some((m) => m.knowledgePoint.includes(query.weakKnowledgePoint) && m.mastery < 60),
    );
  if (query.activityStatus === "active")
    data = data.filter(
      (x) => x.lastActivityAt && Date.now() - new Date(x.lastActivityAt).getTime() <= 7 * 86400000,
    );
  if (query.activityStatus === "inactive")
    data = data.filter(
      (x) => !x.lastActivityAt || Date.now() - new Date(x.lastActivityAt).getTime() > 7 * 86400000,
    );
  const sortMap = {
    displayName: "display_name",
    recentQuizAccuracy: "recentQuizAccuracy",
    pathProgress: "pathProgress",
    lastActivityAt: "lastActivityAt",
    riskLevel: "risk.level",
  };
  const sort = sortMap[query.sortBy] || "display_name",
    direction = String(query.sortOrder).toLowerCase() === "desc" ? -1 : 1;
  data.sort((a, b) => compare(readPath(a, sort), readPath(b, sort)) * direction);
  const total = data.length;
  return {
    data: data.slice((page - 1) * pageSize, page * pageSize).map(publicStudentCard),
    pagination: { page, pageSize, total },
  };
}

async function getStudentDetail(user, studentId, options = {}) {
  const id = await access.assertTeacherCanAccessStudent(user, studentId);
  const metrics = (await loadStudentMetrics(user)).find((x) => x.studentId === id);
  if (!metrics) throw apiError("无权访问该学生", 403);
  const reportDays = Number(options.reportDays);
  const reportMode = Number.isInteger(reportDays) && reportDays >= 7 && reportDays <= 180;
  const period = (field) => (reportMode ? ` AND ${field}>=DATE_SUB(NOW(),INTERVAL ${reportDays} DAY)` : "");
  const recordLimit = reportMode ? "" : " LIMIT 50";
  const [profileVersions, pathVersions, resources, retrieval, quizTrend, citations, events] =
    await Promise.all([
      pool.query(
        "SELECT version,snapshot_json,change_reason,source_type,created_at FROM student_profile_versions WHERE student_id=? ORDER BY version DESC LIMIT 30",
        [id],
      ),
      pool.query(
        "SELECT version,title,snapshot_json,change_reason,source_type,created_at FROM learning_path_versions WHERE student_id=? ORDER BY version DESC LIMIT 30",
        [id],
      ),
      pool.query(
        `SELECT r.id,r.title,r.resource_type,r.status,r.current_version,r.path_version,r.stage_key,COALESCE(p.last_activity_at,r.updated_at) updated_at,p.status progress_status,p.progress_percent,p.completed_at
      FROM learning_resources r LEFT JOIN learning_resource_progress p ON p.student_id=r.student_id AND p.resource_id=r.id AND p.resource_version=r.current_version WHERE r.student_id=?${period("COALESCE(p.last_activity_at,r.updated_at)")} ORDER BY updated_at DESC${recordLimit}`,
        [id],
      ),
      pool.query(
        `SELECT id,request_type,subject,knowledge_point,query_text,retrieval_strategy,result_count,confidence,created_at FROM knowledge_retrieval_runs WHERE student_id=?${period("created_at")} ORDER BY created_at DESC${recordLimit}`,
        [id],
      ),
      pool.query(
        `SELECT id,subject,score,correct_count,total_count,submitted_at FROM quiz_attempts WHERE student_id=?${period("submitted_at")} ORDER BY submitted_at DESC${recordLimit}`,
        [id],
      ),
      pool.query("SELECT COUNT(DISTINCT generation_id) count FROM generation_citations WHERE student_id=?", [
        id,
      ]),
      pool.query(
        "SELECT event_type,subject,knowledge_point,payload_json,created_at FROM student_learning_events WHERE student_id=? ORDER BY created_at DESC LIMIT 50",
        [id],
      ),
    ]);
  const profileHistory = profileVersions[0].map(jsonFields("snapshot_json", "snapshot"));
  const pathHistory = pathVersions[0].map(jsonFields("snapshot_json", "snapshot"));
  const currentProfile =
    profileHistory.find((item) => Number(item.version) === metrics.profileVersion)?.snapshot || null;
  const currentPath =
    pathHistory.find((item) => Number(item.version) === metrics.pathVersion)?.snapshot || null;
  const pathStages = currentPath
    ? pathStageStates(
        currentPath,
        Number(metrics.pathVersion || 0),
        (await loadPathEvidence([id])).get(String(id)),
      )
    : [];
  return {
    student: {
      studentId: id,
      username: metrics.username,
      displayName: metrics.display_name,
      classId: metrics.classId,
      className: metrics.class_name,
      currentCourse: metrics.current_course,
    },
    profile: { currentVersion: metrics.profileVersion, snapshot: currentProfile },
    profileHistory,
    mastery: metrics.mastery,
    errorPatterns: metrics.errorPatterns,
    quizTrend: quizTrend[0],
    path: {
      currentVersion: metrics.pathVersion,
      progress: metrics.pathProgress,
      snapshot: currentPath,
      stages: pathStages,
      versions: pathHistory,
    },
    resources: resources[0],
    retrievalActivity: retrieval[0],
    citationAnswerCount: Number(citations[0][0]?.count || 0),
    recentActivity: events[0].map(jsonFields("payload_json", "payload")),
    risk: metrics.risk,
    recommendations: recommendations(metrics),
  };
}

async function teacherSummary(user) {
  const [[row]] = await pool.query("SELECT id,username,display_name,role FROM users WHERE id=?", [
    user.userId,
  ]);
  const classes = await listClasses(user);
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    classCount: classes.length,
  };
}
function publicStudentCard(x) {
  return {
    studentId: x.studentId,
    username: x.username,
    displayName: x.display_name,
    classId: x.classId,
    className: x.class_name,
    currentCourse: x.current_course,
    profileVersion: x.profileVersion,
    pathVersion: x.pathVersion,
    pathProgress: x.pathProgress,
    recentQuizAccuracy: x.recentQuizAccuracy,
    weakKnowledgePoints: x.mastery.filter((m) => m.mastery < 60).slice(0, 5),
    topErrorPatterns: x.errorPatterns.slice(0, 5),
    lastActivityAt: x.lastActivityAt,
    risk: x.risk,
  };
}
function summaryFromStudents(students) {
  const answers = students.reduce((sum, x) => sum + x.quizAnswerCount, 0),
    correct = students.reduce((sum, x) => sum + x.quizCorrectCount, 0);
  return {
    studentCount: students.length,
    activeStudentCount: students.filter(
      (x) => x.lastActivityAt && Date.now() - new Date(x.lastActivityAt).getTime() <= 7 * 86400000,
    ).length,
    averageQuizAccuracy: answers ? Math.round((correct / answers) * 1000) / 10 : null,
    averagePathProgress: average(students.map((x) => x.pathProgress).filter((x) => x !== null)),
  };
}
async function getClassTrends(ids, range) {
  if (!ids.length) return [];
  const days = range === "7d" ? 7 : range === "6w" ? 42 : 30;
  const [rows] = await pool.query(
    `SELECT DATE(submitted_at) date,SUM(correct_count) correct,SUM(total_count) total FROM quiz_attempts WHERE student_id IN (${placeholders(ids)}) AND submitted_at>=DATE_SUB(CURDATE(),INTERVAL ? DAY) GROUP BY DATE(submitted_at) ORDER BY date`,
    [...ids, days - 1],
  );
  return rows.map((r) => ({
    date: dateKey(r.date),
    accuracy: Number(r.total) ? (Number(r.correct) / Number(r.total)) * 100 : null,
  }));
}
function aggregate(items, keyField, valueField, averageMode) {
  const map = new Map();
  for (const item of items) {
    const key = item[keyField] || "未分类",
      entry = map.get(key) || { key, count: 0, sum: 0 };
    entry.count++;
    entry.sum += Number(item[valueField] || 0);
    map.set(key, entry);
  }
  return [...map.values()]
    .map((x) => ({ name: x.key, count: x.count, value: averageMode ? x.sum / x.count : x.sum }))
    .sort((a, b) => (averageMode ? a.value - b.value : b.value - a.value));
}
function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = String(row[key]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}
function latestDate(...values) {
  return values.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
}
function laterDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}
async function loadPathEvidence(ids) {
  const empty = new Map(
    ids.map((id) => [String(id), { quiz: new Map(), code: new Map(), resource: new Map() }]),
  );
  if (!ids.length) return empty;
  const ph = placeholders(ids);
  const [quiz, code, resource] = await Promise.all([
    pool.query(
      `SELECT q.student_id,a.question_id ref_id,MAX(q.submitted_at) completed_at FROM quiz_attempt_answers a JOIN quiz_attempts q ON q.id=a.attempt_id WHERE q.student_id IN (${ph}) AND a.is_correct=1 GROUP BY q.student_id,a.question_id`,
      ids,
    ),
    pool.query(
      `SELECT s.student_id,s.exercise_id ref_id,MAX(s.created_at) completed_at FROM code_submissions s JOIN code_exercises e ON e.exercise_id=s.exercise_id WHERE s.student_id IN (${ph}) AND s.mode='submit' AND s.status='accepted' AND s.execution_mode='docker' AND e.path_completion_eligible=1 GROUP BY s.student_id,s.exercise_id`,
      ids,
    ),
    pool.query(
      `SELECT r.student_id,r.path_version,r.stage_key,r.resource_type ref_id,MAX(p.completed_at) completed_at FROM learning_resources r JOIN learning_resource_progress p ON p.resource_id=r.id AND p.resource_version=r.current_version AND p.student_id=r.student_id WHERE r.student_id IN (${ph}) AND r.status='approved' AND p.status='completed' GROUP BY r.student_id,r.path_version,r.stage_key,r.resource_type`,
      ids,
    ),
  ]);
  for (const row of quiz[0])
    empty.get(String(row.student_id))?.quiz.set(String(row.ref_id), row.completed_at);
  for (const row of code[0])
    empty.get(String(row.student_id))?.code.set(String(row.ref_id), row.completed_at);
  for (const row of resource[0]) {
    const owner = empty.get(String(row.student_id));
    if (!owner) continue;
    const key = `${row.path_version}:${row.stage_key}`;
    if (!owner.resource.has(key)) owner.resource.set(key, new Map());
    owner.resource.get(key).set(String(row.ref_id), row.completed_at);
  }
  return empty;
}
function average(values) {
  return values.length
    ? Math.round((values.reduce((a, b) => a + Number(b), 0) / values.length) * 10) / 10
    : null;
}
function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function jsonFields(from, to) {
  return (row) => {
    const copy = { ...row, [to]: parseJson(row[from], {}) };
    delete copy[from];
    return copy;
  };
}
function recommendations(x) {
  const result = [];
  for (const item of x.mastery.filter((m) => m.mastery < 60).slice(0, 3))
    result.push(`优先复习${item.knowledgePoint}，当前掌握度 ${Math.round(item.mastery)}%`);
  if (x.recentQuizAccuracy !== null && x.recentQuizAccuracy < 70)
    result.push("完成下一次测验后复盘错题及对应知识点");
  if (!result.length) result.push("保持当前学习节奏，并按学习路径继续完成下一阶段");
  return result;
}
function readPath(value, path) {
  return path.split(".").reduce((v, key) => v?.[key], value);
}
function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return typeof a === "string" ? a.localeCompare(b, "zh-CN") : Number(a) - Number(b);
}
function apiError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  getDashboardOverview,
  getDashboardTrends,
  listClasses,
  getClassAnalytics,
  listStudents,
  getStudentDetail,
  loadStudentMetrics,
  pathProgress,
  pathStageStates,
};
