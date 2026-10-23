/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { validateResourceEnvelope, fingerprint } = require("./resourceSchema");
const {
  TRUSTED_CODE_CASE_VALIDATOR_VERSION,
  listTrustedCodeCaseCandidates,
  selectDeterministicCodeCaseCandidate,
  validateCodeCaseQuality,
} = require("./codeExerciseTrustService");

const PROMPT_VERSION = "code-case-trusted-c-v1";

async function generateCodeCaseResource(context, options = {}) {
  const candidates = Array.isArray(context.trustedCodeCaseCandidates)
    ? context.trustedCodeCaseCandidates
    : await listTrustedCodeCaseCandidates(context, options);
  const candidate = selectDeterministicCodeCaseCandidate(candidates, context);
  if (!candidate) {
    throw apiError(
      "trusted C CodeLab exercise is required for code_case",
      422,
      "CODE_CASE_TRUSTED_EXERCISE_REQUIRED",
      {
        sourceMode: "deterministic_fallback",
        modelAvailable: false,
        candidateCount: candidates.length,
        knowledgeNotice: "No trusted C CodeLab exercise matched this learning-path stage.",
      },
    );
  }

  const content = buildCodeCase({
    ...context,
    trustedCodeCaseCandidates: candidates,
    selectedCodeCaseCandidate: candidate,
  });
  const quality = validateCodeCaseQuality({ content, candidate, candidateCount: candidates.length });
  if (!quality.passed) {
    throw apiError("trusted code_case quality gate failed", 422, "CODE_CASE_QUALITY_FAILED", {
      issues: quality.issues,
    });
  }

  const envelope = validateResourceEnvelope(buildCodeCaseEnvelope(context, content, candidate), {
    ...context,
    trustedCodeExerciseIds: [candidate.exerciseId],
    allowedCodeExerciseIds: [candidate.exerciseId],
  });

  return {
    content: envelope,
    source: "deterministic_fallback",
    sourceMode: "deterministic_fallback",
    model: null,
    modelAvailable: false,
    promptVersion: PROMPT_VERSION,
    knowledgeNotice: content.knowledgeNotice,
    retryCount: 0,
    quality,
    qualityAttempts: [quality],
    generationId: fingerprint({
      exerciseId: candidate.exerciseId,
      selectedCandidateKey: candidate.candidateKey,
      validatorVersion: TRUSTED_CODE_CASE_VALIDATOR_VERSION,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
    }),
  };
}

function buildCodeCase(context) {
  const candidates = Array.isArray(context.trustedCodeCaseCandidates)
    ? context.trustedCodeCaseCandidates
    : [];
  const candidate =
    context.selectedCodeCaseCandidate || selectDeterministicCodeCaseCandidate(candidates, context);
  if (!candidate) {
    throw apiError(
      "trusted C CodeLab exercise is required for code_case",
      422,
      "CODE_CASE_TRUSTED_EXERCISE_REQUIRED",
    );
  }
  const candidateCount = candidates.length;
  const boundaryCategories = candidate.qualitySummary.boundaryCategories.slice(0, 8);
  const goals =
    Array.isArray(context.stageGoals) && context.stageGoals.length
      ? context.stageGoals.slice(0, 4)
      : [`Complete the trusted CodeLab exercise for ${candidate.knowledgePoint}.`];
  const primaryError =
    Array.isArray(context.errorPatterns) && context.errorPatterns[0]?.errorType
      ? String(context.errorPatterns[0].errorType)
      : "off-by-one or state-update mistakes";

  return {
    exerciseTitle: candidate.title,
    caseBackground: `${candidate.title} is rebuilt from a trusted C CodeLab exercise for ${candidate.subject} / ${candidate.knowledgePoint}. The public examples below are safe to show; the reference solution and hidden judge data remain server-side.`,
    learningObjectives: [
      ...goals,
      `Use the public examples to reason about ${candidate.knowledgePoint}, then submit in CodeLab for hidden-test judgment.`,
    ].slice(0, 6),
    language: "c",
    starterCode: candidate.starterCode,
    tasks: [
      `Read the CodeLab statement for ${candidate.title}.`,
      "Complete only the TODO region in the C starter code.",
      "Run public examples, then submit once the reasoning covers boundary cases.",
      "Explain which state changes or invariants make the solution pass.",
    ],
    inputDescription: candidate.sampleInput
      ? `Sample input: ${candidate.sampleInput}`
      : "Input format is defined by the trusted CodeLab exercise statement.",
    outputDescription: candidate.sampleOutput
      ? `Sample output: ${candidate.sampleOutput}`
      : "Output format is defined by the trusted CodeLab exercise statement.",
    testCases: candidate.publicTests.map((test) => ({
      input: test.input,
      expectedOutput: test.expectedOutput,
      description: test.description,
    })),
    boundaryConditions: boundaryCategories.map((category) => `Check ${category}.`),
    aiExplanation: [
      `The case is selected from ${candidateCount} backend-qualified candidate(s) and rebuilt from exercise ${candidate.exerciseId}.`,
      "It teaches with public examples only; hidden tests, reference code, judge config, runner image and fingerprints are not exposed.",
      `For this learner, review ${primaryError} before entering CodeLab.`,
    ].join(" "),
    commonErrors: [
      primaryError,
      "Hard-coding the sample output instead of implementing the state transition.",
      "Passing public cases while missing boundary conditions covered by hidden tests.",
    ],
    advancedChallenges: [
      "Describe the invariant that every public case is checking.",
      "Add one extra local dry-run table before submitting.",
      "Compare the public examples with at least three boundary categories.",
    ],
    verificationStatus: "verified",
    codeExerciseId: candidate.exerciseId,
    codeLabEntry: {
      exerciseId: candidate.exerciseId,
      route: `/student/codelab/${encodeURIComponent(candidate.exerciseId)}`,
    },
    sourceMode: "deterministic_fallback",
    modelAvailable: false,
    candidateCount,
    selectedCandidateKey: candidate.candidateKey,
    selectionReason:
      "stable first trusted candidate matching the current path stage, subject and knowledge point",
    knowledgeNotice:
      "This code_case is server-rebuilt from a trusted C CodeLab exercise; private judge material stays server-side.",
    qualitySummary: candidate.qualitySummary,
  };
}

function buildCodeCaseEnvelope(context, content, candidate) {
  const stageTitle = String(context.stageTitle || candidate.knowledgePoint || "CodeLab").trim();
  const mastery = Number(context.mastery);
  const targetLearnerSummary = Number.isFinite(mastery)
    ? `Current mastery ${mastery}; CodeLab case selected from trusted C exercises for this stage.`
    : "CodeLab case selected from trusted C exercises for this stage.";
  return {
    resourceType: "code_case",
    title: `${candidate.title} CodeLab Case`,
    subject: context.subject,
    knowledgePoint: context.knowledgePoint,
    learningObjectives: content.learningObjectives,
    targetLearnerSummary,
    estimatedMinutes: Math.max(10, Math.min(120, Number(context.estimatedMinutes) || 30)),
    generationRationale: [
      `Path stage: ${stageTitle}`,
      `Trusted candidate count: ${content.candidateCount}`,
      `Selected exercise: ${candidate.exerciseId}`,
      "Source mode: deterministic_fallback; model did not author executable content.",
    ],
    content,
    citations: [],
  };
}

function apiError(message, statusCode, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
}

module.exports = {
  PROMPT_VERSION,
  VALIDATOR_VERSION: TRUSTED_CODE_CASE_VALIDATOR_VERSION,
  buildCodeCase,
  generateCodeCaseResource,
};
