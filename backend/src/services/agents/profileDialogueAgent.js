/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");
const {
  DIALOGUE_FIELDS,
  validatePatchValue,
  getMissingFields,
  mergeDraft,
  cleanText,
} = require("../profileSchema");

const PROFILE_DIALOGUE_SYSTEM_PROMPT = `你是高校学生学习画像构建智能体。你的任务是根据当前对话提取学生明确表达的信息，并逐步形成结构化学习画像。
规则：只能提取学生明确表达的信息；不得根据专业、性别、年级推断能力；不确定字段保持为空；每个字段包含置信度和证据；每轮最多询问一个主要问题；不重复提问；学生可以跳过；只能返回合法 JSON；不得修改知识掌握度；不得虚构目标或偏好。`;

async function analyzeProfileDialogue({
  currentDraft,
  fieldMeta = {},
  history = [],
  message,
  roundCount = 0,
}) {
  const deterministicPatch = extractExplicitProfilePatch(message);
  let modelResult = null;
  try {
    const raw = await generateText({
      capability: "profile",
      messages: [
        { role: "system", content: PROFILE_DIALOGUE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "只返回 JSON，结构为：",
            '{"status":"collecting","assistantMessage":"下一问题","profilePatch":{"field":{"value":null,"confidence":0.8,"evidence":"原话依据"}},"missingFields":[],"progress":0.5}',
            `当前画像：${JSON.stringify(currentDraft)}`,
            `已有字段证据：${JSON.stringify(fieldMeta)}`,
            `历史：${JSON.stringify(history.slice(-10))}`,
            `当前轮次：${roundCount + 1}`,
            `学生回答：${cleanText(message, 1000)}`,
          ].join("\n"),
        },
      ],
      temperature: 0.15,
      maxTokens: 1200,
    });
    modelResult = parseProfileAgentResponse(raw, currentDraft, fieldMeta);
  } catch (error) {
    modelResult = null;
  }

  const combined = { ...(modelResult?.profilePatch || {}), ...deterministicPatch };
  const patchValues = Object.fromEntries(Object.entries(combined).map(([key, item]) => [key, item.value]));
  const nextDraft = mergeDraft(currentDraft, patchValues);
  const missingFields = getMissingFields(nextDraft);
  const nextRound = roundCount + 1;
  const ready = missingFields.length === 0 || nextRound >= 5;

  return {
    status: ready ? "ready_for_confirmation" : "collecting",
    assistantMessage: ready
      ? "画像信息已经整理完成，请确认；如有不准确的地方也可以继续补充。"
      : nextQuestion(missingFields[0]),
    profilePatch: combined,
    missingFields,
    progress: Number(
      Math.min(1, (DIALOGUE_FIELDS.length - missingFields.length) / DIALOGUE_FIELDS.length).toFixed(2),
    ),
    modelAvailable: Boolean(modelResult),
  };
}

function parseProfileAgentResponse(raw, currentDraft = {}, fieldMeta = {}) {
  const source = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const candidate = JSON.parse(source);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw new Error("画像响应必须是对象");
  const result = { profilePatch: {} };
  const patch =
    candidate.profilePatch && typeof candidate.profilePatch === "object" ? candidate.profilePatch : {};

  for (const [field, descriptor] of Object.entries(patch)) {
    if (!DIALOGUE_FIELDS.includes(field)) continue;
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) continue;
    const confidence = Math.max(0, Math.min(1, Number(descriptor.confidence) || 0));
    const evidence = cleanText(descriptor.evidence, 500);
    if (!evidence || confidence <= 0) continue;
    const existingConfidence = Number(fieldMeta[field]?.confidence || 0);
    if (existingConfidence >= 0.85 && confidence <= existingConfidence) continue;
    result.profilePatch[field] = {
      value: validatePatchValue(field, descriptor.value),
      confidence,
      evidence,
    };
  }
  return result;
}

function extractExplicitProfilePatch(message) {
  const text = cleanText(message, 1000);
  const patch = {};
  const evidence = text;
  const grade = text.match(/(大一|大二|大三|大四|研一|研二|研三|一年级|二年级|三年级|四年级)/)?.[1] || "";
  const major =
    ["计算机科学与技术", "软件工程", "人工智能", "电子信息", "网络工程"].find((item) =>
      text.includes(item),
    ) || "";
  if (major || grade) patch.majorAndGrade = item({ major, grade }, evidence, 0.96);
  const course = ["数据结构", "操作系统", "计算机网络", "计算机组成原理", "C语言程序设计", "Python"].find(
    (item) => text.includes(item),
  );
  if (course) patch.currentCourse = item(course, evidence, 0.95);
  if (/学过|掌握|基础|先修|会写/.test(text)) patch.priorKnowledge = item([text], evidence, 0.82);
  if (/目标|希望|想要|通过|考试|考研|提升/.test(text)) patch.learningGoals = item([text], evidence, 0.9);
  const explanation = [];
  if (/图解|图示|画图/.test(text)) explanation.push("图解");
  if (/代码|实操|案例/.test(text)) explanation.push("代码示例");
  if (/公式|推导/.test(text)) explanation.push("公式推导");
  if (explanation.length) patch.explanationPreference = item(explanation.join("和"), evidence, 0.94);
  const resources = ["讲义", "思维导图", "代码练习", "专项测验", "小抄", "案例"].filter((value) =>
    text.includes(value),
  );
  if (resources.length) patch.resourcePreferences = item(resources, evidence, 0.92);
  const hours = text.match(/每周[^\d]{0,8}(\d+(?:\.\d+)?)\s*小时/)?.[1];
  const pace = ["稳步", "冲刺", "循序渐进", "每天", "周末集中"].find((value) => text.includes(value)) || "";
  if (hours || pace)
    patch.paceAndTimeBudget = item(
      { pacePreference: pace, weeklyTimeBudgetMinutes: hours ? Number(hours) * 60 : null },
      evidence,
      0.96,
    );
  return patch;
}

function item(value, evidence, confidence) {
  return { value, evidence, confidence };
}

function nextQuestion(field) {
  const questions = {
    majorAndGrade: "先了解一下你的学习背景：你是什么专业、哪个年级？",
    currentCourse: "你目前最希望重点学习哪一门课程？",
    priorKnowledge: "这门课你已经学过哪些内容，哪些地方最容易卡住？",
    learningGoals: "你这段时间最具体的学习目标是什么？",
    explanationPreference: "你更喜欢图解、代码示例、类比讲解还是公式推导？",
    resourcePreferences: "你希望系统多提供哪类资源，例如讲义、代码练习、思维导图或专项测验？",
    paceAndTimeBudget: "你每周大约能投入多少时间，希望稳步学习还是短期冲刺？",
  };
  return questions[field] || "还有哪项学习偏好希望补充？你也可以选择跳过。";
}

module.exports = {
  PROFILE_DIALOGUE_SYSTEM_PROMPT,
  analyzeProfileDialogue,
  parseProfileAgentResponse,
  extractExplicitProfilePatch,
  nextQuestion,
};
