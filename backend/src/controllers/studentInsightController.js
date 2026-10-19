/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { getStudentOverview, getStudentAssessment } = require("../services/studentInsightService");
const { getClassRanking } = require("../services/studentRankingService");

async function overview(req, res) {
  return respond(res, () => getStudentOverview(req.user.studentId), "读取学生首页数据失败");
}

async function assessment(req, res) {
  return respond(res, () => getStudentAssessment(req.user.studentId), "读取学习评估报告失败");
}

async function ranking(req, res) {
  return respond(res, () => getClassRanking(req.user.studentId), "读取班级排名失败");
}

async function respond(res, action, fallback) {
  try {
    return res.json(await action());
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: status >= 500 ? fallback : error.message });
  }
}

module.exports = { overview, assessment, ranking };
