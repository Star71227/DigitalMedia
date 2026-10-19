/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");

const ReviewAgent = {
  name: "ReviewAgent",
  description: "内容质量审核智能体",
  systemPrompt:
    "你是智课研伴的内容质量审核智能体。你负责审核学习资料、题目和答疑内容是否准确、完整、符合课程范围和难度，并指出易错点、边界条件与改进建议。",
  async run(context = {}, extraPrompt = "") {
    const prompt = [
      this.systemPrompt,
      "",
      "【上下文】",
      JSON.stringify(context, null, 2),
      "",
      "【任务】",
      extraPrompt || "请审核内容质量并给出简洁结论。",
    ].join("\n");

    try {
      const content = await generateText({
        capability: "resource_review",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 1200,
      });

      return content && content.trim() ? content.trim() : buildReviewFallback(context);
    } catch (error) {
      return buildReviewFallback(context);
    }
  },

  reviewChat(context = {}) {
    const issues = [...(context.quality?.issues || [])];
    const answer = String(context.answerMarkdown || "");
    const citations = Array.isArray(context.citations) ? context.citations : [];
    const firstContent = answer
      .replace(/^#{1,3}[^\n]*\n+/, "")
      .trim()
      .slice(0, 500);

    if (!firstContent || /建议先定位课程领域|建议先拆成|可以从以下方面/.test(firstContent)) {
      issues.push({ code: "missing_direct_answer", message: "开头没有直接回答用户问题" });
    }
    if (/我(?:已经|已)运行|执行结果(?:显示|如下)|实验结果(?:显示|如下)|经过实际测试/i.test(answer)) {
      issues.push({ code: "false_execution_claim", message: "回答声称执行了实际上未执行的代码或实验" });
    }
    if (context.sourceMode === "rag_model" && citations.length === 0) {
      issues.push({ code: "missing_verified_citation", message: "RAG 回答没有通过验证的本地引用" });
    }
    if (context.sourceMode === "model_only" && citations.length > 0) {
      issues.push({ code: "model_only_citation", message: "model_only 回答不得包含本地引用" });
    }
    if (context.sourceMode === "model_only" && /\[S\d+\]/.test(answer)) {
      issues.push({ code: "model_only_fake_citation", message: "model_only 回答不得生成本地证据标签" });
    }

    return {
      passed: issues.length === 0,
      issues: deduplicateIssues(issues),
      checks: {
        directAnswer: Boolean(firstContent),
        concreteContent: Number(context.quality?.characterCount || 0) >= 600,
        example: Number(context.quality?.exampleCount || 0) > 0,
        codeWhenNeeded: !context.quality?.issues?.some((item) => item.code === "missing_code"),
        misconceptions: Number(context.quality?.misconceptionCount || 0) >= 3,
        comprehensionCheck: Number(context.quality?.practiceCount || 0) > 0,
        citationsValid: !issues.some((item) => /citation|引用/.test(`${item.code} ${item.message}`)),
        subjectAligned: !context.quality?.issues?.some((item) => item.code === "answer_irrelevant"),
      },
    };
  },
};

function deduplicateIssues(issues) {
  const seen = new Set();
  return issues.filter((item) => {
    const key = `${item.code || "issue"}:${item.message || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildReviewFallback(context) {
  const topic = context.topic || context.knowledgePoint || "当前内容";

  return [
    "## ReviewAgent 审核摘要",
    "",
    `- 内容应继续围绕「${topic}」展开，避免偏离课程主题。`,
    "- 建议保留定义、方法、例题、易错点和练习闭环。",
    "- 若包含代码，请检查空输入、边界条件、复杂度和内存安全。",
  ].join("\n");
}

module.exports = {
  ReviewAgent,
};
