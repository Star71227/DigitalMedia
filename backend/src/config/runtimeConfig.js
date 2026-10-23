/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const PLACEHOLDER_PATTERN = /^(?:请|change[-_ ]?me|replace[-_ ]?me|example|your[-_ ])/i;
const SUPPORTED_NODE_ENVS = new Set(["development", "test", "production"]);
/* local：用本机已安装的编译器（MSVC cl.exe）直接编译运行，
   适合本机开发环境；docker：用容器隔离运行，适合服务器部署。 */
const CODE_EXECUTION_MODES = new Set(["disabled", "docker", "local"]);

function isEnabled(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function isMissingOrPlaceholder(value) {
  const text = String(value || "").trim();
  return !text || PLACEHOLDER_PATTERN.test(text);
}

function positiveInteger(value, fallback, name) {
  const candidate = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate <= 0) {
    throw configError(`${name} must be a positive integer`);
  }
  return candidate;
}

function normalizeNodeEnv(value = "development") {
  const normalized = String(value || "development")
    .trim()
    .toLowerCase();
  if (!SUPPORTED_NODE_ENVS.has(normalized)) {
    throw configError("NODE_ENV must be development, test, or production");
  }
  return normalized;
}

function positiveNumber(value, fallback, name) {
  const candidate = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw configError(`${name} must be a positive number`);
  }
  return candidate;
}

function parseAllowedOrigins(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
}

function validateRuntimeConfig(env = process.env) {
  const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
  const production = nodeEnv === "production";
  const port = positiveInteger(env.PORT, 5800, "PORT");
  const dbPort = positiveInteger(env.DB_PORT, 3306, "DB_PORT");

  if (production && isMissingOrPlaceholder(env.DB_PASSWORD)) {
    throw configError("DB_PASSWORD is required in production and must not be an example value");
  }

  const jwtSecret = String(env.JWT_SECRET || "");
  if (production && (jwtSecret.length < 32 || isMissingOrPlaceholder(jwtSecret))) {
    throw configError("JWT_SECRET must contain at least 32 non-placeholder characters in production");
  }

  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (production && allowedOrigins.includes("*")) {
    throw configError("CORS_ALLOWED_ORIGINS must not contain '*' in production");
  }

  if (production && isEnabled(env.SEED_DEMO_DATA)) {
    const password = String(env.DEMO_PASSWORD || "").trim();
    if (password.length < 12 || isMissingOrPlaceholder(password)) {
      throw configError(
        "A strong DEMO_PASSWORD (at least 12 characters) is required when production demo seeding is enabled",
      );
    }
  }

  return {
    nodeEnv,
    production,
    port,
    dbPort,
    seedDemoData: isEnabled(env.SEED_DEMO_DATA),
    importKnowledgeOnStart: isEnabled(env.KNOWLEDGE_IMPORT_ON_START),
    aiEnabled: isEnabled(env.AI_ENABLED),
    allowedOrigins,
    codeExecution: getCodeExecutionConfig(env),
    teacherRegistrationEnabled: isTeacherRegistrationEnabled(env),
  };
}

function getCodeExecutionConfig(env = process.env) {
  const mode = String(env.CODE_EXECUTION_MODE || "disabled")
    .trim()
    .toLowerCase();
  if (!CODE_EXECUTION_MODES.has(mode)) {
    throw configError("CODE_EXECUTION_MODE must be disabled, docker or local");
  }

  const memory = String(env.CODE_RUNNER_MEMORY || "128m").trim();
  const memorySwap = String(env.CODE_RUNNER_MEMORY_SWAP || memory).trim();
  const image = String(env.CODE_RUNNER_IMAGE || "learnmate/code-runner-c:2.4a").trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,200}$/.test(image)) {
    throw configError("CODE_RUNNER_IMAGE contains unsupported characters");
  }
  if (!/^\d+[bkmgBKMG]?$/.test(memory) || !/^\d+[bkmgBKMG]?$/.test(memorySwap)) {
    throw configError("CODE_RUNNER_MEMORY values must be Docker memory strings");
  }

  return {
    mode,
    transport: env.CODE_RUNNER_TRANSPORT === "wsl" ? "wsl" : "native",
    wslDistribution: String(env.CODE_RUNNER_WSL_DISTRO || "Ubuntu-24.04"),
    image,
    memory,
    memorySwap,
    cpus: positiveNumber(env.CODE_RUNNER_CPUS, 0.5, "CODE_RUNNER_CPUS"),
    pidsLimit: positiveInteger(env.CODE_RUNNER_PIDS_LIMIT, 64, "CODE_RUNNER_PIDS_LIMIT"),
    nofileLimit: positiveInteger(env.CODE_RUNNER_NOFILE_LIMIT, 64, "CODE_RUNNER_NOFILE_LIMIT"),
    nprocLimit: positiveInteger(env.CODE_RUNNER_NPROC_LIMIT, 64, "CODE_RUNNER_NPROC_LIMIT"),
    maxSourceBytes: positiveInteger(env.CODE_RUNNER_MAX_SOURCE_BYTES, 65536, "CODE_RUNNER_MAX_SOURCE_BYTES"),
    maxInputBytes: positiveInteger(env.CODE_RUNNER_MAX_INPUT_BYTES, 32768, "CODE_RUNNER_MAX_INPUT_BYTES"),
    maxOutputBytes: positiveInteger(env.CODE_RUNNER_MAX_OUTPUT_BYTES, 65536, "CODE_RUNNER_MAX_OUTPUT_BYTES"),
    maxTests: positiveInteger(env.CODE_RUNNER_MAX_TESTS, 20, "CODE_RUNNER_MAX_TESTS"),
    compileTimeoutMs: positiveInteger(
      env.CODE_RUNNER_COMPILE_TIMEOUT_MS,
      5000,
      "CODE_RUNNER_COMPILE_TIMEOUT_MS",
    ),
    caseTimeoutMs: positiveInteger(env.CODE_RUNNER_CASE_TIMEOUT_MS, 2000, "CODE_RUNNER_CASE_TIMEOUT_MS"),
    totalTimeoutMs: positiveInteger(env.CODE_RUNNER_TOTAL_TIMEOUT_MS, 15000, "CODE_RUNNER_TOTAL_TIMEOUT_MS"),
    workTmpfsSize: String(env.CODE_RUNNER_WORK_TMPFS_SIZE || "64m").trim(),
    tmpTmpfsSize: String(env.CODE_RUNNER_TMP_TMPFS_SIZE || "16m").trim(),
    user: "10001:10001",
    /* --- local 模式专用 --- */
    visualStudio: String(env.CODE_RUNNER_VISUAL_STUDIO || "").trim(),
    localWorkDir: String(env.CODE_RUNNER_LOCAL_WORKDIR || "").trim(),
  };
}

function isTeacherRegistrationEnabled(env = process.env) {
  const value = String(env.TEACHER_REGISTRATION_MODE || "open")
    .trim()
    .toLowerCase();
  if (value !== "open" && value !== "closed") {
    throw configError("TEACHER_REGISTRATION_MODE must be open or closed");
  }
  return value === "open";
}

function configError(message) {
  const error = new Error(message);
  error.code = "INVALID_RUNTIME_CONFIG";
  return error;
}

module.exports = {
  getCodeExecutionConfig,
  isTeacherRegistrationEnabled,
  isEnabled,
  isMissingOrPlaceholder,
  normalizeNodeEnv,
  parseAllowedOrigins,
  validateRuntimeConfig,
};
