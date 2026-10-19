/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const {
  listCodeExercises,
  getCodeExercise,
  getCodeExerciseSolution,
  runCode,
  submitCode,
  listCodeSubmissions,
  getCodeSubmission,
  explainCodeRun,
} = require("../controllers/codeController");

const router = express.Router();
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

router.use(authMiddleware, requireRole("STUDENT"));

router.get("/health", async (req, res, next) => {
  try {
    /* 按当前执行模式报告可用性：docker 模式查容器与镜像，local 模式查本机编译器。 */
    const { getCodeExecutionConfig } = require("../config/runtimeConfig");
    const { mode } = getCodeExecutionConfig();
    if (mode === "local") {
      const { checkLocalAvailable } = require("../services/localCodeRunnerService");
      const result = await checkLocalAvailable();
      res.json({ available: result.available, reason: result.reason || "ready", mode, language: "C11" });
      return;
    }
    const { checkDockerAvailable } = require("../services/dockerCodeRunnerService");
    const result = await checkDockerAvailable();
    res.json({ available: result.available, reason: result.reason || "ready", mode, language: "C11" });
  } catch (error) {
    next(error);
  }
});

router.get("/exercises", listCodeExercises);
router.get("/exercises/:id", getCodeExercise);
router.get("/exercises/:id/solution", getCodeExerciseSolution);
router.get("/submissions", listCodeSubmissions);
router.get("/submissions/:id", getCodeSubmission);
router.post("/run", runCode);
router.post("/submit", submitCode);
router.post("/explain", explainCodeRun);

module.exports = router;
