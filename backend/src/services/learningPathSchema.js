/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");

const ROOT_FIELDS = new Set(["title", "stages"]);
const STAGE_FIELDS = new Set([
  "key",
  "title",
  "subject",
  "durationMinutes",
  "goals",
  "knowledgePoints",
  "questionIds",
  "codeExerciseIds",
  "completion",
  "dependsOn",
]);
const COMPLETION_FIELDS = new Set(["type", "ids"]);
const COMPLETION_TYPES = new Set(["quiz", "codelab", "resource"]);

function validateLearningPath(candidate, catalog) {
  assertPlainObject(candidate, "path");
  assertWhitelist(candidate, ROOT_FIELDS, "path");
  const title = normalizeText(candidate.title, "path.title", 255);
  if (!Array.isArray(candidate.stages) || candidate.stages.length < 1 || candidate.stages.length > 12) {
    throw validationError("path.stages must contain 1 to 12 stages");
  }

  const questionMap = new Map((catalog.questions || []).map((item) => [String(item.questionId), item]));
  const codeExerciseMap = new Map(
    (catalog.codeExercises || []).map((item) => [String(item.exerciseId), item]),
  );
  const knowledgePairs = new Set([
    ...(catalog.questions || []).map((item) => `${item.subject}::${item.knowledgePoint}`),
    ...(catalog.codeExercises || []).map((item) => `${item.subject}::${item.knowledgePoint}`),
  ]);
  const stages = candidate.stages.map((stage, index) =>
    normalizeStage(stage, index, { questionMap, codeExerciseMap, knowledgePairs }),
  );

  const keys = new Set();
  for (const stage of stages) {
    if (keys.has(stage.key)) throw validationError(`duplicate stage key: ${stage.key}`);
    keys.add(stage.key);
  }
  const positions = new Map(stages.map((stage, index) => [stage.key, index]));
  const semanticStages = new Set();
  for (const stage of stages) {
    const signature = JSON.stringify([stage.subject, stage.knowledgePoints, stage.completion]);
    if (semanticStages.has(signature)) throw validationError(`duplicate semantic stage: ${stage.key}`);
    semanticStages.add(signature);
    for (const dependency of stage.dependsOn) {
      if (!keys.has(dependency)) throw validationError(`unknown dependency: ${dependency}`);
      if (dependency === stage.key) throw validationError(`stage cannot depend on itself: ${stage.key}`);
      if (positions.get(dependency) >= positions.get(stage.key))
        throw validationError(`dependency must precede stage: ${stage.key}`);
    }
  }
  assertAcyclic(stages);
  return { title, stages };
}

function normalizeStage(stage, index, catalog) {
  assertPlainObject(stage, `stages[${index}]`);
  assertWhitelist(stage, STAGE_FIELDS, `stages[${index}]`);
  const key = normalizeIdentifier(stage.key, `stages[${index}].key`);
  const title = normalizeText(stage.title, `stages[${index}].title`, 255);
  const subject = normalizeText(stage.subject, `stages[${index}].subject`, 120);
  const durationMinutes = Number(stage.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 10080) {
    throw validationError(`invalid durationMinutes for ${key}`);
  }
  const goals = normalizeStringArray(stage.goals, `${key}.goals`, 1, 8);
  const stageKnowledgePoints = normalizeStringArray(stage.knowledgePoints, `${key}.knowledgePoints`, 1, 12);
  const stageQuestionIds = normalizeStringArray(stage.questionIds || [], `${key}.questionIds`, 0, 30);
  const stageCodeIds = normalizeStringArray(stage.codeExerciseIds || [], `${key}.codeExerciseIds`, 0, 30);
  const dependsOn = normalizeStringArray(stage.dependsOn || [], `${key}.dependsOn`, 0, 11).map((item) =>
    normalizeIdentifier(item, `${key}.dependsOn`),
  );

  for (const point of stageKnowledgePoints) {
    if (!catalog.knowledgePairs.has(`${subject}::${point}`))
      throw validationError(`unknown knowledge point: ${subject}/${point}`);
  }
  for (const id of stageQuestionIds) {
    const item = catalog.questionMap.get(id);
    if (!item || item.subject !== subject || !stageKnowledgePoints.includes(item.knowledgePoint))
      throw validationError(`invalid question reference: ${id}`);
  }
  for (const id of stageCodeIds) {
    const item = catalog.codeExerciseMap.get(id);
    if (!item || item.subject !== subject || !stageKnowledgePoints.includes(item.knowledgePoint))
      throw validationError(`invalid CodeLab reference: ${id}`);
  }

  assertPlainObject(stage.completion, `${key}.completion`);
  assertWhitelist(stage.completion, COMPLETION_FIELDS, `${key}.completion`);
  const type = String(stage.completion.type || "");
  if (!COMPLETION_TYPES.has(type)) throw validationError(`invalid completion type for ${key}`);
  const ids = normalizeStringArray(stage.completion.ids, `${key}.completion.ids`, 1, 30);
  const allowed =
    type === "quiz"
      ? new Set(stageQuestionIds)
      : type === "codelab"
        ? new Set(stageCodeIds)
        : new Set(["mind_map", "pptx"]);
  if (ids.some((id) => !allowed.has(id)))
    throw validationError(`completion ids must be declared by stage ${key}`);
  if (type === "codelab" && ids.some((id) => !catalog.codeExerciseMap.get(id)?.pathCompletionEligible)) {
    throw validationError(`CodeLab completion is not backed by a verified judge for stage ${key}`);
  }

  return {
    key,
    title,
    subject,
    durationMinutes,
    goals,
    knowledgePoints: stageKnowledgePoints,
    questionIds: stageQuestionIds,
    codeExerciseIds: stageCodeIds,
    completion: { type, ids },
    dependsOn,
  };
}

function semanticFingerprint(path) {
  const semanticPath = path.stages.map((stage) => ({
    key: stage.key,
    subject: stage.subject,
    knowledgePoints: stage.knowledgePoints,
    questionIds: stage.questionIds,
    codeExerciseIds: stage.codeExerciseIds,
    completion: stage.completion,
    dependsOn: stage.dependsOn,
  }));
  return crypto.createHash("sha256").update(JSON.stringify(semanticPath)).digest("hex");
}

function assertAcyclic(stages) {
  const graph = new Map(stages.map((stage) => [stage.key, stage.dependsOn]));
  const visiting = new Set();
  const visited = new Set();
  function visit(key) {
    if (visiting.has(key)) throw validationError(`cyclic dependency detected at ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of graph.get(key) || []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of graph.keys()) visit(key);
}

function assertPlainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw validationError(`${path} must be an object`);
}
function assertWhitelist(value, whitelist, path) {
  const unknown = Object.keys(value).filter((key) => !whitelist.has(key));
  if (unknown.length) throw validationError(`${path} contains unknown fields: ${unknown.join(", ")}`);
}
function normalizeText(value, path, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw validationError(`${path} is invalid`);
  return text;
}
function normalizeIdentifier(value, path) {
  const text = normalizeText(value, path, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw validationError(`${path} is not a safe identifier`);
  return text;
}
function normalizeStringArray(value, path, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw validationError(`${path} has invalid length`);
  const normalized = value.map((item) => normalizeText(item, path, 255));
  if (new Set(normalized).size !== normalized.length) throw validationError(`${path} contains duplicates`);
  return normalized;
}
function validationError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "INVALID_LEARNING_PATH";
  return error;
}

module.exports = { validateLearningPath, semanticFingerprint, assertAcyclic };
