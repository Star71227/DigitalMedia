/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("./aiService");
const { buildAgentTaskDescriptionPrompt } = require("../prompts/agentTaskDescriptionPrompt");

const TASK_DESCRIPTION_FIELDS = ["coordinator", "theoryAgent", "codeAgent", "reviewAgent"];
const MIN_DESCRIPTION_LENGTH = 12;
const MAX_DESCRIPTION_LENGTH = 30;

const FALLBACK_TASK_DESCRIPTIONS = Object.freeze({
  coordinator: "正在分析问题目标与处理流程……",
  theoryAgent: "正在梳理相关理论与解题依据……",
  codeAgent: "正在设计适合当前问题的实现方案……",
  reviewAgent: "正在检查答案正确性与边界条件……",
});

async function generateAgentTaskDescriptions(question, options = {}) {
  const normalizedQuestion = String(question || "").trim();
  const generateTextFn = options.generateTextFn || generateText;
  const logger = options.logger || console;

  if (!normalizedQuestion) {
    return cloneFallbackDescriptions();
  }

  try {
    const modelText = await generateTextFn({
      capability: "tutor",
      prompt: buildAgentTaskDescriptionPrompt(normalizedQuestion),
      temperature: 0.2,
      maxTokens: 512,
    });

    if (!modelText) {
      throw new Error("任务描述模型未返回内容");
    }

    const parsed = parseTaskDescriptionJson(modelText);
    const validated = validateTaskDescriptions(parsed, normalizedQuestion);

    if (!validated) {
      throw new Error("任务描述模型返回结果未通过校验");
    }

    return validated;
  } catch (error) {
    logger.warn("generateAgentTaskDescriptions failed, using fallback:", error.message);
    return cloneFallbackDescriptions();
  }
}

function parseTaskDescriptionJson(modelText) {
  if (typeof modelText !== "string") {
    throw new TypeError("任务描述模型返回值必须是 JSON 字符串");
  }

  const cleaned = modelText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("任务描述 JSON 必须是对象");
  }

  return parsed;
}

function validateTaskDescriptions(candidate, question) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const candidateFields = Object.keys(candidate);
  if (
    candidateFields.length !== TASK_DESCRIPTION_FIELDS.length ||
    candidateFields.some((field) => !TASK_DESCRIPTION_FIELDS.includes(field))
  ) {
    return null;
  }

  const normalized = {};

  for (const field of TASK_DESCRIPTION_FIELDS) {
    if (typeof candidate[field] !== "string") {
      return null;
    }

    const description = cleanTaskDescription(candidate[field]);
    const length = countCharacters(description);

    if (
      !description ||
      !description.startsWith("正在") ||
      length < MIN_DESCRIPTION_LENGTH ||
      length > MAX_DESCRIPTION_LENGTH
    ) {
      return null;
    }

    normalized[field] = description;
  }

  if (new Set(Object.values(normalized)).size !== TASK_DESCRIPTION_FIELDS.length) {
    return null;
  }

  const forbiddenTerms = getForbiddenTerms(question);
  if (
    Object.values(normalized).some((description) => forbiddenTerms.some((term) => description.includes(term)))
  ) {
    return null;
  }

  return normalized;
}

function cleanTaskDescription(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/```(?:json)?/gi, "")
    .replace(/[`*_#~]/g, "")
    .replace(/^[\s"'“”‘’「」『』]+/, "")
    .replace(/[\s"'“”‘’「」『』]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(cleaned).slice(0, MAX_DESCRIPTION_LENGTH).join("").trim();
}

function getForbiddenTerms(question) {
  const normalizedQuestion = String(question || "").toLowerCase();
  const forbidden = [];

  if (!normalizedQuestion.includes("链表")) {
    forbidden.push("链表");
  }

  if (!/(指针|链表|内存地址|地址运算|malloc|free)/i.test(normalizedQuestion)) {
    forbidden.push("指针");
  }

  if (!/(节点|结点|链表|树|图)/i.test(normalizedQuestion)) {
    forbidden.push("节点");
  }

  return forbidden;
}

function countCharacters(value) {
  return Array.from(String(value || "")).length;
}

function cloneFallbackDescriptions() {
  return { ...FALLBACK_TASK_DESCRIPTIONS };
}

module.exports = {
  FALLBACK_TASK_DESCRIPTIONS,
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  TASK_DESCRIPTION_FIELDS,
  cleanTaskDescription,
  generateAgentTaskDescriptions,
  getForbiddenTerms,
  parseTaskDescriptionJson,
  validateTaskDescriptions,
};
