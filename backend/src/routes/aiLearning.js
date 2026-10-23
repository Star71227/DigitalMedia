/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const router = require("express").Router();
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const controller = require("../controllers/aiLearningController");

router.use(authMiddleware);
const studentOnly = requireRole("STUDENT");
router.get("/ai-learning/status", studentOnly, controller.status);
router.get("/ai-learning/agents", studentOnly, controller.agents);
router.get("/ai-learning/model-health", studentOnly, controller.modelHealth);
router.get("/ai-learning/overview", studentOnly, controller.loopOverview);
router.post("/personal-knowledge/documents", studentOnly, controller.createDocument);
router.get("/personal-knowledge/documents", studentOnly, controller.listDocuments);
router.delete("/personal-knowledge/documents/:documentId", studentOnly, controller.removeDocument);
router.get("/knowledge/graph", studentOnly, controller.graph);
router.post("/wrong-questions/analyze", studentOnly, controller.analyzeWrong);
router.post("/quiz/personalized/generate", studentOnly, controller.generateQuiz);
router.get("/review/queue", studentOnly, controller.reviewQueue);
router.post("/review/queue/:itemId/result", studentOnly, controller.reviewResult);
router.get("/resources/catalog", studentOnly, controller.resourceCatalog);

// 多智能体协作：这三个接口学生与教师都能看（教师可加 scope=all 看全量协作轨迹）
router.get("/ai-learning/collaboration/pipelines", controller.collaborationPipelines);
router.get("/ai-learning/collaboration/traces", controller.collaborations);
router.get("/ai-learning/collaboration/traces/:traceId", controller.collaborationDetail);
router.post("/ai-learning/collaboration/full-loop", controller.fullLoop);

module.exports = router;
