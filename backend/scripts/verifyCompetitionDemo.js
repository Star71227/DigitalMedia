/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const path = require("path");
require("dotenv").config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});
const { initDB } = require("../src/config/initDB");
const { pool } = require("../src/config/db");
const { verifyCompetitionDemo } = require("../src/services/competitionDemoService");

async function main() {
  if (!(await initDB())) throw new Error("Database initialization failed");
  const result = await verifyCompetitionDemo();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
  return result;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { main };
