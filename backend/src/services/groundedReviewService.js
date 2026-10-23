/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
function reviewGroundedGeneration(validation, retrieval) {
  const issues = [...validation.issues];
  if ((retrieval.results || []).length === 0) issues.push({ type: "insufficient_evidence" });
  return {
    approved: issues.length === 0,
    issues,
    coverage: validation.coverage,
    confidence: issues.length ? "insufficient" : retrieval.confidence,
  };
}
module.exports = { reviewGroundedGeneration };
