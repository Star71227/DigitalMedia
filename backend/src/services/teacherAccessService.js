/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

function assertTeacherRole(user) {
  const role = String(user?.role || "").toUpperCase();
  if (!user || !["TEACHER", "ADMIN"].includes(role)) throw apiError("无权访问教师功能", 403);
  return role;
}

async function listManagedStudentIds(user) {
  const role = assertTeacherRole(user);
  if (role === "ADMIN") {
    const [rows] = await pool.query("SELECT id FROM users WHERE COALESCE(role,'STUDENT')='STUDENT'");
    return rows.map((row) => Number(row.id));
  }
  const [rows] = await pool.query(
    `SELECT DISTINCT tcs.student_id FROM teacher_class_students tcs
     JOIN teacher_classes tc ON tc.id=tcs.class_id AND tc.teacher_id=tcs.teacher_id
     WHERE tcs.teacher_id=? AND tcs.status='active' AND tc.status='active'`,
    [user.userId],
  );
  return rows.map((row) => Number(row.student_id));
}

async function assertTeacherCanAccessClass(user, classId) {
  const role = assertTeacherRole(user);
  const id = positiveId(classId, "classId");
  const params = role === "ADMIN" ? [id] : [id, user.userId];
  const [[row]] = await pool.query(
    `SELECT id,teacher_id,class_name,subject,status FROM teacher_classes
     WHERE id=? AND status='active' ${role === "ADMIN" ? "" : "AND teacher_id=?"} LIMIT 1`,
    params,
  );
  if (!row) throw apiError("无权访问该班级", 403);
  return row;
}

async function assertTeacherCanAccessStudent(user, studentId) {
  const role = assertTeacherRole(user);
  const id = positiveId(studentId, "studentId");
  if (role === "ADMIN") {
    const [[row]] = await pool.query(
      "SELECT id FROM users WHERE id=? AND COALESCE(role,'STUDENT')='STUDENT' LIMIT 1",
      [id],
    );
    if (!row) throw apiError("无权访问该学生", 403);
    return id;
  }
  const [[row]] = await pool.query(
    `SELECT tcs.student_id FROM teacher_class_students tcs
     JOIN teacher_classes tc ON tc.id=tcs.class_id AND tc.teacher_id=tcs.teacher_id
     WHERE tcs.teacher_id=? AND tcs.student_id=? AND tcs.status='active' AND tc.status='active' LIMIT 1`,
    [user.userId, id],
  );
  if (!row) throw apiError("无权访问该学生", 403);
  return id;
}

function positiveId(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw apiError(`无效的 ${name}`, 400);
  return id;
}
function apiError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  assertTeacherRole,
  assertTeacherCanAccessClass,
  assertTeacherCanAccessStudent,
  listManagedStudentIds,
  positiveId,
};
