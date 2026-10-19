/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const {
  handleChat,
  createChatSession,
  listChatSessions,
  listChatMessages,
  renameChatSession,
  archiveChatSession,
  handleAgentTaskDescriptions,
} = require("../controllers/chatController");

const router = express.Router();
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

router.use(authMiddleware);

const studentOnly = requireRole("STUDENT");

router.post("/chat", studentOnly, handleChat);
router.post("/chat/sessions", studentOnly, createChatSession);
router.get("/chat/sessions", studentOnly, listChatSessions);
router.get("/chat/sessions/:sessionId/messages", studentOnly, listChatMessages);
router.patch("/chat/sessions/:sessionId", studentOnly, renameChatSession);
router.delete("/chat/sessions/:sessionId", studentOnly, archiveChatSession);
router.post("/agent-task-descriptions", handleAgentTaskDescriptions);

module.exports = router;
