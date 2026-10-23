/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const PROMPT_VERSION = "study-note-detailed-v1";

function buildStudyNotePrompt(context, options = {}) {
  const citations = (options.citations || []).map((item) => ({
    label: item.label,
    sourceTitle: item.sourceTitle,
    chapter: item.chapter,
    section: item.section,
    excerpt: item.excerpt,
  }));
  const feedback = (options.qualityFeedback || []).slice(0, 10);
  return [
    "你是 LearnMate 的学习讲义生成器。只返回 JSON 对象，不要输出 Markdown 代码围栏、解释、Agent 自述或内部 Prompt。",
    "JSON 必须完全符合 study_note content schema：",
    JSON.stringify({
      personalizedObjectives: ["目标1"],
      foundationSummary: "当前基础摘要",
      coreConcepts: [{ title: "核心概念标题", explanation: "解释", importance: "high|medium|low" }],
      diagrams: [{ title: "过程图标题", description: "图解文字", steps: ["步骤"] }],
      methodsAndFormulas: [
        {
          title: "方法或伪代码标题",
          expression: "伪代码或公式",
          explanation: "解释",
          conditions: ["适用条件"],
        },
      ],
      workedExamples: [{ question: "完整例题或案例", steps: ["步骤1", "步骤2"], answer: "答案或结论" }],
      commonMistakes: [{ mistake: "具体错误", reason: "为什么错", correction: "如何纠正" }],
      practiceTasks: [{ prompt: "练习题", hint: "提示", answerGuide: "答案或解析" }],
      studyAdvice: ["总结与后续学习建议"],
      citationBasis: ["引用依据，若使用来源必须写 [S1]"],
    }),
    '枚举字段一律使用英文小写固定值：importance 只能取 "high"、"medium"、"low" 三者之一，不要写中文、不要写其它近义词。',
    "内容要求：中文，大学计算机专业系统学习水平；有效中文不少于 2800 字；至少 14 个有意义教学区段；至少 2 个完整示例；至少 1 个代码或伪代码块；至少 4 个具体易错点：每条必须包含 mistake（具体错误做法）、reason（为什么会错）、correction（如何纠正）三部分，每部分写成完整句子，三者合计不少于 100 个中文字符，并至少出现「容易混淆」「常见错误」「纠正」中的一个词；至少 3 道练习且逐题有答案或解析；必须有一道练习的题干以「检查理解：」开头（题干里要真的出现「检查理解」四个字）；包含总结与后续学习建议：必须有一个区段标题里出现「总结」二字，并且正文里出现「复习建议」或「下一步」。",
    "个性化要求：只使用给定学习画像事实，至少把 3 项事实融入不同教学区段（不能只写在开头概述里，要分散到至少 2 个不同的教学区段）；没有给定的事实不要编造。",
    "引用要求：只可使用 providedCitations 中的编号；知识库无引用时不要写 [S1] 这类标记；不要输出 chunkId、retrievalRunId、文件路径、内部得分或数据库 ID。",
    "安全要求：不要写 TODO、待补充、示例代码略、placeholder、作为AI模型、Prompt、Agent 名称、密钥、URL 或 HTML。",
    feedback.length ? `上一次质量问题，需要定向修复：${feedback.join("；")}` : "",
    JSON.stringify({
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      stageTitle: context.stageTitle,
      stageGoals: context.stageGoals,
      mastery: context.mastery,
      weakPoints: context.weakPoints,
      errorPatterns: context.errorPatterns,
      major: context.major,
      grade: context.grade,
      currentCourse: context.currentCourse,
      priorKnowledge: context.priorKnowledge,
      learningGoals: context.learningGoals,
      explanationPreference: context.explanationPreference,
      resourcePreferences: context.resourcePreferences,
      paceAndTimeBudget: context.paceAndTimeBudget,
      estimatedMinutes: context.estimatedMinutes,
      providedCitations: citations,
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseStudyNoteJson(raw) {
  const text = String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!text) throw new Error("empty study note model response");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("study note model response is not JSON");
  const slice = text.slice(start, end + 1);
  let parsed;
  try {
    parsed = JSON.parse(slice);
  } catch (error) {
    // 真实模型偶发尾随逗号、未转义控制字符等小瑕疵，先做轻量修复再解析，避免整次生成（约 100 秒）作废。
    parsed = JSON.parse(repairJsonSlice(slice));
  }
  return parsed && parsed.content && typeof parsed.content === "object" ? parsed.content : parsed;
}

function repairJsonSlice(slice) {
  return String(slice)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
}

module.exports = { PROMPT_VERSION, buildStudyNotePrompt, parseStudyNoteJson };
