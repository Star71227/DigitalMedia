/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
function calculateStudentRisk(metrics = {}) {
  const reasons = [];
  const high = [];
  const medium = [];
  const accuracy = nullableNumber(metrics.recentQuizAccuracy);
  const last = metrics.lastActivityAt ? new Date(metrics.lastActivityAt) : null;
  const daysInactive =
    last && !Number.isNaN(last.getTime())
      ? Math.max(0, Math.floor((Date.now() - last.getTime()) / 86400000))
      : null;
  const mastery = Array.isArray(metrics.mastery) ? metrics.mastery : [];
  const critical = mastery.filter((item) => Number(item.mastery) < 40);
  const weak = mastery.filter((item) => Number(item.mastery) < 55);

  if (daysInactive === null || daysInactive >= 7)
    high.push(daysInactive === null ? "尚无可识别的学习活动" : `最近 ${daysInactive} 天无学习活动`);
  if (accuracy !== null && accuracy < 50) high.push(`最近有效测验正确率为 ${round(accuracy)}%`);
  if (critical.length >= 2) high.push(`${critical.length} 个知识点掌握度低于 40%`);
  if (accuracy !== null && accuracy >= 50 && accuracy < 70)
    medium.push(`最近有效测验正确率为 ${round(accuracy)}%`);
  if (weak.length) medium.push(`${weak[0].knowledgePoint}掌握度为 ${round(weak[0].mastery)}%`);
  if (daysInactive !== null && daysInactive >= 3 && daysInactive <= 6)
    medium.push(`最近 ${daysInactive} 天无学习活动`);
  const progress = nullableNumber(metrics.pathProgress);
  const average = nullableNumber(metrics.classAveragePathProgress);
  if (progress !== null && average !== null && progress + 15 < average)
    medium.push(`路径进度低于班级平均 ${round(average - progress)} 个百分点`);
  if (high.length) reasons.push(...high);
  else if (medium.length) reasons.push(...medium);
  else reasons.push("近期学习记录未触发中高风险规则");
  return { level: high.length ? "high" : medium.length ? "medium" : "low", reasons };
}
function nullableNumber(value) {
  const number = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number) ? null : number;
}
function round(value) {
  return Math.round(Number(value) * 10) / 10;
}
module.exports = { calculateStudentRisk };
