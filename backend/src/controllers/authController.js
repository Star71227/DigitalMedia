/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { authenticate, registerStudent, registerTeacher } = require("../services/authService");

const demoTemplate = require("../services/demoTemplateService");
async function login(req, res) {
  try {
    const { identifier, username, password } = req.body || {};
    const result = await authenticate(identifier || username, password);
    // 演示统一模板：学生一登录就确保「学习路径 + 课件/思维导图/讲义」与模板账号一致。
    // 失败只记日志，绝不影响登录本身。
    const templateStudentId = Number(result?.user?.id || result?.user?.userId || 0);
    if (templateStudentId && String(result?.user?.role || "").toUpperCase() === "STUDENT") {
      try {
        await demoTemplate.ensureStudent(templateStudentId);
      } catch (error) {
        console.warn("[demo-template] 登录时统一模板失败：", error.message);
      }
    }
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "登录失败" });
  }
}

async function register(req, res) {
  try {
    const user = await registerStudent(req.body || {}, {
      rateLimitKey: req.ip || req.socket?.remoteAddress || "unknown",
    });
    return res.status(201).json({
      success: true,
      message: "注册成功，请使用新账号登录。",
      user,
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) {
      return res.status(500).json({ error: "注册失败，请稍后重试。", code: "REGISTER_FAILED" });
    }
    return res
      .status(status)
      .json({ error: error.message || "注册失败", code: error.code || "REGISTER_FAILED" });
  }
}

async function registerTeacherAccount(req, res) {
  try {
    const user = await registerTeacher(req.body || {}, {
      rateLimitKey: req.ip || req.socket?.remoteAddress || "unknown",
    });
    return res.status(201).json({
      success: true,
      message: "教师账号创建成功，请使用新账号登录。",
      user,
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) {
      return res.status(500).json({ error: "注册失败，请稍后重试。", code: "REGISTER_FAILED" });
    }
    return res
      .status(status)
      .json({ error: error.message || "注册失败", code: error.code || "REGISTER_FAILED" });
  }
}

async function currentUser(req, res) {
  try {
    const { pool } = require("../config/db");
    const [[user]] = await pool.query(
      "SELECT id, username, student_no, display_name, COALESCE(role, 'STUDENT') AS role FROM users WHERE id = ? LIMIT 1",
      [req.user.userId],
    );
    if (!user) return res.status(401).json({ error: "登录用户不存在", code: "AUTH_INVALID" });
    const role = String(user.role).toUpperCase();
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        studentNo: user.student_no,
        displayName: user.display_name,
        role,
        ...(role === "STUDENT" ? { studentId: Number(user.id) } : {}),
        ...(role === "TEACHER" ? { teacherId: Number(user.id) } : {}),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "读取登录用户失败" });
  }
}

/* 修改密码：需要当前密码 + 新密码（强度与注册一致），内置账号拒绝 */
async function updatePassword(req, res) {
  try {
    const { changePassword } = require("../services/authService");
    const result = await changePassword(req.user.userId, req.body || {});
    return res.json({ success: true, message: "密码已更新，请牢记新密码。", ...result });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500)
      return res.status(500).json({ error: "修改密码失败，请稍后重试。", code: "PASSWORD_UPDATE_FAILED" });
    return res
      .status(status)
      .json({ error: error.message || "修改密码失败", code: error.code || "PASSWORD_UPDATE_FAILED" });
  }
}

/* 注销账号：需要密码 + 输入「注销」确认；注销后账号不可再登录 */
async function deleteAccount(req, res) {
  try {
    const { deactivateAccount } = require("../services/authService");
    const result = await deactivateAccount(req.user.userId, req.body || {});
    return res.json({ success: true, message: "账号已注销，感谢使用。", ...result });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500)
      return res.status(500).json({ error: "注销失败，请稍后重试。", code: "ACCOUNT_DELETE_FAILED" });
    return res
      .status(status)
      .json({ error: error.message || "注销失败", code: error.code || "ACCOUNT_DELETE_FAILED" });
  }
}

module.exports = { login, register, registerTeacherAccount, currentUser, updatePassword, deleteAccount };
