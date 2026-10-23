/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const { initKnowledgeBaseDB } = require("../config/initKnowledgeBaseDB");
const { seedKnowledgePoints, seedCrossSubjectRelations } = require("./knowledgePointService");
const { importKnowledgeBase } = require("./knowledgeIngestionService");

// 每门课一个目录，目录内含 catalog.json 与带 front matter 的 Markdown 源文件。
// sourceDefaults：sourceKey -> pointKey，用于给每个来源兜底挂一个知识点（手动标注）。
const COURSES = [
  {
    dir: "data-structures",
    subject: "数据结构",
    sourceDefaults: {
      "ds-team-complexity": "complexity",
      "ds-team-linear-lists": "array",
      "ds-team-stack-queue": "stack",
      "ds-team-binary-tree": "binary-tree",
      "ds-team-bst": "bst",
      "ds-team-avl": "avl",
      "ds-team-notes-balanced-tree": "red-black-tree",
      "ds-team-heap": "heap",
      "ds-team-graph-representation": "graph",
      "ds-team-graph-traversal": "bfs",
      "ds-team-shortest-mst": "shortest-path",
      "ds-team-search-hash": "hash-table",
      "ds-team-basic-sorts": "insertion-sort",
      "ds-team-advanced-sorts": "quick-sort",
      "ds-team-algorithm-design": "divide-conquer",
    },
  },
  {
    dir: "operating-systems",
    subject: "操作系统",
    sourceDefaults: {
      "os-team-process-thread": "process-thread",
      "os-team-process-state": "process-state",
      "os-team-cpu-scheduling": "cpu-scheduling",
      "os-team-process-sync": "process-sync",
      "os-team-semaphore": "semaphore",
      "os-team-deadlock": "deadlock",
      "os-team-memory": "memory-management",
      "os-team-virtual-memory": "virtual-memory",
      "os-team-file-system": "file-system",
      "os-team-disk-io": "disk-io",
    },
  },
  {
    dir: "computer-organization",
    subject: "计算机组成原理",
    sourceDefaults: {
      "co-team-number-repr": "number-representation",
      "co-team-alu": "alu",
      "co-team-instruction": "instruction",
      "co-team-datapath": "cpu-datapath",
      "co-team-pipeline": "pipeline",
      "co-team-memory-hierarchy": "memory-hierarchy",
      "co-team-cache": "cache",
      "co-team-main-memory": "main-memory",
      "co-team-bus": "bus",
      "co-team-io-interrupt": "io-interrupt",
    },
  },
  {
    dir: "computer-networks",
    subject: "计算机网络",
    sourceDefaults: {
      "cn-team-arch": "network-arch",
      "cn-team-data-link": "data-link",
      "cn-team-arp": "arp",
      "cn-team-ip": "ip",
      "cn-team-routing": "routing",
      "cn-team-tcp": "tcp",
      "cn-team-tcp-conn": "tcp-conn",
      "cn-team-udp": "udp",
      "cn-team-congestion": "congestion",
      "cn-team-app": "app-layer",
    },
  },
  {
    dir: "c-language",
    subject: "C语言",
    sourceDefaults: {
      "c-team-basics": "c-basics",
      "c-team-operators": "c-operators",
      "c-team-control": "c-control",
      "c-team-functions": "c-functions",
      "c-team-arrays": "c-arrays",
      "c-team-pointers": "c-pointers",
      "c-team-strings": "c-strings",
      "c-team-structs": "c-structs",
      "c-team-preprocessor": "c-preprocessor",
      "c-team-memory": "c-memory",
      "c-team-files": "c-files",
    },
  },
];

function loadCatalog(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "catalog.json"), "utf8"));
}

async function importBundledKnowledgeBase({ db = pool, rootDir } = {}) {
  await initKnowledgeBaseDB(db);
  const base = rootDir || path.resolve(__dirname, "../../data/knowledge-base");
  const reports = [];

  for (const course of COURSES) {
    const dir = path.join(base, course.dir);
    if (!fs.existsSync(path.join(dir, "catalog.json"))) {
      throw new Error(`missing catalog.json for course ${course.subject}: ${dir}`);
    }
    const raw = loadCatalog(dir);
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
    await seedKnowledgePoints(db, catalog, course.subject);
    const report = await importKnowledgeBase({ db, rootDir: dir });
    reports.push({ subject: course.subject, dir: course.dir, ...report });
    if (report.failed) {
      const error = new Error(`knowledge base import did not complete for ${course.subject}`);
      error.code = "KNOWLEDGE_IMPORT_FAILED";
      error.report = report;
      throw error;
    }
  }

  // 跨课程关系：catalog.json 只能表达课程内关系，跨课程关系单独成文，导入时一并写入。
  const crossSubjectFile = path.join(base, "cross-subject-relations.json");
  let crossSubjectReport = { written: 0, invalid: [] };
  if (fs.existsSync(crossSubjectFile)) {
    const crossDoc = JSON.parse(fs.readFileSync(crossSubjectFile, "utf8"));
    crossSubjectReport = await seedCrossSubjectRelations(db, crossDoc);
    if (crossSubjectReport.invalid.length) {
      console.warn(
        "跨课程关系中有 " +
          crossSubjectReport.invalid.length +
          " 条引用了不存在的知识点：" +
          crossSubjectReport.invalid.slice(0, 5).join("；"),
      );
    }
    console.log(
      "跨课程关系写入 " + crossSubjectReport.written + " 条（" + crossDoc.relations.length + " 条待写入）",
    );
  }

  // 通用兜底：按“学科 + 章节”把 chunk 挂到同章节知识点。
  await db.query(`INSERT IGNORE INTO knowledge_chunk_links(chunk_id,knowledge_point_id,relevance_score,annotation_source)
    SELECT c.id,kp.id,0.7,'manual' FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.id=c.document_id
    JOIN knowledge_points kp ON kp.subject COLLATE utf8mb4_unicode_ci=c.subject COLLATE utf8mb4_unicode_ci
      AND kp.chapter COLLATE utf8mb4_unicode_ci=d.chapter COLLATE utf8mb4_unicode_ci AND kp.status='active'
    LEFT JOIN knowledge_chunk_links existing ON existing.chunk_id=c.id
    WHERE c.status='active' AND existing.id IS NULL`);

  // 来源级兜底：每个 source 至少挂到它对应的默认知识点。
  for (const course of COURSES) {
    for (const [sourceKey, pointKey] of Object.entries(course.sourceDefaults)) {
      await db.query(
        `INSERT IGNORE INTO knowledge_chunk_links(chunk_id,knowledge_point_id,relevance_score,annotation_source)
        SELECT c.id,kp.id,0.7,'manual' FROM knowledge_chunks c
        JOIN knowledge_sources s ON s.id=c.source_id
        JOIN knowledge_points kp ON kp.point_key=? AND kp.subject=?
        LEFT JOIN knowledge_chunk_links existing ON existing.chunk_id=c.id
        WHERE s.source_key=? AND c.status='active' AND existing.id IS NULL`,
        [pointKey, course.subject, sourceKey],
      );
    }
  }

  const total = reports.reduce(
    (acc, r) => {
      acc.files += r.files || 0;
      acc.succeeded += r.succeeded || 0;
      acc.skipped += r.skipped || 0;
      acc.failed += r.failed || 0;
      acc.documents += r.documents || 0;
      acc.chunks += r.chunks || 0;
      acc.errors = acc.errors.concat(r.errors || []);
      return acc;
    },
    { files: 0, succeeded: 0, skipped: 0, failed: 0, documents: 0, chunks: 0, errors: [] },
  );

  // knowledgePoints 是导入过程中全局累计值，取最后一份报告即可，不做跨课程累加。
  total.knowledgePoints = reports.length ? reports[reports.length - 1].knowledgePoints || 0 : 0;

  return { courses: reports, total };
}

module.exports = { importBundledKnowledgeBase, COURSES };
