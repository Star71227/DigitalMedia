/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 本机执行器（CODE_EXECUTION_MODE=local）
 * ---------------------------------------------------------------------------
 * 用本机已安装的 C 编译器（优先 MSVC cl.exe）编译并运行学生代码，产出与
 * Docker 执行器完全一致的结果结构（protocolVersion / compile / execution），
 * 因此上层 codeJudgeService 无需区分两种模式。
 *
 * 适用场景：本机开发环境（没有可用 Docker 时也能在线判题）。
 * 隔离说明：容器模式有完整的 namespace/cgroup 隔离；本模式为进程级保护，
 * 提供「编译与用例超时 + 输出上限 + 进程树强杀」，请勿在不受信任的多用户
 * 服务器上使用，生产部署仍建议 CODE_EXECUTION_MODE=docker。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { getCodeExecutionConfig } = require("../config/runtimeConfig");
const {
  PROTOCOL_VERSION,
  normalizeTask,
  sanitizeRunnerResult,
  sanitizeDiagnostic,
  codeExecutionError,
  ensureText,
} = require("./dockerCodeRunnerService");

const DEFAULT_STDOUT_LIMIT = 64 * 1024;
const DEFAULT_STDERR_LIMIT = 32 * 1024;

let visualStudioCache = null;

/**
 * 安装包自带的便携 gcc（packaging\desktop\compiler → 装到 <root>\runtime\cc）。
 * 有它就完全不依赖 Docker / Visual Studio：任何一台 Windows 装完就能判题。
 * 路径来源优先级：环境变量 CODE_RUNNER_GCC_PATH → 进程工作目录（= 软件根目录）下的 runtime\cc。
 */
function findGcc(env = process.env) {
  const candidates = [
    ensureText(env.CODE_RUNNER_GCC_PATH).trim(),
    path.join(process.cwd(), "runtime", "cc", "bin", "gcc.exe"),
    path.join(path.dirname(process.execPath), "..", "runtime", "cc", "bin", "gcc.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return path.resolve(candidate);
    } catch {
      /* 忽略不可访问的路径 */
    }
  }
  return "";
}

/* ---------------------------------------------------------------- 工具链探测 */

/** 在若干候选根目录下查找 vcvars64.bat（Visual Studio 的编译环境脚本）。 */
function findVisualStudio(env = process.env) {
  if (visualStudioCache) return visualStudioCache;
  const explicit = ensureText(env.CODE_RUNNER_VISUAL_STUDIO).trim();
  const roots = [
    explicit,
    env.VSINSTALLDIR,
    env.VCINSTALLDIR,
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools",
  ].filter(Boolean);

  for (const root of roots) {
    const candidates = [
      path.join(root, "VC", "Auxiliary", "Build", "vcvars64.bat"),
      path.join(root, "VC", "Auxiliary", "Build", "vcvarsall.bat"),
      path.join(root, "vcvars64.bat"),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          visualStudioCache = candidate;
          return visualStudioCache;
        }
      } catch {
        /* 忽略不可访问的路径，继续找下一个 */
      }
    }
  }
  visualStudioCache = null;
  return null;
}

async function checkLocalAvailable(options = {}) {
  const env = options.env || process.env;
  const gcc = findGcc(env);
  if (gcc) return { available: true, compiler: "gcc", gcc };
  const vcvars = findVisualStudio(env);
  if (!vcvars) return { available: false, reason: "compiler_not_found" };
  return { available: true, compiler: "msvc", vcvars };
}

/* ---------------------------------------------------------------- 入口 */

async function runLocalTask(task, options = {}) {
  const config = options.config || getCodeExecutionConfig(options.env || process.env);
  if (config.mode !== "local") {
    throw codeExecutionError("Code execution is disabled", 503, "CODE_EXECUTION_UNAVAILABLE");
  }

  const env = options.env || process.env;
  const gcc = findGcc(env);
  const vcvars = gcc ? "" : findVisualStudio(env);
  if (!gcc && !vcvars) {
    throw codeExecutionError(
      "本机未找到 C 编译器（安装包自带 gcc 缺失，且没有 Visual Studio 的 cl.exe）",
      503,
      "CODE_EXECUTION_UNAVAILABLE",
    );
  }
  // 自带 gcc 时把它的 bin 加进 PATH：学生程序链接/运行时能找到随包的 DLL
  console.log(`[code-runner] local compiler = ${gcc ? "gcc" : "msvc"}${gcc ? ` (${gcc})` : ""}`);
  const compilerEnv = gcc ? { ...env, Path: `${path.dirname(gcc)};${env.Path || env.PATH || ""}` } : env;

  const normalized = normalizeTask(task, config);
  const workRoot = ensureWorkRoot(config);
  const workdir = fs.mkdtempSync(path.join(workRoot, "case-"));

  try {
    const sourcePath = path.join(workdir, "main.c");
    const binaryPath = path.join(workdir, "program.exe");
    fs.writeFileSync(sourcePath, normalized.sourceCode, { encoding: "utf8" });

    const compile = gcc
      ? await compileWithGcc({
          gcc,
          sourcePath,
          binaryPath,
          workdir,
          limits: normalized.limits,
          env: compilerEnv,
        })
      : await compileSource({
          vcvars,
          sourcePath,
          binaryPath,
          workdir,
          limits: normalized.limits,
          env: compilerEnv,
        });

    if (compile.status !== "success") {
      return sanitizeRunnerResult({
        protocolVersion: PROTOCOL_VERSION,
        compile,
        execution: {
          status: "compile_error",
          passedCount: 0,
          totalCount: normalized.tests.length,
          cases: [],
        },
      });
    }

    const cases = [];
    let passed = 0;
    let overall = "accepted";
    for (const [index, test] of normalized.tests.entries()) {
      const item = await runCase({
        binaryPath,
        workdir,
        test,
        index: index + 1,
        limits: normalized.limits,
        env: compilerEnv,
      });
      cases.push(item);
      if (item.status === "accepted") passed += 1;
      else {
        overall = item.status;
        break;
      }
    }

    return sanitizeRunnerResult({
      protocolVersion: PROTOCOL_VERSION,
      compile,
      execution: {
        status: overall,
        passedCount: passed,
        totalCount: normalized.tests.length,
        cases,
      },
    });
  } finally {
    removeDir(workdir);
  }
}

function ensureWorkRoot(config) {
  const configured = ensureText(config.localWorkDir).trim();
  const root = configured || path.join(os.tmpdir(), "learnmate-code-runner");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/* ---------------------------------------------------------------- 编译环境 */

let compileEnvCache = null;

/**
 * 解析 Visual Studio 的编译环境（PATH/INCLUDE/LIB/...）并缓存。
 * vcvars64.bat 每次启动约 1~2 秒，编译前加载一次即可，
 * 之后直接在带该环境变量的进程里调用 cl.exe，避免每个用例都付这份开销。
 */
async function resolveCompileEnv(vcvars, baseEnv) {
  if (compileEnvCache) return compileEnvCache;
  const dumpPath = path.join(os.tmpdir(), `learnmate-vcenv-${crypto.randomUUID()}.txt`);
  const batchPath = path.join(os.tmpdir(), `learnmate-vcenv-${crypto.randomUUID()}.cmd`);
  const lines = [
    "@echo off",
    `call "${vcvars}" >nul 2>&1`,
    "if errorlevel 1 exit /b 101",
    `set > "${dumpPath}"`,
  ];
  fs.writeFileSync(batchPath, `${lines.join("\r\n")}\r\n`, { encoding: "utf8" });

  try {
    const result = await runCommand({
      file: "cmd.exe",
      args: ["/d", "/s", "/c", batchPath],
      cwd: os.tmpdir(),
      timeoutMs: 60000,
      stdoutLimit: 8192,
      stderrLimit: 8192,
      env: baseEnv,
    });
    if (result.exitCode !== 0) return null;

    const parsed = {};
    const dump = fs.readFileSync(dumpPath, "utf8");
    for (const line of dump.split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0) continue;
      parsed[line.slice(0, index)] = line.slice(index + 1);
    }
    if (!parsed.Path && !parsed.PATH) return null;

    const merged = { ...baseEnv, ...parsed };
    /* Windows 环境变量名大小写不敏感，统一以 Path 为准，避免出现两份 PATH。 */
    merged.Path = parsed.Path || parsed.PATH;
    delete merged.PATH;
    compileEnvCache = merged;
    return compileEnvCache;
  } catch {
    return null;
  } finally {
    try {
      fs.rmSync(dumpPath, { force: true });
    } catch {
      /* 忽略 */
    }
    try {
      fs.rmSync(batchPath, { force: true });
    } catch {
      /* 忽略 */
    }
  }
}

/* ---------------------------------------------------------------- 编译 */

async function compileSource({ vcvars, sourcePath, binaryPath, workdir, limits, env }) {
  const started = Date.now();
  const compileEnv = await resolveCompileEnv(vcvars, env);
  if (!compileEnv) {
    return { status: "compile_error", message: "无法初始化 C 编译环境", durationMs: Date.now() - started };
  }

  const result = await runCommand({
    file: "cl.exe",
    args: ["/nologo", "/std:c11", "/O2", "/W3", "main.c", `/Fe:program.exe`, `/Fo:obj_`],
    cwd: workdir,
    timeoutMs: Math.max(limits.compileTimeoutMs, 15000),
    stdoutLimit: 64 * 1024,
    stderrLimit: 64 * 1024,
    env: compileEnv,
  });

  const durationMs = Date.now() - started;
  if (result.timedOut) {
    return { status: "compile_error", message: "compile timeout", durationMs };
  }

  const rawMessage = decodeCompilerOutput(`${result.stdout || ""}${result.stderr || ""}`).trim();
  const success = result.exitCode === 0 && fs.existsSync(binaryPath);
  return {
    status: success ? "success" : "compile_error",
    message: success ? "" : sanitizeDiagnostic(cleanCompilerMessage(rawMessage)) || "编译失败",
    durationMs,
  };
}

/** 用随包的 gcc 编译：-std=c11 保持与云端 runner 一致的口径，-static 让产物不依赖 DLL。 */
async function compileWithGcc({ gcc, sourcePath, binaryPath, workdir, limits, env }) {
  const started = Date.now();
  const result = await runCommand({
    file: gcc,
    args: ["-std=c11", "-O2", "-static", "-o", binaryPath, sourcePath],
    cwd: workdir,
    timeoutMs: Math.max(limits.compileTimeoutMs, 20000),
    stdoutLimit: 64 * 1024,
    stderrLimit: 64 * 1024,
    env,
  });

  const durationMs = Date.now() - started;
  if (result.timedOut) {
    return { status: "compile_error", message: "compile timeout", durationMs };
  }
  const rawMessage = decodeCompilerOutput(`${result.stdout || ""}${result.stderr || ""}`).trim();
  const success = result.exitCode === 0 && fs.existsSync(binaryPath);
  return {
    status: success ? "success" : "compile_error",
    message: success ? "" : sanitizeDiagnostic(cleanCompilerMessage(rawMessage)) || "编译失败",
    durationMs,
  };
}

/** MSVC 的诊断里带着本机绝对路径，去掉以免泄露环境信息。 */
function cleanCompilerMessage(text) {
  return ensureText(text)
    .replace(/[A-Za-z]:\\[^\s"']*\\/g, "")
    .replace(/\s+in\s+"[^"]*"/g, "")
    .trim()
    .slice(0, 4096);
}

/**
 * 中文 Windows 上 MSVC 的诊断信息是 GBK 编码，按 UTF-8 读会变成乱码，
 * 学生根本看不懂错误在哪。这里识别乱码特征后按 GBK 重新解码。
 * 输入是 runCommand 以 "binary" 收集的原始字节串。
 */
function decodeCompilerOutput(binaryText) {
  const text = ensureText(binaryText);
  if (!text) return "";
  const utf8 = Buffer.from(text, "binary").toString("utf8");
  // U+FFFD 表示 UTF-8 解码失败；成片的拉丁补充区字符也是 GBK 被误读的特征
  const looksGarbled = utf8.includes("\uFFFD") || /[\u00C0-\u00FF]{2,}/.test(utf8);
  if (!looksGarbled) return utf8;
  try {
    const iconv = require("iconv-lite");
    if (iconv && typeof iconv.decode === "function") {
      const decoded = iconv.decode(Buffer.from(text, "binary"), "gbk");
      return decoded && !decoded.includes("\uFFFD") ? decoded : utf8;
    }
  } catch {
    /* 没有 iconv-lite 时退回 UTF-8 结果 */
  }
  return utf8;
}

/** 学生程序的输出按 UTF-8 解释（源码与 printf 都是 UTF-8）。 */
function decodeProgramOutput(binaryText) {
  return Buffer.from(ensureText(binaryText), "binary").toString("utf8");
}

/* ---------------------------------------------------------------- 运行单个用例 */

async function runCase({ binaryPath, workdir, test, index, limits, env }) {
  const started = Date.now();
  const result = await runCommand({
    file: binaryPath,
    args: [],
    cwd: workdir,
    input: test.input,
    timeoutMs: limits.caseTimeoutMs,
    stdoutLimit: limits.maxOutputBytes || DEFAULT_STDOUT_LIMIT,
    stderrLimit: Math.min(limits.maxOutputBytes || DEFAULT_STDERR_LIMIT, DEFAULT_STDERR_LIMIT),
    env,
  });

  const durationMs = Date.now() - started;
  const stdoutText = decodeProgramOutput(result.stdout);
  const stderrText = decodeProgramOutput(result.stderr);
  const expected = test.expectedOutput;

  let status;
  let message;
  if (result.timedOut) {
    status = "timeout";
    message = "time limit exceeded";
  } else if (result.stdoutOverflow || result.stderrOverflow) {
    status = "output_limit";
    message = "output limit exceeded";
  } else if (result.exitCode !== 0) {
    status = "runtime_error";
    message = `program exited with code ${result.exitCode}`;
  } else if (!test.compareOutput || normalizeOutput(stdoutText) === normalizeOutput(expected)) {
    status = "accepted";
    message = "";
  } else {
    status = "wrong_answer";
    message = "output did not match expected result";
  }

  const item = {
    id: ensureText(test.id || `case-${index}`),
    visibility: test.visibility,
    status,
    message: message || status,
    durationMs,
  };
  if (test.visibility === "public") {
    item.stdout = truncateText(stdoutText, 4096);
    item.stderr = truncateText(stderrText, 2048);
  }
  return item;
}

/* ---------------------------------------------------------------- 进程执行 */

/**
 * 执行外部命令并按上限收集输出。
 * 超时会强杀整棵进程树，避免学生代码 fork 出的子进程残留。
 */
function runCommand({ file, args, cwd, input = "", timeoutMs, stdoutLimit, stderrLimit, env }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: env || process.env,
      });
    } catch (error) {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: error.message,
        timedOut: false,
        stdoutOverflow: false,
        stderrOverflow: false,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let stdoutOverflow = false;
    let stderrOverflow = false;
    let timedOut = false;
    let settled = false;

    const append = (current, chunk, limit, overflow) => {
      if (overflow) return { text: current, overflow: true };
      // 用 binary 收集原始字节，交给上层按各自编码解码（编译器 GBK / 程序 UTF-8）
      const next = current + chunk.toString("binary");
      if (next.length > limit) return { text: next.slice(0, limit), overflow: true };
      return { text: next, overflow: false };
    };

    const killTree = () => {
      if (!child || child.killed) return;
      if (process.platform === "win32" && child.pid) {
        try {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        } catch {
          child.kill();
        }
      } else {
        child.kill("SIGKILL");
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      const next = append(stdout, chunk, stdoutLimit, stdoutOverflow);
      stdout = next.text;
      stdoutOverflow = next.overflow;
      if (stdoutOverflow) killTree();
    });
    child.stderr.on("data", (chunk) => {
      const next = append(stderr, chunk, stderrLimit, stderrOverflow);
      stderr = next.text;
      stderrOverflow = next.overflow;
      if (stderrOverflow) killTree();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout,
        stderr: ensureText(error.message),
        timedOut,
        stdoutOverflow,
        stderrOverflow,
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut, stdoutOverflow, stderrOverflow });
    });

    try {
      child.stdin.end(input);
    } catch {
      /* 进程可能已经退出，忽略写入失败 */
    }
  });
}

/* ---------------------------------------------------------------- 输出比较与清洗 */

/** 与容器执行器一致的比较规则：统一换行、忽略行尾空白、忽略末尾空行。 */
function normalizeOutput(value) {
  const text = ensureText(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function truncateText(value, limit) {
  const text = ensureText(value);
  return text.length > limit ? `${text.slice(0, limit)}...truncated` : text;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    /* 临时目录清理失败不影响判题结果 */
  }
}

module.exports = {
  runLocalTask,
  checkLocalAvailable,
  findVisualStudio,
  findGcc,
  normalizeOutput,
};
