/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const ERROR_LABELS = {
  concept_misunderstanding: "概念理解偏差",
  condition_omission: "条件遗漏",
  procedure_confusion: "操作顺序混淆",
  formula_misuse: "公式使用错误",
  boundary_mistake: "边界条件遗漏",
  implementation_error: "代码实现错误",
  careless_error: "粗心计算错误",
  memory_gap: "知识记忆不牢",
  unknown: "暂无法判断",
};

function inferErrorAttribution(question, selectedAnswer) {
  const configured = question.option_error_types || {};
  const errorType = configured[selectedAnswer] || inferFromQuestion(question);
  const confidence = configured[selectedAnswer] ? 0.92 : errorType === "unknown" ? 0.35 : 0.68;
  return {
    knowledgePointId: question.knowledge_point,
    knowledgePointName: question.knowledge_point,
    errorType: confidence < 0.5 ? "unknown" : errorType,
    label: ERROR_LABELS[confidence < 0.5 ? "unknown" : errorType],
    confidence,
    evidence: configured[selectedAnswer]
      ? `题目元数据表明选项 ${selectedAnswer} 对应「${ERROR_LABELS[errorType]}」干扰项。`
      : `根据题目知识点「${question.knowledge_point}」和本次错误答案进行规则归因。`,
    suggestion: suggestionFor(errorType, question.knowledge_point),
  };
}

function buildRecommendations({ profile, masteryChanges, errorAttributions }) {
  const preferences = new Set(profile?.resourcePreferences || []);
  const explanation = String(profile?.explanationPreference || "");
  const budget = Number(profile?.paceAndTimeBudget?.weeklyTimeBudgetMinutes || 0);
  const candidates = [];
  for (const attribution of errorAttributions) {
    const point = attribution.knowledgePointName;
    if (
      ["concept_misunderstanding", "condition_omission", "procedure_confusion"].includes(
        attribution.errorType,
      )
    ) {
      candidates.push(
        resource(
          "diagram_note",
          `${point}分步图解`,
          `出现${attribution.label}，先用结构图和步骤核对概念`,
          point,
          budget && budget < 180 ? 12 : 20,
        ),
      );
    }
    if (["procedure_confusion", "implementation_error", "boundary_mistake"].includes(attribution.errorType)) {
      candidates.push(
        resource("code_lab", `${point}基础代码练习`, `通过可执行步骤巩固${attribution.label}`, point, 25),
      );
    }
    if (attribution.errorType === "formula_misuse") {
      candidates.push(
        resource(
          "lecture_notes",
          `${point}公式与例题讲义`,
          "针对公式使用错误回到适用条件并完成例题",
          point,
          20,
        ),
      );
    }
  }
  if (candidates.length === 0 && masteryChanges[0]) {
    const point = masteryChanges[0].knowledgePointName;
    candidates.push(resource("cheat_sheet", `${point}重点总结`, "根据最新掌握度变化进行短时复习", point, 10));
  }
  for (const item of candidates) {
    item.preferenceScore =
      (preferences.has("代码练习") && item.resourceType === "code_lab" ? 2 : 0) +
      ((preferences.has("思维导图") || explanation.includes("图")) && item.resourceType === "diagram_note"
        ? 2
        : 0) +
      (budget > 0 && budget < 180 && item.estimatedMinutes <= 15 ? 1 : 0);
  }
  return deduplicate(candidates)
    .sort((a, b) => b.preferenceScore - a.preferenceScore || a.estimatedMinutes - b.estimatedMinutes)
    .slice(0, 4)
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

function inferFromQuestion(question) {
  const text = `${question.ability_dimension || ""} ${(question.tags || []).join(" ")} ${question.stem || ""}`;
  if (/代码|实现/.test(text)) return "implementation_error";
  if (/边界|临界/.test(text)) return "boundary_mistake";
  if (/公式|计算/.test(text)) return "formula_misuse";
  if (/顺序|旋转|步骤|过程/.test(text)) return "procedure_confusion";
  if (/概念|定义/.test(text)) return "concept_misunderstanding";
  return "unknown";
}

function suggestionFor(errorType, point) {
  if (errorType === "procedure_confusion") return `先画出${point}的状态变化，再完成基础代码题。`;
  if (errorType === "implementation_error") return `在 CodeLab 中逐行运行${point}案例并补充测试用例。`;
  return `回顾${point}的定义、适用条件和一个典型反例。`;
}

function resource(resourceType, title, reason, knowledgePointId, estimatedMinutes) {
  return { resourceType, title, reason, knowledgePointId, estimatedMinutes, preferenceScore: 0 };
}

function deduplicate(items) {
  return Array.from(
    new Map(items.map((item) => [`${item.resourceType}:${item.knowledgePointId}`, item])).values(),
  );
}

module.exports = { ERROR_LABELS, inferErrorAttribution, buildRecommendations };
