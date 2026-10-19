/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const c = require("../controllers/assignmentController");

const router = express.Router();
router.use(authMiddleware);

router.get("/assignments", c.listMine);
router.get("/assignments/:assignmentId", c.myDetail);
router.post("/assignments/:assignmentId/submit", c.submit);
router.post("/assignments/:assignmentId/code/:exerciseId/submit", c.submitCode);

module.exports = router;
