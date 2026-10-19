/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { pool } = require("../config/db");
const { retrieveKnowledge } = require("./knowledgeRetrievalService");
const { normalizeMindMapContent } = require("./mindMapNormalizationService");
const { topicBlueprint } = require("./studyNoteFallbackService");

const SOURCE_TYPES = ["study_note", "mind_map", "quiz_pack", "code_case"];
const SOURCE_LABELS = {
  study_note: "已批准学习讲义",
  mind_map: "已批准思维导图",
  quiz_pack: "已批准公开测验摘要",
  code_case: "已批准公开代码案例",
};
const PROMPT_VERSION = "ppt-deck-planning-v1";

async function buildPptSourceBundle(context, options = {}) {
  const approvedResources = await loadApprovedSourceResources(context, options.db || pool);
  const retrieval = await preparePptRetrieval(context, options);
  await options.onKnowledgeRetrieval?.(retrieval);
  const citations = buildCitationCatalog(retrieval);
  const byType = Object.fromEntries(approvedResources.map((resource) => [resource.resourceType, resource]));
  const resourceReferences = approvedResources.map((resource) => ({
    sourceKey: sourceKey(resource.resourceType, resource.version),
    title: `${SOURCE_LABELS[resource.resourceType]}：${resource.title}`,
    chapter: context.subject,
    section: context.knowledgePoint,
    version: `resource-v${resource.version}`,
    license: "LearnMate approved resource",
  }));
  const knowledgeReferences = citations.map((citation) => ({
    sourceKey: `knowledge:${citation.sourceKey}`,
    title: citation.sourceTitle,
    chapter: citation.chapter,
    section: citation.section,
    version: citation.version,
    license: citation.license,
  }));
  const fallbackReference = {
    sourceKey: "course-metadata:current-path",
    title: "当前学习路径与课程元数据",
    chapter: context.subject,
    section: context.knowledgePoint,
    version: `path-v${context.pathVersion || 1}`,
    license: "LearnMate internal course metadata",
  };
  const references = uniqueReferences([
    ...resourceReferences,
    ...knowledgeReferences,
    fallbackReference,
  ]).slice(0, 8);
  const usedResourceTypes = approvedResources.map((resource) => resource.resourceType);
  const missingResourceTypes = SOURCE_TYPES.filter((type) => !usedResourceTypes.includes(type));
  return {
    approvedResources,
    byType,
    retrieval,
    citations,
    references,
    usedResourceTypes,
    missingResourceTypes,
    sourceModeBasis: citations.length
      ? "approved_resources_with_knowledge"
      : "approved_resources_or_course_metadata",
    knowledgeNotice: citations.length
      ? "PPT已结合本地课程知识库引用和当前已批准资源规划。"
      : "本次PPT未命中可用课程知识库引用，使用已批准资源与当前学习路径元数据规划，不生成虚假引用。",
  };
}

function buildContextOnlySourceBundle(context) {
  return {
    approvedResources: [],
    byType: {},
    retrieval: { retrievalRunId: null, results: [], insufficient: true },
    citations: [],
    references: [
      {
        sourceKey: "course-metadata:current-path",
        title: "当前学习路径与课程元数据",
        chapter: context.subject,
        section: context.knowledgePoint,
        version: `path-v${context.pathVersion || 1}`,
        license: "LearnMate internal course metadata",
      },
    ],
    usedResourceTypes: [],
    missingResourceTypes: SOURCE_TYPES.slice(),
    sourceModeBasis: "course_metadata",
    knowledgeNotice: "当前未读取到已批准资源或知识库引用，使用课程元数据与确定性教学结构规划。",
  };
}

function buildDeterministicPptDeckContent(
  context,
  sourceBundle = buildContextOnlySourceBundle(context),
  options = {},
) {
  const bundle = { ...buildContextOnlySourceBundle(context), ...sourceBundle };
  const note = bundle.byType.study_note?.content || null;
  const mindMap = safeMindMap(bundle.byType.mind_map?.content);
  const quizPack = bundle.byType.quiz_pack?.content || null;
  const codeCase = bundle.byType.code_case?.content || null;
  const topic = topicBlueprint(context);
  const references =
    Array.isArray(bundle.references) && bundle.references.length
      ? bundle.references
      : buildContextOnlySourceBundle(context).references;
  const sourceKeys = new Set(references.map((reference) => reference.sourceKey));
  const sourceRef = (type) =>
    sourceKeys.has(sourceKey(type, bundle.byType[type]?.version))
      ? sourceKey(type, bundle.byType[type].version)
      : references[0].sourceKey;
  const profileFacts = selectProfileFacts(context);
  const citations = Array.isArray(bundle.citations) ? bundle.citations : [];
  const cite = (index = 0) => (citations[index]?.chunkId ? [Number(citations[index].chunkId)] : []);
  const objectives = cleanList(note?.personalizedObjectives, context.stageGoals, [
    `掌握${context.knowledgePoint}的核心定义`,
    "能够按步骤分析过程",
    "能识别常见易错点",
  ])
    .slice(0, 5)
    .map((item) => limit(item, 58));
  const concepts = cleanList(
    note?.coreConcepts?.map((item) => item.title),
    mindMap?.root?.children?.map((node) => node.label),
    [topic.objects, topic.mechanism],
  )
    .slice(0, 5)
    .map((item) => limit(item, 48));
  const processSteps = firstNonEmpty(
    note?.diagrams?.flatMap((diagram) =>
      array(diagram.steps).map((step) => ({ title: limit(diagram.title, 28), description: step })),
    ),
    collectMindNodes(
      mindMap,
      (node) =>
        node.nodeType === "step" ||
        /过程|步骤|协议|执行|旋转|切换|握手|挥手/.test(`${node.label} ${node.description}`),
    ).map((node) => ({ title: node.label, description: node.description })),
    topic.process
      .split(/[；。]/)
      .filter(Boolean)
      .map((item, index) => ({ title: `步骤${index + 1}`, description: item })),
  )
    .slice(0, 4)
    .map((item, index) => ({
      title: limit(item.title || `步骤${index + 1}`, 30),
      description: limit(item.description || item.title || "", 72),
    }));
  const examples = firstNonEmpty(
    note?.workedExamples?.map((item) => ({ title: item.question, steps: item.steps, answer: item.answer })),
    collectMindNodes(mindMap, (node) => node.nodeType === "example").map((node) => ({
      title: node.label,
      steps: [node.description],
      answer: node.description,
    })),
    array(topic.examples).map((item) => ({ title: item.question, steps: item.steps, answer: item.answer })),
  );
  const mistakes = firstNonEmpty(
    note?.commonMistakes?.map((item) => ({
      mistake: item.mistake,
      correction: `${item.reason} ${item.correction}`,
    })),
    collectMindNodes(mindMap, (node) => node.nodeType === "misconception" || node.nodeType === "warning").map(
      (node) => ({ mistake: node.label, correction: node.description }),
    ),
    array(topic.mistakes).map((item) => ({
      mistake: item.mistake,
      correction: `${item.reason} ${item.correction}`,
    })),
    array(context.errorPatterns).map((item) => ({
      mistake: item.errorType,
      correction: "回到定义、条件和过程逐步核对，避免只凭关键词判断。",
    })),
  )
    .slice(0, 3)
    .map((item) => ({
      mistake: limit(item.mistake, 48),
      correction: limit(item.correction, 82),
    }));
  const publicQuiz = array(quizPack?.questions)[0];
  const practicePrompt = publicQuiz?.stem
    ? `题型参考：${limit(publicQuiz.stem.replace(/```[\s\S]*?```/g, "代码片段见题库练习"), 110)}`
    : array(topic.exercises)[0]?.prompt || `请解释${context.knowledgePoint}的关键条件，并指出一个常见误区。`;
  const answers = [
    array(topic.exercises)[0]?.answerGuide ||
      `回答时应包含${context.knowledgePoint}的对象、条件、步骤和边界验证。`,
    examples[0]?.answer || "示例复盘要说明每一步状态如何变化，以及为什么最终结果满足定义。",
    mistakes[0]?.correction || "易错点的修正要回到条件、顺序和边界，不直接套结论。",
  ].map((item) => limit(item, 110));
  const code = codeCase?.starterCode ? limitCode(codeCase.starterCode) : buildTopicPseudoCode(context, topic);
  const codeExplanation = codeCase
    ? `${codeCase.exerciseTitle || "CodeLab练习"}只展示公开题面与 starter code；评测细节不进入课件。`
    : `本页使用安全伪代码表达${context.knowledgePoint}的状态变化，评测细节不进入课件。`;
  const commonNotes = `本页用于课堂讲解${context.knowledgePoint}，讲解时先确认学生已有基础，再把结论落到可检查的对象、条件和过程。`;
  const slides = [
    slide(
      "cover",
      "cover",
      `${context.knowledgePoint}教学课件`,
      {
        subtitle: `${context.subject} · ${context.stageTitle || "当前学习阶段"} · ${profileFacts.slice(0, 3).join("；")}`,
        bullets: profileFacts.slice(0, 3),
        speakerNotes: `开场说明本课件基于当前路径、已批准资源和学习画像生成。${profileFacts.slice(0, 3).join("；") || "暂无可用画像事实。"}`,
      },
      [references[0].sourceKey],
    ),
    slide(
      "objectives",
      "objectives",
      "本次学习目标要能被检查",
      {
        bullets: objectives,
        speakerNotes: `逐项解释学习目标，并提醒学生每个目标最后都要能用例题、过程或自测验证。${commonNotes}`,
      },
      [sourceRef("study_note")],
    ),
    slide(
      "roadmap",
      "roadmap",
      "先沿知识路线建立整体框架",
      {
        steps: roadmapSteps(context, mindMap, concepts),
        speakerNotes: `用路线图说明本节从定义、机制、例题到练习的递进关系，避免直接进入碎片细节。${commonNotes}`,
      },
      [sourceRef("mind_map")],
    ),
    slide(
      "concept",
      "concept",
      `${context.knowledgePoint}先明确对象和边界`,
      {
        body: limit(note?.foundationSummary || topic.objects, 160),
        bullets: concepts.slice(0, 3),
        citations: cite(0),
        speakerNotes: `讲解对象、输入输出和成立条件，特别提醒不要只背术语。${commonNotes}`,
      },
      [sourceRef("study_note")],
    ),
    slide(
      "mechanism",
      "mechanism",
      "关键机制要落到条件、动作和结果",
      {
        body: limit(
          firstNonEmpty(
            note?.coreConcepts?.map((item) => item.explanation),
            [topic.mechanism],
          )[0],
          160,
        ),
        bullets: cleanList(
          note?.methodsAndFormulas?.map((item) => `${item.title}：${item.explanation}`),
          [topic.mechanism],
        )
          .slice(0, 3)
          .map((item) => limit(item, 56)),
        citations: cite(1),
        speakerNotes: `围绕机制页说明为什么每个条件都会影响后续动作和最终结果。${commonNotes}`,
      },
      [sourceRef("study_note")],
    ),
    slide(
      "process",
      "process",
      "把过程拆成可跟踪的步骤",
      {
        steps: processSteps,
        speakerNotes: `按步骤讲，不跳步；每一步都要求学生说出输入、动作和状态变化。${commonNotes}`,
      },
      [sourceRef("mind_map")],
    ),
    exampleSlide("example-1", examples[0], context, sourceRef("study_note"), cite(2), commonNotes),
    exampleSlide(
      "example-2",
      examples[1] || examples[0],
      context,
      sourceRef("study_note"),
      cite(3),
      commonNotes,
    ),
    slide(
      "code",
      "code",
      codeCase ? "公开代码案例只展示教学安全部分" : "用伪代码或状态表检查过程",
      {
        language: codeCase?.language || "pseudo",
        code,
        explanation: limit(codeExplanation, 220),
        speakerNotes: `只讲公开代码或伪代码中的关键状态，评测细节不进入课件。${commonNotes}`,
      },
      [codeCase ? sourceRef("code_case") : references[0].sourceKey],
    ),
    slide(
      "mechanism-cost",
      "mechanism",
      "复杂度、代价和工程实践决定适用场景",
      {
        body: limit(topic.complexity, 220),
        bullets: [
          "先说明标准复杂度或协议成本，再讨论何时会被工程因素放大。",
          "区分理论保证、实现代价和真实系统边界。",
          "把本页结论回收到例题和CodeLab练习中验证。",
        ],
        speakerNotes: `讲复杂度时不要夸大绝对效果，强调前提条件和工程代价。${commonNotes}`,
      },
      [references[0].sourceKey],
    ),
    slide(
      "mistakes",
      "mistakes",
      "常见错误不是记忆点，而是检查清单",
      {
        items: mistakes,
        speakerNotes: `逐个易错点说明错误原因和修正方式，让学生把它们转成做题前的检查清单。${commonNotes}`,
      },
      [sourceRef("study_note")],
    ),
    slide(
      "comparison",
      "comparison",
      "相邻概念对比帮助避免关键词套用",
      {
        body: limit(topic.comparison, 160),
        left: {
          title: context.knowledgePoint,
          items: ["关注本节定义与成立条件", "按过程或状态变化验证", "最终结论服务当前阶段目标"],
        },
        right: {
          title: "相邻或易混机制",
          items: ["目标、对象或层次可能不同", "同名术语不能直接等价", "需要用反例检查边界"],
        },
        speakerNotes: `对比页用于把相似概念拆开，尤其提醒学生先比较目标和条件，再判断答案。${commonNotes}`,
      },
      [sourceRef("mind_map")],
    ),
    slide(
      "practice",
      "practice",
      "用自我检查题确认是否真正理解",
      {
        body: practicePrompt,
        bullets: [
          "A. 先列对象和条件，再跟踪过程",
          "B. 只凭关键词直接选结论",
          "C. 忽略边界或状态变化",
          "D. 把相邻概念当作同一机制",
        ],
        questionIds: publicQuiz?.questionId ? [publicQuiz.questionId] : [],
        explanation: "本页只展示公开题型或概念自测，不公开真实题库答案；完成后再看下一页解析。",
        speakerNotes: `让学生先独立作答，随后要求说明依据。真实题库答案不在本页展示。${commonNotes}`,
      },
      [quizPack ? sourceRef("quiz_pack") : references[0].sourceKey],
    ),
    slide(
      "answers",
      "answers",
      "解析要说明依据，而不是只给结论",
      {
        bullets: answers,
        body: "参考解析围绕定义、条件、过程和边界展开；如果学生答案缺少其中任一部分，应回到对应页面复盘。",
        speakerNotes: `讲解析时强调理由链：对象是什么、条件是否满足、过程如何变化、结论为什么成立。${commonNotes}`,
      },
      [references[0].sourceKey],
    ),
    slide(
      "summary",
      "summary",
      "收束为一张可执行复习清单",
      {
        bullets: [
          `能复述${context.knowledgePoint}的对象、条件和核心机制。`,
          "能手推至少两个具体示例并解释状态变化。",
          "能用易错清单检查自己的判断过程。",
        ],
        nextSteps: cleanList(
          note?.studyAdvice,
          topic.exercises?.map((item) => item.prompt),
          ["回到学习路径完成阶段练习", "完成相关CodeLab或题库自测"],
        ).slice(0, 4),
        speakerNotes: `总结本课件的学习闭环，并提示学生把目标、例题、易错清单和自测解析串成一次完整复盘。`,
      },
      [sourceRef("study_note")],
    ),
    slide(
      "references",
      "references",
      "参考资料",
      {
        references,
        speakerNotes: "说明本课件使用的已批准资源、课程知识库或当前学习路径元数据；没有虚构外部来源。",
      },
      references.map((reference) => reference.sourceKey).slice(0, 6),
    ),
  ];
  return {
    title: `${context.knowledgePoint}教学课件`,
    subtitle: `${context.subject} · ${context.stageTitle || "当前学习阶段"}`,
    course: context.subject,
    knowledgePoint: context.knowledgePoint,
    audience: targetAudience(context),
    theme: { name: "academic-blue", primaryTone: "blue", density: "medium" },
    slides,
    references,
    sourceSummary: {
      sourceMode: options.sourceMode || "deterministic_fallback",
      modelAvailable: Boolean(options.modelAvailable),
      usedResourceTypes: bundle.usedResourceTypes,
      missingResourceTypes: bundle.missingResourceTypes,
      knowledgeNotice: bundle.knowledgeNotice,
    },
    generationMeta: {
      deckFormatVersion: PROMPT_VERSION,
      depth: "normal",
      normalSlideRange: "14-18",
      deepSlideRange: "18-24",
      sourceMode: options.sourceMode || "deterministic_fallback",
      modelAvailable: Boolean(options.modelAvailable),
      usedResourceTypes: bundle.usedResourceTypes,
      missingResourceTypes: bundle.missingResourceTypes,
      profileFactsUsed: profileFacts.slice(0, 6),
      contentHash: hashSlides(slides),
    },
  };
}

async function loadApprovedSourceResources(context, db = pool) {
  const params = [
    context.studentId,
    context.subject,
    context.knowledgePoint,
    context.pathVersion,
    context.stageKey,
    ...SOURCE_TYPES,
  ];
  const [rows] = await db.query(
    `SELECT r.id,r.resource_type,r.title,r.current_version,v.content_json,v.review_json,v.citations_json,v.created_at
    FROM learning_resources r
    JOIN learning_resource_versions v ON v.resource_id=r.id AND v.student_id=r.student_id AND v.version=r.current_version
    WHERE r.student_id=? AND r.subject=? AND r.knowledge_point=? AND r.path_version=? AND r.stage_key=?
      AND r.status='approved' AND r.current_version>0 AND r.resource_type IN (${SOURCE_TYPES.map(() => "?").join(",")})
    ORDER BY FIELD(r.resource_type, ${SOURCE_TYPES.map(() => "?").join(",")})`,
    [...params, ...SOURCE_TYPES],
  );
  return rows
    .map((row) => {
      const envelope = parseJson(row.content_json);
      const review = parseJson(row.review_json);
      return {
        resourceId: Number(row.id),
        resourceType: row.resource_type,
        title: row.title,
        version: Number(row.current_version),
        content: envelope.content || {},
        citations: parseJson(row.citations_json),
        review,
        createdAt: row.created_at,
      };
    })
    .filter((resource) => resource.review?.status !== "rejected");
}

async function preparePptRetrieval(context, options = {}) {
  const retrieve = options.retrieveKnowledgeFn || retrieveKnowledge;
  try {
    return await retrieve(options.db || pool, {
      studentId: context.studentId,
      requestType: "pptx",
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      query: `${context.knowledgePoint} ${array(context.stageGoals).join(" ")}`,
      stageGoals: context.stageGoals,
      errorPatterns: context.errorPatterns,
      topK: 8,
      minimumScore: 0.12,
    });
  } catch {
    return {
      retrievalRunId: null,
      results: [],
      insufficient: true,
      unsupportedForRag: false,
      confidence: "insufficient",
      warning: "knowledge_retrieval_unavailable",
    };
  }
}

function buildCitationCatalog(retrieval) {
  return array(retrieval?.results)
    .slice(0, 8)
    .map((item, index) => ({
      label: `S${index + 1}`,
      chunkId: item.chunkId ?? item.id,
      sourceKey: item.sourceKey ?? item.source_key,
      sourceTitle: item.sourceTitle ?? item.source_title ?? item.title,
      chapter: item.chapter,
      section: item.section ?? item.section_name,
      license: (item.license ?? item.license_name) || "未提供",
      version: (item.sourceVersion ?? item.version) || "未提供",
      excerpt: String(item.content ?? item.excerpt ?? item.snippet ?? item.content_text ?? "").slice(0, 500),
      supportScore: item.score ?? item.finalScore,
    }))
    .filter((item) => item.chunkId && item.sourceKey && item.sourceTitle);
}

function slide(id, slideType, title, fields = {}, sourceRefs = []) {
  return {
    id,
    slideType,
    title: limit(title, 80),
    learningPurpose: fields.learningPurpose || learningPurposeFor(slideType),
    sourceRefs,
    accessibilitySummary:
      fields.accessibilitySummary || `${title}：使用清晰标题、短句和结构化布局，便于课堂投影阅读。`,
    ...fields,
  };
}

function exampleSlide(id, example, context, sourceRefValue, citations, commonNotes) {
  const fallback = {
    title: `示例：围绕${context.knowledgePoint}手推一次过程`,
    steps: ["列出对象和条件", "按关键步骤跟踪状态", "用边界或反例验证结论"],
    answer: "结论必须同时满足定义、过程和边界检查。",
  };
  const item = example || fallback;
  return slide(
    id,
    "example",
    limit(item.title || fallback.title, 52),
    {
      body: limit(item.title || fallback.title, 100),
      steps: cleanList(array(item.steps), fallback.steps)
        .slice(0, 3)
        .map((step, index) => ({ title: `步骤${index + 1}`, description: limit(step, 88) })),
      explanation: limit(item.answer || fallback.answer, 120),
      citations,
      speakerNotes: `示例页只讲一个核心过程：先读条件，再手推状态，最后解释结论为什么成立。${commonNotes}`,
    },
    [sourceRefValue],
  );
}

function roadmapSteps(context, mindMap, concepts) {
  const fromMind = array(mindMap?.root?.children)
    .slice(0, 4)
    .map((node) => ({
      title: limit(node.label, 28),
      description: limit(node.description, 60),
    }));
  if (fromMind.length >= 3) return fromMind;
  return cleanList(concepts, context.stageGoals, [
    `认识${context.knowledgePoint}`,
    "跟踪关键过程",
    "完成自测与复盘",
  ])
    .slice(0, 4)
    .map((item, index) => ({ title: `路径${index + 1}`, description: limit(item, 60) }));
}

function safeMindMap(content) {
  if (!content) return null;
  try {
    return normalizeMindMapContent(content, { repairIds: true });
  } catch {
    return null;
  }
}

function collectMindNodes(content, predicate) {
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) nodes.push(node);
    array(node.children).forEach(visit);
  };
  visit(content?.root);
  return nodes;
}

function buildTopicPseudoCode(context, topic) {
  const lines = [
    "输入：题目对象、条件和当前状态",
    "步骤1：列出必须满足的定义或协议约束",
    "步骤2：按顺序执行关键动作并记录状态变化",
    "步骤3：用边界条件或反例检查结论",
    "输出：符合定义、过程和边界的解释",
  ];
  const pseudo =
    topic.pseudocode && countChinese(topic.pseudocode) >= 20
      ? topic.pseudocode.split(/[；。]/).filter(Boolean)
      : lines;
  return pseudo
    .slice(0, 10)
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
}

function targetAudience(context) {
  return [
    context.major || context.currentCourse
      ? `${context.major || context.currentCourse}学习者`
      : "当前课程学习者",
    Number.isFinite(Number(context.mastery)) ? `掌握度约${Number(context.mastery)}` : "",
    context.explanationPreference ? `偏好${context.explanationPreference}` : "",
  ]
    .filter(Boolean)
    .join("，");
}

function selectProfileFacts(context) {
  const facts = [
    context.major,
    context.grade,
    context.currentCourse,
    Number.isFinite(Number(context.mastery)) ? `掌握度 ${Number(context.mastery)}` : "",
    context.explanationPreference ? `偏好${context.explanationPreference}` : "",
    context.paceAndTimeBudget?.pacePreference ? `学习节奏${context.paceAndTimeBudget.pacePreference}` : "",
    context.paceAndTimeBudget?.weeklyTimeBudgetMinutes
      ? `每周${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}分钟`
      : "",
    ...array(context.priorKnowledge).slice(0, 2),
    ...array(context.learningGoals).slice(0, 2),
    ...array(context.resourcePreferences).slice(0, 2),
    ...array(context.errorPatterns)
      .map((item) => item?.errorType)
      .filter(Boolean)
      .slice(0, 2),
  ]
    .map((item) => String(item || "").trim())
    .filter((item) => item.length >= 2);
  return [...new Set(facts)].slice(0, 6);
}

function firstNonEmpty(...lists) {
  return lists.find((list) => Array.isArray(list) && list.filter(Boolean).length) || [];
}

function cleanList(...lists) {
  return firstNonEmpty(...lists)
    .map((item) =>
      String(item || "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function uniqueReferences(references) {
  const seen = new Set();
  return references.filter((reference) => {
    const key = String(reference?.sourceKey || reference?.title || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceKey(type, version = 1) {
  return `approved:${type}:v${Number(version) || 1}`;
}

function limit(value, max) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : text.slice(0, Math.max(0, max - 1));
}

function limitCode(value) {
  const lines = String(value || "")
    .replace(/TODO|FIXME|待补充|待实现/gi, "实现要点")
    .split(/\r?\n/)
    .map((line) => line.slice(0, 96))
    .slice(0, 18);
  const code = lines.join("\n");
  return code.length <= 1100 ? code : code.slice(0, 1100);
}

function learningPurposeFor(slideType) {
  return (
    {
      cover: "建立本次学习场景和受众预期。",
      objectives: "明确课后可验证的学习结果。",
      roadmap: "呈现概念路线和学习顺序。",
      concept: "解释核心对象、定义和边界。",
      mechanism: "说明关键机制、性质或代价。",
      process: "拆解步骤、流程或状态变化。",
      example: "用具体例子验证概念迁移。",
      code: "用安全代码或伪代码呈现过程。",
      comparison: "区分相邻概念和易混边界。",
      mistakes: "把常见错误转化为检查清单。",
      practice: "提供自我检查问题。",
      answers: "给出公开解析和复盘路径。",
      summary: "收束本次学习并安排下一步。",
      references: "列出真实来源和版本。",
    }[slideType] || "推进本次教学叙事。"
  );
}

function hashSlides(slides) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        slides.map((slide) => ({ type: slide.slideType, title: slide.title, body: slidePublicText(slide) })),
      ),
    )
    .digest("hex");
}

function slidePublicText(slide = {}) {
  return [
    slide.title,
    slide.subtitle,
    slide.body,
    ...array(slide.bullets),
    ...array(slide.nextSteps),
    ...array(slide.steps).flatMap((item) => [item?.title, item?.description]),
    ...array(slide.items).flatMap((item) => [
      item?.mistake,
      item?.correction,
      item?.title,
      item?.description,
    ]),
    slide.explanation,
  ]
    .filter(Boolean)
    .join("\n");
}

function countChinese(value) {
  return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  PROMPT_VERSION,
  SOURCE_TYPES,
  buildContextOnlySourceBundle,
  buildDeterministicPptDeckContent,
  buildPptSourceBundle,
  buildCitationCatalog,
  loadApprovedSourceResources,
};
