/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { normalizeMindMapContent } = require("./mindMapNormalizationService");

const PROMPT_VERSION = "mind-map-structured-v1";

function buildMindMapPrompt(context, options = {}) {
  const citations = (options.citations || []).map((item) => ({
    label: item.label,
    // 关键：必须把真实 chunkId 交给模型。以前这里只给 label/标题/摘录，
    // 而质量门禁要求节点 citations 必须是真实 chunkId，模型无从得知只能猜数字，必然校验失败。
    chunkId: item.chunkId,
    sourceTitle: item.sourceTitle,
    chapter: item.chapter,
    section: item.section,
    excerpt: item.excerpt,
  }));
  const feedback = (options.qualityFeedback || []).slice(0, 12);
  return [
    "你是 LearnMate 的思维导图生成器。只返回 JSON 对象，不要输出 Markdown 代码围栏、解释、Agent 自述或内部 Prompt。",
    "JSON 必须完全符合 mind_map content schema：",
    JSON.stringify({
      root: {
        id: "stable-topic-root",
        label: "本次知识主题",
        description: "主题说明",
        nodeType: "root",
        importance: "high",
        citations: [],
        children: [
          {
            id: "stable-branch-id",
            label: "真实一级主题",
            description: "不少于40个有效中文字符的教学说明",
            nodeType: "concept|condition|step|example|warning|misconception|formula|code|summary",
            importance: "high|medium|low",
            citations: [],
            children: [],
          },
        ],
      },
      crossLinks: [{ sourceId: "node-a", targetId: "node-b", label: "说明两个不同一级分支下节点为什么相关" }],
      highlightNodeIds: ["node-id"],
      misconceptionNodeIds: ["node-id"],
      recommendedSequence: ["node-id"],
    }),
    "结构要求：中文，大学计算机专业水平；恰好1个主题root；一级主题4至6个；二级节点15至30个；总知识节点20至50个；最大深度3至5层；不得使用数组下标作为持久化id。",
    '枚举字段一律使用英文小写固定值：importance 只能取 "high"、"medium"、"low"；nodeType 只能取 "root"、"concept"、"condition"、"step"、"example"、"warning"、"misconception"、"formula"、"code"、"summary"。不要写中文或其它近义词。',
    "节点要求：每个节点必须有唯一稳定id、label、description、nodeType、importance、children、citations；普通节点description不少于20个有效中文字符，一级节点不少于40个有效中文字符。",
    "教学要求：一级节点必须是对主题的真实教学分解，不要机械使用概述、基本概念、应用场景、总结这类通用模板；至少2个具体示例节点，至少3个具体易错点或辨析节点，至少1个代码、伪代码、协议过程或执行过程分支，至少1个总结或复习顺序分支。",
    "crossLinks要求：至少3条真实跨分支联系；两端必须存在、不能自环、不能重复父子关系、不能全部连向root；label必须说明为什么相关。",
    "个性化要求：只使用给定学习画像事实，至少把3项事实融入不同分支（必须分布在不同的一级分支下，不要集中在同一个分支）；无事实不要编造，不要泄露敏感原文。",
    "引用要求：每个节点的 citations 数组只能填 providedCitations 里对应条目的 chunkId 数字本身（例如某条 providedCitations 的 chunkId 是 321，就写 321，不要写序号 1/2/3，也不要写 [S1] 这类标签）；只能使用 providedCitations 中真实存在的 chunkId，不确定的节点请留空数组 []；知识库无引用时所有 citations 必须为空；不要输出其它数据库 ID、retrievalRunId、内部得分或文件路径。",
    "安全要求：不要写 TODO、待补充、placeholder、示例A、知识点1、作为AI模型、Prompt、Agent、密钥、URL、HTML或脚本。",
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

function parseMindMapJson(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("empty mind_map model response");
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("mind_map model response is not JSON");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const content = parsed && parsed.content && typeof parsed.content === "object" ? parsed.content : parsed;
  return normalizeMindMapContent(content, { repairIds: true });
}

module.exports = { PROMPT_VERSION, buildMindMapPrompt, parseMindMapJson };
