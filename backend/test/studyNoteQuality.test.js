/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateStudyNoteQuality,
  countEffectiveChinese,
} = require("../src/services/studyNoteQualityService");

const context = {
  subject: "数据结构",
  knowledgePoint: "红黑树",
  major: "软件工程",
  grade: "大二",
  currentCourse: "数据结构",
  priorKnowledge: ["C语言基础", "树与图基础薄弱"],
  learningGoals: ["准备408", "提升系统学习能力"],
  explanationPreference: "先图解后代码",
  resourcePreferences: ["学习讲义", "代码示例"],
  paceAndTimeBudget: { pacePreference: "适中", weeklyTimeBudgetMinutes: 360 },
};
const retrieval = {
  results: [
    {
      chunkId: 12,
      sourceKey: "rbt",
      sourceTitle: "红黑树课程讲义",
      chapter: "红黑树",
      section: "插入修复",
      sourceVersion: "1.0",
      license: "CC-BY-4.0",
      content: "红黑树插入修复通过变色和旋转保持红黑性质，根节点最终为黑色。",
      score: 0.9,
    },
  ],
};
const citations = [
  {
    label: "S1",
    chunkId: 12,
    sourceKey: "rbt",
    sourceTitle: "红黑树课程讲义",
    chapter: "红黑树",
    section: "插入修复",
    version: "1.0",
    license: "CC-BY-4.0",
    excerpt: "红黑树插入修复通过变色和旋转保持红黑性质，根节点最终为黑色。",
    supportScore: 0.9,
  },
];

function phrase(label, length = 120) {
  const seed = `${label}强调${label}定义边界，围绕${label}状态变化、验证方法、复杂度、工程实践、错误纠正和练习解析展开。`;
  let value = "";
  while (countEffectiveChinese(value) < length) value += seed;
  return value.slice(0, length + 30);
}

function validContent({
  target = 2600,
  examples = 2,
  mistakes = 3,
  exercises = 3,
  codeBlocks = 1,
  useProfile = true,
  withCitation = false,
} = {}) {
  const content = {
    personalizedObjectives: [
      "理解红黑树插入修复",
      "掌握旋转和变色",
      useProfile ? "面向软件工程大二学生准备408" : "完成系统学习",
    ],
    foundationSummary: `${useProfile ? "软件工程大二，当前课程数据结构，目标准备408，偏好先图解后代码。" : "采用通用学习模式。"}${phrase("基础摘要", 180)}`,
    coreConcepts: Array.from({ length: 6 }, (_, index) => ({
      title: `核心概念${index + 1}`,
      explanation: `${phrase(`核心概念${index + 1}`, 120)}${withCitation && index === 0 ? " [S1]" : ""}`,
      importance: index < 3 ? "high" : "medium",
    })),
    diagrams: Array.from({ length: 2 }, (_, index) => ({
      title: `过程图${index + 1}`,
      description: phrase(`过程图${index + 1}`, 120),
      steps: ["确认前置条件并记录状态变化", "执行局部调整并说明保持性质", "使用边界样例验证结论"],
    })),
    methodsAndFormulas: Array.from({ length: codeBlocks }, (_, index) => ({
      title: `伪代码${index + 1}`,
      expression:
        "while parent is RED:\n  if uncle is RED: recolor\n  else: rotate and swap colors\nroot.color = BLACK",
      explanation: phrase(`伪代码解释${index + 1}`, 120),
      conditions: ["存在连续红冲突", "需要保持中序顺序"],
    })),
    workedExamples: Array.from({ length: examples }, (_, index) => ({
      question: `示例${index + 1}：分析一次红黑树插入修复`,
      steps: [
        "按二叉搜索树规则插入红节点并观察父节点颜色",
        "根据叔叔颜色区分变色上推或旋转修复",
        "检查根节点最终为黑并验证黑高不变",
      ],
      answer: phrase(`示例答案${index + 1}`, 100),
    })),
    commonMistakes: Array.from({ length: mistakes }, (_, index) => ({
      mistake: `具体易错点${index + 1}：混淆旋转和变色`,
      reason: phrase(`错误原因${index + 1}`, 70),
      correction: phrase(`纠正方法${index + 1}`, 70),
    })),
    practiceTasks: Array.from({ length: exercises }, (_, index) => ({
      prompt: `${index === 0 ? "检查理解" : "练习题"}${index + 1}：解释红黑树插入修复的一个场景`,
      hint: phrase(`练习提示${index + 1}`, 45),
      answerGuide: phrase(`练习解析${index + 1}`, 70),
    })),
    studyAdvice: [
      "知识总结：红黑树插入修复依靠变色和旋转保持性质。",
      "后续学习建议：继续比较AVL树和红黑树并完成代码练习。",
    ],
    citationBasis: withCitation
      ? ["S1：红黑树课程讲义 / 红黑树 / 插入修复，摘录支持红黑树插入修复通过变色和旋转保持红黑性质。[S1]"]
      : ["知识库未命中时不生成虚假引用。"],
  };
  const current = validateStudyNoteQuality({
    content,
    context: useProfile ? context : {},
    citations: withCitation ? citations : [],
    retrieval: withCitation ? retrieval : { results: [] },
  }).effectiveChineseChars;
  if (current < target) content.foundationSummary += "学".repeat(target - current);
  return content;
}

function boundaryContent(target, { examples = 2, mistakes = 3, exercises = 3, codeBlocks = 1 } = {}) {
  const content = {
    personalizedObjectives: ["面向软件工程大二学生准备408，理解红黑树插入修复。"],
    foundationSummary:
      "软件工程大二，当前课程数据结构，偏好先图解后代码，目标是准备408。" + phrase("基础", 90),
    coreConcepts: Array.from({ length: 4 }, (_, index) => ({
      title: `概念${index + 1}`,
      explanation: phrase(`概念${index + 1}`, 85),
      importance: "high",
    })),
    diagrams: Array.from({ length: 2 }, (_, index) => ({
      title: `图解${index + 1}`,
      description: phrase(`图解${index + 1}`, 85),
      steps: ["记录条件动作验证", "画出状态变化过程"],
    })),
    methodsAndFormulas: Array.from({ length: codeBlocks }, (_, index) => ({
      title: `伪代码${index + 1}`,
      expression: "while parent is RED:\n  if uncle is RED: recolor\n  else: rotate\nroot.color = BLACK",
      explanation: phrase(`伪代码解释${index + 1}`, 85),
      conditions: ["存在连续红冲突"],
    })),
    workedExamples: Array.from({ length: examples }, (_, index) => ({
      question: `示例${index + 1}：分析父红叔黑的旋转修复`,
      steps: ["确认父节点和叔叔颜色", "判断内侧或外侧结构", "执行旋转并交换颜色"],
      answer: phrase(`示例答案${index + 1}`, 70),
    })),
    commonMistakes: Array.from({ length: mistakes }, (_, index) => ({
      mistake: `易错点${index + 1}：混淆旋转方向`,
      reason: phrase(`原因${index + 1}`, 45),
      correction: phrase(`纠正${index + 1}`, 45),
    })),
    practiceTasks: Array.from({ length: exercises }, (_, index) => ({
      prompt: `${index === 0 ? "检查理解" : "练习题"}${index + 1}：解释一次红黑树插入修复`,
      hint: phrase(`提示${index + 1}`, 25),
      answerGuide: phrase(`解析${index + 1}`, 35),
    })),
    studyAdvice: [
      "知识总结：红黑树插入修复依靠变色和旋转保持性质，学习时要同时检查定义、过程、复杂度和边界条件。",
      "后续学习建议：继续比较AVL树和红黑树的平衡策略，并完成一次代码练习和一次纸面推导。",
    ],
    citationBasis: ["知识库未命中时不生成虚假引用，本测试只验证无来源场景下的质量门禁行为。"],
  };
  const current = quality(content).effectiveChineseChars;
  if (current < target) content.foundationSummary += "学".repeat(target - current);
  return content;
}

function quality(content, options = {}) {
  return validateStudyNoteQuality({
    content,
    context,
    citations: [],
    retrieval: { results: [] },
    ...options,
  });
}

test("2500有效中文字符通过", () => assert.equal(quality(boundaryContent(2500)).passed, true));
test("2499有效中文字符失败", () =>
  assert.ok(
    quality(boundaryContent(2499)).issues.some((item) => item.code === "effective_chinese_too_short"),
  ));
test("深度模式3999失败", () =>
  assert.ok(
    quality(boundaryContent(3999, { examples: 3, mistakes: 5, exercises: 5, codeBlocks: 2 }), {
      depth: "deep",
    }).issues.some((item) => item.code === "effective_chinese_too_short"),
  ));
test("深度模式4000通过", () =>
  assert.equal(
    quality(boundaryContent(4000, { examples: 3, mistakes: 5, exercises: 5, codeBlocks: 2 }), {
      depth: "deep",
    }).passed,
    true,
  ));
test("14个有意义区段通过", () => assert.ok(quality(validContent()).meaningfulSectionCount >= 14));
test("14个空标题失败", () => {
  const c = validContent();
  c.coreConcepts = Array.from({ length: 14 }, (_, i) => ({
    title: `空标题${i}`,
    explanation: "",
    importance: "high",
  }));
  c.diagrams = [];
  c.methodsAndFormulas = [];
  c.workedExamples = [];
  c.commonMistakes = [];
  c.practiceTasks = [];
  assert.ok(quality(c).issues.some((item) => item.code === "empty_sections"));
});
test("13个区段失败", () => {
  const c = validContent();
  c.coreConcepts = c.coreConcepts.slice(0, 1);
  c.diagrams = c.diagrams.slice(0, 1);
  c.methodsAndFormulas = c.methodsAndFormulas.slice(0, 1);
  c.workedExamples = c.workedExamples.slice(0, 1);
  assert.ok(quality(c).issues.some((item) => item.code === "insufficient_meaningful_sections"));
});
test("2个完整示例通过", () => assert.equal(quality(validContent({ examples: 2 })).exampleCount, 2));
test("只有“例如”字样不算两个示例", () => {
  const c = validContent();
  c.workedExamples = [
    { question: "例如", steps: ["例如"], answer: "例如" },
    { question: "例如", steps: ["例如"], answer: "例如" },
  ];
  assert.ok(quality(c).issues.some((item) => item.code === "insufficient_examples"));
});
test("存在代码块通过", () => assert.ok(quality(validContent({ codeBlocks: 1 })).codeBlockCount >= 1));
test("无代码块失败", () => {
  const c = validContent();
  c.methodsAndFormulas = [
    { title: "公式", expression: "性质保持", explanation: phrase("解释", 120), conditions: ["适用"] },
  ];
  assert.ok(quality(c).issues.some((item) => item.code === "missing_code_block"));
});
test("3个具体易错点通过", () => assert.equal(quality(validContent({ mistakes: 3 })).mistakeCount, 3));
test("模糊注意事项不算3个易错点", () => {
  const c = validContent();
  c.commonMistakes = Array.from({ length: 3 }, () => ({
    mistake: "注意事项",
    reason: "注意一下",
    correction: "认真看",
  }));
  assert.ok(quality(c).issues.some((item) => item.code === "insufficient_mistakes"));
});
test("3道练习和3组答案通过", () => {
  const q = quality(validContent({ exercises: 3 }));
  assert.equal(q.exerciseCount, 3);
  assert.equal(q.answerCount, 3);
});
test("有练习无答案失败", () => {
  const c = validContent();
  c.practiceTasks[0].answerGuide = "";
  assert.ok(quality(c).issues.some((item) => item.code === "exercise_answer_mismatch"));
});
test("有答案无法对应练习失败", () => {
  const c = validContent();
  c.practiceTasks[0].answerGuide = "见上文";
  assert.ok(quality(c).issues.some((item) => item.code === "exercise_answer_mismatch"));
});
test("comprehension check存在", () => assert.ok(quality(validContent()).comprehensionCheckCount >= 1));
test("画像可用时3项真实画像事实通过", () =>
  assert.ok(quality(validContent({ useProfile: true })).profileFactCount >= 3));
test("画像可用但不足3项失败", () =>
  assert.ok(
    quality(validContent({ useProfile: false })).issues.some(
      (item) => item.code === "insufficient_profile_facts",
    ),
  ));
test("无画像时不强制3项", () =>
  assert.equal(
    validateStudyNoteQuality({
      content: validContent({ useProfile: false }),
      context: {},
      citations: [],
      retrieval: { results: [] },
    }).issues.some((item) => item.code === "insufficient_profile_facts"),
    false,
  ));
test("真实引用通过", () => {
  const c = boundaryContent(2600);
  c.coreConcepts[0].explanation += " 红黑树插入修复通过变色和旋转保持红黑性质。[S1]";
  c.citationBasis = [
    "S1：红黑树课程讲义 / 红黑树 / 插入修复，摘录支持红黑树插入修复通过变色和旋转保持红黑性质。[S1]",
  ];
  assert.equal(validateStudyNoteQuality({ content: c, context, citations, retrieval }).passed, true);
});
test("悬空引用失败", () => {
  const c = validContent({ withCitation: true });
  c.citationBasis = ["错误引用 [S9]"];
  assert.ok(
    validateStudyNoteQuality({ content: c, context, citations, retrieval }).issues.some(
      (item) => item.code === "invalid_citations",
    ),
  );
});
test("假引用失败", () => {
  const fake = [{ ...citations[0], chunkId: 999 }];
  assert.ok(
    validateStudyNoteQuality({
      content: validContent({ withCitation: true }),
      context,
      citations: fake,
      retrieval,
    }).issues.some((item) => item.code === "invalid_citations"),
  );
});
test("知识库无命中时不强制引用", () =>
  assert.equal(
    quality(validContent({ withCitation: false })).issues.some((item) => item.code === "invalid_citations"),
    false,
  ));
test("重复段落过高失败", () => {
  const c = validContent();
  const repeated = phrase("重复段落", 120);
  c.coreConcepts.forEach((item) => {
    item.explanation = repeated;
  });
  assert.ok(quality(c).issues.some((item) => item.code === "duplicate_content"));
});
test("仅标题长文本失败", () => {
  const c = {
    personalizedObjectives: ["学".repeat(2600)],
    foundationSummary: "",
    coreConcepts: [],
    diagrams: [],
    methodsAndFormulas: [],
    workedExamples: [],
    commonMistakes: [],
    practiceTasks: [],
    studyAdvice: [],
    citationBasis: [],
  };
  assert.ok(quality(c).issues.some((item) => item.code === "insufficient_meaningful_sections"));
});
test("代码字符不计入中文正文长度", () => {
  const c = boundaryContent(1200);
  c.methodsAndFormulas[0].expression = "if 条件成立 then 执行旋转\\n".repeat(200);
  assert.ok(quality(c).effectiveChineseChars < 2500);
});
test("Markdown标记不计入有效字符", () => assert.equal(countEffectiveChinese("# 标题\\n**核心** `代码`"), 6));
test("URL不计入有效字符", () => assert.equal(countEffectiveChinese("资料 https://example.com/红黑树"), 2));
test("占位符失败", () => {
  const c = validContent();
  c.foundationSummary += " TODO";
  assert.ok(quality(c).issues.some((item) => item.code === "placeholder_found"));
});
test("未闭合代码围栏失败", () => {
  const c = validContent();
  c.foundationSummary += "```c\\nint main(";
  assert.ok(quality(c).issues.some((item) => item.code === "content_truncated"));
});
test("截断练习失败", () => {
  const c = boundaryContent(2600);
  c.practiceTasks.push({ prompt: "练习题：分析一次旋转并写出验证过程", hint: "画图", answerGuide: "" });
  assert.ok(quality(c).issues.some((item) => item.code === "exercise_answer_mismatch"));
});
test("中文和英文混合安全处理", () => {
  const c = boundaryContent(2600);
  c.coreConcepts[0].explanation += " TCP ACK FIN RED BLACK TREE 都可以作为英文术语出现。";
  assert.equal(quality(c).passed, true);
});
test("空内容失败", () =>
  assert.equal(
    validateStudyNoteQuality({ content: {}, context, citations: [], retrieval: { results: [] } }).passed,
    false,
  ));
test("null和错误类型安全失败", () =>
  assert.equal(
    validateStudyNoteQuality({ content: null, context, citations: [], retrieval: { results: [] } }).passed,
    false,
  ));
