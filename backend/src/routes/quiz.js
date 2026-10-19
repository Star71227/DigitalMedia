/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const {
  generateQuestion,
  generateQuizHint,
  listQuizQuestions,
  getQuizPaper,
  submitQuizAnswer,
} = require("../controllers/quizController");

const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/quiz/questions", listQuizQuestions);
router.get("/quiz/paper", getQuizPaper);
router.post("/quiz/submit", submitQuizAnswer);
router.post("/generate-question", generateQuestion);
router.post("/quiz-hint", generateQuizHint);

module.exports = router;
