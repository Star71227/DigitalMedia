/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const access = require("./teacherAccessService");

const CLASS_NAME_MAX = 60;
const SUBJECT_MAX = 40;
const DESCRIPTION_MAX = 500;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 20;

// 教师与学生之间的绑定关系：班级（teacher_classes）+ 成员（teacher_class_students）。
// 学生端只按 JWT 里的 userId 查询自己所在的班级，不接受任何身份参数。

function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizeText(value, { field, min, max, required = true }) {
  const normalized = String(value ?? "").trim();
  const length = Array.from(normalized).length;
  if (!normalized) {
    if (required) throw apiError(`${field}不能为空`, 400);
    return "";
  }
  if (length < min) throw apiError(`${field}至少需要 ${min} 个字符`, 400);
  if (length > max) throw apiError(`${field}不能超过 ${max} 个字符`, 400);
  return normalized;
}

async function requireClass(user, classId) {
  const role = access.assertTeacherRole(user);
  const id = access.positiveId(classId, "classId");
  const params = role === "ADMIN" ? [id] : [id, user.userId];
  const [[row]] = await pool.query(
    `SELECT tc.id, tc.teacher_id, tc.class_name, tc.subject, tc.description, tc.status,
            (SELECT COUNT(DISTINCT student_id) FROM teacher_class_students WHERE class_id = tc.id AND status = 'active') student_count
       FROM teacher_classes tc
      WHERE tc.id = ? AND tc.status = 'active' ${role === "ADMIN" ? "" : "AND tc.teacher_id = ?"} LIMIT 1`,
    params,
  );
  if (!row) throw apiError("无权访问该班级", 403);
  return {
    id: Number(row.id),
    className: row.class_name,
    subject: row.subject,
    description: row.description,
    status: row.status,
    teacherId: Number(row.teacher_id),
    studentCount: Number(row.student_count),
  };
}

async function createClass(user, body = {}) {
  access.assertTeacherRole(user);
  const className = normalizeText(body.className, { field: "班级名称", min: 2, max: CLASS_NAME_MAX });
  const subject = normalizeText(body.subject, { field: "学科", min: 2, max: SUBJECT_MAX });
  const description = normalizeText(body.description, {
    field: "班级说明",
    min: 0,
    max: DESCRIPTION_MAX,
    required: false,
  });

  try {
    const [result] = await pool.query(
      "INSERT INTO teacher_classes (teacher_id, class_name, subject, description, status) VALUES (?, ?, ?, ?, 'active')",
      [user.userId, className, subject, description || null],
    );
    return { class: await requireClass(user, Number(result.insertId)) };
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY" || Number(error?.errno) === 1062) {
      throw apiError("你已经有一个同名班级", 409, "CLASS_NAME_TAKEN");
    }
    throw error;
  }
}

async function listClassStudents(user, classId) {
  const classRow = await requireClass(user, classId);
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.student_no, u.display_name, tcs.joined_at
       FROM teacher_class_students tcs
       JOIN users u ON u.id = tcs.student_id
      WHERE tcs.class_id = ? AND tcs.status = 'active'
      ORDER BY tcs.joined_at, u.id`,
    [classRow.id],
  );
  return {
    class: classRow,
    data: rows.map((row) => ({
      studentId: Number(row.id),
      username: row.username,
      studentNo: row.student_no,
      displayName: row.display_name,
      joinedAt: row.joined_at,
    })),
  };
}

async function searchStudents(user, query = {}) {
  access.assertTeacherRole(user);
  const keyword = String(query.keyword ?? "").trim();
  const classId =
    query.classId === undefined || query.classId === null || query.classId === ""
      ? null
      : Number(query.classId);

  if (classId !== null && (!Number.isInteger(classId) || classId <= 0)) throw apiError("无效的班级 ID", 400);
  if (classId !== null) await requireClass(user, classId);

  if (Array.from(keyword).length < SEARCH_MIN_LENGTH) {
    return { data: [], hint: `请输入至少 ${SEARCH_MIN_LENGTH} 个字符的用户名、学号或姓名` };
  }
  if (keyword.length > 100) throw apiError("搜索关键字过长", 400);

  const like = `%${keyword.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
  const [rows] = await pool.query(
    `SELECT id, username, student_no, display_name
       FROM users
      WHERE COALESCE(role, 'STUDENT') = 'STUDENT'
        AND (username LIKE ? OR student_no LIKE ? OR display_name LIKE ?)
      ORDER BY id LIMIT ?`,
    [like, like, like, SEARCH_LIMIT],
  );

  let inClass = new Set();
  if (classId !== null && rows.length) {
    const ids = rows.map((row) => Number(row.id));
    const [members] = await pool.query(
      `SELECT student_id FROM teacher_class_students
        WHERE class_id = ? AND status = 'active' AND student_id IN (${ids.map(() => "?").join(",")})`,
      [classId, ...ids],
    );
    inClass = new Set(members.map((row) => Number(row.student_id)));
  }

  return {
    data: rows.map((row) => ({
      studentId: Number(row.id),
      username: row.username,
      studentNo: row.student_no,
      displayName: row.display_name,
      inThisClass: inClass.has(Number(row.id)),
    })),
  };
}

async function addStudent(user, classId, body = {}) {
  const classRow = await requireClass(user, classId);
  const identifier = String(body.username ?? body.identifier ?? "").trim();
  const rawStudentId =
    body.studentId === undefined || body.studentId === null || body.studentId === ""
      ? null
      : Number(body.studentId);
  if (rawStudentId !== null && (!Number.isInteger(rawStudentId) || rawStudentId <= 0))
    throw apiError("无效的学生 ID", 400);
  if (rawStudentId === null && !identifier) throw apiError("请提供学生用户名、学号或学生 ID", 400);

  const [[student]] = await pool.query(
    `SELECT id, username, student_no, display_name FROM users
      WHERE COALESCE(role, 'STUDENT') = 'STUDENT' AND ${rawStudentId !== null ? "id = ?" : "(username = ? OR student_no = ?)"}
      LIMIT 1`,
    rawStudentId !== null ? [rawStudentId] : [identifier, identifier],
  );
  if (!student) throw apiError("没有找到该学生账号", 404, "STUDENT_NOT_FOUND");

  await pool.query(
    `INSERT INTO teacher_class_students (class_id, teacher_id, student_id, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id), status = 'active'`,
    [classRow.id, classRow.teacherId, student.id],
  );

  return {
    class: await requireClass(user, classId),
    member: {
      studentId: Number(student.id),
      username: student.username,
      studentNo: student.student_no,
      displayName: student.display_name,
    },
  };
}

async function removeStudent(user, classId, studentId) {
  const classRow = await requireClass(user, classId);
  const id = access.positiveId(studentId, "studentId");
  const [result] = await pool.query(
    "DELETE FROM teacher_class_students WHERE class_id = ? AND student_id = ?",
    [classRow.id, id],
  );
  if (!Number(result.affectedRows)) throw apiError("该学生不在此班级中", 404, "NOT_IN_CLASS");
  return { class: await requireClass(user, classId), removedStudentId: id };
}

async function listStudentClasses(user) {
  const studentId = Number(user?.userId);
  if (!studentId || String(user?.role || "").toUpperCase() !== "STUDENT") return { data: [] };
  const [rows] = await pool.query(
    `SELECT tc.id, tc.class_name, tc.subject, tc.description,
            u.display_name AS teacher_name, u.username AS teacher_username, tcs.joined_at
       FROM teacher_class_students tcs
       JOIN teacher_classes tc ON tc.id = tcs.class_id AND tc.status = 'active'
       JOIN users u ON u.id = tc.teacher_id
      WHERE tcs.student_id = ? AND tcs.status = 'active'
      ORDER BY tc.created_at, tc.id`,
    [studentId],
  );
  return {
    data: rows.map((row) => ({
      classId: Number(row.id),
      className: row.class_name,
      subject: row.subject,
      description: row.description,
      teacherName: row.teacher_name,
      teacherUsername: row.teacher_username,
      joinedAt: row.joined_at,
    })),
  };
}

/**
 * 学生自己退出班级：只允许退自己那条成员记录，退掉后该班的待审核申请也一并作废。
 * 与教师端 removeStudent 一样是物理删除，避免留下半活跃的成员行。
 */
async function leaveClass(user, classId) {
  const studentId = studentIdOf(user);
  if (!studentId) throw apiError("只有学生账号可以退出班级", 403, "STUDENT_ONLY");
  const id = access.positiveId(classId, "classId");
  const [[classRow]] = await pool.query("SELECT id, class_name FROM teacher_classes WHERE id = ? LIMIT 1", [
    id,
  ]);
  if (!classRow) throw apiError("班级不存在", 404, "CLASS_NOT_FOUND");

  const [result] = await pool.query(
    "DELETE FROM teacher_class_students WHERE class_id = ? AND student_id = ?",
    [id, studentId],
  );
  if (!Number(result.affectedRows)) throw apiError("你不在这个班级里", 404, "NOT_IN_CLASS");

  await pool.query(
    "UPDATE teacher_class_join_requests SET status = 'cancelled', reviewed_at = NOW() WHERE class_id = ? AND student_id = ? AND status = 'pending'",
    [id, studentId],
  );

  return { classId: id, className: classRow.class_name, left: true };
}

const JOIN_REQUEST_STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);

const JOIN_REQUEST_SELECT = `SELECT r.id, r.class_id, r.teacher_id, r.student_id, r.status, r.message, r.review_note, r.reviewed_at, r.created_at,
    tc.class_name, tc.subject, tu.display_name teacher_name, tu.username teacher_username,
    su.display_name student_name, su.username student_username, su.student_no student_no
  FROM teacher_class_join_requests r
  JOIN teacher_classes tc ON tc.id = r.class_id
  JOIN users tu ON tu.id = r.teacher_id
  JOIN users su ON su.id = r.student_id`;

function mapJoinRequest(row) {
  return {
    requestId: Number(row.id),
    classId: Number(row.class_id),
    className: row.class_name,
    subject: row.subject,
    teacherId: Number(row.teacher_id),
    teacherName: row.teacher_name,
    teacherUsername: row.teacher_username,
    studentId: Number(row.student_id),
    studentName: row.student_name,
    studentUsername: row.student_username,
    studentNo: row.student_no,
    status: row.status,
    message: row.message,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

function studentIdOf(user) {
  if (String(user?.role || "").toUpperCase() !== "STUDENT") return null;
  const id = Number(user?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function loadJoinRequest(requestId) {
  const [[row]] = await pool.query(`${JOIN_REQUEST_SELECT} WHERE r.id = ? LIMIT 1`, [requestId]);
  return row ? mapJoinRequest(row) : null;
}

// 班级目录：学生找老师 / 找班级用。myStatus 告诉前端当前处于 未申请 / 待审核 / 已加入。
async function listClassDirectory(user, query = {}) {
  const studentId = studentIdOf(user);
  const keyword = String(query.keyword ?? "").trim();
  if (keyword.length > 100) throw apiError("搜索关键字过长", 400);
  const params = [];
  let where = "tc.status = 'active'";
  if (keyword) {
    const escaped = keyword.replace(/[%_\\]/g, (char) => `\\${char}`);
    const like = `%${escaped}%`;
    where += " AND (tc.class_name LIKE ? OR tc.subject LIKE ? OR u.display_name LIKE ? OR u.username LIKE ?)";
    params.push(like, like, like, like);
  }
  const [rows] = await pool.query(
    `SELECT tc.id, tc.class_name, tc.subject, tc.description, u.display_name teacher_name, u.username teacher_username,
            (SELECT COUNT(DISTINCT student_id) FROM teacher_class_students WHERE class_id = tc.id AND status = 'active') member_count
       FROM teacher_classes tc JOIN users u ON u.id = tc.teacher_id
      WHERE ${where}
      ORDER BY tc.created_at DESC, tc.id DESC LIMIT 20`,
    params,
  );

  const memberClasses = new Set();
  const pendingClasses = new Set();
  if (studentId && rows.length) {
    const ids = rows.map((row) => Number(row.id));
    const marks = ids.map(() => "?").join(",");
    const [members] = await pool.query(
      `SELECT class_id FROM teacher_class_students WHERE student_id = ? AND status = 'active' AND class_id IN (${marks})`,
      [studentId, ...ids],
    );
    members.forEach((row) => memberClasses.add(Number(row.class_id)));
    const [pending] = await pool.query(
      `SELECT class_id FROM teacher_class_join_requests WHERE student_id = ? AND status = 'pending' AND class_id IN (${marks})`,
      [studentId, ...ids],
    );
    pending.forEach((row) => pendingClasses.add(Number(row.class_id)));
  }

  return {
    data: rows.map((row) => ({
      classId: Number(row.id),
      className: row.class_name,
      subject: row.subject,
      description: row.description,
      teacherName: row.teacher_name,
      teacherUsername: row.teacher_username,
      memberCount: Number(row.member_count),
      myStatus: memberClasses.has(Number(row.id))
        ? "member"
        : pendingClasses.has(Number(row.id))
          ? "pending"
          : "none",
    })),
  };
}

async function createJoinRequest(user, body = {}) {
  const studentId = studentIdOf(user);
  if (!studentId) throw apiError("只有学生账号可以申请加入班级", 403, "STUDENT_REQUIRED");
  const classId = access.positiveId(body.classId, "classId");
  const message = normalizeText(body.message, { field: "申请留言", min: 0, max: 200, required: false });

  const [[classRow]] = await pool.query(
    "SELECT id, teacher_id FROM teacher_classes WHERE id = ? AND status = 'active' LIMIT 1",
    [classId],
  );
  if (!classRow) throw apiError("该班级不存在或已关闭", 404, "CLASS_NOT_FOUND");

  const [[member]] = await pool.query(
    "SELECT id FROM teacher_class_students WHERE class_id = ? AND student_id = ? AND status = 'active' LIMIT 1",
    [classId, studentId],
  );
  if (member) throw apiError("你已经是该班级成员", 409, "ALREADY_MEMBER");

  const [[pending]] = await pool.query(
    "SELECT id FROM teacher_class_join_requests WHERE class_id = ? AND student_id = ? AND status = 'pending' LIMIT 1",
    [classId, studentId],
  );
  if (pending) throw apiError("你已经提交过申请，正在等待教师审核", 409, "ALREADY_REQUESTED");

  const [result] = await pool.query(
    "INSERT INTO teacher_class_join_requests (class_id, teacher_id, student_id, status, message) VALUES (?, ?, ?, 'pending', ?)",
    [classId, classRow.teacher_id, studentId, message || null],
  );
  return { request: await loadJoinRequest(Number(result.insertId)) };
}

async function listMyJoinRequests(user) {
  const studentId = studentIdOf(user);
  if (!studentId) return { data: [] };
  const [rows] = await pool.query(
    `${JOIN_REQUEST_SELECT} WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
    [studentId],
  );
  return { data: rows.map(mapJoinRequest) };
}

async function cancelJoinRequest(user, requestId) {
  const studentId = studentIdOf(user);
  if (!studentId) throw apiError("只有学生账号可以撤回申请", 403, "STUDENT_REQUIRED");
  const id = access.positiveId(requestId, "requestId");
  const [result] = await pool.query(
    "UPDATE teacher_class_join_requests SET status = 'cancelled', reviewed_at = NOW() WHERE id = ? AND student_id = ? AND status = 'pending'",
    [id, studentId],
  );
  if (!Number(result.affectedRows)) throw apiError("只能撤回待审核的申请", 409, "REQUEST_NOT_PENDING");
  return { request: await loadJoinRequest(id) };
}

async function countJoinRequests(user, role) {
  const params = [];
  const clause = role === "ADMIN" ? "" : " AND teacher_id = ?";
  if (role !== "ADMIN") params.push(user.userId);
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) count FROM teacher_class_join_requests WHERE 1 = 1${clause} GROUP BY status`,
    params,
  );
  const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  rows.forEach((row) => {
    counts[row.status] = Number(row.count);
  });
  return counts;
}

async function listJoinRequests(user, query = {}) {
  const role = access.assertTeacherRole(user);
  const status = String(query.status || "pending")
    .trim()
    .toLowerCase();
  if (!JOIN_REQUEST_STATUSES.has(status)) throw apiError("无效的申请状态", 400);
  const classId =
    query.classId === undefined || query.classId === null || query.classId === ""
      ? null
      : access.positiveId(query.classId, "classId");
  if (classId !== null) await requireClass(user, classId);

  const where = ["r.status = ?"];
  const params = [status];
  if (role !== "ADMIN") {
    where.push("r.teacher_id = ?");
    params.push(user.userId);
  }
  if (classId !== null) {
    where.push("r.class_id = ?");
    params.push(classId);
  }

  const [rows] = await pool.query(
    `${JOIN_REQUEST_SELECT} WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC, r.id DESC LIMIT 100`,
    params,
  );
  return { data: rows.map(mapJoinRequest), counts: await countJoinRequests(user, role) };
}

// 审核：approve 会在同一事务里写入班级成员并把申请置为 approved。
async function reviewJoinRequest(user, requestId, decision, body = {}) {
  const role = access.assertTeacherRole(user);
  const id = access.positiveId(requestId, "requestId");
  if (decision !== "approve" && decision !== "reject") throw apiError("无效的审核操作", 400);
  const note = normalizeText(body.note, { field: "审核备注", min: 0, max: 200, required: false });

  const [[row]] = await pool.query(
    "SELECT id, class_id, teacher_id, student_id, status FROM teacher_class_join_requests WHERE id = ? LIMIT 1",
    [id],
  );
  if (!row) throw apiError("申请不存在", 404, "REQUEST_NOT_FOUND");
  if (role !== "ADMIN" && Number(row.teacher_id) !== Number(user.userId))
    throw apiError("无权审核该申请", 403);
  if (row.status !== "pending") throw apiError("该申请已经处理过了", 409, "REQUEST_ALREADY_REVIEWED");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (decision === "approve") {
      await connection.query(
        `INSERT INTO teacher_class_students (class_id, teacher_id, student_id, status)
         VALUES (?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id), status = 'active'`,
        [row.class_id, row.teacher_id, row.student_id],
      );
    }
    await connection.query(
      "UPDATE teacher_class_join_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ? AND status = 'pending'",
      [decision === "approve" ? "approved" : "rejected", user.userId, note || null, id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }

  return { request: await loadJoinRequest(id), class: await requireClass(user, row.class_id) };
}

module.exports = {
  createClass,
  listClassStudents,
  searchStudents,
  addStudent,
  removeStudent,
  listStudentClasses,
  listClassDirectory,
  createJoinRequest,
  listMyJoinRequests,
  cancelJoinRequest,
  listJoinRequests,
  reviewJoinRequest,
  leaveClass,
};
