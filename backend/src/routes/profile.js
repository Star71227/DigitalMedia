/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const {
  listKnowledgeMasteryItems,
  listWeakPointItems,
  getMyProfile,
  startProfileDialogue,
  postProfileDialogueMessage,
  confirmProfileDialogue,
  patchMyProfile,
  getProfileHistory,
  getLearningEvents,
} = require("../controllers/profileController");

const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

router.use(authMiddleware);
router.get("/profile/me", getMyProfile);
router.patch("/profile/me", patchMyProfile);
router.get("/profile/history", getProfileHistory);
router.get("/profile/events", getLearningEvents);
router.post("/profile/dialogue/start", startProfileDialogue);
router.post("/profile/dialogue/message", postProfileDialogueMessage);
router.post("/profile/dialogue/confirm", confirmProfileDialogue);

router.get("/profile/knowledge-mastery", listKnowledgeMasteryItems);
router.get("/profile/weak-points", listWeakPointItems);

module.exports = router;
