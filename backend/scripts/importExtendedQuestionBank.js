/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 扩展题库导入：把 data/question-banks/extended/*.json 导入 question_bank。
 *
 * 与 seedBaseQuestionBank.js 的区别：那份脚本只接受单选题（option_a~d 与 A/B/C/D 答案），
 * 这份脚本同时接受填空题（fill_blank）、应用题（application）与代码题（code）：
 *   - 选择题：四个选项必填、互不重复，answer ∈ A/B/C/D；
 *   - 填空题：无选项，answer 为不超过 10 个字符的答案串（多空用 | 分隔）；
 *   - 应用题 / 代码题：无选项，answer 固定为「见解析」，完整答案写在 analysis 里。
 *
 * 用法：npm run import:extended-questions            （幂等，按 question_id upsert）
 *       npm run import:extended-questions -- --dry-run
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});

const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");

const EXTENDED_DIR = path.resolve(__dirname, "../data/question-banks/extended");
const DRY_RUN = process.argv.includes("--dry-run");

const QUESTION_TYPES = ["single_choice", "fill_blank", "application", "code"];
const DIFFICULTIES = ["基础", "提高", "综合", "冲刺"];

function readAllQuestionFiles() {
  if (!fs.existsSync(EXTENDED_DIR)) {
    throw new Error(`扩展题库目录不存在：${EXTENDED_DIR}`);
  }
  const files = fs
    .readdirSync(EXTENDED_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort();
  if (!files.length) throw new Error(`扩展题库目录里没有 JSON 文件：${EXTENDED_DIR}`);
  const questions = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(EXTENDED_DIR, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${file} 的顶层必须是数组`);
    questions.push(...parsed);
  }
  return { files, questions };
}

function validateQuestion(question) {
  const id = question && question.question_id ? question.question_id : "(缺少 question_id)";
  for (const field of ["question_id", "subject", "stem", "answer"]) {
    if (!question || !String(question[field] || "").trim()) throw new Error(`${id}：缺少必填字段 ${field}`);
  }
  const type = String(question.question_type || "single_choice").trim();
  if (!QUESTION_TYPES.includes(type))
    throw new Error(`${id}：question_type 必须是 ${QUESTION_TYPES.join(" / ")}`);
  if (!DIFFICULTIES.includes(question.difficulty))
    throw new Error(`${id}：difficulty 必须是 ${DIFFICULTIES.join(" / ")}`);

  const answer = String(question.answer).trim();
  // answer 列是 VARCHAR(10)，超长会被 MySQL 截断，这里提前拦下来
  if ([...answer].length > 10) throw new Error(`${id}：answer 超过 10 个字符（${answer}）`);

  const options = [question.option_a, question.option_b, question.option_c, question.option_d].map((value) =>
    String(value || "").trim(),
  );
  if (type === "single_choice") {
    if (options.some((option) => !option)) throw new Error(`${id}：单选题四个选项都必填`);
    if (new Set(options).size !== 4) throw new Error(`${id}：四个选项必须互不重复`);
    if (!["A", "B", "C", "D"].includes(answer.toUpperCase()))
      throw new Error(`${id}：单选题 answer 必须是 A/B/C/D`);
  } else if (options.some((option) => option)) {
    throw new Error(`${id}：${type} 不应带选项`);
  }

  if (!String(question.analysis || "").trim()) throw new Error(`${id}：analysis 不能为空`);
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
    // 只有单选题的答案是 A/B/C/D 需要规范成大写；填空题答案是表达式或术语
    // （例如 "2i|O(n)"、"n-i+1"、"ssthresh"），转大写会破坏语义，必须原样保留。
    String(question.question_type || "single_choice").trim() === "single_choice"
      ? String(question.answer || "")
          .trim()
          .toUpperCase()
      : String(question.answer || "").trim(),
    question.analysis || "",
    question.hint || "",
    question.ability_dimension || "",
    JSON.stringify(Array.isArray(question.tags) ? question.tags : []),
    question.stage || "核心",
    question.is_core === false ? 0 : 1,
    question.source || "extended_bank_seed",
    question.is_published === false ? 0 : 1,
  ];

  await pool.query(
    `
      INSERT INTO question_bank (
        question_id, subject, chapter, knowledge_point, question_type, difficulty, stem,
        code_context, option_a, option_b, option_c, option_d, answer, analysis, hint,
        ability_dimension, tags, stage, is_core, source, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        subject = VALUES(subject), chapter = VALUES(chapter), knowledge_point = VALUES(knowledge_point),
        question_type = VALUES(question_type), difficulty = VALUES(difficulty), stem = VALUES(stem),
        code_context = VALUES(code_context), option_a = VALUES(option_a), option_b = VALUES(option_b),
        option_c = VALUES(option_c), option_d = VALUES(option_d), answer = VALUES(answer),
        analysis = VALUES(analysis), hint = VALUES(hint), ability_dimension = VALUES(ability_dimension),
        tags = VALUES(tags), stage = VALUES(stage), is_core = VALUES(is_core), source = VALUES(source),
        is_published = VALUES(is_published)
    `,
    values,
  );
}

async function main() {
  const dbReady = await initDB();
  if (!dbReady) {
    console.error("扩展题库导入终止：数据库连接或初始化失败。");
    process.exitCode = 1;
    return;
  }

  const { files, questions } = readAllQuestionFiles();
  const ids = new Set();
  for (const question of questions) {
    validateQuestion(question);
    if (ids.has(question.question_id)) throw new Error(`题号重复：${question.question_id}`);
    ids.add(question.question_id);
  }

  const [existingRows] = await pool.query("SELECT question_id FROM question_bank");
  const existingIds = new Set(existingRows.map((row) => row.question_id));

  const byType = questions.reduce((acc, question) => {
    const type = question.question_type || "single_choice";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  console.log(`扩展题库文件：${files.join("、")}`);
  console.log(
    `读取题目数量：${questions.length}（${Object.entries(byType)
      .map(([type, count]) => `${type} ${count}`)
      .join(" / ")}）`,
  );

  if (DRY_RUN) {
    console.log("--dry-run：校验通过，未写库。");
    return;
  }

  const stats = { inserted: 0, updated: 0 };
  await pool.query("START TRANSACTION");
  try {
    for (const question of questions) {
      await upsertQuestion(question);
      if (existingIds.has(question.question_id)) stats.updated += 1;
      else {
        stats.inserted += 1;
        existingIds.add(question.question_id);
      }
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(`扩展题库导入事务已回滚：${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`新增数量：${stats.inserted}`);
  console.log(`更新数量：${stats.updated}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`扩展题库导入失败：${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = { validateQuestion, readAllQuestionFiles, EXTENDED_DIR };
