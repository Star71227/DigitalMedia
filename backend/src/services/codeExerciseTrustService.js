/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { pool } = require("../config/db");
const { getCodeExecutionConfig } = require("../config/runtimeConfig");
const { PROTOCOL_VERSION } = require("./dockerCodeRunnerService");

const TRUSTED_CODE_CASE_VALIDATOR_VERSION = "code-case-trust-v1";
const JUDGE_FINGERPRINT_VERSION = "judge-fingerprint-v1";
const SUPPORTED_LANGUAGE = "c";
const MIN_PUBLIC_TESTS = 3;
const MIN_HIDDEN_TESTS = 6;
const MIN_BOUNDARY_CATEGORIES = 3;
const DEFAULT_FINGERPRINT_DAYS = 3650;
const DANGEROUS_C_PATTERNS = [
  /\b(?:system|popen|fork|execv?|execl|socket|connect|bind|listen|accept|kill|ptrace)\s*\(/i,
  /#\s*include\s*[<"](?:windows\.h|sys\/socket\.h|netinet\/in\.h|arpa\/inet\.h|unistd\.h)[>"]/i,
];

function currentRunnerMetadata(env = process.env) {
  const config = getCodeExecutionConfig(env);
  const mode = config.mode === "local" ? "local" : "docker";
  return {
    executionMode: mode,
    runnerProtocol: PROTOCOL_VERSION,
    runnerImage: mode === "local" ? "local-msvc" : config.image || "learnmate/code-runner-c:2.4a",
  };
}

function buildJudgeFingerprint({
  language,
  referenceSolution,
  publicTests,
  hiddenTests,
  judgeConfig,
  runnerProtocol,
  runnerImage,
}) {
  return sha256(
    stableStringify({
      version: JUDGE_FINGERPRINT_VERSION,
      language: normalizeLanguage(language),
      referenceSolution: String(referenceSolution || ""),
      publicTests: normalizeFingerprintTests(publicTests),
      hiddenTests: normalizeFingerprintTests(hiddenTests),
      judgeConfig: sortObject(judgeConfig || {}),
      runnerProtocol: String(runnerProtocol || ""),
      runnerImage: String(runnerImage || ""),
    }),
  );
}

async function listTrustedCodeCaseCandidates(context = {}, options = {}) {
  const allowedIds = normalizeIdList(context.allowedCodeExerciseIds || context.stageCodeExerciseIds || []);
  if (!allowedIds.length) return [];
  const runner = options.runnerMetadata || currentRunnerMetadata(options.env || process.env);
  const placeholders = allowedIds.map(() => "?").join(",");
  const [rows] = await (options.db || pool).query(
    `SELECT
       e.id,e.exercise_id,e.subject,e.knowledge_point,e.title,e.description,e.language,e.difficulty,
       e.starter_code,e.sample_input,e.sample_output,e.explanation,e.tags,e.source,e.is_published,
       e.path_completion_eligible,
       p.reference_solution,p.judge_config_json,p.judge_verified,p.judge_verified_at,p.judge_fingerprint,
       p.judge_fingerprint_expires_at,p.judge_quality_json,p.execution_mode,p.runner_protocol,p.runner_image,
       p.validator_version
     FROM code_exercises e
     LEFT JOIN code_exercise_private p ON p.exercise_id=e.exercise_id
     WHERE e.exercise_id IN (${placeholders})
     ORDER BY FIELD(e.exercise_id, ${placeholders}), e.exercise_id`,
    [...allowedIds, ...allowedIds],
  );
  const testsByExercise = await loadTestsForExercises(
    rows.map((row) => row.exercise_id),
    options.db || pool,
  );
  return rows
    .map((row) =>
      qualifyTrustedExercise(row, testsByExercise.get(row.exercise_id) || [], {
        runner,
        subject: context.subject,
        knowledgePoint: context.knowledgePoint,
        allowedIds,
      }),
    )
    .filter((candidate) => candidate.qualified)
    .map((candidate) => candidate.publicCandidate);
}

async function getTrustedCodeCaseCandidateByKey(candidateKey, context = {}, options = {}) {
  const candidates = await listTrustedCodeCaseCandidates(context, options);
  return candidates.find((candidate) => candidate.candidateKey === candidateKey) || null;
}

function selectDeterministicCodeCaseCandidate(candidates = [], context = {}) {
  const normalized = Array.isArray(candidates) ? candidates.slice() : [];
  normalized.sort(
    (left, right) =>
      candidateRank(left, context) - candidateRank(right, context) ||
      String(left.exerciseId).localeCompare(String(right.exerciseId), "zh-CN"),
  );
  return normalized[0] || null;
}

function qualifyTrustedExercise(row = {}, tests = [], { runner, subject, knowledgePoint, allowedIds } = {}) {
  const issues = [];
  const exerciseId = text(row.exercise_id);
  const language = normalizeLanguage(row.language);
  const publicTests = tests.filter((test) => test.visibility === "public");
  const hiddenTests = tests.filter((test) => test.visibility === "hidden");
  const judgeConfig = parseJson(row.judge_config_json);
  const quality = parseJson(row.judge_quality_json);
  const fingerprint = buildJudgeFingerprint({
    language,
    referenceSolution: row.reference_solution,
    publicTests,
    hiddenTests,
    judgeConfig,
    runnerProtocol: row.runner_protocol || runner.runnerProtocol,
    runnerImage: row.runner_image || runner.runnerImage,
  });

  add(issues, allowedIds?.includes(exerciseId), "not_in_path_candidate_set");
  add(issues, text(row.subject) === text(subject), "subject_mismatch");
  add(issues, text(row.knowledge_point) === text(knowledgePoint), "knowledge_point_mismatch");
  add(issues, normalizeLanguage(row.language) === SUPPORTED_LANGUAGE, "language_not_c");
  add(issues, Number(row.is_published ?? 1) === 1, "exercise_not_published");
  add(issues, Number(row.path_completion_eligible || 0) === 1, "not_path_completion_eligible");
  add(
    issues,
    Boolean(text(row.title) && text(row.description) && text(row.starter_code)),
    "missing_public_statement_or_starter",
  );
  add(issues, publicTests.length >= MIN_PUBLIC_TESTS, "insufficient_public_tests");
  add(issues, hiddenTests.length >= MIN_HIDDEN_TESTS, "insufficient_hidden_tests");
  add(issues, Boolean(text(row.reference_solution)), "missing_reference_solution");
  add(issues, Number(row.judge_verified || 0) === 1, "judge_not_verified");
  add(issues, text(row.execution_mode) === "docker", "execution_mode_not_docker");
  add(issues, text(row.runner_protocol) === runner.runnerProtocol, "runner_protocol_mismatch");
  add(issues, text(row.runner_image) === runner.runnerImage, "runner_image_mismatch");
  add(
    issues,
    text(row.validator_version) === TRUSTED_CODE_CASE_VALIDATOR_VERSION,
    "validator_version_mismatch",
  );
  add(issues, text(row.judge_fingerprint) === fingerprint, "judge_fingerprint_mismatch");
  add(issues, !isExpired(row.judge_fingerprint_expires_at), "judge_fingerprint_expired");
  add(
    issues,
    Array.isArray(quality.boundaryCategories) && quality.boundaryCategories.length >= MIN_BOUNDARY_CATEGORIES,
    "insufficient_boundary_categories",
  );
  add(issues, Boolean(quality.referenceAccepted), "reference_not_accepted");
  add(issues, Boolean(quality.knownBugCaught), "known_bug_not_caught");
  add(issues, Boolean(quality.fixedOutputCaught), "fixed_output_not_caught");
  add(
    issues,
    !hasDangerousCDependency(row.starter_code) && !hasDangerousCDependency(row.reference_solution),
    "dangerous_c_dependency",
  );
  add(issues, safeTags(parseTags(row.tags)).length > 0, "missing_safe_tags");

  const qualified = issues.length === 0;
  return {
    qualified,
    issues,
    publicCandidate: qualified ? toPublicCandidate(row, publicTests, hiddenTests, quality) : null,
  };
}

function toPublicCandidate(row, publicTests, hiddenTests, quality) {
  const exerciseId = text(row.exercise_id);
  return {
    candidateKey: candidateKeyForExercise(exerciseId),
    exerciseId,
    subject: text(row.subject),
    knowledgePoint: text(row.knowledge_point),
    title: text(row.title),
    description: text(row.description),
    language: normalizeLanguage(row.language),
    difficulty: text(row.difficulty),
    starterCode: text(row.starter_code),
    sampleInput: text(row.sample_input),
    sampleOutput: text(row.sample_output),
    explanation: text(row.explanation),
    tags: safeTags(parseTags(row.tags)),
    publicTests: publicTests.map((test, index) => ({
      input: text(test.input),
      expectedOutput: text(test.expectedOutput),
      description: `public case ${index + 1}`,
    })),
    qualitySummary: {
      trusted: true,
      language: SUPPORTED_LANGUAGE,
      executionMode: "docker",
      publicTestCount: publicTests.length,
      hiddenTestCount: hiddenTests.length,
      boundaryCategories: Array.isArray(quality.boundaryCategories)
        ? quality.boundaryCategories.map(text).filter(Boolean)
        : [],
      referenceAccepted: Boolean(quality.referenceAccepted),
      knownBugCaught: Boolean(quality.knownBugCaught),
      fixedOutputCaught: Boolean(quality.fixedOutputCaught),
      validatorVersion: TRUSTED_CODE_CASE_VALIDATOR_VERSION,
      checkedAt: text(quality.checkedAt) || null,
    },
  };
}

function validateCodeCaseQuality({ content, candidate, candidateCount }) {
  const issues = [];
  const summary = content?.qualitySummary || {};
  add(issues, Boolean(candidate), "candidate_missing");
  add(issues, content?.verificationStatus === "verified", "verification_status_not_verified");
  add(issues, content?.language === SUPPORTED_LANGUAGE, "language_not_c");
  add(issues, content?.codeExerciseId === candidate?.exerciseId, "exercise_id_mismatch");
  add(issues, content?.selectedCandidateKey === candidate?.candidateKey, "candidate_key_mismatch");
  add(
    issues,
    Number(content?.candidateCount || 0) === Number(candidateCount || 0),
    "candidate_count_mismatch",
  );
  add(issues, content?.sourceMode === "deterministic_fallback", "source_mode_not_deterministic");
  add(issues, content?.modelAvailable === false, "model_must_not_author_code_case");
  add(
    issues,
    Array.isArray(content?.testCases) && content.testCases.length >= MIN_PUBLIC_TESTS,
    "public_tests_missing",
  );
  add(
    issues,
    Array.isArray(content?.boundaryConditions) &&
      content.boundaryConditions.length >= MIN_BOUNDARY_CATEGORIES,
    "boundary_conditions_missing",
  );
  add(issues, summary.trusted === true, "quality_summary_not_trusted");
  add(issues, summary.executionMode === "docker", "quality_execution_mode_not_docker");
  add(issues, Number(summary.publicTestCount || 0) >= MIN_PUBLIC_TESTS, "quality_public_tests_insufficient");
  add(issues, Number(summary.hiddenTestCount || 0) >= MIN_HIDDEN_TESTS, "quality_hidden_tests_insufficient");
  add(issues, summary.referenceAccepted === true, "quality_reference_not_accepted");
  add(issues, summary.knownBugCaught === true, "quality_known_bug_not_caught");
  add(issues, summary.fixedOutputCaught === true, "quality_fixed_output_not_caught");
  add(issues, !containsPrivateJudgeField(content), "private_judge_field_exposed");

  return {
    passed: issues.length === 0,
    issues: issues.map((code) => ({ code, message: code })),
    checks: [
      {
        name: "trusted-candidate",
        passed: Boolean(candidate),
        detail: candidate ? candidate.exerciseId : "missing",
      },
      {
        name: "docker-reference",
        passed: summary.referenceAccepted === true,
        detail: "reference accepted by docker judge metadata",
      },
      {
        name: "public-hidden-counts",
        passed:
          Number(summary.publicTestCount || 0) >= MIN_PUBLIC_TESTS &&
          Number(summary.hiddenTestCount || 0) >= MIN_HIDDEN_TESTS,
        detail: `${summary.publicTestCount || 0}/${summary.hiddenTestCount || 0}`,
      },
      {
        name: "private-projection",
        passed: !containsPrivateJudgeField(content),
        detail: "reference, hidden tests, fingerprint and runner image are not in public content",
      },
    ],
    trusted: issues.length === 0,
    candidateCount: Number(candidateCount || 0),
    selectedCandidateKey: content?.selectedCandidateKey || null,
    publicTestCount: Number(summary.publicTestCount || 0),
    hiddenTestCount: Number(summary.hiddenTestCount || 0),
    boundaryCategoryCount: Array.isArray(summary.boundaryCategories) ? summary.boundaryCategories.length : 0,
    referenceAccepted: summary.referenceAccepted === true,
    knownBugCaught: summary.knownBugCaught === true,
    fixedOutputCaught: summary.fixedOutputCaught === true,
    executionMode: summary.executionMode || "",
    validatorVersion: TRUSTED_CODE_CASE_VALIDATOR_VERSION,
    checkedAt: new Date().toISOString(),
  };
}

function candidateKeyForExercise(exerciseId) {
  return `codecase:${sha256(`trusted-code-case:${exerciseId}`).slice(0, 24)}`;
}

async function loadTestsForExercises(exerciseIds, db = pool) {
  const ids = normalizeIdList(exerciseIds);
  const result = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return result;
  const [rows] = await db.query(
    `SELECT exercise_id,visibility,input_text,expected_output,order_index
       FROM code_test_cases
      WHERE exercise_id IN (${ids.map(() => "?").join(",")})
      ORDER BY exercise_id, FIELD(visibility,'public','hidden'), order_index, id`,
    ids,
  );
  for (const row of rows) {
    const list = result.get(row.exercise_id) || [];
    list.push({
      exerciseId: text(row.exercise_id),
      visibility: row.visibility === "hidden" ? "hidden" : "public",
      input: text(row.input_text),
      expectedOutput: text(row.expected_output),
      orderIndex: Number(row.order_index || list.length + 1),
    });
    result.set(row.exercise_id, list);
  }
  return result;
}

function candidateRank(candidate, context = {}) {
  let rank = 0;
  if (candidate.subject !== context.subject) rank += 1000;
  if (candidate.knowledgePoint !== context.knowledgePoint) rank += 500;
  const order = normalizeIdList(context.allowedCodeExerciseIds || []).indexOf(candidate.exerciseId);
  rank += order >= 0 ? order : 100;
  return rank;
}

function containsPrivateJudgeField(value) {
  const privateKeys = new Set([
    "referenceSolution",
    "reference_solution",
    "hiddenTests",
    "hidden_tests",
    "privateTests",
    "private_tests",
    "judgeConfig",
    "judge_config",
    "judgeConfigJson",
    "judge_config_json",
    "judgeFingerprint",
    "judge_fingerprint",
    "runnerImage",
    "runner_image",
    "dockerImage",
    "compileCommand",
    "runCommand",
    "sourceCode",
    "source_code",
  ]);
  const seen = new Set();
  function visit(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(visit);
    return Object.entries(node).some(([key, child]) => privateKeys.has(key) || visit(child));
  }
  return visit(value);
}

function normalizeFingerprintTests(tests = []) {
  return (Array.isArray(tests) ? tests : [])
    .map((test, index) => ({
      visibility: test.visibility === "hidden" ? "hidden" : "public",
      orderIndex: Number(test.orderIndex || test.order_index || index + 1),
      input: String(test.input ?? test.input_text ?? ""),
      expectedOutput: String(test.expectedOutput ?? test.expected_output ?? ""),
    }))
    .sort(
      (left, right) => left.visibility.localeCompare(right.visibility) || left.orderIndex - right.orderIndex,
    );
}

function hasDangerousCDependency(source) {
  const textValue = String(source || "");
  return DANGEROUS_C_PATTERNS.some((pattern) => pattern.test(textValue));
}

function safeTags(value) {
  return (Array.isArray(value) ? value : [])
    .map(text)
    .filter((tag) => tag && !/script|html|url|docker|command|system|socket|exec/i.test(tag))
    .slice(0, 12);
}

function parseTags(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObject(value[key]);
      return result;
    }, {});
}

function isExpired(value) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return !Number.isFinite(time) || time <= Date.now();
}

function normalizeIdList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))];
}

function normalizeLanguage(value) {
  return text(value || SUPPORTED_LANGUAGE).toLowerCase();
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function add(issues, passed, code) {
  if (!passed) issues.push(code);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = {
  DEFAULT_FINGERPRINT_DAYS,
  JUDGE_FINGERPRINT_VERSION,
  MIN_BOUNDARY_CATEGORIES,
  MIN_HIDDEN_TESTS,
  MIN_PUBLIC_TESTS,
  TRUSTED_CODE_CASE_VALIDATOR_VERSION,
  buildJudgeFingerprint,
  candidateKeyForExercise,
  containsPrivateJudgeField,
  currentRunnerMetadata,
  getTrustedCodeCaseCandidateByKey,
  listTrustedCodeCaseCandidates,
  qualifyTrustedExercise,
  selectDeterministicCodeCaseCandidate,
  stableStringify,
  validateCodeCaseQuality,
};
