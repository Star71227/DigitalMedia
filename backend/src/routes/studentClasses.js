/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const membership = require("../services/classMembershipService");

const router = express.Router();

function sendError(res, error, fallbackMessage) {
  const status = Number(error?.statusCode) || 500;
  return res.status(status).json({
    error: status < 500 ? error.message : fallbackMessage,
    ...(error?.code ? { code: error.code } : {}),
  });
}

// 学生查看自己所属的班级与任课教师。
// 只使用 JWT 中的 userId，不接受请求参数指定学生身份；非学生角色返回空数组。
router.get("/student/classes", authMiddleware, async (req, res) => {
  try {
    return res.json(await membership.listStudentClasses(req.user));
  } catch (error) {
    return sendError(res, error, "读取班级信息失败");
  }
});

// 班级目录：学生按老师姓名/用户名或班级名称搜索，用于提交入班申请。
router.get("/student/class-directory", authMiddleware, async (req, res) => {
  try {
    return res.json(await membership.listClassDirectory(req.user, { keyword: req.query.keyword }));
  } catch (error) {
    return sendError(res, error, "读取班级列表失败");
  }
});

// 我的入班申请（待审核 / 已通过 / 已拒绝 / 已撤回）。
router.get("/student/class-requests", authMiddleware, async (req, res) => {
  try {
    return res.json(await membership.listMyJoinRequests(req.user));
  } catch (error) {
    return sendError(res, error, "读取入班申请失败");
  }
});

// 提交入班申请：只产生申请记录，不直接加入班级，需要教师审核通过。
router.post("/student/class-requests", authMiddleware, async (req, res) => {
  try {
    return res.status(201).json(await membership.createJoinRequest(req.user, req.body || {}));
  } catch (error) {
    return sendError(res, error, "提交入班申请失败");
  }
});

// 学生自己退出班级（只处理自己的成员记录；退班后该班的待审核申请一并作废）。
router.delete("/student/classes/:classId", authMiddleware, async (req, res) => {
  try {
    return res.json(await membership.leaveClass(req.user, req.params.classId));
  } catch (error) {
    return sendError(res, error, "退出班级失败");
  }
});

// 撤回自己的待审核申请。
router.delete("/student/class-requests/:requestId", authMiddleware, async (req, res) => {
  try {
    return res.json(await membership.cancelJoinRequest(req.user, req.params.requestId));
  } catch (error) {
    return sendError(res, error, "撤回入班申请失败");
  }
});

module.exports = router;
