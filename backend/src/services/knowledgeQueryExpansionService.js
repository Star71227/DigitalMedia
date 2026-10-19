/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { normalizeText } = require("./knowledgeChunkingService");
async function expandQuery(db, { subject, query, knowledgePoint, includePrerequisites = true }) {
  const normalized = normalizeText(query)
    .toLowerCase()
    .replace(/[，。！？、；：“”‘’（）]/g, " ")
    .slice(0, 1000);
  const terms = new Set(normalized.split(/\s+/).filter(Boolean));
  if (knowledgePoint) terms.add(normalizeText(knowledgePoint).toLowerCase());
  for (const sequence of normalized.match(/[\p{Script=Han}]{3,}/gu) || [])
    for (let size = 2; size <= Math.min(4, sequence.length); size += 1)
      for (let index = 0; index <= sequence.length - size; index += 1)
        terms.add(sequence.slice(index, index + size));
  const normalizedPoint = normalizeText(knowledgePoint || "").toLowerCase();
  const [rows] = await db.query(
    `SELECT kp.id,kp.name,a.alias FROM knowledge_points kp LEFT JOIN knowledge_point_aliases a ON a.knowledge_point_id=kp.id WHERE kp.subject=? AND kp.status='active' AND (kp.name=? OR a.normalized_alias=? OR ? LIKE CONCAT('%',kp.name,'%') OR ? LIKE CONCAT('%',a.alias,'%'))`,
    [subject, knowledgePoint || "", normalizedPoint, knowledgePoint || "", knowledgePoint || ""],
  );
  for (const row of rows) {
    terms.add(row.name);
    if (row.alias) terms.add(row.alias);
    if (includePrerequisites) {
      const [pre] = await db.query(
        `SELECT p.name FROM knowledge_point_prerequisites r JOIN knowledge_points p ON p.id=r.prerequisite_knowledge_point_id WHERE r.knowledge_point_id=? AND r.relation_type='prerequisite' LIMIT 5`,
        [row.id],
      );
      pre.forEach((x) => terms.add(x.name));
    }
  }
  return {
    normalized,
    terms: [...terms].filter((x) => x.length > 1).slice(0, 20),
    pointIds: rows.map((x) => x.id),
  };
}
module.exports = { expandQuery };
