/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { getCodeExecutionConfig } = require("../config/runtimeConfig");

const PROTOCOL_VERSION = "code-runner-c.v1";
const DOCKER_BIN = "docker";
const STDOUT_LIMIT = 512 * 1024;
const STDERR_LIMIT = 64 * 1024;
const NAME_PREFIX = "learnmate-code-runner-";

async function runDockerTask(task, options = {}) {
  const config = options.config || getCodeExecutionConfig(options.env || process.env);
  if (config.mode !== "docker") {
    throw codeExecutionError("Code execution is disabled", 503, "CODE_EXECUTION_UNAVAILABLE");
  }

  const normalizedTask = normalizeTask(task, config);
  const containerName = buildContainerName();
  const args = buildDockerRunArgs({ containerName, config });
  const payload = JSON.stringify(normalizedTask);
  const runner = options.spawnFn || spawn;
  const command = dockerCommand(config, args);
  let spawned = false;

  try {
    const result = await runProcess({
      runner,
      args: command.args,
      file: command.file,
      input: payload,
      timeoutMs: config.totalTimeoutMs + 3000,
    });
    spawned = true;

    if (result.timedOut) {
      throw codeExecutionError("Code execution timed out", 503, "CODE_EXECUTION_UNAVAILABLE");
    }
    if (result.exitCode !== 0 && !result.stdout.trim()) {
      throw codeExecutionError(
        sanitizeDiagnostic(result.stderr || "Runner container failed"),
        503,
        "CODE_EXECUTION_UNAVAILABLE",
      );
    }

    return normalizeRunnerResult(result.stdout);
  } finally {
    await cleanupContainer(containerName, options.execFileFn || execFile, config).catch(() => undefined);
    if (!spawned && options.onCleanup) options.onCleanup(containerName);
  }
}

function buildDockerRunArgs({ containerName, config }) {
  return [
    "run",
    "--name",
    containerName,
    "--rm",
    "-i",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    String(config.pidsLimit),
    "--memory",
    config.memory,
    "--memory-swap",
    config.memorySwap,
    "--cpus",
    String(config.cpus),
    "--user",
    config.user,
    "--tmpfs",
    `/work:rw,exec,nosuid,nodev,mode=1777,size=${config.workTmpfsSize}`,
    "--tmpfs",
    `/tmp:rw,noexec,nosuid,nodev,size=${config.tmpTmpfsSize}`,
    "--ulimit",
    `nofile=${config.nofileLimit}:${config.nofileLimit}`,
    "--ulimit",
    `nproc=${config.nprocLimit}:${config.nprocLimit}`,
    config.image,
  ];
}

async function checkDockerAvailable(options = {}) {
  const config = options.config || getCodeExecutionConfig(options.env || process.env);
  if (config.mode !== "docker") return { available: false, reason: "disabled" };
  const execFileFn = options.execFileFn || execFile;
  try {
    const command = dockerCommand(config, ["info", "--format", "{{json .}}"]);
    const info = await execFileJson(execFileFn, [command.file, command.args], 5000);
    if (info.OSType !== "linux") return { available: false, reason: "docker_not_linux" };
    const imageCommand = dockerCommand(config, [
      "image",
      "inspect",
      config.image,
      "--format",
      "{{json .Id}}",
    ]);
    try {
      await execFileJson(execFileFn, [imageCommand.file, imageCommand.args], 5000);
    } catch {
      return { available: false, reason: "runner_image_missing" };
    }
    return { available: true, info };
  } catch (error) {
    return { available: false, reason: "docker_unavailable" };
  }
}

function normalizeTask(task, config) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw codeExecutionError("Invalid runner task", 500, "CODE_EXECUTION_INTERNAL_ERROR");
  }
  const sourceCode = ensureText(task.sourceCode);
  const sourceBytes = Buffer.byteLength(sourceCode, "utf8");
  if (!sourceCode) throw codeExecutionError("源码不能为空", 400, "EMPTY_CODE_SOURCE");
  if (sourceBytes > config.maxSourceBytes) {
    throw codeExecutionError("源码超过长度限制", 400, "CODE_SOURCE_TOO_LARGE");
  }

  const tests = normalizeTests(task.tests, config);
  return {
    protocolVersion: PROTOCOL_VERSION,
    language: "c",
    sourceCode,
    tests,
    limits: {
      maxSourceBytes: config.maxSourceBytes,
      maxInputBytes: config.maxInputBytes,
      maxOutputBytes: config.maxOutputBytes,
      maxTests: config.maxTests,
      compileTimeoutMs: config.compileTimeoutMs,
      caseTimeoutMs: config.caseTimeoutMs,
    },
  };
}

function normalizeTests(tests, config) {
  if (!Array.isArray(tests) || tests.length < 1) {
    throw codeExecutionError("未配置可运行测试", 422, "CODE_TESTS_NOT_CONFIGURED");
  }
  if (tests.length > config.maxTests) {
    throw codeExecutionError("测试数量超过限制", 400, "CODE_TEST_COUNT_LIMIT");
  }

  return tests.map((test, index) => {
    const input = ensureText(test.input);
    const expectedOutput = ensureText(test.expectedOutput);
    if (Buffer.byteLength(input, "utf8") > config.maxInputBytes) {
      throw codeExecutionError("测试输入超过限制", 400, "CODE_TEST_INPUT_TOO_LARGE");
    }
    return {
      id: sanitizeCaseId(test.id || `${test.visibility || "case"}-${index + 1}`),
      visibility: test.visibility === "hidden" ? "hidden" : "public",
      input,
      expectedOutput,
      compareOutput: test.visibility === "hidden" ? true : test.compareOutput !== false,
    };
  });
}

function normalizeRunnerResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw codeExecutionError("Runner returned invalid output", 503, "CODE_EXECUTION_UNAVAILABLE");
  }
  if (!parsed || parsed.protocolVersion !== PROTOCOL_VERSION || !parsed.compile || !parsed.execution) {
    throw codeExecutionError("Runner returned an invalid result", 503, "CODE_EXECUTION_UNAVAILABLE");
  }
  return sanitizeRunnerResult(parsed);
}

function sanitizeRunnerResult(result) {
  const compile = result.compile || {};
  const execution = result.execution || {};
  return {
    protocolVersion: PROTOCOL_VERSION,
    compile: {
      status: safeStatus(compile.status),
      message: sanitizeDiagnostic(compile.message || ""),
      durationMs: finiteNumber(compile.durationMs),
    },
    execution: {
      status: safeStatus(execution.status),
      passedCount: finiteNumber(execution.passedCount),
      totalCount: finiteNumber(execution.totalCount),
      cases: Array.isArray(execution.cases) ? execution.cases.map(sanitizeCase) : [],
    },
  };
}

function sanitizeCase(item = {}) {
  const visibility = item.visibility === "hidden" ? "hidden" : "public";
  const result = {
    id: sanitizeCaseId(item.id || "case"),
    visibility,
    status: safeStatus(item.status),
    message: sanitizeDiagnostic(item.message || ""),
    durationMs: finiteNumber(item.durationMs),
  };
  if (visibility === "public") {
    result.stdout = truncate(ensureText(item.stdout), 4096);
    result.stderr = sanitizeDiagnostic(item.stderr || "");
  }
  return result;
}

function dockerCommand(config, args) {
  return config.transport === "wsl"
    ? {
        file: "wsl.exe",
        args: ["-d", config.wslDistribution || "Ubuntu-24.04", "--user", "root", "--exec", "docker", ...args],
      }
    : { file: DOCKER_BIN, args };
}

function runProcess({ runner, file = DOCKER_BIN, args, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = runner(file, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(codeExecutionError(sanitizeDiagnostic(error.message), 503, "CODE_EXECUTION_UNAVAILABLE"));
    });
    // Docker may fail before reading stdin (missing image/daemon). EPIPE must
    // not crash the entire learning backend.
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk, STDOUT_LIMIT);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk, STDERR_LIMIT);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
    child.stdin.end(input);
  });
}

function cleanupContainer(containerName, execFileFn, config) {
  const command = dockerCommand(config, ["rm", "-f", containerName]);
  return new Promise((resolve) => {
    execFileFn(command.file, command.args, { shell: false, windowsHide: true, timeout: 5000 }, () =>
      resolve(),
    );
  });
}

function execFileJson(execFileFn, command, timeoutMs) {
  const [file, args] = command;
  return new Promise((resolve, reject) => {
    execFileFn(file, args, { shell: false, windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
      if (error) return reject(error);
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function buildContainerName() {
  return `${NAME_PREFIX}${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function appendLimited(current, chunk, limit) {
  const next = current + chunk.toString("utf8");
  return next.length > limit ? next.slice(0, limit) : next;
}

function sanitizeDiagnostic(value) {
  return truncate(
    ensureText(value)
      .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[path]")
      .replace(/\/(?:work|tmp|runner)\/[^\s"'<>]*/g, "[path]")
      .replace(/\b[0-9a-f]{12,64}\b/gi, "[id]")
      .replace(/docker\s+run\s+[^\r\n]*/gi, "docker command hidden"),
    4096,
  );
}

function safeStatus(value) {
  const status = ensureText(value);
  return /^[a-z_]{3,40}$/.test(status) ? status : "internal_error";
}

function sanitizeCaseId(value) {
  return (
    ensureText(value)
      .replace(/[^A-Za-z0-9_.:-]/g, "_")
      .slice(0, 80) || "case"
  );
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function truncate(value, max) {
  const text = ensureText(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function ensureText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function codeExecutionError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  PROTOCOL_VERSION,
  buildDockerRunArgs,
  dockerCommand,
  checkDockerAvailable,
  codeExecutionError,
  runDockerTask,
  sanitizeDiagnostic,
  /* 供本地执行器（localCodeRunnerService）复用同一套任务归一化与清洗逻辑，
     保证两种执行模式产出的结果结构完全一致。 */
  normalizeTask,
  sanitizeRunnerResult,
  ensureText,
};
