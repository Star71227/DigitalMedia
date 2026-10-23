/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({
  path: [path.join(__dirname, "../../../.env"), path.join(__dirname, "../../.env")],
  quiet: true,
});

function assertDatabaseConfig() {
  if (
    !Object.prototype.hasOwnProperty.call(process.env, "DB_PASSWORD") ||
    !String(process.env.DB_PASSWORD).length
  ) {
    const error = new Error(
      "DB_PASSWORD is required. Configure it through the environment or backend/.env; no default password is used.",
    );
    error.code = "DB_PASSWORD_REQUIRED";
    throw error;
  }
}

function getDatabaseName() {
  return process.env.DB_NAME || "edusmart";
}

const databaseConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: getDatabaseName(),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
};

const pool = mysql.createPool(databaseConfig);

module.exports = {
  pool,
  databaseConfig,
  getDatabaseName,
  assertDatabaseConfig,
};
