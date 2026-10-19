/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");

const QuizAgent = {
  name: "QuizAgent",
  description: "练习题生成智能体",
  systemPrompt:
    "你是智课研伴的练习题生成智能体。你负责根据课程领域、知识点和难度生成选择题、同类题、答题提示和测验题。生成题目时必须保证答案唯一、解析清楚、提示不泄露答案。",
  async run(context = {}, extraPrompt = "") {
    const prompt = [
      this.systemPrompt,
      "",
      "【上下文】",
      JSON.stringify(context, null, 2),
      "",
      "【任务】",
      extraPrompt || "请生成练习题或答题提示。",
    ].join("\n");

    try {
      const content = await generateText({
        capability: "quiz",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.45,
        maxTokens: 2200,
      });

      return content && content.trim() ? content.trim() : buildQuizFallback(context);
    } catch (error) {
      return buildQuizFallback(context);
    }
  },
};

function buildQuizFallback(context) {
  const domain = context.domain || "数据结构";
  const knowledgePoint = context.knowledgePoint || context.topic || "核心知识点";

  return [
    `QuizAgent fallback：已根据「${domain} / ${knowledgePoint}」准备可用练习内容。`,
    "如需选择题结构，请由 agentOrchestrator 进行模板包装；如需提示，请优先提醒学生关注定义、条件和执行过程。",
  ].join("\n");
}

module.exports = {
  QuizAgent,
};
