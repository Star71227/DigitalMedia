/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { RENDER_SLIDE_TYPES, validatePptDeckQuality } = require("./pptQualityService");

const RESOURCE_TYPES = new Set(["study_note", "mind_map", "pptx", "quiz_pack", "code_case"]);
const NODE_TYPES = new Set([
  "root",
  "concept",
  "condition",
  "step",
  "example",
  "warning",
  "misconception",
  "formula",
  "code",
  "summary",
]);
const IMPORTANCE = new Set(["high", "medium", "low"]);
const SLIDE_TYPES = RENDER_SLIDE_TYPES;
const REVIEW_STATUS = new Set(["approved", "needs_revision", "rejected"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const CATEGORIES = new Set([
  "factuality",
  "relevance",
  "structure",
  "clarity",
  "difficulty",
  "safety",
  "citation",
  "duplication",
  "formatting",
  "resource_reference",
]);
const DIFFICULTIES = new Set(["foundation", "intermediate", "advanced"]);

// 真实模型（尤其智谱 GLM 系列）经常把枚举字段写成中文或近义英文，例如 importance: "高"、"重要"、"high（核心）"。
// 这类同义写法在语义上完全正确，不应该让整份资源生成失败，因此在校验前先做归一化。
const IMPORTANCE_ALIASES = new Map([
  ["高", "high"],
  ["中", "medium"],
  ["低", "low"],
  ["重要", "high"],
  ["一般", "medium"],
  ["次要", "low"],
  ["核心", "high"],
  ["普通", "medium"],
  ["可选", "low"],
  ["关键", "high"],
  ["基础", "medium"],
  ["了解", "low"],
  ["important", "high"],
  ["normal", "medium"],
  ["minor", "low"],
  ["mid", "medium"],
  ["moderate", "medium"],
  ["critical", "high"],
  ["1", "high"],
  ["2", "medium"],
  ["3", "low"],
]);

const NODE_TYPE_ALIASES = new Map([
  ["根", "root"],
  ["根节点", "root"],
  ["rootnode", "root"],
  ["概念", "concept"],
  ["知识点", "concept"],
  ["条件", "condition"],
  ["前提", "condition"],
  ["步骤", "step"],
  ["过程", "step"],
  ["流程", "step"],
  ["示例", "example"],
  ["例子", "example"],
  ["例题", "example"],
  ["警告", "warning"],
  ["注意", "warning"],
  ["易错", "warning"],
  ["易错点", "warning"],
  ["误区", "misconception"],
  ["错误概念", "misconception"],
  ["公式", "formula"],
  ["方法", "formula"],
  ["代码", "code"],
  ["伪代码", "code"],
  ["总结", "summary"],
  ["小结", "summary"],
  ["汇总", "summary"],
]);

function normalizeEnum(value, allowed, aliases) {
  const key = String(value === undefined || value === null ? "" : value)
    .trim()
    .toLowerCase();
  if (allowed.has(key)) return key;
  if (aliases.has(key)) return aliases.get(key);
  const stripped = key.replace(/[\s_\-（）()【】\[\]]/g, "");
  if (aliases.has(stripped)) return aliases.get(stripped);
  const prefix = [...allowed].find((item) => key.startsWith(item) || stripped.startsWith(item));
  return prefix || key;
}

function normalizeImportance(value) {
  return normalizeEnum(value, IMPORTANCE, IMPORTANCE_ALIASES);
}

function normalizeNodeType(value) {
  return normalizeEnum(value, NODE_TYPES, NODE_TYPE_ALIASES);
}

function validateResourceEnvelope(value, context) {
  object(value, "resource");
  whitelist(
    value,
    [
      "resourceType",
      "title",
      "subject",
      "knowledgePoint",
      "learningObjectives",
      "targetLearnerSummary",
      "estimatedMinutes",
      "generationRationale",
      "content",
      "retrievalRunId",
      "citations",
    ],
    "resource",
  );
  if (!RESOURCE_TYPES.has(value.resourceType)) fail("unsupported resourceType");
  if (
    value.resourceType !== context.resourceType ||
    value.subject !== context.subject ||
    value.knowledgePoint !== context.knowledgePoint
  )
    fail("resource context mismatch");
  text(value.title, 255);
  text(value.subject, 120);
  text(value.knowledgePoint, 160);
  strings(value.learningObjectives, 1, 8, 240);
  text(value.targetLearnerSummary, 500);
  integer(value.estimatedMinutes, 5, 240);
  strings(value.generationRationale, 1, 8, 300);
  const validators = {
    study_note: () => validateStudyNote(value.content),
    mind_map: () => validateMindMap(value.content),
    pptx: () => validatePptx(value.content, new Set(context.allowedQuestionIds || [])),
    quiz_pack: () => validateQuizPack(value.content, new Set(context.allowedQuestionIds || [])),
    code_case: () =>
      validateCodeCase(
        value.content,
        new Set(context.trustedCodeExerciseIds || context.allowedCodeExerciseIds || []),
      ),
  };
  const content = validators[value.resourceType]();
  if (value.retrievalRunId !== undefined) integer(value.retrievalRunId, 1, Number.MAX_SAFE_INTEGER);
  if (value.citations !== undefined) validateCitationCatalog(value.citations);
  return { ...value, content };
}

function validateStudyNote(value) {
  object(value, "studyNote");
  whitelist(
    value,
    [
      "personalizedObjectives",
      "foundationSummary",
      "coreConcepts",
      "diagrams",
      "methodsAndFormulas",
      "workedExamples",
      "commonMistakes",
      "practiceTasks",
      "studyAdvice",
      "citationBasis",
    ],
    "studyNote",
  );
  strings(value.personalizedObjectives, 1, 8, 240);
  text(value.foundationSummary, 800);
  structuredItems(
    value.coreConcepts,
    1,
    12,
    "coreConcept",
    ["title", "explanation", "importance"],
    (item) => {
      text(item.title, 120);
      text(item.explanation, 900);
      const importance = normalizeImportance(item.importance);
      if (!IMPORTANCE.has(importance)) fail("invalid importance");
      item.importance = importance;
    },
  );
  structuredItems(value.diagrams, 1, 8, "diagram", ["title", "description", "steps"], (item) => {
    text(item.title, 120);
    text(item.description, 700);
    strings(item.steps, 1, 10, 300);
  });
  structuredItems(
    value.methodsAndFormulas,
    1,
    10,
    "method",
    ["title", "expression", "explanation", "conditions"],
    (item) => {
      text(item.title, 120);
      text(item.expression, 300);
      text(item.explanation, 700);
      strings(item.conditions, 0, 8, 240);
    },
  );
  structuredItems(value.workedExamples, 1, 8, "workedExample", ["question", "steps", "answer"], (item) => {
    text(item.question, 600);
    strings(item.steps, 1, 12, 500);
    text(item.answer, 600);
  });
  structuredItems(
    value.commonMistakes,
    1,
    10,
    "commonMistake",
    ["mistake", "reason", "correction"],
    (item) => {
      text(item.mistake, 400);
      text(item.reason, 500);
      text(item.correction, 500);
    },
  );
  structuredItems(value.practiceTasks, 1, 10, "practiceTask", ["prompt", "hint", "answerGuide"], (item) => {
    text(item.prompt, 500);
    text(item.hint, 400);
    text(item.answerGuide, 600);
  });
  strings(value.studyAdvice, 1, 8, 300);
  strings(value.citationBasis, 1, 8, 300);
  return value;
}

function validateMindMap(value) {
  object(value, "mindMap");
  whitelist(
    value,
    ["root", "crossLinks", "highlightNodeIds", "misconceptionNodeIds", "recommendedSequence"],
    "mindMap",
  );
  const ids = new Set();
  let count = 0;
  function visit(node, depth, ancestors) {
    object(node, "node");
    whitelist(
      node,
      ["id", "label", "description", "nodeType", "importance", "children", "citations"],
      "node",
    );
    const id = identifier(node.id);
    if (ids.has(id)) fail(`duplicate node id: ${id}`);
    if (ancestors.has(node)) fail("cyclic mind map object");
    ids.add(id);
    count += 1;
    if (depth > 6) fail("mind map depth exceeds 6");
    text(node.label, 120);
    text(node.description || "", 500, true);
    const nodeType = normalizeNodeType(node.nodeType);
    const importance = normalizeImportance(node.importance);
    if (!NODE_TYPES.has(nodeType)) fail("invalid nodeType");
    if (!IMPORTANCE.has(importance)) fail("invalid importance");
    node.nodeType = nodeType;
    node.importance = importance;
    if (!Array.isArray(node.children)) fail("children must be an array");
    if (node.citations !== undefined) citationIds(node.citations);
    const next = new Set(ancestors);
    next.add(node);
    node.children.forEach((child) => visit(child, depth + 1, next));
  }
  visit(value.root, 1, new Set());
  if (value.root.nodeType !== "root") fail("root nodeType required");
  if (count < 8 || count > 70) fail("mind map must contain 8 to 70 nodes");
  const crossLinks = array(value.crossLinks, 0, 40).map((link) => {
    object(link, "crossLink");
    whitelist(link, ["sourceId", "targetId", "label"], "crossLink");
    if (!ids.has(link.sourceId) || !ids.has(link.targetId) || link.sourceId === link.targetId)
      fail("invalid crossLink");
    text(link.label, 120);
    return link;
  });
  for (const field of ["highlightNodeIds", "misconceptionNodeIds", "recommendedSequence"])
    strings(value[field], 0, 40, 80).forEach((id) => {
      if (!ids.has(id)) fail(`${field} contains unknown node`);
    });
  return { ...value, crossLinks };
}

function validatePptx(value, allowedQuestionIds) {
  object(value, "pptx");
  whitelist(
    value,
    [
      "title",
      "subtitle",
      "course",
      "knowledgePoint",
      "audience",
      "theme",
      "slides",
      "references",
      "sourceSummary",
      "generationMeta",
    ],
    "pptx",
  );
  for (const field of ["title", "subtitle", "course", "knowledgePoint", "audience"])
    if (value[field] !== undefined) text(value[field] || "", field === "subtitle" ? 240 : 160, true);
  object(value.theme, "theme");
  whitelist(value.theme, ["name", "primaryTone", "density"], "theme");
  text(value.theme.name, 60);
  text(value.theme.primaryTone, 30);
  text(value.theme.density, 30);
  const slides = array(value.slides, 14, 18).map((slide, index) =>
    validateSlide(slide, index, allowedQuestionIds),
  );
  const references = array(value.references, 1, 20).map(validatePptReference);
  if (value.sourceSummary !== undefined) validatePptSourceSummary(value.sourceSummary);
  if (value.generationMeta !== undefined) validatePptGenerationMeta(value.generationMeta);
  const normalized = {
    title: value.title,
    subtitle: value.subtitle,
    course: value.course,
    knowledgePoint: value.knowledgePoint,
    audience: value.audience,
    theme: value.theme,
    slides,
    references,
    sourceSummary: value.sourceSummary,
    generationMeta: value.generationMeta,
  };
  const quality = validatePptDeckQuality({
    content: normalized,
    context: { allowedQuestionIds: [...allowedQuestionIds] },
  });
  if (!quality.passed) fail(`pptx quality failed: ${quality.issues[0]?.code || "unknown"}`);
  return normalized;
}

function validateSlide(slide, index, allowedQuestionIds) {
  object(slide, `slide[${index}]`);
  const allowed = [
    "id",
    "slideType",
    "title",
    "subtitle",
    "learningPurpose",
    "speakerNotes",
    "bullets",
    "body",
    "steps",
    "left",
    "right",
    "items",
    "language",
    "code",
    "explanation",
    "questionIds",
    "nextSteps",
    "citations",
    "sourceRefs",
    "accessibilitySummary",
    "references",
  ];
  whitelist(slide, allowed, `slide[${index}]`);
  if (!SLIDE_TYPES.has(slide.slideType)) fail("invalid slideType");
  text(slide.id || "", 80, true);
  text(slide.title, 160);
  text(slide.subtitle || "", 240, true);
  text(slide.learningPurpose || "", 260, true);
  text(slide.speakerNotes || "", 1200, true);
  text(slide.body || "", 1400, true);
  if (slide.code !== undefined) codeText(slide.code, 3000);
  text(slide.explanation || "", 900, true);
  text(slide.accessibilitySummary || "", 360, true);
  for (const field of ["bullets", "nextSteps", "questionIds"])
    if (slide[field] !== undefined) strings(slide[field], 0, 12, 300);
  if (slide.sourceRefs !== undefined) strings(slide.sourceRefs, 0, 8, 180);
  if (slide.questionIds)
    slide.questionIds.forEach((id) => {
      if (!allowedQuestionIds.has(id)) fail(`invalid questionId: ${id}`);
    });
  if (slide.citations !== undefined) citationIds(slide.citations);
  if (slide.steps !== undefined)
    structuredItems(slide.steps, 0, 12, "step", ["title", "description"], (step) => {
      text(step.title, 160);
      text(step.description, 500);
    });
  if (slide.items !== undefined)
    array(slide.items, 0, 12).forEach((item) => {
      if (typeof item === "string") text(item, 300);
      else {
        object(item, "item");
        whitelist(item, ["mistake", "correction", "title", "description"], "item");
        Object.values(item).forEach((v) => text(v, 500));
      }
    });
  for (const field of ["left", "right"])
    if (slide[field] !== undefined) {
      object(slide[field], field);
      whitelist(slide[field], ["title", "items"], field);
      text(slide[field].title, 160);
      strings(slide[field].items, 0, 12, 300);
    }
  if (slide.references !== undefined) array(slide.references, 0, 20).forEach(validatePptReference);
  return slide;
}

function validatePptReference(reference) {
  object(reference, "reference");
  whitelist(reference, ["sourceKey", "title", "chapter", "section", "version", "license"], "reference");
  text(reference.sourceKey, 180);
  text(reference.title, 240);
  text(String(reference.chapter || ""), 200, true);
  text(String(reference.section || ""), 200, true);
  text(String(reference.version || ""), 120, true);
  text(String(reference.license || ""), 200, true);
  return reference;
}

function validatePptSourceSummary(value) {
  object(value, "pptSourceSummary");
  whitelist(
    value,
    ["sourceMode", "modelAvailable", "usedResourceTypes", "missingResourceTypes", "knowledgeNotice"],
    "pptSourceSummary",
  );
  text(value.sourceMode || "", 80, true);
  if (typeof value.modelAvailable !== "boolean") fail("invalid ppt source modelAvailable");
  if (value.usedResourceTypes !== undefined) strings(value.usedResourceTypes, 0, 8, 80);
  if (value.missingResourceTypes !== undefined) strings(value.missingResourceTypes, 0, 8, 80);
  text(value.knowledgeNotice || "", 500, true);
}

function validatePptGenerationMeta(value) {
  object(value, "pptGenerationMeta");
  whitelist(
    value,
    [
      "deckFormatVersion",
      "depth",
      "normalSlideRange",
      "deepSlideRange",
      "sourceMode",
      "modelAvailable",
      "usedResourceTypes",
      "missingResourceTypes",
      "profileFactsUsed",
      "contentHash",
    ],
    "pptGenerationMeta",
  );
  for (const field of [
    "deckFormatVersion",
    "depth",
    "normalSlideRange",
    "deepSlideRange",
    "sourceMode",
    "contentHash",
  ])
    if (value[field] !== undefined) text(value[field] || "", 120, true);
  if (value.modelAvailable !== undefined && typeof value.modelAvailable !== "boolean")
    fail("invalid ppt generation modelAvailable");
  if (value.usedResourceTypes !== undefined) strings(value.usedResourceTypes, 0, 8, 80);
  if (value.missingResourceTypes !== undefined) strings(value.missingResourceTypes, 0, 8, 80);
  if (value.profileFactsUsed !== undefined) strings(value.profileFactsUsed, 0, 8, 160);
}

function validateQuizPack(value, allowedQuestionIds) {
  object(value, "quizPack");
  whitelist(
    value,
    ["title", "difficultyDistribution", "generationBasis", "questions", "evidenceStatus"],
    "quizPack",
  );
  text(value.title, 200);
  object(value.difficultyDistribution, "difficultyDistribution");
  whitelist(
    value.difficultyDistribution,
    ["foundation", "intermediate", "advanced"],
    "difficultyDistribution",
  );
  let total = 0;
  for (const key of DIFFICULTIES) total += integer(value.difficultyDistribution[key], 0, 16);
  if (total < 12 || total > 16) fail("difficulty distribution must total 12 to 16");
  strings(value.generationBasis, 1, 8, 300);
  if (value.evidenceStatus !== "sufficient") fail("quiz evidence is insufficient");
  const seen = new Set();
  const questions = array(value.questions, 12, 16).map((question, index) => {
    object(question, `question[${index}]`);
    whitelist(
      question,
      [
        "questionId",
        "questionType",
        "stem",
        "options",
        "scoringPoints",
        "correctAnswer",
        "analysis",
        "personalizedHint",
        "knowledgePoints",
        "difficulty",
      ],
      `question[${index}]`,
    );
    const id = text(question.questionId, 120);
    if (!allowedQuestionIds.has(id)) fail(`invalid questionId: ${id}`);
    if (seen.has(id)) fail(`duplicate questionId: ${id}`);
    seen.add(id);
    if (text(question.questionType, 60) !== "single_choice") fail("unsupported quiz questionType");
    text(question.stem, 1200);
    if (!DIFFICULTIES.has(question.difficulty)) fail("invalid difficulty");
    const options = strings(question.options, 4, 4, 600);
    const points = strings(question.scoringPoints, 0, 0, 300);
    const answer = text(question.correctAnswer, 10).toUpperCase();
    if (!/^[A-D]$/.test(answer)) fail("invalid quiz answer");
    text(question.analysis, 1800);
    text(question.personalizedHint, 500);
    strings(question.knowledgePoints, 1, 5, 120);
    return { ...question, options, scoringPoints: points, correctAnswer: answer };
  });
  return { ...value, questions };
}

function validateCodeCase(value, allowedExerciseIds) {
  object(value, "codeCase");
  whitelist(
    value,
    [
      "exerciseTitle",
      "caseBackground",
      "learningObjectives",
      "language",
      "starterCode",
      "tasks",
      "inputDescription",
      "outputDescription",
      "testCases",
      "boundaryConditions",
      "aiExplanation",
      "commonErrors",
      "advancedChallenges",
      "verificationStatus",
      "codeExerciseId",
      "codeLabEntry",
      "sourceMode",
      "modelAvailable",
      "candidateCount",
      "selectedCandidateKey",
      "selectionReason",
      "knowledgeNotice",
      "qualitySummary",
    ],
    "codeCase",
  );
  text(value.exerciseTitle || "", 200, true);
  text(value.caseBackground, 1400);
  strings(value.learningObjectives, 1, 8, 260);
  if (text(value.language, 50).toLowerCase() !== "c") fail("code_case language must be c");
  codeText(value.starterCode, 8000);
  strings(value.tasks, 1, 10, 600);
  text(value.inputDescription, 1000);
  text(value.outputDescription, 1000);
  structuredItems(value.testCases, 3, 12, "testCase", ["input", "expectedOutput", "description"], (item) => {
    text(item.input || "", 1500, true);
    text(item.expectedOutput || "", 1500, true);
    text(item.description, 500);
  });
  strings(value.boundaryConditions, 3, 10, 500);
  text(value.aiExplanation, 2000);
  strings(value.commonErrors, 1, 10, 600);
  strings(value.advancedChallenges, 1, 8, 600);
  if (value.verificationStatus !== "verified") fail("code_case must be verified");
  const id = text(value.codeExerciseId, 120);
  if (!allowedExerciseIds.has(id)) fail(`invalid codeExerciseId: ${id}`);
  object(value.codeLabEntry, "codeLabEntry");
  whitelist(value.codeLabEntry, ["exerciseId", "route"], "codeLabEntry");
  if (text(value.codeLabEntry.exerciseId, 120) !== id) fail("invalid codeLabEntry exerciseId");
  text(value.codeLabEntry.route, 240);
  if (text(value.sourceMode, 80) !== "deterministic_fallback") fail("invalid code_case sourceMode");
  if (value.modelAvailable !== false) fail("code_case modelAvailable must be false");
  integer(value.candidateCount, 1, 100);
  text(value.selectedCandidateKey, 100);
  text(value.selectionReason, 500);
  text(value.knowledgeNotice, 500);
  validateCodeCaseQualitySummary(value.qualitySummary);
  return value;
}

function validateCodeCaseQualitySummary(value) {
  object(value, "qualitySummary");
  whitelist(
    value,
    [
      "trusted",
      "language",
      "executionMode",
      "publicTestCount",
      "hiddenTestCount",
      "boundaryCategories",
      "referenceAccepted",
      "knownBugCaught",
      "fixedOutputCaught",
      "validatorVersion",
      "checkedAt",
    ],
    "qualitySummary",
  );
  if (value.trusted !== true) fail("code_case quality must be trusted");
  if (text(value.language, 20).toLowerCase() !== "c") fail("code_case quality language must be c");
  if (text(value.executionMode, 30) !== "docker") fail("code_case quality execution mode must be docker");
  integer(value.publicTestCount, 3, 20);
  integer(value.hiddenTestCount, 6, 20);
  strings(value.boundaryCategories, 3, 12, 120);
  if (value.referenceAccepted !== true || value.knownBugCaught !== true || value.fixedOutputCaught !== true)
    fail("code_case quality evidence incomplete");
  text(value.validatorVersion, 80);
  if (value.checkedAt !== null && value.checkedAt !== undefined) text(String(value.checkedAt), 80, true);
}

function validateReview(value) {
  object(value, "review");
  whitelist(value, ["status", "score", "issues", "correctedContent", "summary", "checks"], "review");
  if (!REVIEW_STATUS.has(value.status)) fail("invalid review status");
  integer(value.score, 0, 100);
  text(value.summary, 600);
  const issues = array(value.issues, 0, 30).map((issue) => {
    object(issue, "issue");
    whitelist(issue, ["severity", "category", "location", "message", "suggestedFix"], "issue");
    if (!SEVERITIES.has(issue.severity) || !CATEGORIES.has(issue.category)) fail("invalid review issue");
    text(issue.location, 160);
    text(issue.message, 500);
    text(issue.suggestedFix, 500);
    return issue;
  });
  if (value.checks !== undefined)
    structuredItems(value.checks, 1, 20, "check", ["name", "passed", "detail"], (check) => {
      text(check.name, 100);
      if (typeof check.passed !== "boolean") fail("invalid check result");
      text(check.detail, 400);
    });
  if (value.correctedContent !== null && value.correctedContent !== undefined)
    object(value.correctedContent, "correctedContent");
  return { ...value, issues, checks: value.checks || [] };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function citationIds(value) {
  return array(value, 0, 8).map((id) => integer(id, 1, Number.MAX_SAFE_INTEGER));
}
function validateCitationCatalog(value) {
  return array(value, 0, 8).map((citation) => {
    object(citation, "citation");
    whitelist(
      citation,
      [
        "label",
        "chunkId",
        "sourceKey",
        "sourceTitle",
        "chapter",
        "section",
        "license",
        "version",
        "excerpt",
        "supportScore",
      ],
      "citation",
    );
    text(citation.label, 20);
    integer(citation.chunkId, 1, Number.MAX_SAFE_INTEGER);
    for (const field of ["sourceKey", "sourceTitle", "chapter", "section", "license", "version", "excerpt"])
      text(citation[field] || "", field === "excerpt" ? 500 : 255, true);
    if (
      citation.supportScore !== undefined &&
      (!Number.isFinite(Number(citation.supportScore)) ||
        Number(citation.supportScore) < 0 ||
        Number(citation.supportScore) > 1)
    )
      fail("invalid citation supportScore");
    return citation;
  });
}
function structuredItems(value, min, max, name, fields, validate) {
  return array(value, min, max).map((item) => {
    object(item, name);
    whitelist(item, fields, name);
    validate(item);
    return item;
  });
}
// 真实模型（尤其推理模型）经常多输出几个无害字段（id、notes、difficulty 等）。
// 过去直接 fail 会让整份资源重新生成一次（一次约 100 秒），这里改为丢弃未声明字段。
// 需要严格模式时设置 RESOURCE_STRICT_FIELDS=true 恢复报错行为。
const STRICT_FIELDS =
  String(process.env.RESOURCE_STRICT_FIELDS || "")
    .trim()
    .toLowerCase() === "true";
function whitelist(v, allowed, p) {
  const set = new Set(allowed);
  const unknown = Object.keys(v).filter((k) => !set.has(k));
  if (!unknown.length) return;
  if (STRICT_FIELDS) fail(`${p} unknown fields: ${unknown.join(",")}`);
  for (const key of unknown) delete v[key];
}
function object(v, p) {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${p} must be object`);
}
function array(v, min, max) {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail("invalid array length");
  return v;
}
function text(v, max, empty = false) {
  const value = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  if (typeof value !== "string")
    fail(`invalid text: expected string, got ${Array.isArray(value) ? "array" : typeof value}`);
  if (!empty && !value.trim()) fail(`invalid text: 字段不能为空或纯空白（长度 ${value.length}）`);
  // 生成类文本（max >= 120）轻微超限时截断，不让整份资源作废；更短的是 id、枚举、短标签，仍严格报错。
  if (value.length > max) {
    if (max >= 120) return value.trim().slice(0, max);
    fail(`invalid text: length ${value.length} exceeds ${max}`);
  }
  if (
    /<\/?(?:html|body|img|a|div|span|style|form|input|video|audio|link|meta|script|iframe|object|embed|svg)\b[^>]*>|javascript:|data:text\/html|https?:\/\/|vbscript:/i.test(
      value,
    )
  )
    fail("unsafe HTML or URL");
  return value.trim();
}
function codeText(v, max) {
  if (typeof v !== "string" || !v.trim() || v.length > max) fail("invalid code text");
  if (
    /<\/?(?:html|body|img|a|div|span|style|form|input|video|audio|link|meta|script|iframe|object|embed|svg)\b|\bon\w+\s*=|javascript:|data:text\/html|https?:\/\/|vbscript:/i.test(
      v,
    )
  )
    fail("unsafe code content");
  return v;
}
function strings(v, min, max, len) {
  return array(v, min, max).map((x) => text(x, len));
}
function integer(v, min, max) {
  if (!Number.isInteger(Number(v)) || Number(v) < min || Number(v) > max) fail("invalid integer");
  return Number(v);
}
function identifier(v) {
  const s = text(v, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) fail("invalid identifier");
  return s;
}
function fail(message) {
  const e = new Error(message);
  e.statusCode = 422;
  e.code = "INVALID_RESOURCE";
  throw e;
}

module.exports = {
  RESOURCE_TYPES,
  validateResourceEnvelope,
  validateStudyNote,
  validateMindMap,
  validatePptx,
  validateQuizPack,
  validateCodeCase,
  validateReview,
  fingerprint,
};
