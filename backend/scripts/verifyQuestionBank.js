/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});

const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");

const CORE_SUBJECTS = ["C 语言程序设计", "数据结构", "计算机组成原理", "操作系统", "计算机网络"];
const HARD_MINIMUMS = { total: 200, perSubject: 35, knowledgePoints: 6, perKnowledgePoint: 4 };

function parseTags(value) {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean);
  } catch {
    return String(value)
      .split(/[，,、|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function countHan(value) {
  return (String(value || "").match(/[\p{Script=Han}]/gu) || []).length;
}

function normalizeStem(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[0-9]+/g, "#");
}

function scenarioLike(row, tags) {
  return (
    tags.includes("场景题") ||
    Boolean(row.code_context) ||
    /若|如果|当|执行过程|收到|发送|状态变化|连接建立|连接释放|报文/.test(String(row.stem || ""))
  );
}

function applicationLike(row, tags) {
  return (
    tags.includes("应用题") || /应用迁移|计算推导|过程推演|结构推演/.test(String(row.ability_dimension || ""))
  );
}

function misconceptionLike(row, tags) {
  return (
    tags.includes("误区辨析") ||
    /易错|误区|辨析|错误|不是|区别|混淆/.test(`${row.ability_dimension || ""} ${row.stem}`)
  );
}

function normalizeDifficulty(value) {
  if (value === "基础") return "foundation";
  if (value === "提高") return "intermediate";
  return "advanced";
}

function analyze(rows) {
  const allCore = rows.filter((row) => CORE_SUBJECTS.includes(row.subject));
  const core = allCore.filter((row) => Number(row.is_published ?? 1) === 1);
  const subjectCounts = Object.fromEntries(
    CORE_SUBJECTS.map((subject) => [subject, core.filter((row) => row.subject === subject).length]),
  );
  const knowledgePointCounts = {};
  for (const row of core) {
    knowledgePointCounts[row.subject] ||= {};
    knowledgePointCounts[row.subject][row.knowledge_point || "未分类"] =
      (knowledgePointCounts[row.subject][row.knowledge_point || "未分类"] || 0) + 1;
  }

  const exactStemMap = new Map();
  const nearStemMap = new Map();
  for (const row of core) {
    const stem = String(row.stem || "").trim();
    exactStemMap.set(stem, (exactStemMap.get(stem) || 0) + 1);
    const normalized = normalizeStem(stem);
    nearStemMap.set(normalized, (nearStemMap.get(normalized) || 0) + 1);
  }
  const duplicateCount = (map) =>
    [...map.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);

  const invalidOptions = core.filter((row) => {
    const options = [row.option_a, row.option_b, row.option_c, row.option_d].map((value) =>
      String(value || "").trim(),
    );
    return options.some((value) => !value) || new Set(options).size !== 4;
  });
  const invalidAnswers = core.filter((row) => {
    const answer = String(row.answer || "")
      .trim()
      .toUpperCase();
    return !["A", "B", "C", "D"].includes(answer);
  });
  const invalidType = core.filter((row) => String(row.question_type || "single_choice") !== "single_choice");
  const emptyStem = core.filter((row) => !String(row.stem || "").trim());
  const missingKnowledgePoint = core.filter((row) => !String(row.knowledge_point || "").trim());
  const missingAnalysis = core.filter((row) => countHan(row.analysis) < 60);
  const scenarioShortAnalysis = core.filter((row) => {
    const tags = parseTags(row.tags);
    return scenarioLike(row, tags) && countHan(row.analysis) < 100;
  });
  const difficultyDistribution = core.reduce(
    (result, row) => {
      const key = normalizeDifficulty(row.difficulty);
      result[key] = (result[key] || 0) + 1;
      return result;
    },
    { foundation: 0, intermediate: 0, advanced: 0 },
  );
  const ratio = (count) => (core.length ? Number((count / core.length).toFixed(4)) : 0);
  const scenarioCount = core.filter((row) => scenarioLike(row, parseTags(row.tags))).length;
  const applicationCount = core.filter((row) => applicationLike(row, parseTags(row.tags))).length;
  const misconceptionCount = core.filter((row) => misconceptionLike(row, parseTags(row.tags))).length;
  const publishedCount = core.length;
  const unpublishedCount = allCore.length - publishedCount;
  const unusableCount = allCore.filter(
    (row) =>
      Number(row.is_published ?? 1) !== 1 ||
      String(row.question_type || "single_choice") !== "single_choice" ||
      !row.stem ||
      !row.knowledge_point ||
      ![row.option_a, row.option_b, row.option_c, row.option_d].every(Boolean) ||
      new Set([row.option_a, row.option_b, row.option_c, row.option_d]).size !== 4 ||
      !["A", "B", "C", "D"].includes(
        String(row.answer || "")
          .trim()
          .toUpperCase(),
      ) ||
      !row.analysis,
  ).length;
  const duplicateKeyCount = rows.length - new Set(rows.map((row) => row.question_id)).size;

  const hardFailures = [];
  if (core.length < HARD_MINIMUMS.total)
    hardFailures.push(`核心正式题目 ${core.length} < ${HARD_MINIMUMS.total}`);
  for (const subject of CORE_SUBJECTS) {
    if (subjectCounts[subject] < HARD_MINIMUMS.perSubject)
      hardFailures.push(`${subject} 题目 ${subjectCounts[subject]} < ${HARD_MINIMUMS.perSubject}`);
    const points = Object.values(knowledgePointCounts[subject] || {});
    if (points.length < HARD_MINIMUMS.knowledgePoints)
      hardFailures.push(`${subject} 知识点 ${points.length} < ${HARD_MINIMUMS.knowledgePoints}`);
    if (points.some((count) => count < HARD_MINIMUMS.perKnowledgePoint))
      hardFailures.push(`${subject} 存在知识点少于 ${HARD_MINIMUMS.perKnowledgePoint} 题`);
  }
  if (
    invalidOptions.length ||
    invalidAnswers.length ||
    invalidType.length ||
    emptyStem.length ||
    missingKnowledgePoint.length
  )
    hardFailures.push("存在不可组卷的题目字段");
  if (duplicateKeyCount) hardFailures.push("存在重复题号");
  if (duplicateCount(exactStemMap)) hardFailures.push("存在完全重复题干");
  if (missingAnalysis.length || scenarioShortAnalysis.length) hardFailures.push("存在解析长度不达标题目");
  if (ratio(scenarioCount) < 0.2) hardFailures.push("场景题比例低于 20%");
  if (ratio(applicationCount) < 0.3) hardFailures.push("理解应用题比例低于 30%");
  if (ratio(misconceptionCount) < 0.2) hardFailures.push("误区辨析题比例低于 20%");
  if (
    difficultyDistribution.foundation / Math.max(core.length, 1) < 0.35 ||
    difficultyDistribution.foundation / Math.max(core.length, 1) > 0.55
  )
    hardFailures.push("基础题比例超出 35%-55%");
  if (
    difficultyDistribution.intermediate / Math.max(core.length, 1) < 0.3 ||
    difficultyDistribution.intermediate / Math.max(core.length, 1) > 0.5
  )
    hardFailures.push("中等题比例超出 30%-50%");
  if (
    difficultyDistribution.advanced / Math.max(core.length, 1) < 0.05 ||
    difficultyDistribution.advanced / Math.max(core.length, 1) > 0.25
  )
    hardFailures.push("较难题比例超出 5%-25%");

  return {
    passed: hardFailures.length === 0,
    hardFailures,
    total: rows.length,
    coreTotal: core.length,
    publishedCount,
    unpublishedCount,
    subjectCounts,
    knowledgePointCounts,
    difficultyDistribution,
    difficultyRatios: Object.fromEntries(
      Object.entries(difficultyDistribution).map(([key, count]) => [key, ratio(count)]),
    ),
    applicationRatio: ratio(applicationCount),
    scenarioRatio: ratio(scenarioCount),
    misconceptionRatio: ratio(misconceptionCount),
    optionAnomalyCount: invalidOptions.length,
    answerAnomalyCount: invalidAnswers.length,
    unsupportedTypeCount: invalidType.length,
    missingKnowledgePointCount: missingKnowledgePoint.length,
    shortAnalysisCount: missingAnalysis.length,
    shortScenarioAnalysisCount: scenarioShortAnalysis.length,
    duplicateKeyCount,
    duplicateStemCount: duplicateCount(exactStemMap),
    nearDuplicateCount: duplicateCount(nearStemMap),
    unusableForQuizPackCount: unusableCount,
  };
}

async function main() {
  if (!(await initDB())) throw new Error("数据库初始化失败");
  const [rows] = await pool.query("SELECT * FROM question_bank");
  const result = analyze(rows);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
  return result;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { analyze, parseTags, countHan };
