/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const c = require("../controllers/resourceController");
const router = express.Router();
router.use(authMiddleware);
const editor = require("../controllers/presentationEditorController");
const studentOnly = (req, res, next) =>
  req.user?.role === "STUDENT" && req.user.studentId
    ? next()
    : res.status(403).json({ error: "此课件属于学生学习空间" });
router.get("/resources/:resourceId/presentation", studentOnly, editor.load);
router.put("/resources/:resourceId/presentation", studentOnly, editor.save);
router.post("/resources/:resourceId/presentation/export", studentOnly, editor.download);
router.post("/resources/generate", c.generate);
router.get("/resources", c.list);
router.get("/resources/jobs/latest", c.latestJob);
router.get("/resources/jobs/:jobId/events", c.jobEvents);
router.get("/resources/jobs/:jobId", c.job);
router.get("/resources/:resourceId/versions/:version/download", c.download);
router.get("/resources/:resourceId/versions/:version/pptist-json", c.pptistJson);
router.get("/resources/:resourceId/pptist-json", c.pptistJson);
router.get("/resources/:resourceId/versions/:version/mindmap-json", c.mindmapJson);
router.get("/resources/:resourceId/mindmap-json", c.mindmapJson);
router.get("/resources/:resourceId/versions/:version", c.versionDetail);
router.get("/resources/:resourceId/versions", c.versions);
router.get("/resources/:resourceId/download", c.download);
router.post("/resources/:resourceId/open", c.open);
router.post("/resources/:resourceId/progress", c.progress);
router.post("/resources/:resourceId/complete", c.complete);
router.get("/resources/:resourceId", c.detail);
router.get("/path/me/stages/:stageKey/resources", c.stageResources);
module.exports = router;
