/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");

const AssessmentAgent = {
  name: "AssessmentAgent",
  description: "学习效果评估智能体",
  systemPrompt:
    "你是智课研伴的学习效果评估智能体。你负责根据学习结果、答题结果和阶段表现做评估总结，指出掌握水平、风险点和下一步提升方向。",
  async run(context = {}, extraPrompt = "") {
    const prompt = [
      this.systemPrompt,
      "",
      "【上下文】",
      JSON.stringify(context, null, 2),
      "",
      "【任务】",
      extraPrompt || "请评估学习效果并给出总结。",
    ].join("\n");

    try {
      const content = await generateText({
        capability: "assessment",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.35,
        maxTokens: 1200,
      });

      return content && content.trim() ? content.trim() : buildAssessmentFallback(context);
    } catch (error) {
      return buildAssessmentFallback(context);
    }
  },
};

function buildAssessmentFallback(context) {
  const score = context.score === undefined ? "暂未提供" : context.score;

  return [
    `学习效果评估：当前阶段得分/表现为「${score}」。`,
    "掌握较好的部分可以进入综合题训练；仍不稳定的知识点应回到定义和典型例题。",
    "下一步建议：完成错题复盘、同类题巩固和一次限时小测。",
  ].join("\n");
}

module.exports = {
  AssessmentAgent,
};
