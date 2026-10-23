/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { recordDailyCheckIn, getCheckInSummary } = require("../services/checkInService");

function assertStudent(req, res) {
  if (!req.user || !req.user.studentId) {
    res.status(403).json({ error: "仅学生账号可用", code: "FORBIDDEN" });
    return false;
  }
  return true;
}

async function getCheckInStatus(req, res) {
  try {
    if (!assertStudent(req, res)) return;
    return res.json(await getCheckInSummary(req.user.studentId));
  } catch (error) {
    return res.status(500).json({ error: "签到状态读取失败，请稍后重试" });
  }
}

async function postCheckIn(req, res) {
  try {
    if (!assertStudent(req, res)) return;
    const { newlyCheckedIn } = await recordDailyCheckIn(req.user.studentId);
    const summary = await getCheckInSummary(req.user.studentId);
    return res.json({ ...summary, newlyCheckedIn });
  } catch (error) {
    return res.status(500).json({ error: "签到失败，请稍后重试" });
  }
}

module.exports = { getCheckInStatus, postCheckIn };
