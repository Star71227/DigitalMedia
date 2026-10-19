/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { normalizeText } = require("./knowledgeChunkingService");

function assertAcyclic(relations) {
  const graph = new Map();
  for (const [a, b] of relations) graph.set(a, [...(graph.get(a) || []), b]);
  const visiting = new Set();
  const done = new Set();
  function visit(n) {
    if (visiting.has(n)) throw new Error("prerequisite cycle");
    if (done.has(n)) return;
    visiting.add(n);
    for (const x of graph.get(n) || []) visit(x);
    visiting.delete(n);
    done.add(n);
  }
  for (const n of graph.keys()) visit(n);
}

// subject 作为显式参数传入，知识点的唯一键是 (subject, point_key)，不同学科可复用同名 point_key。
async function seedKnowledgePoints(db, catalog, subject) {
  assertAcyclic(catalog.relations || []);
  for (const p of catalog.points) {
    await db.query(
      `INSERT INTO knowledge_points(subject,point_key,name,description,difficulty,chapter,status)
       VALUES(?,?,?,?,?,?,'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),difficulty=VALUES(difficulty),chapter=VALUES(chapter),status='active'`,
      [subject, p.key, p.name, p.description, p.difficulty, p.chapter],
    );
  }
  const [rows] = await db.query("SELECT id,point_key FROM knowledge_points WHERE subject=?", [subject]);
  const ids = new Map(rows.map((x) => [x.point_key, x.id]));
  for (const p of catalog.points) {
    for (const alias of p.aliases || []) {
      await db.query(
        "INSERT IGNORE INTO knowledge_point_aliases(knowledge_point_id,alias,normalized_alias) VALUES(?,?,?)",
        [ids.get(p.key), alias, normalizeText(alias).toLowerCase()],
      );
    }
  }
  for (const [point, pre, type = "prerequisite"] of catalog.relations || []) {
    await db.query(
      "INSERT IGNORE INTO knowledge_point_prerequisites(knowledge_point_id,prerequisite_knowledge_point_id,relation_type,confidence) VALUES(?,?,?,1)",
      [ids.get(point), ids.get(pre), type],
    );
  }
}

// 跨课程关系：catalog.json 中 relations 的 id 按 subject 解析，只能表达课程内关系。
// 跨课程关系放在 knowledge-base/cross-subject-relations.json，写入同一张关系表，
// relation_type 用 cross_subject，以便与课程内 prerequisite 区分（不影响按 prerequisite 做的查询扩展）。
async function seedCrossSubjectRelations(db, doc) {
  if (!doc || !Array.isArray(doc.relations) || doc.relations.length === 0) {
    return { written: 0, invalid: [] };
  }

  const [rows] = await db.query("SELECT id,subject,point_key FROM knowledge_points WHERE status='active'");
  const ids = new Map(rows.map((row) => [row.subject + "::" + row.point_key, row.id]));
  const invalid = [];
  let written = 0;

  for (const relation of doc.relations) {
    const from = relation && relation.from;
    const requires = relation && relation.requires;
    const fromId = from ? ids.get(from.subject + "::" + from.key) : undefined;
    const toId = requires ? ids.get(requires.subject + "::" + requires.key) : undefined;

    if (!fromId || !toId) {
      invalid.push(
        (from ? from.subject + ":" + from.key : "?") +
          " -> " +
          (requires ? requires.subject + ":" + requires.key : "?"),
      );
      continue;
    }

    const [result] = await db.query(
      "INSERT IGNORE INTO knowledge_point_prerequisites(knowledge_point_id,prerequisite_knowledge_point_id,relation_type,confidence) VALUES(?,?,?,?)",
      [fromId, toId, relation.type || "cross_subject", relation.confidence || 1],
    );
    written += result.affectedRows;
  }

  return { written, invalid };
}

module.exports = { seedKnowledgePoints, assertAcyclic, seedCrossSubjectRelations };
