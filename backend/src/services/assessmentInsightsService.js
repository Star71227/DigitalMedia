/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// Derived report evidence is shared by the online report and its PDF snapshot.
function buildAssessmentInsights(snapshot, report) {
  const points = (snapshot.mastery || [])
    .filter((x) => x.mastery != null && Number.isFinite(Number(x.mastery)))
    .map((x) => ({ knowledgePoint: x.knowledgePoint, mastery: Number(x.mastery), subject: x.subject || "" }))
    .sort((a, b) => a.mastery - b.mastery);
  const attempts = snapshot.quizTrend || [];
  const answered = attempts.reduce((sum, x) => sum + Number(x.total_count || 0), 0);
  const correct = attempts.reduce((sum, x) => sum + Number(x.correct_count || 0), 0);
  const weak = points.filter((x) => x.mastery < 60);
  const riskNames = { high: "重点关注", medium: "持续关注", low: "常规跟进" };
  const actionPlan = weak.slice(0, 3).map((x, i) => ({
    priority: i + 1,
    knowledgePoint: x.knowledgePoint,
    mastery: x.mastery,
    action: `先回顾${x.knowledgePoint}的概念与典型例题，再完成针对性练习并复盘错误步骤。`,
    target: "复测掌握度达到 60% 及以上",
    review: "建议 7 天内复测",
  }));
  if (!actionPlan.length)
    actionPlan.push({
      priority: 1,
      knowledgePoint: points.length ? "下一阶段学习" : "建立评估基线",
      mastery: null,
      action: points.length
        ? "按学习路径完成下一阶段练习，保留错题与解题过程供教师复核。"
        : "先完成一次基础测验，补充知识点练习记录后再评估。",
      target: points.length ? "完成下一阶段并复盘错题" : "形成可用的测验与掌握度记录",
      review: "建议 7 天内回访",
    });
  const gaps = [];
  if (!attempts.length) gaps.push("周期内没有测验记录，不能判断测验表现。");
  if (!points.length) gaps.push("缺少知识点掌握度记录，暂不能识别学习优势和薄弱点。");
  if (!(snapshot.resources || []).length) gaps.push("周期内没有资源学习记录。");
  return {
    executiveSummary: `${riskNames[report.riskAssessment?.level] || "待评估"}：${attempts.length ? `周期内提交 ${attempts.length} 次测验，共作答 ${answered} 题，答对 ${correct} 题。` : "周期内尚无测验提交。"}${weak.length ? `当前有 ${weak.length} 个知识点掌握度低于 60%，建议优先安排针对性复习。` : points.length ? "当前已记录的知识点均达到基础掌握标准。" : "需补充知识点证据后再制定专项复习计划。"}`,
    knowledgePoints: points,
    actionPlan,
    evidence: {
      answeredCount: answered,
      correctCount: correct,
      masteredCount: points.filter((x) => x.mastery >= 80).length,
      weakCount: weak.length,
      developingCount: points.filter((x) => x.mastery >= 60 && x.mastery < 80).length,
    },
    dataQuality: {
      gaps,
      note: "测验、检索及资源记录按所选周期统计；掌握度、路径进度与风险为生成时的最新状态。建议目标由规则生成，尚未代表学生完成情况。",
    },
  };
}
module.exports = { buildAssessmentInsights };
