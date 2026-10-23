/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const secret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
  }

  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: "认证服务尚未配置", code: "AUTH_NOT_CONFIGURED" });
  }

  try {
    const payload = jwt.verify(token, secret);
    const id = Number(payload.userId || payload.sub);
    const role = String(payload.role || "STUDENT").toUpperCase();
    req.user = {
      id,
      userId: id,
      role,
      ...(role === "STUDENT" ? { studentId: Number(payload.studentId || id) } : {}),
      ...(role === "TEACHER" ? { teacherId: Number(payload.teacherId || id) } : {}),
      username: payload.username,
      studentNo: payload.studentNo,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "登录状态已失效", code: "AUTH_INVALID" });
  }
}

function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles.map((role) => String(role).toUpperCase()));
  return async function roleMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
    try {
      const { pool } = require("../config/db");
      const [[account]] = await pool.query(
        "SELECT COALESCE(role,'STUDENT') role FROM users WHERE id=? LIMIT 1",
        [req.user.userId],
      );
      if (!account) return res.status(401).json({ error: "登录用户不存在", code: "AUTH_INVALID" });
      const currentRole = String(account.role).toUpperCase();
      req.user.role = currentRole;
      delete req.user.studentId;
      delete req.user.teacherId;
      if (currentRole === "STUDENT") req.user.studentId = req.user.userId;
      if (currentRole === "TEACHER") req.user.teacherId = req.user.userId;
      if (!allowed.has(currentRole))
        return res.status(403).json({ error: "无权访问该功能", code: "FORBIDDEN" });
      return next();
    } catch {
      return res.status(500).json({ error: "权限验证失败" });
    }
  };
}

module.exports = { authMiddleware, requireRole };
