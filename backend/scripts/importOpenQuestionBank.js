/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});

const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");

const openQuestionBankPath = path.resolve(
  __dirname,
  "../data/question-banks/interview_grill_408_open_questions.json",
);

async function main() {
  const dbReady = await initDB();
  if (!dbReady) {
    console.error("开放题导入终止：数据库连接或初始化失败。");
    process.exitCode = 1;
    return;
  }

  const questions = readOpenQuestionBankJson(openQuestionBankPath);
  const existingIds = await loadExistingOpenQuestionIds();
  const stats = {
    total: questions.length,
    inserted: 0,
    updated: 0,
    failed: 0,
  };

  for (const question of questions) {
    try {
      validateOpenQuestion(question);
      await upsertOpenQuestion(question);

      if (existingIds.has(question.question_id)) {
        stats.updated += 1;
      } else {
        stats.inserted += 1;
        existingIds.add(question.question_id);
      }
    } catch (error) {
      stats.failed += 1;
      console.error(
        `开放题导入失败：${question && question.question_id ? question.question_id : "未知题号"}，${error.message}`,
      );
    }
  }

  console.log(`读取开放题数量：${stats.total}`);
  console.log(`新增数量：${stats.inserted}`);
  console.log(`更新数量：${stats.updated}`);
  console.log(`失败数量：${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

function readOpenQuestionBankJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error("JSON 顶层必须是数组。");
    }

    return parsed;
  } catch (error) {
    console.error(`开放题 JSON 读取或解析失败：${filePath}`);
    console.error(`错误：${error.message}`);
    process.exit(1);
  }
}

async function loadExistingOpenQuestionIds() {
  try {
    const [rows] = await pool.query("SELECT question_id FROM open_question_bank");
    return new Set(rows.map((row) => row.question_id));
  } catch (error) {
    console.error(`读取已有开放题题号失败，请检查数据库连接：${error.message}`);
    process.exit(1);
  }
}

function validateOpenQuestion(question) {
  const requiredFields = ["question_id", "subject", "prompt"];

  for (const field of requiredFields) {
    if (!question[field]) {
      throw new Error(`缺少必填字段 ${field}`);
    }
  }

  if (!["基础", "提高", "综合", "冲刺"].includes(question.difficulty)) {
    throw new Error("difficulty 必须是：基础 / 提高 / 综合 / 冲刺");
  }

  if (!Array.isArray(question.followups) || question.followups.length < 2) {
    throw new Error("followups 至少需要 2 条。");
  }

  if (!Array.isArray(question.checkpoints) || question.checkpoints.length < 3) {
    throw new Error("checkpoints 至少需要 3 条。");
  }

  if (question.source && question.source !== "interview_grill_adapted") {
    throw new Error("source 必须是 interview_grill_adapted。");
  }
}

async function upsertOpenQuestion(question) {
  const values = [
    question.question_id,
    question.subject,
    question.chapter || "",
    question.knowledge_point || "",
    question.difficulty || "基础",
    question.prompt,
    JSON.stringify(question.followups),
    JSON.stringify(question.checkpoints),
    "interview_grill_adapted",
  ];

  await pool.query(
    `
      INSERT INTO open_question_bank (
        question_id,
        subject,
        chapter,
        knowledge_point,
        difficulty,
        prompt,
        followups,
        checkpoints,
        source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        subject = VALUES(subject),
        chapter = VALUES(chapter),
        knowledge_point = VALUES(knowledge_point),
        difficulty = VALUES(difficulty),
        prompt = VALUES(prompt),
        followups = VALUES(followups),
        checkpoints = VALUES(checkpoints),
        source = VALUES(source)
    `,
    values,
  );
}

main()
  .catch((error) => {
    console.error(`开放题导入失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
