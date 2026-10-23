/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { listAgentLogs, buildAgentLogSummary } = require("../services/agentLogService");

async function listAgentLogItems(req, res) {
  try {
    const logs = await listAgentLogs({ limit: req.query.limit, studentId: req.user.studentId });

    return res.json({
      data: logs.map(buildAgentLogSummary),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询智能体协同记录失败",
    });
  }
}

module.exports = {
  listAgentLogItems,
};
