/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");

const ProfileAgent = {
  name: "ProfileAgent",
  description: "学习画像诊断智能体",
  systemPrompt:
    "你是寻笺的学习画像诊断智能体。你负责分析学生当前课程、知识点、薄弱点、学习目标和历史表现，并输出简明、可用于后续智能体协作的画像摘要。",
  async run(context = {}, extraPrompt = "") {
    const prompt = [
      this.systemPrompt,
      "",
      "【上下文】",
      JSON.stringify(context, null, 2),
      "",
      "【任务】",
      extraPrompt || "请给出学习画像诊断摘要。",
    ].join("\n");

    try {
      const content = await generateText({
        capability: "profile",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.35,
        maxTokens: 1200,
      });

      return content && content.trim() ? content.trim() : buildProfileFallback(context);
    } catch (error) {
      return buildProfileFallback(context);
    }
  },
};

function buildProfileFallback(context) {
  const subject = context.subject || context.domain || "计算机专业课程";
  const topic = context.topic || context.knowledgePoint || context.message || "当前知识点";
  const difficulty = context.difficulty || "中等";

  return [
    `学习画像摘要：当前学习任务聚焦于「${subject}」中的「${topic}」。`,
    `难度目标为「${difficulty}」，建议优先确认基础定义、核心性质和典型应用场景。`,
    "潜在薄弱点包括：概念边界不清、代码实现边界条件遗漏、复杂度分析不完整。",
  ].join("\n");
}

module.exports = {
  ProfileAgent,
};
