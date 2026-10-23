/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 知识图谱关系导入：把各课程 catalog.json 的知识点/课程内关系，以及跨课程关系文件
// 一并写入 knowledge_points / knowledge_point_aliases / knowledge_point_prerequisites。
// 幂等：知识点用 ON DUPLICATE KEY UPDATE，关系用 INSERT IGNORE，可反复执行。
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});

const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const { seedKnowledgePoints, seedCrossSubjectRelations } = require("../src/services/knowledgePointService");
const { normalizeText } = require("../src/services/knowledgeChunkingService");

const KB_ROOT = path.resolve(__dirname, "../data/knowledge-base");

const COURSES = [
  { dir: "data-structures", subject: "数据结构" },
  { dir: "operating-systems", subject: "操作系统" },
  { dir: "computer-organization", subject: "计算机组成原理" },
  { dir: "computer-networks", subject: "计算机网络" },
  { dir: "c-language", subject: "C语言" },
];

async function main() {
  const dbReady = await initDB();
  if (!dbReady) {
    console.error("知识图谱导入终止：数据库连接或初始化失败。");
    process.exitCode = 1;
    return;
  }

  let pointTotal = 0;
  let relationTotal = 0;

  for (const course of COURSES) {
    const file = path.join(KB_ROOT, course.dir, "catalog.json");
    if (!fs.existsSync(file)) {
      console.error(`缺少 catalog.json：${file}`);
      process.exitCode = 1;
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const catalog = {
      points: raw.points.map(([key, name, description, chapter, difficulty, aliases]) => ({
        key,
        name,
        description,
        chapter,
        difficulty,
        aliases,
      })),
      relations: raw.relations || [],
    };
    // seedKnowledgePoints 内部会做无环校验；有环会抛错并终止，避免写入坏数据。
    await seedKnowledgePoints(pool, catalog, course.subject);
    pointTotal += catalog.points.length;
    relationTotal += catalog.relations.length;
    console.log(
      `  ${course.subject.padEnd(12)} 知识点 ${String(catalog.points.length).padStart(3)}  课程内关系 ${String(catalog.relations.length).padStart(3)}`,
    );
  }

  const crossFile = path.join(KB_ROOT, "cross-subject-relations.json");
  let crossWritten = 0;
  let crossTotal = 0;
  if (fs.existsSync(crossFile)) {
    const doc = JSON.parse(fs.readFileSync(crossFile, "utf8"));
    crossTotal = (doc.relations || []).length;
    const result = await seedCrossSubjectRelations(pool, doc);
    crossWritten = result.written;
    if (result.invalid.length) {
      console.error(`跨课程关系有 ${result.invalid.length} 条引用了不存在的知识点：`);
      for (const item of result.invalid.slice(0, 10)) console.error("  " + item);
      process.exitCode = 1;
    }
    console.log(`  跨课程关系   待写入 ${crossTotal}  新增 ${crossWritten}`);
  } else {
    console.log("  未找到 cross-subject-relations.json，跳过跨课程关系");
  }

  // 补充别名：测验/开放题/代码练习/掌握度里用到、但 catalog 未登记的名称。
  // 写入后这些名称可以通过别名匹配挂到规范知识点上（检索查询扩展也一并受益）。
  const aliasFile = path.join(KB_ROOT, "extra-aliases.json");
  let aliasAdded = 0;
  let aliasTotal = 0;
  if (fs.existsSync(aliasFile)) {
    const doc = JSON.parse(fs.readFileSync(aliasFile, "utf8"));
    const dirToSubject = Object.fromEntries(COURSES.map((course) => [course.dir, course.subject]));
    for (const item of doc.aliases || []) {
      const subject = dirToSubject[item.dir];
      if (!subject) {
        console.error(`补充别名引用了未知课程目录：${item.dir}`);
        process.exitCode = 1;
        continue;
      }
      const [points] = await pool.query(
        "SELECT id FROM knowledge_points WHERE subject=? AND point_key=? LIMIT 1",
        [subject, item.key],
      );
      if (!points.length) {
        console.error(`补充别名引用了不存在的知识点：${subject} / ${item.key}`);
        process.exitCode = 1;
        continue;
      }
      for (const alias of item.aliases || []) {
        aliasTotal += 1;
        const [result] = await pool.query(
          "INSERT IGNORE INTO knowledge_point_aliases(knowledge_point_id,alias,normalized_alias) VALUES(?,?,?)",
          [points[0].id, alias, normalizeText(alias).toLowerCase()],
        );
        aliasAdded += result.affectedRows;
      }
    }
    console.log(`  补充别名     待写入 ${aliasTotal}  新增 ${aliasAdded}`);
  }

  const [[points]] = await pool.query("SELECT COUNT(*) c FROM knowledge_points WHERE status='active'");
  const [[prereq]] = await pool.query(
    "SELECT COUNT(*) c FROM knowledge_point_prerequisites WHERE relation_type='prerequisite'",
  );
  const [[cross]] = await pool.query(
    "SELECT COUNT(*) c FROM knowledge_point_prerequisites WHERE relation_type='cross_subject'",
  );
  const [[chapters]] = await pool.query(
    "SELECT COUNT(DISTINCT subject,chapter) c FROM knowledge_points WHERE status='active'",
  );
  const [[aliases]] = await pool.query("SELECT COUNT(*) c FROM knowledge_point_aliases");

  console.log("");
  console.log(`激活知识点：${points.c}`);
  console.log(`章节数（学科+章节去重）：${chapters.c}`);
  console.log(`课程内前置关系：${prereq.c}`);
  console.log(`跨课程关系：${cross.c}`);
  console.log(`关系合计：${prereq.c + cross.c}`);
  console.log(`别名：${aliases.c}`);
}

main()
  .catch((error) => {
    console.error(`知识图谱导入失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
