/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText, isAIEnabled } = require("../aiService");
const { validateResourceEnvelope } = require("../resourceSchema");
const { buildStudyNote, generateStudyNoteResource } = require("../studyNoteService");
const { buildMindMap, generateMindMapResource } = require("../mindMapService");
const { buildQuizPack, generateQuizPackResource } = require("../quizPackService");
const { buildCodeCase, generateCodeCaseResource } = require("../codeCaseService");
const { buildPptxFallbackContent, generatePptxResource } = require("../pptService");

async function generateStructuredResource(context, options = {}) {
  if (context.resourceType === "study_note") return generateStudyNoteResource(context, options);
  if (context.resourceType === "mind_map") return generateMindMapResource(context, options);
  if (context.resourceType === "quiz_pack") return generateQuizPackResource(context, options);
  if (context.resourceType === "code_case") return generateCodeCaseResource(context, options);
  if (context.resourceType === "pptx") return generatePptxResource(context, options);
  const fallback = buildFallback(context);
  if (process.env.MULTIMODAL_RESOURCE_AI_ENABLED !== "true" || !isAIEnabled())
    return { content: fallback, source: "deterministic", model: null };
  try {
    const prompt = [
      "Return strict JSON only. Never use HTML, URLs, file paths, or IDs outside allowed lists.",
      JSON.stringify(minimalModelContext(context)),
      `Required schema follows the LearnMate ${context.resourceType} contract. Preserve every verified question or exercise field supplied by the context.`,
    ].join("\n");
    const raw = await generateText({
      capability: "resource",
      messages: [
        { role: "system", content: "You are ResourceAgent. Output strict JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 18000,
    });
    if (!raw || raw.trim()[0] !== "{" || raw.trim().slice(-1) !== "}") throw new Error("non JSON output");
    return {
      content: validateResourceEnvelope(JSON.parse(raw.trim()), context),
      source: "model",
      model: process.env.LLM_MODEL || process.env.SPARK_MODEL || process.env.AI_MODEL || null,
    };
  } catch {
    return { content: fallback, source: "deterministic_fallback", model: null };
  }
}
function buildFallback(c) {
  const builders = {
    study_note: buildStudyNote,
    mind_map: buildMindMap,
    pptx: buildPptxFallbackContent,
    quiz_pack: buildQuizPack,
    code_case: buildCodeCase,
  };
  return validateResourceEnvelope(base(c, builders[c.resourceType](c)), c);
}
function base(c, content) {
  const names = {
    study_note: "学习讲义",
    mind_map: "思维导图",
    pptx: "学习课件",
    quiz_pack: "练习包",
    code_case: "代码实操案例",
  };
  return {
    resourceType: c.resourceType,
    title: `${c.knowledgePoint}个性化${names[c.resourceType]}`,
    subject: c.subject,
    knowledgePoint: c.knowledgePoint,
    learningObjectives: c.stageGoals.slice(0, 5).length
      ? c.stageGoals.slice(0, 5)
      : [`掌握${c.knowledgePoint}`],
    targetLearnerSummary: `当前掌握度 ${c.mastery}，偏好${c.explanationPreference}，学习节奏${c.paceAndTimeBudget?.pacePreference || "适中"}。`,
    estimatedMinutes: c.estimatedMinutes,
    generationRationale: [
      `路径阶段：${c.stageTitle}`,
      `当前掌握度：${c.mastery}`,
      c.errorPatterns[0] ? `主要错误模式：${c.errorPatterns[0].errorType}` : "暂无高频错误模式",
      `资源偏好：${c.resourcePreferences.join("、") || "结构化资源"}`,
    ],
    content,
  };
}
function minimalModelContext(c) {
  return {
    resourceType: c.resourceType,
    subject: c.subject,
    knowledgePoint: c.knowledgePoint,
    stageTitle: c.stageTitle,
    stageGoals: c.stageGoals,
    mastery: c.mastery,
    errorPatterns: c.errorPatterns,
    learningGoals: c.learningGoals,
    explanationPreference: c.explanationPreference,
    resourcePreferences: c.resourcePreferences,
    priorKnowledge: c.priorKnowledge,
    paceAndTimeBudget: c.paceAndTimeBudget,
    estimatedMinutes: c.estimatedMinutes,
    difficulty: c.difficulty,
    allowedQuestionIds: c.allowedQuestionIds,
    allowedCodeExerciseIds: c.allowedCodeExerciseIds,
    questionEvidence: c.questionEvidence,
    codeEvidence: c.codeEvidence,
  };
}
module.exports = { generateStructuredResource, buildFallback };
