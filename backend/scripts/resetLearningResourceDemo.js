/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const path = require("path");
require("dotenv").config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});
const fs = require("fs/promises");
const { initDB } = require("../src/config/initDB");
const { pool } = require("../src/config/db");
const { STORAGE_ROOT } = require("../src/services/resourceStorageService");
async function main() {
  if (!(await initDB())) throw new Error("数据库初始化失败");
  const username = process.argv[2] || "zhangsan";
  const [[user]] = await pool.query("SELECT id FROM users WHERE username=? LIMIT 1", [username]);
  if (!user) throw new Error(`未找到账号 ${username}`);
  const connection = await pool.getConnection();
  let directories = [];
  try {
    await connection.beginTransaction();
    const [files] = await connection.query(
      "SELECT storage_path FROM learning_resource_files WHERE student_id=?",
      [user.id],
    );
    directories = [...new Set(files.map((f) => f.storage_path.split("/").slice(0, 2).join("/")))];
    await connection.query("DELETE FROM learning_resource_progress WHERE student_id=?", [user.id]);
    await connection.query("DELETE FROM learning_resource_stage_links WHERE student_id=?", [user.id]);
    await connection.query("DELETE FROM learning_resource_files WHERE student_id=?", [user.id]);
    await connection.query("DELETE FROM learning_resource_versions WHERE student_id=?", [user.id]);
    await connection.query("DELETE FROM learning_resources WHERE student_id=?", [user.id]);
    await connection.commit();
    for (const directory of directories)
      await fs.rm(path.join(STORAGE_ROOT, directory), { recursive: true, force: true });
    console.log(`已复位 ${username} 的学习资源数据`);
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
