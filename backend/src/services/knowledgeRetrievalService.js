/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { expandQuery } = require("./knowledgeQueryExpansionService");
const { scoreEmbeddings } = require("./embeddingService");
const REQUEST_TYPES = new Set(["chat", "study_note", "mind_map", "pptx", "learning_path", "review", "test"]);
const RAG_SUPPORTED_SUBJECTS = new Set(["数据结构", "操作系统", "计算机组成原理", "计算机网络", "C语言"]);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
async function retrieveKnowledge(db, input) {
  const studentId = Number(input.studentId);
  if (!Number.isInteger(studentId) || studentId < 1) throw new Error("authenticated studentId required");
  if (!REQUEST_TYPES.has(input.requestType)) throw new Error("invalid requestType");
  const subject = String(input.subject || "").slice(0, 120);
  const query = String(input.query || "")
    .trim()
    .slice(0, 1000);
  if (query.length < 2) throw new Error("query too short");
  if (!isSubjectSupportedForRag(subject))
    return unsupportedRetrieval({ subject, query, knowledgePoint: input.knowledgePoint });
  const topK = clamp(Number(input.topK) || 5, 3, 8),
    minimumScore = clamp(Number(input.minimumScore) || 0.18, 0.05, 0.95);
  const expanded = await expandQuery(db, {
    subject,
    query,
    knowledgePoint: String(input.knowledgePoint || "").slice(0, 180),
    includePrerequisites: input.includePrerequisites !== false,
  });
  const [run] = await db.query(
    `INSERT INTO knowledge_retrieval_runs(student_id,request_type,subject,knowledge_point,query_text,normalized_query,filters_json,retrieval_strategy,top_k,minimum_score,result_count) VALUES(?,?,?,?,?,?,?,?,?,?,0)`,
    [
      studentId,
      input.requestType,
      subject,
      input.knowledgePoint || null,
      query,
      expanded.normalized,
      JSON.stringify({
        chapter: input.chapter || null,
        stageGoals: input.stageGoals || [],
        errorPatterns: input.errorPatterns || [],
      }),
      "lexical+alias+relation",
      topK,
      minimumScore,
    ],
  );
  const params = [subject];
  let chapterSql = "";
  if (input.chapter) {
    chapterSql = " AND c.chapter=?";
    params.push(String(input.chapter).slice(0, 255));
  }
  const [rows] = await db.query(
    `SELECT c.id,c.chunk_key,c.content_text,c.chapter,c.section_name,c.heading_path_json,c.chunk_index,c.checksum_sha256,s.source_key,s.title source_title,s.author,s.publisher,s.license_name,s.version,s.source_type,s.quality_grade,l.knowledge_point_id,l.relevance_score FROM knowledge_chunks c JOIN knowledge_sources s ON s.id=c.source_id LEFT JOIN (SELECT chunk_id,MAX(knowledge_point_id) knowledge_point_id,MAX(relevance_score) relevance_score FROM knowledge_chunk_links GROUP BY chunk_id) l ON l.chunk_id=c.id WHERE c.subject=? ${chapterSql} AND c.status='active' AND c.safety_status='safe' AND s.status='active' AND s.quality_grade<>'Rejected' LIMIT 5000`,
    params,
  );
  const semantic = await scoreEmbeddings(query, rows);
  const terms = expanded.terms.map((x) => String(x).toLowerCase());
  const goals = (input.stageGoals || []).join(" ").toLowerCase();
  const errors = (input.errorPatterns || [])
    .map((x) => (typeof x === "string" ? x : x.errorType))
    .join(" ")
    .toLowerCase();
  const scored = rows
    .map((r) => {
      const text = String(r.content_text).toLowerCase();
      let hits = 0,
        weighted = 0;
      for (const term of terms) {
        if (text.includes(term)) {
          hits++;
          weighted += Math.min(term.length / 8, 1);
        }
      }
      const lexical = Math.min(1, (hits + weighted) / Math.max(3, terms.length));
      const relation = expanded.pointIds.includes(Number(r.knowledge_point_id))
        ? Number(r.relevance_score || 0.8)
        : 0;
      const stage = terms.some((t) => goals.includes(t) && text.includes(t)) ? 0.08 : 0;
      const error = terms.some((t) => errors.includes(t) && text.includes(t)) ? 0.06 : 0;
      const quality = r.quality_grade === "A" ? 0.08 : r.quality_grade === "B" ? 0.04 : 0;
      const semanticScore = Number(semantic.get(r.id) || 0);
      const sec = String(r.section_name || "").toLowerCase();
      let secHits = 0;
      for (const term of terms) {
        if (term.length >= 2 && sec.includes(term)) secHits++;
      }
      const sectionBonus = Math.min(0.18, secHits * 0.06);
      return {
        ...r,
        lexicalScore: lexical,
        semanticScore,
        relationScore: relation,
        sectionScore: sectionBonus,
        finalScore: Math.min(
          1,
          lexical * 0.62 + semanticScore * 0.18 + relation * 0.12 + stage + error + quality + sectionBonus,
        ),
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
  const selected = [];
  const seen = new Set();
  for (const row of scored) {
    if (row.finalScore < minimumScore) continue;
    if (seen.has(row.checksum_sha256)) continue;
    if (
      selected.some(
        (x) =>
          x.source_key === row.source_key &&
          Math.abs(x.chunk_index - row.chunk_index) <= 1 &&
          x.section_name === row.section_name,
      )
    )
      continue;
    seen.add(row.checksum_sha256);
    selected.push(row);
    if (selected.length >= topK) break;
  }
  let rank = 0;
  for (const row of scored.slice(0, Math.max(topK * 3, 20))) {
    rank++;
    const chosen = selected.some((x) => x.id === row.id);
    await db.query(
      `INSERT INTO knowledge_retrieval_results(retrieval_run_id,chunk_id,rank_position,lexical_score,semantic_score,relation_score,final_score,selected,rejection_reason) VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        run.insertId,
        row.id,
        rank,
        row.lexicalScore,
        row.semanticScore,
        row.relationScore,
        row.finalScore,
        chosen ? 1 : 0,
        chosen ? null : row.finalScore < minimumScore ? "below_threshold" : "deduplicated",
      ],
    );
  }
  const confidence = calculateConfidence(selected);
  await db.query("UPDATE knowledge_retrieval_runs SET result_count=?,confidence=? WHERE id=?", [
    selected.length,
    confidence,
    run.insertId,
  ]);
  return {
    retrievalRunId: run.insertId,
    query,
    normalizedQuery: expanded.normalized,
    strategy: "lexical+alias+relation",
    confidence,
    insufficient: selected.length === 0,
    unsupportedForRag: false,
    results: selected.map((r, i) => ({
      rank: i + 1,
      chunkId: r.id,
      chunkKey: r.chunk_key,
      sourceKey: r.source_key,
      sourceTitle: r.source_title,
      author: r.author,
      publisher: r.publisher,
      license: r.license_name,
      sourceVersion: r.version,
      sourceType: r.source_type,
      qualityGrade: r.quality_grade,
      chapter: r.chapter,
      section: r.section_name,
      headingPath: safeJson(r.heading_path_json, []),
      content: String(r.content_text).slice(0, 1800),
      score: Number(r.finalScore.toFixed(4)),
    })),
  };
}
function calculateConfidence(rows) {
  if (!rows.length) return "insufficient";
  const avg = rows.reduce((s, x) => s + x.finalScore, 0) / rows.length;
  const sources = new Set(rows.map((x) => x.source_key)).size;
  const low = rows.every((x) => x.quality_grade === "C");
  if (low) return "low";
  if (avg >= 0.62 && sources >= 2) return "high";
  if (avg >= 0.38) return "medium";
  return "low";
}
function safeJson(v, f) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v || f;
  } catch {
    return f;
  }
}
function isSubjectSupportedForRag(subject) {
  return RAG_SUPPORTED_SUBJECTS.has(String(subject || "").trim());
}
function unsupportedRetrieval({ subject, query, knowledgePoint }) {
  return {
    retrievalRunId: null,
    query,
    normalizedQuery: String(query || "").toLowerCase(),
    strategy: "not_applicable",
    confidence: "insufficient",
    insufficient: true,
    unsupportedForRag: true,
    subject,
    knowledgePoint: knowledgePoint || null,
    results: [],
  };
}
module.exports = {
  retrieveKnowledge,
  calculateConfidence,
  isSubjectSupportedForRag,
  unsupportedRetrieval,
  REQUEST_TYPES,
  RAG_SUPPORTED_SUBJECTS,
};
