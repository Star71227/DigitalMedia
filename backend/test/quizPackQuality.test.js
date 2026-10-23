/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildQuizPack } = require("../src/services/quizPackService");
const { validateQuizPackQuality } = require("../src/services/quizPackQualityService");

const topics = [
  [
    "数据结构",
    "红黑树旋转",
    [
      "左旋指针",
      "右旋镜像",
      "黑高约束",
      "插入修复",
      "删除修复",
      "颜色变换",
      "BST次序",
      "NIL叶子",
      "复杂度分析",
      "场景推演",
      "误区辨析",
      "代码过程",
      "边界条件",
      "状态验证",
    ],
  ],
  [
    "操作系统",
    "进程、线程、调度与上下文切换",
    [
      "PCB",
      "线程共享",
      "进程状态",
      "上下文切换",
      "时间片轮转",
      "短作业优先",
      "优先级反转",
      "系统调用",
      "阻塞唤醒",
      "抢占调度",
      "线程切换",
      "多核调度",
      "锁等待",
      "切换开销",
    ],
  ],
  [
    "计算机网络",
    "TCP连接建立、数据传输与连接释放",
    [
      "三次握手",
      "序列号",
      "超时重传",
      "快速重传",
      "流量控制",
      "拥塞控制",
      "滑动窗口",
      "四次挥手",
      "TIME_WAIT",
      "半关闭",
      "校验和",
      "有序交付",
      "握手丢包",
      "零窗口",
    ],
  ],
];

function context(subject = "数据结构", knowledgePoint = "红黑树旋转", mechanisms = topics[0][2]) {
  const questionEvidence = mechanisms.map((mechanism, index) => ({
    questionId: `${subject.slice(0, 2)}-${index + 1}`,
    questionType: "single_choice",
    stem: stemFor(mechanism, index),
    optionA: `${mechanism}符合题干条件的处理`,
    optionB: `${mechanism}混淆概念边界的处理`,
    optionC: `${mechanism}忽略执行顺序的处理`,
    optionD: `${mechanism}错误套用其他场景的处理`,
    answer: "A",
    analysis: `本题考查${mechanism}，需要先确认题干中的对象、状态、限制条件和执行顺序，再把四个选项逐一核对。错误选项通常混淆概念边界、忽略关键条件或错用其他场景，复盘时应画出过程线并说明为什么正确机制满足题干限制。`,
    hint: `先回到${mechanism}的条件和过程，再排除混淆概念或跳过步骤的选项。`,
    difficulty: index < 6 ? "基础" : index < 10 ? "提高" : "综合",
    knowledgePoint,
    abilityDimension: mechanism,
    tags: [mechanism, index % 3 === 0 ? "场景题" : index % 3 === 1 ? "误区辨析" : "过程推演"],
    optionErrorTypes: { B: "concept_misunderstanding", C: "procedure_confusion", D: "scenario_confusion" },
  }));
  return {
    studentId: 7,
    resourceType: "quiz_pack",
    subject,
    knowledgePoint,
    stageTitle: `${knowledgePoint}阶段`,
    stageGoals: [`理解${knowledgePoint}`, `应用${knowledgePoint}`],
    mastery: 45,
    errorPatterns: [{ errorType: "概念混淆", occurrenceCount: 2, confidence: 0.8 }],
    explanationPreference: "图解",
    resourcePreferences: ["练习包"],
    priorKnowledge: [],
    paceAndTimeBudget: { pacePreference: "适中" },
    estimatedMinutes: 30,
    difficulty: "foundation",
    allowedQuestionIds: questionEvidence.map((item) => item.questionId),
    allowedCodeExerciseIds: [],
    questionEvidence,
    codeEvidence: [],
  };
}

function stemFor(mechanism, index) {
  const templates = [
    `在${mechanism}的场景中，若关键状态刚发生变化，下一步最稳妥的判断依据是什么？`,
    `分析${mechanism}时，学生把概念边界和执行顺序混在一起，哪种处理最能纠正这个错误？`,
    `给定一段${mechanism}的过程描述，哪项最符合从条件到结果的推演逻辑？`,
    `关于${mechanism}的应用题，遇到边界输入时应优先核对哪一类信息？`,
    `某同学复盘${mechanism}时只记结论不看过程，以下哪种做法更可靠？`,
    `在${mechanism}的状态追踪中，如何判断当前选项没有偷换对象或前提？`,
    `若${mechanism}出现与常规样例不同的限制条件，最合适的分析路径是什么？`,
  ];
  return templates[index % templates.length];
}

function quality(content, ctx = context()) {
  return validateQuizPackQuality({ content, context: ctx });
}

test("确定性红黑树、进程线程上下文切换和 TCP 测验包均通过", () => {
  for (const [subject, knowledgePoint, mechanisms] of topics) {
    const ctx = context(subject, knowledgePoint, mechanisms);
    const pack = buildQuizPack(ctx);
    const result = quality(pack, ctx);
    assert.equal(result.passed, true, `${subject}: ${result.issues.map((item) => item.code).join(",")}`);
    assert.ok(result.questionCount >= 12 && result.questionCount <= 16);
    assert.ok(result.knowledgePointCount >= 5);
    assert.ok(result.maxKnowledgePointShare <= 0.4);
    assert.ok(result.scenarioProcessCount >= 2);
    assert.ok(result.misconceptionCount >= 3);
  }
});

test("题量不足、覆盖不足或无效题号会失败", () => {
  const ctx = context();
  const pack = buildQuizPack(ctx);
  const tooShort = {
    ...pack,
    questions: pack.questions.slice(0, 10),
    difficultyDistribution: { foundation: 4, intermediate: 3, advanced: 3 },
  };
  assert.ok(quality(tooShort, ctx).issues.some((item) => item.code === "invalid_question_count"));
  const invalid = structuredClone(pack);
  invalid.questions[0].questionId = "FAKE";
  assert.ok(quality(invalid, ctx).issues.some((item) => item.code === "invalid_question_ids"));
  const narrow = structuredClone(pack);
  narrow.questions.forEach((question) => {
    question.knowledgePoints = ["同一机制"];
  });
  assert.ok(
    quality(narrow, ctx).issues.some(
      (item) =>
        item.code === "insufficient_knowledge_coverage" || item.code === "single_knowledge_point_overweight",
    ),
  );
});

test("答案安全和作答兼容性失败会被拦截", () => {
  const ctx = context();
  const pack = buildQuizPack(ctx);
  const leak = structuredClone(pack);
  leak.questions[0].personalizedHint = "答案是A，请直接选择。";
  assert.ok(quality(leak, ctx).issues.some((item) => item.code === "answer_leak_in_stem_or_hint"));
  const mismatch = structuredClone(pack);
  mismatch.questions[0].correctAnswer = "B";
  assert.ok(quality(mismatch, ctx).issues.some((item) => item.code === "answer_mismatch"));
  const unsupported = structuredClone(pack);
  unsupported.questions[0].questionType = "short_answer";
  unsupported.questions[0].scoringPoints = ["主观评分点"];
  assert.ok(quality(unsupported, ctx).issues.some((item) => item.code === "unsupported_question_type"));
});

test("短解析、重复题和虚构引用会失败", () => {
  const ctx = context();
  const pack = buildQuizPack(ctx);
  const short = structuredClone(pack);
  short.questions[0].analysis = "太短。";
  assert.ok(quality(short, ctx).issues.some((item) => item.code === "analysis_too_short"));
  const duplicate = structuredClone(pack);
  duplicate.questions[1].stem = duplicate.questions[0].stem;
  assert.ok(quality(duplicate, ctx).issues.some((item) => item.code === "duplicate_or_similar_questions"));
  const citation = structuredClone(pack);
  citation.questions[0].analysis += " 参考 [S1]。";
  assert.ok(quality(citation, ctx).issues.some((item) => item.code === "fake_citations"));
});

module.exports = { context };
