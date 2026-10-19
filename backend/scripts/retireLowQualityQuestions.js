#!/usr/bin/env node
/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 下架「元描述式」低质量题目。
 *
 * 背景：题库里有一批早期 AI 生成的单选题，选项是
 * 「…需要结合定义、适用条件和典型场景理解。」「…只需要记住名称，不需要关注使用条件。」
 * 「…在所有题目中都没有边界情况。」这类空话，学生无论怎么选都学不到东西，
 * 出现在「知识检测」里观感很差。
 *
 * 本脚本只做一件事：把命中这些空话特征的题目标为未发布（is_published = 0），
 * 学生自测与组卷不会再抽到；题目本身仍在库里，可用 --restore 一键恢复。
 *
 * 用法：
 *   node scripts/retireLowQualityQuestions.js --dry-run   # 只看命中多少
 *   node scripts/retireLowQualityQuestions.js             # 下架（先写备份）
 *   node scripts/retireLowQualityQuestions.js --restore   # 按备份恢复
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const mysql = require("mysql2/promise");

const BACKUP = path.join(__dirname, "..", "data", "question-banks", "retired-low-quality-questions.json");
const PATTERNS = [
  "结合定义",
  "适用条件",
  "典型场景",
  "没有关联",
  "不需要关注",
  "只需记住",
  "没有任何边界",
  "不用关注使用条件",
];

function pool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 3,
  });
}

async function findLowQuality(db) {
  const where = PATTERNS.map(
    () => "(option_a LIKE ? OR option_b LIKE ? OR option_c LIKE ? OR option_d LIKE ?)",
  ).join(" OR ");
  const params = PATTERNS.flatMap((pattern) => Array(4).fill(`%${pattern}%`));
  const [rows] = await db.query(
    `SELECT question_id, subject, chapter, knowledge_point, stem, option_a, option_b, option_c, option_d, answer, analysis, is_published
       FROM question_bank WHERE (${where})`,
    params,
  );
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const restore = args.includes("--restore");
  const db = pool();

  if (restore) {
    if (!fs.existsSync(BACKUP)) {
      console.error("找不到备份文件：", BACKUP);
      process.exit(1);
    }
    const backup = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
    const ids = backup.questions.map((item) => item.question_id);
    let restored = 0;
    for (const id of ids) {
      await db.query("UPDATE question_bank SET is_published = 1 WHERE question_id = ?", [id]);
      restored += 1;
    }
    console.log(`已恢复 ${restored} 道题目的发布状态（备份：${BACKUP}）`);
    await db.end();
    return;
  }

  const rows = await findLowQuality(db);
  const bySubject = rows.reduce((acc, row) => {
    acc[row.subject] = (acc[row.subject] || 0) + 1;
    return acc;
  }, {});
  console.log(`命中「元描述式」低质量题目 ${rows.length} 道：`, JSON.stringify(bySubject));
  if (dryRun) {
    rows
      .slice(0, 5)
      .forEach((row) =>
        console.log(
          ` - ${row.question_id} ${String(row.stem).slice(0, 50)}… | A: ${String(row.option_a).slice(0, 40)}`,
        ),
      );
    await db.end();
    return;
  }

  const toRetire = rows.filter((row) => Number(row.is_published) === 1);
  fs.writeFileSync(
    BACKUP,
    JSON.stringify(
      {
        retiredAt: new Date().toISOString(),
        reason: "元描述式选项，内容空洞",
        patterns: PATTERNS,
        questions: toRetire,
      },
      null,
      2,
    ),
    "utf8",
  );
  let retired = 0;
  for (const row of toRetire) {
    await db.query("UPDATE question_bank SET is_published = 0 WHERE question_id = ?", [row.question_id]);
    retired += 1;
  }
  console.log(`已下架 ${retired} 道（备份：${BACKUP}，可用 --restore 恢复）`);
  await db.end();
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
