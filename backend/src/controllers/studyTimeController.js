/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { recordFocusSession, getDailyStudyTime } = require("../services/studyTimeService");

function assertStudent(req, res) {
  if (!req.user || !req.user.studentId) {
    res.status(403).json({ error: "仅学生账号可用", code: "FORBIDDEN" });
    return false;
  }
  return true;
}

async function getStudyTime(req, res) {
  try {
    if (!assertStudent(req, res)) return;
    const parsed = Number.parseInt(String(req.query.days ?? "30"), 10);
    const days = Number.isFinite(parsed) ? Math.min(90, Math.max(1, parsed)) : 30;
    return res.json(await getDailyStudyTime(req.user.studentId, days));
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "学习时长读取失败，请稍后重试",
    });
  }
}

async function postFocusSession(req, res) {
  try {
    if (!assertStudent(req, res)) return;
    const minutes = Number(req.body && req.body.minutes);
    await recordFocusSession(req.user.studentId, minutes);
    return res.json({ recorded: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "专注时长上报失败，请稍后重试",
    });
  }
}

module.exports = { getStudyTime, postFocusSession };
