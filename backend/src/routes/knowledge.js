/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const router = require("express").Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const controller = require("../controllers/knowledgeController");
router.use(authMiddleware);
router.post("/knowledge/search", controller.search);
router.post("/knowledge/answer", controller.answer);
router.get("/knowledge/retrieval-runs/:id", controller.run);
router.get("/knowledge/sources", controller.sources);
router.get("/knowledge/overview", controller.overview);
router.get("/knowledge/citations/:generationType/:generationId/versions/:version", controller.citations);
module.exports = router;
