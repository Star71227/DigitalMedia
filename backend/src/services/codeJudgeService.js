/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const {
  getExercisePrivateConfig,
  getPublishedExerciseById,
  listExerciseTests,
} = require("./codeExerciseService");
const { runDockerTask } = require("./dockerCodeRunnerService");
const { runLocalTask } = require("./localCodeRunnerService");
const { getCodeExecutionConfig } = require("../config/runtimeConfig");

const SUPPORTED_LANGUAGE = "c";
let runnerOverride = null;

async function runPublicCode({ exerciseId, language, sourceCode, stdin, runMode = "public" } = {}) {
  const exercise = await loadExercise(exerciseId);
  const normalizedLanguage = assertSupportedLanguage(language || exercise.language || "c");
  assertExerciseLanguage(exercise, normalizedLanguage);
  const custom = runMode === "custom";
  const tests = custom
    ? [
        {
          id: "custom-input",
          visibility: "public",
          input: String(stdin ?? ""),
          expectedOutput: "",
          compareOutput: false,
        },
      ]
    : await getPublicTests(exercise.exercise_id);
  const runnerResult = await executeRunner({
    language: normalizedLanguage,
    sourceCode,
    tests,
  });
  return toApiResult(runnerResult, {
    mode: "run",
    executionMode: activeExecutionMode(),
    includePublicStdout: true,
    judgedBy: custom ? "custom_input" : "public_only",
  });
}

async function judgeSubmission({ exerciseId, language, sourceCode } = {}) {
  const exercise = await loadExercise(exerciseId);
  const normalizedLanguage = assertSupportedLanguage(language || exercise.language || "c");
  assertExerciseLanguage(exercise, normalizedLanguage);
  const { tests, judgedBy } = await resolveSubmitTests(exercise.exercise_id);
  const runnerResult = await executeRunner({
    language: normalizedLanguage,
    sourceCode,
    tests,
  });
  return toApiResult(runnerResult, {
    mode: "submit",
    executionMode: activeExecutionMode(),
    includePublicStdout: true,
    judgedBy,
  });
}

async function verifyReferenceSolution(exerciseId) {
  const exercise = await loadExercise(exerciseId);
  const privateConfig = await getExercisePrivateConfig(exercise.exercise_id);
  if (!privateConfig || !privateConfig.referenceSolution) {
    throw apiError("reference solution missing", 422, "CODE_REFERENCE_MISSING");
  }
  return judgeSubmission({
    exerciseId: exercise.exercise_id,
    language: privateConfig.language || "c",
    sourceCode: privateConfig.referenceSolution,
  });
}

async function getPublicTests(exerciseId) {
  const tests = await listExerciseTests(exerciseId, { includeHidden: false });
  if (!tests.length) throw apiError("该练习尚未配置公开测试", 422, "CODE_PUBLIC_TESTS_NOT_CONFIGURED");
  return tests;
}

// 正式提交的判题用例：配置了参考题解与隐藏用例时按公开 + 隐藏判定，
// 否则退回只用公开用例判定（结果是自测口径，不冒充隐藏用例结论）。
async function resolveSubmitTests(exerciseId) {
  const tests = await listExerciseTests(exerciseId, { includeHidden: true });
  const publicTests = tests.filter((test) => test.visibility === "public");
  const hiddenTests = tests.filter((test) => test.visibility === "hidden");
  if (!publicTests.length) {
    throw apiError("该练习尚未配置公开测试", 422, "CODE_PUBLIC_TESTS_NOT_CONFIGURED");
  }
  const privateConfig = await getExercisePrivateConfig(exerciseId);
  if (!privateConfig || !privateConfig.referenceSolution || !hiddenTests.length) {
    return { tests: publicTests, judgedBy: "public_only" };
  }
  return { tests, judgedBy: "public_and_hidden" };
}

/**
 * 按 CODE_EXECUTION_MODE 选择执行器：
 *   docker → 容器隔离执行（服务器部署推荐）
 *   local  → 本机编译器直接执行（本机开发环境，无需 Docker）
 * 两者产出的结果结构完全一致，上层无需感知差异。
 */
async function executeRunner(task) {
  if (runnerOverride) return runnerOverride(task);
  const config = getCodeExecutionConfig();
  if (config.mode === "local") return runLocalTask(task, { config });
  return runDockerTask(task);
}

/** 当前生效的执行模式，用于接口回显（docker / local）。 */
function activeExecutionMode() {
  try {
    return getCodeExecutionConfig().mode;
  } catch {
    return "docker";
  }
}

function toApiResult(runnerResult, { mode, executionMode, includePublicStdout, judgedBy = "" }) {
  const compile = runnerResult.compile || {};
  const execution = runnerResult.execution || {};
  const cases = Array.isArray(execution.cases)
    ? execution.cases.map((item) => sanitizeCase(item, includePublicStdout))
    : [];
  const publicStdout = cases
    .filter((item) => item.visibility === "public" && item.stdout !== undefined)
    .map((item) => item.stdout)
    .join("\n");
  const status = compile.status === "compile_error" ? "compile_error" : normalizeStatus(execution.status);
  return {
    status: judgedBy === "custom_input" && status === "accepted" ? "success" : status,
    stdout: publicStdout,
    stderr: status === "runtime_error" ? firstPublicMessage(cases) : "",
    compileOutput: compile.status === "compile_error" ? sanitizeText(compile.message, 4096) : "",
    time: String(totalDuration(cases, compile.durationMs)),
    memory: "",
    mode,
    executionMode,
    judgedBy: judgedBy || (mode === "run" ? "public_only" : ""),
    passedCount: Number(execution.passedCount || 0),
    totalCount: Number(execution.totalCount || cases.length || 0),
    cases,
  };
}

function sanitizeCase(item = {}, includePublicStdout) {
  const visibility = item.visibility === "hidden" ? "hidden" : "public";
  const result = {
    id: sanitizeCaseId(item.id || "case"),
    visibility,
    status: normalizeStatus(item.status),
    message: visibility === "hidden" ? hiddenMessage(item.status) : sanitizeText(item.message, 240),
    durationMs: Number.isFinite(Number(item.durationMs)) ? Number(item.durationMs) : 0,
  };
  if (visibility === "public" && includePublicStdout) {
    result.stdout = sanitizeText(item.stdout, 4096);
    result.stderr = sanitizeText(item.stderr, 2048);
  }
  return result;
}

function hiddenMessage(status) {
  if (status === "accepted") return "hidden test accepted";
  if (status === "timeout") return "hidden test exceeded time limit";
  if (status === "output_limit") return "hidden test exceeded output limit";
  if (status === "runtime_error") return "hidden test failed at runtime";
  return "hidden test did not pass";
}

async function loadExercise(exerciseId) {
  const id = String(exerciseId || "").trim();
  if (!id) throw apiError("exerciseId 不能为空", 400, "INVALID_CODE_EXERCISE_ID");
  const exercise = await getPublishedExerciseById(id);
  if (!exercise) throw apiError("code exercise not found", 404, "CODE_EXERCISE_NOT_FOUND");
  return exercise;
}

function assertSupportedLanguage(language) {
  const normalized = String(language || "")
    .trim()
    .toLowerCase();
  if (normalized !== SUPPORTED_LANGUAGE) {
    throw apiError("当前 CodeLab 仅支持 C 语言", 400, "UNSUPPORTED_CODE_LANGUAGE");
  }
  return SUPPORTED_LANGUAGE;
}

function assertExerciseLanguage(exercise, language) {
  if (
    String(exercise.language || "")
      .trim()
      .toLowerCase() !== language
  ) {
    throw apiError("练习语言与提交语言不匹配", 400, "UNSUPPORTED_CODE_LANGUAGE");
  }
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  if (
    [
      "accepted",
      "wrong_answer",
      "compile_error",
      "runtime_error",
      "timeout",
      "output_limit",
      "internal_error",
    ].includes(status)
  ) {
    return status;
  }
  return "internal_error";
}

function firstPublicMessage(cases) {
  const item = cases.find((current) => current.visibility === "public" && current.message);
  return item ? item.message : "";
}

function totalDuration(cases, compileDuration) {
  return Number(compileDuration || 0) + cases.reduce((sum, item) => sum + Number(item.durationMs || 0), 0);
}

function sanitizeText(value, max) {
  return String(value || "")
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[path]")
    .replace(/\/(?:work|tmp|runner)\/[^\s"'<>]*/g, "[path]")
    .replace(/\b[0-9a-f]{12,64}\b/gi, "[id]")
    .slice(0, max);
}

function sanitizeCaseId(value) {
  return (
    String(value || "")
      .replace(/[^A-Za-z0-9_.:-]/g, "_")
      .slice(0, 80) || "case"
  );
}

function setCodeRunnerForTests(fn) {
  if (process.env.NODE_ENV !== "test") throw new Error("runner override is only available during tests");
  runnerOverride = fn;
}

function resetCodeRunnerForTests() {
  runnerOverride = null;
}

function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  SUPPORTED_LANGUAGE,
  assertSupportedLanguage,
  judgeSubmission,
  resetCodeRunnerForTests,
  runPublicCode,
  setCodeRunnerForTests,
  toApiResult,
  verifyReferenceSolution,
};
