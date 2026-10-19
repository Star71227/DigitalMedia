/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 导入 94 道题的判题升级数据（starter 读 stdin 版 + 参考题解 + 1 公开 + 3 隐藏用例）。
 * 数据来源：backend/data/code-judge-upgrade.json（期望输出由参考题解在判题容器里真实跑出，
 * 并与原 sample_output 逐字校验过）。
 *
 * 用法：npm run seed:code-judge-upgrade        （先备份再写入）
 *       npm run seed:code-judge-upgrade -- --dry-run
 */
const fs = require("fs");
const path = require("path");

const candidates = [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")];
require("dotenv").config({ path: candidates, quiet: true });

const { pool } = require("../src/config/db");

const DATA_FILE = path.resolve(__dirname, "../data/code-judge-upgrade.json");
const JUDGE_CONFIG = JSON.stringify({
  judgeVersion: "2.4a-c-v1",
  outputComparison: "line_endings_and_trailing_line_space",
});
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  console.log(`判题升级数据：${rows.length} 道题`);

  if (DRY_RUN) {
    const sample = rows[0];
    console.log(
      `[dry-run] 示例：${sample.exercise_id} 公开 ${sample.public_cases.length} 条 / 隐藏 ${sample.hidden_cases.length} 条`,
    );
    return;
  }

  const backup = { takenAt: new Date().toISOString(), exercises: [], testCases: [], privateRows: [] };
  const ids = rows.map((row) => row.exercise_id);

  const [exerciseRows] = await pool.query(
    "SELECT exercise_id, description, starter_code, sample_input, sample_output FROM code_exercises WHERE exercise_id IN (?)",
    [ids],
  );
  const [caseRows] = await pool.query(
    "SELECT exercise_id, visibility, input_text, expected_output, order_index FROM code_test_cases WHERE exercise_id IN (?)",
    [ids],
  );
  const [privateRows] = await pool.query(
    "SELECT exercise_id, language, reference_solution, judge_config_json FROM code_exercise_private WHERE exercise_id IN (?)",
    [ids],
  );
  backup.exercises = exerciseRows;
  backup.testCases = caseRows;
  backup.privateRows = privateRows;

  const backupDir = path.resolve(__dirname, "../backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `code-judge-upgrade-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");
  console.log(`已备份原数据：${backupFile}`);

  let imported = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const row of rows) {
      await connection.query(
        "UPDATE code_exercises SET description=?, starter_code=?, sample_input=?, sample_output=? WHERE exercise_id=?",
        [row.description, row.starter_code, row.sample_input, row.sample_output, row.exercise_id],
      );
      await connection.query(
        `INSERT INTO code_exercise_private (exercise_id, language, reference_solution, judge_config_json)
         VALUES (?, 'c', ?, ?)
         ON DUPLICATE KEY UPDATE language=VALUES(language), reference_solution=VALUES(reference_solution), judge_config_json=VALUES(judge_config_json)`,
        [row.exercise_id, row.reference_solution, JUDGE_CONFIG],
      );
      await connection.query("DELETE FROM code_test_cases WHERE exercise_id=?", [row.exercise_id]);
      let order = 0;
      for (const test of row.public_cases) {
        order += 1;
        await connection.query(
          "INSERT INTO code_test_cases (exercise_id, visibility, input_text, expected_output, order_index) VALUES (?, 'public', ?, ?, ?)",
          [row.exercise_id, test.input, test.expected_output, order],
        );
      }
      order = 0;
      for (const test of row.hidden_cases) {
        order += 1;
        await connection.query(
          "INSERT INTO code_test_cases (exercise_id, visibility, input_text, expected_output, order_index) VALUES (?, 'hidden', ?, ?, ?)",
          [row.exercise_id, test.input, test.expected_output, order],
        );
      }
      imported += 1;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  console.log(`导入完成：${imported} 道题（每题 1 条公开 + 3 条隐藏用例 + 1 份参考题解）`);
  console.log("提示：脚本幂等，可重复执行；回滚用上面那份 backups/code-judge-upgrade-backup-*.json。");
}

main()
  .catch((error) => {
    console.error("导入失败：", error.message || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => undefined));
