/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
  ],
  quiet: true,
});

const app = require("./app");
const { validateRuntimeConfig } = require("./config/runtimeConfig");
const { missingLocalDevOrigins } = require("./config/corsConfig");
const { prepareApplication, installShutdownHandlers } = require("./services/startupService");

// 本地开发端口不在白名单时给出明确告警：浏览器里的登录与提交请求会被 403 拒绝。
function warnOnMissingLocalDevOrigins() {
  try {
    const missing = missingLocalDevOrigins();
    if (!missing.length) return;
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "cors_local_origins_missing",
        message:
          "CORS 白名单里没有本地开发端口，浏览器中的登录与提交请求会被 403 拒绝；请补进 .env 的 CORS_ALLOWED_ORIGINS，或改用 start-learnmate-local.ps1 / 重启LearnMate.bat 启动。",
        missingOrigins: missing,
      }),
    );
  } catch {
    // 自检失败不影响服务启动
  }
}

async function startServer() {
  const config = validateRuntimeConfig();
  await prepareApplication(config);
  const host = String(process.env.HOST || "0.0.0.0");

  const server = app.listen(config.port, host, () => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "server_started",
        host,
        port: config.port,
        environment: config.nodeEnv,
      }),
    );
    warnOnMissingLocalDevOrigins();
  });

  server.on("error", (error) => {
    console.error(
      JSON.stringify({ level: "error", event: "server_error", message: String(error.message).slice(0, 160) }),
    );
    process.exitCode = 1;
  });
  installShutdownHandlers(server);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "startup_failed",
        code: String(error.code || "STARTUP_FAILED"),
        message: String(error.message).slice(0, 200),
      }),
    );
    process.exit(1);
  });
}

module.exports = { startServer };
