/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { retrieveKnowledge } = require("../services/knowledgeRetrievalService");
const { generateGroundedAnswer } = require("../services/groundedAnswerService");
async function search(req, res, next) {
  try {
    return res.json(
      await retrieveKnowledge(pool, {
        ...req.body,
        studentId: req.user.studentId,
        requestType: req.body.requestType || "chat",
      }),
    );
  } catch (error) {
    return next(error);
  }
}
async function answer(req, res, next) {
  try {
    return res.json(await generateGroundedAnswer(pool, { ...req.body, studentId: req.user.studentId }));
  } catch (error) {
    return next(error);
  }
}
async function run(req, res, next) {
  try {
    const [[row]] = await pool.query("SELECT * FROM knowledge_retrieval_runs WHERE id=? AND student_id=?", [
      Number(req.params.id),
      req.user.studentId,
    ]);
    if (!row) return res.status(404).json({ error: "not found" });
    const [results] = await pool.query(
      "SELECT * FROM knowledge_retrieval_results WHERE retrieval_run_id=? ORDER BY rank_position",
      [row.id],
    );
    return res.json({ ...row, results });
  } catch (error) {
    return next(error);
  }
}
async function sources(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT source_key,title,author,publisher,license_name,source_type,subject,language,version,status,quality_grade,imported_at FROM knowledge_sources WHERE status='active' ORDER BY title,version",
    );
    return res.json({ sources: rows });
  } catch (error) {
    return next(error);
  }
}
async function citations(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT generation_type,generation_id,generation_version,location_key,claim_text,chunk_id,citation_label,support_score,validation_status,source_snapshot_json,created_at FROM generation_citations WHERE student_id=? AND generation_type=? AND generation_id=? AND generation_version=? ORDER BY location_key,citation_label",
      [req.user.studentId, req.params.generationType, req.params.generationId, Number(req.params.version)],
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    return res.json({
      citations: rows.map((row) => ({
        ...row,
        sourceSnapshot:
          typeof row.source_snapshot_json === "string"
            ? JSON.parse(row.source_snapshot_json)
            : row.source_snapshot_json,
      })),
    });
  } catch (error) {
    return next(error);
  }
}
async function overview(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT s.subject,
              (SELECT COUNT(*) FROM knowledge_sources WHERE subject = s.subject AND status = 'active') AS sources,
              (SELECT COUNT(*) FROM knowledge_chunks WHERE subject = s.subject AND status = 'active') AS chunks,
              (SELECT COUNT(*) FROM knowledge_points WHERE subject = s.subject AND status = 'active') AS points
         FROM (SELECT DISTINCT subject FROM knowledge_sources WHERE status = 'active') s
        ORDER BY s.subject`,
    );
    const subjects = rows.map((row) => ({
      subject: row.subject,
      sources: Number(row.sources),
      chunks: Number(row.chunks),
      points: Number(row.points),
    }));
    const total = subjects.reduce(
      (acc, item) => ({
        subjects: acc.subjects + 1,
        sources: acc.sources + item.sources,
        chunks: acc.chunks + item.chunks,
        points: acc.points + item.points,
      }),
      { subjects: 0, sources: 0, chunks: 0, points: 0 },
    );
    return res.json({ subjects, total });
  } catch (error) {
    return next(error);
  }
}

module.exports = { search, answer, run, sources, citations, overview };
