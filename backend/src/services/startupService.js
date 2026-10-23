/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { initDB } = require("../config/initDB");
const { pool } = require("../config/db");
const { checkStorage } = require("./healthService");
const { importBundledKnowledgeBase } = require("./knowledgeBootstrapService");
const { seedCompetitionDemo } = require("./competitionDemoService");

async function initializeWithRetry({
  attempts = Number(process.env.DB_INIT_MAX_ATTEMPTS || 15),
  retryMs = Number(process.env.DB_INIT_RETRY_MS || 2000),
  initialize = initDB,
  onRetry = defaultRetryLogger,
} = {}) {
  const maxAttempts = normalizePositiveInteger(attempts, 15);
  const delayMs = normalizeNonNegativeInteger(retryMs, 2000);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (await initialize()) return true;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }
    if (attempt < maxAttempts) {
      onRetry({ attempt, maxAttempts, retryMs: delayMs });
      await delay(delayMs);
    }
  }
  throw startupError(`Database initialization failed after ${maxAttempts} attempts`);
}

async function prepareApplication(config) {
  await initializeWithRetry();
  await checkStorage();
  if (config.importKnowledgeOnStart) await importBundledKnowledgeBase();
  if (config.seedDemoData) {
    await seedCompetitionDemo({ importKnowledge: !config.importKnowledgeOnStart });
  }
}

function installShutdownHandlers(server, { database = pool, timeoutMs = 10_000 } = {}) {
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
    const forceTimer = setTimeout(() => {
      console.error(JSON.stringify({ level: "error", event: "shutdown_timeout" }));
      process.exit(1);
    }, timeoutMs);
    forceTimer.unref();
    try {
      if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await database.end();
      clearTimeout(forceTimer);
      console.log(JSON.stringify({ level: "info", event: "shutdown_complete" }));
      process.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      console.error(
        JSON.stringify({
          level: "error",
          event: "shutdown_failed",
          message: String(error.message).slice(0, 160),
        }),
      );
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return shutdown;
}

function defaultRetryLogger({ attempt, maxAttempts, retryMs }) {
  console.warn(JSON.stringify({ level: "warn", event: "database_wait", attempt, maxAttempts, retryMs }));
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}
function startupError(message) {
  const error = new Error(message);
  error.code = "STARTUP_FAILED";
  return error;
}

module.exports = { initializeWithRetry, prepareApplication, installShutdownHandlers };
