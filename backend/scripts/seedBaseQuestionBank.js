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

const questionBankPaths = [
  path.resolve(__dirname, "../data/question-banks/base_question_bank.json"),
  path.resolve(__dirname, "../data/question-banks/trusted_core_question_bank.json"),
];

async function main() {
  const dbReady = await initDB();
  if (!dbReady) {
    console.error("题库导入终止：数据库连接或初始化失败。");
    process.exitCode = 1;
    return;
  }

  const sourceSets = questionBankPaths.map((questionBankPath) => readQuestionBankJson(questionBankPath));
  const trustedIds = new Set(sourceSets[1].map((question) => question.question_id));
  const questions = [
    ...sourceSets[0].filter((question) => !trustedIds.has(question.question_id)),
    ...sourceSets[1],
  ];
  validateQuestionSet(questions);
  const existingIds = await loadExistingQuestionIds();
  const stats = {
    total: questions.length,
    inserted: 0,
    updated: 0,
    failed: 0,
  };

  await pool.query("START TRANSACTION");
  try {
    for (const question of questions) {
      await upsertQuestion(question);

      if (existingIds.has(question.question_id)) {
        stats.updated += 1;
      } else {
        stats.inserted += 1;
        existingIds.add(question.question_id);
      }
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    stats.failed = 1;
    console.error(`题库导入事务已回滚：${error.message}`);
  }

  console.log(`读取题目数量：${stats.total}`);
  console.log(`新增数量：${stats.inserted}`);
  console.log(`更新数量：${stats.updated}`);
  console.log(`失败数量：${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

function readQuestionBankJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error("JSON 顶层必须是数组。");
    }

    return parsed;
  } catch (error) {
    console.error(`题库 JSON 读取或解析失败：${filePath}`);
    console.error(`错误：${error.message}`);
    process.exit(1);
  }
}

function validateQuestionSet(questions) {
  const ids = new Set();
  for (const question of questions) {
    validateQuestion(question);
    if (ids.has(question.question_id)) {
      throw new Error(`题号重复：${question.question_id}`);
    }
    ids.add(question.question_id);
  }
}

async function loadExistingQuestionIds() {
  try {
    const [rows] = await pool.query("SELECT question_id FROM question_bank");
    return new Set(rows.map((row) => row.question_id));
  } catch (error) {
    console.error(`读取已有题号失败，请检查数据库连接：${error.message}`);
    process.exit(1);
  }
}

function validateQuestion(question) {
  const requiredFields = [
    "question_id",
    "subject",
    "stem",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "answer",
  ];

  for (const field of requiredFields) {
    if (!question[field]) {
      throw new Error(`缺少必填字段 ${field}`);
    }
  }

  if (!["A", "B", "C", "D"].includes(String(question.answer).trim().toUpperCase())) {
    throw new Error("answer 必须是 A/B/C/D");
  }

  if (!["基础", "提高", "综合", "冲刺"].includes(question.difficulty)) {
    throw new Error("difficulty 必须是：基础 / 提高 / 综合 / 冲刺");
  }

  const options = [question.option_a, question.option_b, question.option_c, question.option_d].map((value) =>
    String(value).trim(),
  );
  if (new Set(options).size !== 4) {
    throw new Error("四个选项必须互不重复");
  }

  if (question.analysis !== undefined && !String(question.analysis).trim()) {
    throw new Error("analysis 不能为空");
  }
}

async function upsertQuestion(question) {
  const values = [
    question.question_id,
    question.subject,
    question.chapter || "",
    question.knowledge_point || "",
    question.question_type || "single_choice",
    question.difficulty || "基础",
    question.stem,
    question.code_context || "",
    question.option_a || "",
    question.option_b || "",
    question.option_c || "",
    question.option_d || "",
    String(question.answer || "")
      .trim()
      .toUpperCase(),
    question.analysis || "",
    question.hint || "",
    question.ability_dimension || "",
    JSON.stringify(Array.isArray(question.tags) ? question.tags : []),
    question.stage || "",
    question.is_core === false ? 0 : 1,
    question.source || "system_seed",
    question.is_published === false ? 0 : 1,
  ];

  await pool.query(
    `
      INSERT INTO question_bank (
        question_id,
        subject,
        chapter,
        knowledge_point,
        question_type,
        difficulty,
        stem,
        code_context,
        option_a,
        option_b,
        option_c,
        option_d,
        answer,
        analysis,
        hint,
        ability_dimension,
        tags,
        stage,
        is_core,
        source,
        is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        subject = VALUES(subject),
        chapter = VALUES(chapter),
        knowledge_point = VALUES(knowledge_point),
        question_type = VALUES(question_type),
        difficulty = VALUES(difficulty),
        stem = VALUES(stem),
        code_context = VALUES(code_context),
        option_a = VALUES(option_a),
        option_b = VALUES(option_b),
        option_c = VALUES(option_c),
        option_d = VALUES(option_d),
        answer = VALUES(answer),
        analysis = VALUES(analysis),
        hint = VALUES(hint),
        ability_dimension = VALUES(ability_dimension),
        tags = VALUES(tags),
        stage = VALUES(stage),
        is_core = VALUES(is_core),
        source = VALUES(source),
        is_published = VALUES(is_published)
    `,
    values,
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`题库导入失败：${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = { validateQuestion, validateQuestionSet };
