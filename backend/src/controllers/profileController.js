/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { listKnowledgeMastery, getWeakPoints } = require("../services/profileService");
const {
  getCompleteProfile,
  startDialogue,
  sendDialogueMessage,
  confirmDialogue,
  patchProfile,
  listProfileHistory,
  listLearningEvents,
} = require("../services/studentProfileService");

async function getMyProfile(req, res) {
  try {
    return res.json(await getCompleteProfile(req.user.studentId));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function startProfileDialogue(req, res) {
  try {
    return res.json(await startDialogue(req.user.studentId));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function postProfileDialogueMessage(req, res) {
  try {
    const { sessionId, message } = req.body || {};
    return res.json(await sendDialogueMessage(req.user.studentId, sessionId, message));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function confirmProfileDialogue(req, res) {
  try {
    const { sessionId, confirmedProfile } = req.body || {};
    return res.json(await confirmDialogue(req.user.studentId, sessionId, confirmedProfile));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function patchMyProfile(req, res) {
  try {
    return res.json(await patchProfile(req.user.studentId, req.body || {}));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function getProfileHistory(req, res) {
  try {
    return res.json({ data: await listProfileHistory(req.user.studentId) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function getLearningEvents(req, res) {
  try {
    return res.json({ data: await listLearningEvents(req.user.studentId, req.query.limit) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

async function listKnowledgeMasteryItems(req, res) {
  try {
    const data = await listKnowledgeMastery({
      studentId: req.user.studentId,
      subject: req.query.subject,
    });

    return res.json({ data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询学习画像失败",
    });
  }
}

async function listWeakPointItems(req, res) {
  try {
    const data = await getWeakPoints({
      studentId: req.user.studentId,
      limit: req.query.limit,
    });

    return res.json({ data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询薄弱知识点失败",
    });
  }
}

module.exports = {
  getMyProfile,
  startProfileDialogue,
  postProfileDialogueMessage,
  confirmProfileDialogue,
  patchMyProfile,
  getProfileHistory,
  getLearningEvents,
  listKnowledgeMasteryItems,
  listWeakPointItems,
};
