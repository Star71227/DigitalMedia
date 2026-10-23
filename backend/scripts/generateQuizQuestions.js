#!/usr/bin/env node
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 题库补充脚本：按「每门课 ≥30 道选择题 + ≥20 道填空题」的目标补题。
 *
 * 质量保证（两道模型关卡 + 代码校验）：
 *   1) 出题：资深命题教师提示词，限定章节/知识点/难度，禁止元描述式选项与重复题干；
 *   2) 复核：只把题干 + 选项 + 答案交给模型审题，判定是否表述清晰、答案唯一正确、
 *      选择题是否只有一个正确项、干扰项是否不构成第二个正确答案；不通过直接丢弃；
 *   3) 代码校验：选项齐全且互异、答案在 A-D、解析长度达标、题干与既有题目/本次生成去重。
 *
 * 用法：
 *   node scripts/generateQuizQuestions.js                 # 按默认目标补齐五门课
 *   node scripts/generateQuizQuestions.js --dry-run       # 只生成不写库（输出 JSON 供人工看）
 *   node scripts/generateQuizQuestions.js --subjects 数据结构,操作系统 --blank 20 --choice 30
 *   node scripts/generateQuizQuestions.js --concurrency 4
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const mysql = require("mysql2/promise");
const { generateJson } = require("../src/services/aiService");

const SUBJECT_SLUG = {
  "数据结构": "DS",
  "操作系统": "OS",
  "计算机组成原理": "CO",
  "计算机网络": "CN",
  "C语言": "CL",
  // 题库里 C 语言的实际科目名
  "C 语言程序设计": "CL",
};
const DIFFICULTIES = ["基础", "提高", "综合"];
const BATCH_SOURCE = "ai_generated_verified";
const OUT_DIR = path.join(__dirname, "..", "data", "question-banks", "generated");

function parseArgs(argv) {
  const args = { blank: 20, choice: 30, concurrency: 4, dryRun: false, subjects: null, attempts: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--blank") {
      args.blank = Number(value);
      i += 1;
    } else if (key === "--choice") {
      args.choice = Number(value);
      i += 1;
    } else if (key === "--concurrency") {
      args.concurrency = Number(value);
      i += 1;
    } else if (key === "--attempts") {
      args.attempts = Number(value);
      i += 1;
    } else if (key === "--subjects") {
      args.subjects = String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      i += 1;
    } else if (key === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function log(...parts) {
  const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${parts.join(" ")}`;
  console.log(line);
}

function normalizeStem(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]，。,．.、:：;；?？!！"'“”‘’]/g, "")
    .toLowerCase();
}

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

async function loadInventory(db, subject, isCLanguage) {
  const bankSubject = isCLanguage ? "C 语言程序设计" : subject;
  const [rows] = await db.query(
    `SELECT chapter, knowledge_point AS kp, COUNT(*) AS n
       FROM question_bank
      WHERE subject = ? AND COALESCE(is_published,1)=1 AND owner_teacher_id IS NULL AND owner_student_id IS NULL
        AND COALESCE(chapter,'') <> '' AND COALESCE(knowledge_point,'') <> ''
      GROUP BY chapter, knowledge_point
      ORDER BY n DESC`,
    [bankSubject],
  );
  return { bankSubject, items: rows.map((row) => ({ chapter: row.chapter, kp: row.kp })) };
}

async function countPublished(db, bankSubject, questionType) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n FROM question_bank
      WHERE subject = ? AND question_type = ? AND COALESCE(is_published,1)=1
        AND owner_teacher_id IS NULL AND owner_student_id IS NULL`,
    [bankSubject, questionType],
  );
  return Number(row.n) || 0;
}

async function loadExistingStems(db, bankSubject) {
  const [rows] = await db.query("SELECT stem FROM question_bank WHERE subject = ?", [bankSubject]);
  return new Set(rows.map((row) => normalizeStem(row.stem)));
}

function buildPrompt({ subject, chapter, kp, difficulty, kind, avoidStems }) {
  const avoid = (avoidStems || [])
    .slice(0, 24)
    .map((stem, index) => `${index + 1}) ${stem}`)
    .join("\n");
  const common = [
    `你是《${subject}》课程的资深命题教师，正在为本科生期末题库出题。`,
    `章节：${chapter}；知识点：${kp}；难度：${difficulty}；题型：${kind === "fill_blank" ? "填空题" : "单项选择题"}。`,
    "硬性要求：",
    "1) 题目必须考查该知识点的具体技术内容（定义、性质、公式、计算、执行过程、对比结论），答案在教材上有确定结论；",
    "2) 严禁出“元描述”题：选项不能是“需要结合定义/适用条件和典型场景理解”“只需要记住名称”“与其他知识点没有关联”这类空话，必须是可判断的技术结论；",
    "3) 单选必须 4 个选项且只有一个正确，干扰项要像学生真的会选错的错误（常见误解、计算错位、概念混淆），不能明显荒谬；",
    "4) 填空题答案要简短（一个术语、数字、公式或短表达式），公式用纯文本写法（如 O(n)、2^k-1、n/2、m+n-1）；同一空有多种常见写法时用 | 分隔（最多 3 个）；",
    "5) 解析 40~140 字，说明推导过程或教材依据，不要只重复答案；",
    "6) 与下列已有题目不得重复或近似（不要复述同一考点同一问法）：",
    avoid || "（暂无）",
    "只输出 JSON，不要任何解释文字。格式：",
    kind === "fill_blank"
      ? `{"items":[{"stem":"题面（含括号提示要填什么）","answer":"答案1|答案2","analysis":"解析","hint":"一句话提示","difficulty":"${difficulty}","tags":["知识点","题型标签"]}]}`
      : `{"items":[{"stem":"题面","options":["A 选项内容","B 选项内容","C 选项内容","D 选项内容"],"answer":"A","analysis":"解析","hint":"一句话提示","difficulty":"${difficulty}","tags":["知识点","题型标签"]}]}`,
  ];
  return common.join("\n");
}

function verifyPrompt({ subject, chapter, kp, kind, item }) {
  const body =
    kind === "fill_blank"
      ? [`题干：${item.stem}`, `给出的答案：${item.answer}`, `解析：${item.analysis}`]
      : [
          `题干：${item.stem}`,
          ...item.options.map((option, index) => `${"ABCD"[index]}. ${option}`),
          `给出的答案：${item.answer}`,
          `解析：${item.analysis}`,
        ];
  return [
    `你是《${subject}》课程的严格审题人（章节：${chapter}，知识点：${kp}）。请审核下面这道${kind === "fill_blank" ? "填空" : "单选"}题：`,
    ...body,
    "审核要点：",
    "1) 题干表述是否清晰、无歧义、条件充分？",
    "2) 给出的答案是否正确且唯一（填空题若有多种等价写法，是否至少包含最常见的那种）？",
    kind === "fill_blank"
      ? "3) 答案是否简短、可判定（不依赖主观发挥）？"
      : "3) 4 个选项中是否只有一个正确？干扰项里有没有其实也成立的？选项是否属于空话式元描述？",
    '只输出 JSON：{"ok":true|false,"reason":"不超过60字","fixedAnswer":"若答案有误请给正确写法，否则空字符串"}',
    "只有当题目完全无误时才给 ok=true；有任何不确定都判 false。",
  ].join("\n");
}

function pickItems(list, index) {
  return list[index % list.length];
}

function validateQuestion({ kind, item, existingStems, generatedStems }) {
  const stem = String(item?.stem || "").trim();
  const analysis = String(item?.analysis || "").trim();
  if (stem.length < 12) return "题干过短";
  if (analysis.length < 20) return "解析过短";
  const key = normalizeStem(stem);
  if (!key) return "题干为空";
  if (existingStems.has(key)) return "与题库已有题目重复";
  if (generatedStems.has(key)) return "本次生成重复";
  if (kind === "fill_blank") {
    const answer = String(item?.answer || "").trim();
    if (!answer) return "缺少答案";
    if (answer.length > 60) return "答案过长";
    return "";
  }
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option || "").trim())
    : [];
  if (options.length !== 4) return "选项数量不是 4";
  if (options.some((option) => !option)) return "存在空选项";
  if (new Set(options.map((option) => option.replace(/\s+/g, ""))).size !== 4) return "选项重复";
  const answer = String(item?.answer || "")
    .trim()
    .toUpperCase();
  if (!/^[A-D]$/.test(answer)) return "答案不是 A-D";
  if (
    /(结合定义|结合概念|适用条件|典型场景|没有关联|不需要关注|只需记住|没有任何边界)/.test(options.join(""))
  ) {
    return "选项是元描述空话";
  }
  return "";
}

async function generateOne({ subject, chapter, kp, difficulty, kind, existingStems, model, attempts }) {
  const avoidStems = [...existingStems].slice(0, 24);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await generateJson({
      capability: "quiz",
      messages: [
        { role: "system", content: "你是严谨的大学课程命题教师，只输出 JSON。" },
        { role: "user", content: buildPrompt({ subject, chapter, kp, difficulty, kind, avoidStems }) },
      ],
      temperature: 0.55 + attempt * 0.12,
      maxTokens: 1400,
      model,
    }).catch((error) => {
      log(`生成失败(${subject}/${kp} ${kind} 第${attempt}次)：${error.message}`);
      return null;
    });
    const item = Array.isArray(result?.items) ? result.items[0] : null;
    if (!item) continue;
    const problem = validateQuestion({ kind, item, existingStems, generatedStems: new Set() });
    if (problem) {
      log(`丢弃(${subject}/${kp} ${kind})：${problem}`);
      continue;
    }
    return item;
  }
  return null;
}

async function verifyOne({ subject, chapter, kp, kind, item, model }) {
  const verdict = await generateJson({
    capability: "quiz",
    messages: [
      { role: "system", content: "你是严格审题人，只输出 JSON。" },
      { role: "user", content: verifyPrompt({ subject, chapter, kp, kind, item }) },
    ],
    temperature: 0.05,
    maxTokens: 700,
    model,
  }).catch((error) => {
    log(`复核失败(${subject}/${kp})：${error.message}`);
    return null;
  });
  if (!verdict || verdict.ok !== true) return null;
  const fixed = String(verdict.fixedAnswer || "").trim();
  if (fixed && kind === "fill_blank" && !String(item.answer || "").includes(fixed)) {
    return { ...item, answer: `${fixed}|${item.answer}`.slice(0, 60) };
  }
  return item;
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function insertQuestions(db, rows) {
  if (!rows.length) return 0;
  const sql = `INSERT INTO question_bank
    (question_id, subject, chapter, knowledge_point, question_type, difficulty, stem, code_context,
     option_a, option_b, option_c, option_d, answer, analysis, hint, ability_dimension, tags, stage,
     is_core, source, owner_student_id, source_verified_at, is_published, owner_teacher_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),1,NULL)
    ON DUPLICATE KEY UPDATE stem = VALUES(stem), answer = VALUES(answer), analysis = VALUES(analysis),
      option_a = VALUES(option_a), option_b = VALUES(option_b), option_c = VALUES(option_c), option_d = VALUES(option_d),
      updated_at = CURRENT_TIMESTAMP`;
  let inserted = 0;
  for (const row of rows) {
    await db.query(sql, [
      row.question_id,
      row.subject,
      row.chapter,
      row.knowledge_point,
      row.question_type,
      row.difficulty,
      row.stem,
      "",
      row.option_a || "",
      row.option_b || "",
      row.option_c || "",
      row.option_d || "",
      row.answer,
      row.analysis,
      row.hint || "",
      row.ability_dimension || "概念理解",
      JSON.stringify(row.tags || []),
      "核心",
      0,
      BATCH_SOURCE,
      null,
    ]);
    inserted += 1;
  }
  return inserted;
}

/** 选项常常自带「A. 」「B 」「C、」前缀，界面已经单独显示字母，入库前统一去掉 */
/** 续号：避免多次运行时 AI-FILL-DS-001 这种编号被 ON DUPLICATE KEY UPDATE 覆盖掉 */
async function nextSequence(db, kind, slug) {
  const [[row]] = await db.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(question_id,'-',-1) AS UNSIGNED)),0) AS maxSeq FROM question_bank WHERE question_id LIKE ?",
    [`AI-${kind === "fill_blank" ? "FILL" : "CHOICE"}-${slug}-%`],
  );
  return Number(row.maxSeq || 0) + 1;
}

function stripOptionPrefix(value) {
  return String(value || "")
    .replace(/^\s*[A-Da-d]\s*[.、．)）:：]?\s+/, "")
    .replace(/^\s*[A-Da-d]\s*[.、．)）:：]\s*/, "")
    .trim();
}

function toRow(subject, bankSubject, kind, chapter, kp, difficulty, item, seq) {
  const slug = SUBJECT_SLUG[bankSubject] || SUBJECT_SLUG[subject] || "GEN";
  const questionId = `AI-${kind === "fill_blank" ? "FILL" : "CHOICE"}-${slug}-${String(seq).padStart(3, "0")}`;
  const options = Array.isArray(item.options) ? item.options.map((option) => stripOptionPrefix(option)) : [];
  return {
    question_id: questionId,
    subject: bankSubject,
    chapter,
    knowledge_point: kp,
    question_type: kind,
    difficulty: String(item.difficulty || difficulty).slice(0, 10),
    stem: String(item.stem).trim(),
    option_a: options[0] || "",
    option_b: options[1] || "",
    option_c: options[2] || "",
    option_d: options[3] || "",
    answer: String(item.answer).trim(),
    analysis: String(item.analysis).trim(),
    hint: String(item.hint || "")
      .trim()
      .slice(0, 200),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)).slice(0, 6) : [kp],
    ability_dimension: "概念理解",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = process.env.LLM_QUIZ_MODEL || process.env.LLM_MODEL;
  const db = pool();
  const subjects = args.subjects || Object.keys(SUBJECT_SLUG).filter((name) => name !== "C 语言程序设计");

  log(
    `目标：每门课 ≥${args.choice} 道选择题 + ≥${args.blank} 道填空题；模型=${model}；并发=${args.concurrency}${args.dryRun ? "；dry-run（不写库）" : ""}`,
  );
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];

  for (const subject of subjects) {
    const isCLanguage = subject === "C语言";
    const { bankSubject, items } = await loadInventory(db, subject, isCLanguage);
    if (!items.length) {
      log(`跳过 ${subject}：题库里没有可参考的章节/知识点`);
      continue;
    }

    const [existingChoice, existingBlank] = await Promise.all([
      countPublished(db, bankSubject, "single_choice"),
      countPublished(db, bankSubject, "fill_blank"),
    ]);
    const existingStems = await loadExistingStems(db, bankSubject);

    const plan = [];
    for (let i = existingBlank; i < args.blank; i += 1)
      plan.push({ kind: "fill_blank", index: i - existingBlank });
    for (let i = existingChoice; i < args.choice; i += 1)
      plan.push({ kind: "single_choice", index: i - existingChoice });

    log(
      `${subject}（库内科目名 ${bankSubject}）：现有 选择 ${existingChoice} / 填空 ${existingBlank} → 需补 选择 ${Math.max(0, args.choice - existingChoice)} / 填空 ${Math.max(0, args.blank - existingBlank)}`,
    );
    if (!plan.length) {
      summary.push({ subject, bankSubject, choice: 0, blank: 0, existingChoice, existingBlank });
      continue;
    }

    const generated = await runPool(
      plan,
      async (task) => {
        const target = pickItems(items, task.index);
        const difficulty = DIFFICULTIES[task.index % DIFFICULTIES.length];
        const item = await generateOne({
          subject: bankSubject,
          chapter: target.chapter,
          kp: target.kp,
          difficulty,
          kind: task.kind,
          existingStems,
          model,
          attempts: args.attempts,
        });
        if (!item) return null;
        const approved = await verifyOne({
          subject: bankSubject,
          chapter: target.chapter,
          kp: target.kp,
          kind: task.kind,
          item,
          model,
        });
        if (!approved) {
          log(`复核不通过，丢弃：${String(item.stem).slice(0, 30)}…（${subject}/${target.kp}）`);
          return null;
        }
        return { task, target, item: approved };
      },
      args.concurrency,
    );

    const approvedList = generated.filter(Boolean);
    // 二次去重（并发下可能撞车）
    const seen = new Set(existingStems);
    const finalList = [];
    for (const entry of approvedList) {
      const key = normalizeStem(entry.item.stem);
      if (seen.has(key)) {
        log(`去重丢弃：${String(entry.item.stem).slice(0, 30)}…`);
        continue;
      }
      seen.add(key);
      finalList.push(entry);
    }

    const slug = SUBJECT_SLUG[bankSubject] || SUBJECT_SLUG[subject] || "GEN";
    const seqByKind = {
      fill_blank: await nextSequence(db, "fill_blank", slug),
      single_choice: await nextSequence(db, "single_choice", slug),
    };
    const rows = finalList.map((entry) => {
      const difficulty = DIFFICULTIES[entry.task.index % DIFFICULTIES.length];
      return toRow(
        subject,
        bankSubject,
        entry.task.kind,
        entry.target.chapter,
        entry.target.kp,
        difficulty,
        entry.item,
        seqByKind[entry.task.kind]++,
      );
    });
    const file = path.join(OUT_DIR, `${SUBJECT_SLUG[bankSubject] || bankSubject}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        { subject: bankSubject, generatedAt: new Date().toISOString(), model, questions: rows },
        null,
        2,
      ),
      "utf8",
    );
    log(`${subject}：通过复核 ${rows.length} 道，已写出 ${file}`);

    if (!args.dryRun && rows.length) {
      const inserted = await insertQuestions(db, rows);
      log(`${subject}：写入 question_bank ${inserted} 道`);
    }
    summary.push({
      subject,
      bankSubject,
      choice: rows.filter((row) => row.question_type === "single_choice").length,
      blank: rows.filter((row) => row.question_type === "fill_blank").length,
      existingChoice,
      existingBlank,
    });
  }

  log("=== 汇总 ===");
  for (const row of summary) {
    log(
      `${row.subject}：新增 选择 ${row.choice} / 填空 ${row.blank}（原有 选择 ${row.existingChoice} / 填空 ${row.existingBlank}）`,
    );
  }
  await db.end();
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
