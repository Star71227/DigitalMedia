#!/usr/bin/env node
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 把 data/question-banks/generated/*.json 里归档的题目导入 question_bank。
 *
 * 用途：新环境（例如刚部署的服务器数据库）不想重新跑模型出题时，
 * 直接用这份归档把「AI 复核通过」的题目补进去；重复执行安全（按 question_id upsert）。
 *
 * 用法：
 *   node scripts/importGeneratedQuestions.js            # 导入全部
 *   node scripts/importGeneratedQuestions.js --dry-run  # 只统计不写库
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const mysql = require("mysql2/promise");

const DIR = path.join(__dirname, "..", "data", "question-banks", "generated");

function pool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((name) => name.endsWith(".json")) : [];
  if (!files.length) {
    console.log("没有找到归档文件：", DIR);
    return;
  }
  const db = dryRun ? null : pool();

  const sql = `INSERT INTO question_bank
    (question_id, subject, chapter, knowledge_point, question_type, difficulty, stem, code_context,
     option_a, option_b, option_c, option_d, answer, analysis, hint, ability_dimension, tags, stage,
     is_core, source, owner_student_id, source_verified_at, is_published, owner_teacher_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),1,NULL)
    ON DUPLICATE KEY UPDATE subject=VALUES(subject), chapter=VALUES(chapter), knowledge_point=VALUES(knowledge_point),
      question_type=VALUES(question_type), difficulty=VALUES(difficulty), stem=VALUES(stem), answer=VALUES(answer),
      analysis=VALUES(analysis), hint=VALUES(hint), option_a=VALUES(option_a), option_b=VALUES(option_b),
      option_c=VALUES(option_c), option_d=VALUES(option_d), tags=VALUES(tags), is_published=1,
      updated_at=CURRENT_TIMESTAMP`;

  let total = 0;
  for (const name of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    console.log(`${name}: ${questions.length} 道（科目 ${payload.subject}）`);
    total += questions.length;
    if (dryRun) continue;
    for (const q of questions) {
      await db.query(sql, [
        q.question_id,
        q.subject,
        q.chapter,
        q.knowledge_point,
        q.question_type,
        q.difficulty,
        q.stem,
        q.code_context || "",
        q.option_a || "",
        q.option_b || "",
        q.option_c || "",
        q.option_d || "",
        q.answer,
        q.analysis,
        q.hint || "",
        q.ability_dimension || "概念理解",
        JSON.stringify(q.tags || []),
        q.stage || "核心",
        0,
        q.source || "ai_generated_verified",
        null,
      ]);
    }
  }
  console.log(dryRun ? `dry-run：共 ${total} 道（未写库）` : `导入完成：共 ${total} 道`);
  if (db) await db.end();
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
