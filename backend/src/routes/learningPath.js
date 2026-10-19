/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  getMyLearningPath,
  generateMyLearningPath,
  getMyLearningPathVersions,
} = require("../controllers/learningPathController");

const router = express.Router();
router.use(authMiddleware);
router.get("/path/me", getMyLearningPath);
router.post("/path/generate", generateMyLearningPath);
router.get("/path/versions", getMyLearningPathVersions);

module.exports = router;
