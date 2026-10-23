/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");

const ResourceAgent = {
  name: "ResourceAgent",
  description: "学习资源生成智能体",
  systemPrompt:
    "你是寻笺的学习资源生成智能体。你负责生成 Markdown 学习资料、讲义、代码示例、知识点讲解、例题和练习说明。输出应结构清晰、适合高校计算机专业课程学习。",
  async run(context = {}, extraPrompt = "") {
    const prompt = [
      this.systemPrompt,
      "",
      "【上下文】",
      JSON.stringify(context, null, 2),
      "",
      "【任务】",
      extraPrompt || "请生成结构完整的 Markdown 学习资料。",
    ].join("\n");

    try {
      const content = await generateText({
        capability: "resource",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.45,
        maxTokens: 4200,
      });

      return content && content.trim() ? content.trim() : buildResourceAgentFallback(context);
    } catch (error) {
      return buildResourceAgentFallback(context);
    }
  },
};

function buildResourceAgentFallback(context) {
  const subject = context.subject || "计算机专业课程";
  const topic = context.topic || context.knowledgePoint || "核心知识点";
  const difficulty = context.difficulty || "Intermediate";
  const codeExample = shouldIncludeCode(subject, topic)
    ? [
        "",
        "```c",
        "#include <stdio.h>",
        "",
        "typedef struct TreeNode {",
        "    int value;",
        "    struct TreeNode *left;",
        "    struct TreeNode *right;",
        "} TreeNode;",
        "",
        "void preorder(TreeNode *root) {",
        "    if (root == NULL) return;",
        '    printf("%d ", root->value);',
        "    preorder(root->left);",
        "    preorder(root->right);",
        "}",
        "```",
      ].join("\n")
    : "";

  return [
    `# ${topic}`,
    "",
    "## 学习目标",
    "",
    `- 理解「${subject}」中「${topic}」的基本定义和适用场景。`,
    `- 能够在 ${difficulty} 难度下完成概念辨析、例题分析和边界条件检查。`,
    "",
    "## 核心概念",
    "",
    `${topic} 的学习重点是把抽象定义转化为可推导、可实现、可验证的过程。建议从“对象是什么、关系是什么、操作如何改变状态”三个角度理解。`,
    "",
    "## 公式或方法",
    "",
    "- 先列出输入规模 n 和关键约束。",
    "- 再分析基本操作的执行次数。",
    "- 最后给出时间复杂度、空间复杂度和最坏情况。",
    "",
    "## 例题讲解",
    "",
    `例题：请说明「${topic}」在实际解题中如何判断边界情况。`,
    "",
    "思路：先构造最小样例，再构造极端样例，比较两者的状态变化是否符合定义。",
    codeExample,
    "",
    "## 易错点",
    "",
    "1. 只背结论，忽略前提条件。",
    "2. 把相似概念混用，例如遍历顺序、存储结构和逻辑结构混在一起。",
    "3. 代码实现时忘记处理空输入、单节点或越界情况。",
    "",
    "## 巩固练习",
    "",
    `请用自己的话解释「${topic}」的核心思想，并给出一个反例说明某个错误理解为什么不成立。`,
    "",
    "## 学习建议",
    "",
    "先画图或列状态表，再写伪代码，最后补充复杂度和边界条件。",
  ].join("\n");
}

function shouldIncludeCode(subject, topic) {
  const text = `${subject} ${topic}`.toLowerCase();
  return /c|python|数据结构|算法|树|二叉树|链表|栈|队列|图|遍历|代码/.test(text);
}

module.exports = {
  ResourceAgent,
};
