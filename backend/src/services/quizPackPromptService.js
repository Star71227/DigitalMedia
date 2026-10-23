/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const PROMPT_VERSION = "quiz-pack-trustworthy-v1";

function buildQuizPackPrompt(context, options = {}) {
  const feedback = (options.qualityFeedback || []).slice(0, 10);
  const evidence = (context.questionEvidence || []).slice(0, 24).map((item) => ({
    questionId: item.questionId,
    subject: context.subject,
    knowledgePoint: item.knowledgePoint,
    difficulty: item.difficulty,
    abilityDimension: item.abilityDimension,
    tags: normalizeArray(item.tags),
    stem: item.stem,
    optionCount: [item.optionA, item.optionB, item.optionC, item.optionD].filter(Boolean).length,
  }));

  return [
    "你是 LearnMate 的测验组卷器。只返回 JSON 对象，不要输出 Markdown、解释、Agent 自述或内部 Prompt。",
    "你的任务不是编写新题，而是从 providedQuestionEvidence 中选择 12 到 16 道真实题库题号。",
    "JSON 只允许包含 selectedQuestionIds 字段，值为题号数组；不得改写题干、选项、答案、解析或题号。",
    "组卷要求：覆盖至少 5 个知识点或机制；单一机制占比不得超过 40%；理解/应用题不少于 30%；至少 2 道场景、代码、流程或状态推演题；至少 3 道误区辨析题。",
    "安全要求：不要泄露答案、答案字母、正确选项文本、内部评分字段、数据库字段、chunkId、retrievalRunId、URL 或虚构引用。",
    feedback.length ? `上一轮质量问题，需要定向修复：${feedback.join("；")}` : "",
    JSON.stringify({
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      stageTitle: context.stageTitle,
      stageGoals: context.stageGoals,
      mastery: context.mastery,
      errorPatterns: context.errorPatterns,
      estimatedMinutes: context.estimatedMinutes,
      providedQuestionEvidence: evidence,
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseQuizPackSelectionJson(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("empty quiz_pack model response");
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("quiz_pack model response is not JSON");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const ids = parsed.selectedQuestionIds || parsed.questionIds || parsed.questions;
  const selected = Array.isArray(ids)
    ? ids
        .map((item) => (typeof item === "string" ? item : item?.questionId || item?.question_id))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  if (selected.length === 0) throw new Error("quiz_pack model response did not select question IDs");
  return [...new Set(selected)];
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

module.exports = {
  PROMPT_VERSION,
  buildQuizPackPrompt,
  parseQuizPackSelectionJson,
};
