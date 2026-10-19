/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const {
  login,
  register,
  registerTeacherAccount,
  currentUser,
  updatePassword,
  deleteAccount,
} = require("../controllers/authController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();
router.post("/auth/login", login);
router.post("/auth/register", register);
router.post("/auth/register-teacher", registerTeacherAccount);
router.get("/auth/me", authMiddleware, currentUser);
router.post("/auth/password", authMiddleware, updatePassword);
router.post("/auth/deactivate", authMiddleware, deleteAccount);

module.exports = router;
