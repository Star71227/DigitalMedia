/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateResourceEnvelope,
  validateMindMap,
  validatePptx,
  validateQuizPack,
  validateCodeCase,
  validateReview,
} = require("../src/services/resourceSchema");
const { buildFallback } = require("../src/services/agents/multimodalResourceAgent");
const { applyReview } = require("../src/services/resourceGenerationService");

const questionEvidence = Array.from({ length: 14 }, (_, index) => ({
  questionId: `Q${index + 1}`,
  questionType: "single_choice",
  stem: `Scenario ${index + 1}: choose the correct mechanism for stack state changes.`,
  optionA: "Correct mechanism",
  optionB: "Confuses the boundary",
  optionC: "Skips a step",
  optionD: "Uses another scenario",
  answer: "A",
  analysis:
    "A real question-bank explanation that checks object, condition, order and boundary before choosing.",
  hint: "Track the state before answering.",
  difficulty: index < 6 ? "foundation" : index < 10 ? "intermediate" : "advanced",
  knowledgePoint: "Stack",
  abilityDimension: "state reasoning",
  tags: ["stack", index % 2 ? "process" : "misconception"],
  optionErrorTypes: { B: "concept_misunderstanding", C: "procedure_confusion", D: "scenario_confusion" },
}));

const trustedCandidate = {
  candidateKey: "codecase:test",
  exerciseId: "CODE-1",
  subject: "Data Structures",
  knowledgePoint: "Stack",
  title: "Trusted stack CodeLab",
  description: "Complete a trusted C stack exercise.",
  language: "c",
  difficulty: "foundation",
  starterCode: "int main(void){return 0;}",
  sampleInput: "1",
  sampleOutput: "1",
  explanation: "Trusted public explanation.",
  tags: ["stack"],
  publicTests: [
    { input: "1", expectedOutput: "1", description: "public case 1" },
    { input: "2", expectedOutput: "2", description: "public case 2" },
    { input: "3", expectedOutput: "3", description: "public case 3" },
  ],
  qualitySummary: {
    trusted: true,
    language: "c",
    executionMode: "docker",
    publicTestCount: 3,
    hiddenTestCount: 6,
    boundaryCategories: ["empty", "single", "large"],
    referenceAccepted: true,
    knownBugCaught: true,
    fixedOutputCaught: true,
    validatorVersion: "code-case-trust-v1",
    checkedAt: "2026-07-18T00:00:00.000Z",
  },
};

const context = {
  resourceType: "mind_map",
  subject: "Data Structures",
  knowledgePoint: "Stack",
  stageTitle: "Stack stage",
  stageGoals: ["Understand stack operations"],
  mastery: 40,
  errorPatterns: [{ errorType: "boundary confusion" }],
  explanationPreference: "diagram first",
  resourcePreferences: ["mind map"],
  priorKnowledge: [],
  paceAndTimeBudget: { pacePreference: "steady" },
  estimatedMinutes: 30,
  difficulty: "foundation",
  allowedQuestionIds: questionEvidence.map((item) => item.questionId),
  allowedCodeExerciseIds: ["CODE-1"],
  trustedCodeExerciseIds: ["CODE-1"],
  questionEvidence,
  codeEvidence: [trustedCandidate],
  trustedCodeCaseCandidates: [trustedCandidate],
};

test("deterministic mind map passes strict schema", () => {
  assert.equal(validateResourceEnvelope(buildFallback(context), context).content.root.id, "root");
});

test("mind map rejects duplicate ids, excessive depth, invalid links and unsafe text", () => {
  const valid = buildFallback(context).content;
  const duplicate = structuredClone(valid);
  duplicate.root.children[0].id = "root";
  assert.throws(() => validateMindMap(duplicate), /duplicate/);

  const deep = structuredClone(valid);
  let node = deep.root;
  for (let index = 0; index < 7; index += 1) {
    const child = {
      id: `deep-${index}`,
      label: "deep",
      description: "deep",
      nodeType: "concept",
      importance: "low",
      children: [],
    };
    node.children = [child];
    node = child;
  }
  assert.throws(() => validateMindMap(deep), /depth/);

  const link = structuredClone(valid);
  link.crossLinks = [{ sourceId: "root", targetId: "missing", label: "x" }];
  assert.throws(() => validateMindMap(link), /crossLink/);

  const html = structuredClone(valid);
  html.root.label = "<script>alert(1)</script>";
  assert.throws(() => validateMindMap(html), /unsafe/);
});

test("PPTX schema rejects missing cover slide, invalid slide type and forged question ids", () => {
  const pptContext = { ...context, resourceType: "pptx" };
  const allowed = new Set(pptContext.allowedQuestionIds);
  const valid = buildFallback(pptContext);
  assert.ok(validateResourceEnvelope(valid, pptContext).content.slides.length >= 14);
  const noTitle = structuredClone(valid.content);
  noTitle.slides = noTitle.slides.filter((slide) => slide.slideType !== "cover");
  assert.throws(() => validatePptx(noTitle, allowed), /invalid_cover_count|invalid_slide_count/);
  const bad = structuredClone(valid.content);
  bad.slides[0].slideType = "video";
  assert.throws(() => validatePptx(bad, allowed), /slideType/);
  const quiz = structuredClone(valid.content);
  const practice = quiz.slides.find((slide) => slide.slideType === "practice");
  practice.questionIds = ["FAKE"];
  assert.throws(() => validatePptx(quiz, allowed), /questionId/);
});

test("review schema uses status and field allowlists", () => {
  assert.equal(
    validateReview({ status: "approved", score: 90, issues: [], correctedContent: null, summary: "pass" })
      .score,
    90,
  );
  assert.throws(
    () => validateReview({ status: "ok", score: 90, issues: [], correctedContent: null, summary: "pass" }),
    /status/,
  );
});

test("needs_revision applies corrected content and rejected review blocks persistence", () => {
  const original = buildFallback(context);
  const corrected = structuredClone(original);
  corrected.title = "corrected map";
  assert.equal(
    applyReview(original, { status: "needs_revision", correctedContent: corrected }, context).title,
    "corrected map",
  );
  assert.throws(
    () => applyReview(original, { status: "rejected", correctedContent: null }, context),
    /rejected/,
  );
});

test("all five resource types pass schema with trusted code_case", () => {
  for (const resourceType of ["study_note", "mind_map", "pptx", "quiz_pack", "code_case"]) {
    const typed = { ...context, resourceType };
    const resource = buildFallback(typed);
    assert.equal(validateResourceEnvelope(resource, typed).resourceType, resourceType);
    assert.ok(Number.isFinite(resource.estimatedMinutes));
  }
  const invalid = { ...buildFallback(context), resourceType: "markdown" };
  assert.throws(
    () => validateResourceEnvelope(invalid, { ...context, resourceType: "markdown" }),
    /unsupported/,
  );
});

test("quiz_pack only accepts real question ids and rejects insufficient evidence", () => {
  const typed = { ...context, resourceType: "quiz_pack" };
  const valid = buildFallback(typed);
  assert.ok(validateQuizPack(valid.content, new Set(typed.allowedQuestionIds)).questions.length >= 12);
  const fake = structuredClone(valid.content);
  fake.questions[0].questionId = "FAKE";
  assert.throws(() => validateQuizPack(fake, new Set(typed.allowedQuestionIds)), /invalid questionId/);
  assert.throws(
    () =>
      buildFallback({ ...typed, allowedQuestionIds: ["Q1"], questionEvidence: questionEvidence.slice(0, 1) }),
    (error) => error.code === "INSUFFICIENT_QUESTION_EVIDENCE" && error.statusCode === 422,
  );
});

test("code_case requires a trusted verified exercise and rejects generated cases", () => {
  const typed = { ...context, resourceType: "code_case" };
  const verified = buildFallback(typed);
  assert.equal(validateCodeCase(verified.content, new Set(["CODE-1"])).verificationStatus, "verified");
  const fake = structuredClone(verified.content);
  fake.codeExerciseId = "FAKE";
  assert.throws(() => validateCodeCase(fake, new Set(["CODE-1"])), /invalid codeExerciseId/);
  const generated = structuredClone(verified.content);
  generated.verificationStatus = "generated";
  generated.codeExerciseId = null;
  assert.throws(() => validateCodeCase(generated, new Set(["CODE-1"])), /must be verified/);
  assert.throws(
    () =>
      buildFallback({
        ...typed,
        allowedCodeExerciseIds: [],
        trustedCodeExerciseIds: [],
        trustedCodeCaseCandidates: [],
        codeEvidence: [],
      }),
    (error) => error.code === "CODE_CASE_TRUSTED_EXERCISE_REQUIRED",
  );
});

test("AI disabled fallback remains deterministic for non-code resources and never yields NaN", () => {
  for (const resourceType of ["study_note", "mind_map", "pptx"]) {
    const typed = {
      ...context,
      resourceType,
      stageGoals: [],
      errorPatterns: [],
      resourcePreferences: [],
      priorKnowledge: [],
    };
    const value = buildFallback(typed);
    assert.equal(value.resourceType, resourceType);
    assert.equal(JSON.stringify(value).includes("NaN"), false);
  }
});
