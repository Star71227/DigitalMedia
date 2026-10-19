/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const c = require("../controllers/teacherQuestionBankController");

const router = express.Router();
router.use("/teacher/question-bank", authMiddleware, requireRole("TEACHER", "ADMIN"));

router.get("/teacher/question-bank/subjects", c.subjects);
router.get("/teacher/question-bank/questions", c.list);
router.post("/teacher/question-bank/questions", c.create);
router.delete("/teacher/question-bank/questions/:questionId", c.remove);

module.exports = router;
