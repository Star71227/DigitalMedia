/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { pool } = require("../config/db");

const MAX_DOCUMENT_CHARS = 800_000;
const MAX_CHUNK_CHARS = 1_600;

async function createPersonalDocument({ studentId, title, fileName, mimeType, subject, contentText }) {
  const owner = normalizeStudentId(studentId);
  const content = String(contentText || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!content) throw requestError("资料正文不能为空；图片或 PDF 请先由前端或 OCR 服务提取文字后上传");
  if (content.length > MAX_DOCUMENT_CHARS)
    throw requestError(`单份资料不能超过 ${MAX_DOCUMENT_CHARS} 个字符`);
  const normalizedSubject = requiredText(subject, "subject", 120);
  const normalizedTitle = requiredText(title || fileName, "title", 255);
  const checksum = sha256(`${normalizedSubject}\n${content}`);
  const chunks = splitText(content);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT id,title,subject,created_at FROM student_knowledge_documents WHERE student_id=? AND checksum_sha256=? LIMIT 1",
      [owner, checksum],
    );
    if (existing[0]) {
      await connection.rollback();
      return { document: toDocument(existing[0]), duplicate: true };
    }
    const [insert] = await connection.query(
      `INSERT INTO student_knowledge_documents
        (student_id,title,file_name,mime_type,subject,content_text,checksum_sha256,status)
       VALUES(?,?,?,?,?,?,?,'active')`,
      [
        owner,
        normalizedTitle,
        optionalText(fileName, 255),
        optionalText(mimeType, 120) || "text/plain",
        normalizedSubject,
        content,
        checksum,
      ],
    );
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      await connection.query(
        `INSERT INTO student_knowledge_chunks
          (document_id,student_id,subject,chunk_index,heading,content_text,normalized_text,checksum_sha256)
         VALUES(?,?,?,?,?,?,?,?)`,
        [
          insert.insertId,
          owner,
          normalizedSubject,
          index,
          chunk.heading,
          chunk.content,
          normalizeText(chunk.content),
          sha256(chunk.content),
        ],
      );
    }
    await connection.commit();
    return {
      document: {
        id: Number(insert.insertId),
        title: normalizedTitle,
        fileName: fileName || null,
        mimeType: mimeType || "text/plain",
        subject: normalizedSubject,
        chunkCount: chunks.length,
        createdAt: new Date().toISOString(),
      },
      duplicate: false,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function listPersonalDocuments(studentId, { subject } = {}) {
  const owner = normalizeStudentId(studentId);
  const params = [owner];
  const where = ["d.student_id=?", "d.status='active'"];
  if (subject) {
    where.push("d.subject=?");
    params.push(String(subject).trim());
  }
  const [rows] = await pool.query(
    `SELECT d.id,d.title,d.file_name,d.mime_type,d.subject,d.created_at,d.updated_at,COUNT(c.id) chunk_count
       FROM student_knowledge_documents d
       LEFT JOIN student_knowledge_chunks c ON c.document_id=d.id
      WHERE ${where.join(" AND ")}
      GROUP BY d.id ORDER BY d.updated_at DESC`,
    params,
  );
  return rows.map(toDocument);
}

async function deletePersonalDocument(studentId, documentId) {
  const [result] = await pool.query("DELETE FROM student_knowledge_documents WHERE id=? AND student_id=?", [
    positiveId(documentId, "documentId"),
    normalizeStudentId(studentId),
  ]);
  return result.affectedRows > 0;
}

async function retrieveCourseEvidence({ studentId, subject, query, limit = 8 }) {
  const owner = normalizeStudentId(studentId);
  const normalizedSubject = requiredText(subject, "subject", 120);
  const normalizedQuery = requiredText(query, "query", 4000);
  const candidateLimit = Math.max(80, Math.min(500, Number(limit) * 50));
  const [courseRows, personalRows] = await Promise.all([
    pool.query(
      `SELECT c.id chunk_id,c.content_text,c.chapter,c.section_name,s.source_key,s.title source_title,
              s.author,s.publisher,s.version,s.source_type
         FROM knowledge_chunks c JOIN knowledge_sources s ON s.id=c.source_id
        WHERE c.subject=? AND c.status='active' AND c.safety_status='safe' AND s.status='active'
        ORDER BY s.quality_grade,c.id LIMIT ?`,
      [normalizedSubject, candidateLimit],
    ),
    pool.query(
      `SELECT c.id chunk_id,c.content_text,c.heading section_name,d.id document_id,d.title source_title,
              d.file_name,d.source_type
         FROM student_knowledge_chunks c JOIN student_knowledge_documents d ON d.id=c.document_id
        WHERE c.student_id=? AND c.subject=? AND d.status='active'
        ORDER BY d.updated_at DESC,c.chunk_index LIMIT ?`,
      [owner, normalizedSubject, candidateLimit],
    ),
  ]);
  const terms = queryTerms(normalizedQuery);
  const scored = [
    ...courseRows[0].map((row) => scoreEvidence(row, terms, "course")),
    ...personalRows[0].map((row) => scoreEvidence(row, terms, "personal")),
  ]
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (a.scope === "course" ? -1 : 1))
    .slice(0, Math.max(3, Math.min(12, Number(limit) || 8)));
  let courseIndex = 0;
  let personalIndex = 0;
  return scored.map((item) => {
    const label = item.scope === "course" ? `T${++courseIndex}` : `P${++personalIndex}`;
    return {
      label,
      scope: item.scope,
      chunkId: Number(item.chunk_id),
      documentId: item.document_id ? Number(item.document_id) : null,
      sourceKey: item.source_key || `personal-${item.document_id}`,
      sourceTitle: item.source_title,
      author: item.author || (item.scope === "personal" ? "学生本人" : ""),
      publisher: item.publisher || "",
      version: item.version || "",
      chapter: item.chapter || "",
      section: item.section_name || "",
      excerpt: String(item.content_text || "").slice(0, 900),
      score: Number(item.score.toFixed(4)),
    };
  });
}

async function getKnowledgeGraph(studentId, { subject } = {}) {
  const owner = normalizeStudentId(studentId);
  const params = [];
  const subjectWhere = subject ? " AND kp.subject=?" : "";
  if (subject) params.push(String(subject).trim());
  const [points, relations, sources, personal] = await Promise.all([
    pool.query(
      `SELECT kp.id,kp.point_key,kp.name,kp.description,kp.difficulty,kp.chapter,kp.subject,
      COUNT(DISTINCT l.chunk_id) resource_count FROM knowledge_points kp
      LEFT JOIN knowledge_chunk_links l ON l.knowledge_point_id=kp.id
      WHERE kp.status='active'${subjectWhere} GROUP BY kp.id ORDER BY kp.subject,kp.chapter,kp.name`,
      params,
    ),
    pool.query(
      `SELECT p.knowledge_point_id source_id,p.prerequisite_knowledge_point_id target_id,
      p.relation_type,p.confidence FROM knowledge_point_prerequisites p
      JOIN knowledge_points kp ON kp.id=p.knowledge_point_id WHERE kp.status='active'${subjectWhere}`,
      params,
    ),
    pool.query(
      `SELECT source_key,title,subject,source_type,version,quality_grade FROM knowledge_sources
      WHERE status='active'${subject ? " AND subject=?" : ""} ORDER BY subject,title`,
      subject ? [String(subject).trim()] : [],
    ),
    pool.query(
      `SELECT id,title,subject,file_name,mime_type,created_at FROM student_knowledge_documents
      WHERE student_id=? AND status='active'${subject ? " AND subject=?" : ""} ORDER BY created_at DESC`,
      subject ? [owner, String(subject).trim()] : [owner],
    ),
  ]);
  return {
    nodes: points[0].map((row) => ({
      id: Number(row.id),
      key: row.point_key,
      label: row.name,
      subject: row.subject,
      chapter: row.chapter,
      difficulty: row.difficulty,
      description: row.description,
      resourceCount: Number(row.resource_count),
    })),
    edges: relations[0].map((row) => ({
      source: Number(row.source_id),
      target: Number(row.target_id),
      type: row.relation_type,
      confidence: Number(row.confidence),
    })),
    resources: [
      ...sources[0].map((row) => ({ ...row, scope: "course" })),
      ...personal[0].map((row) => ({
        id: Number(row.id),
        title: row.title,
        subject: row.subject,
        fileName: row.file_name,
        mimeType: row.mime_type,
        createdAt: row.created_at,
        scope: "personal",
      })),
    ],
  };
}

function splitText(content) {
  const sections = String(content)
    .split(/(?=^#{1,4}\s+)/m)
    .filter((item) => item.trim());
  const chunks = [];
  for (const section of sections.length ? sections : [content]) {
    const heading = (/^#{1,4}\s+(.+)$/m.exec(section)?.[1] || "").trim().slice(0, 255) || null;
    const paragraphs = section
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
    let buffer = "";
    for (const paragraph of paragraphs) {
      if (buffer && buffer.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
        chunks.push({ heading, content: buffer });
        buffer = "";
      }
      if (paragraph.length > MAX_CHUNK_CHARS) {
        for (let offset = 0; offset < paragraph.length; offset += MAX_CHUNK_CHARS) {
          if (buffer) {
            chunks.push({ heading, content: buffer });
            buffer = "";
          }
          chunks.push({ heading, content: paragraph.slice(offset, offset + MAX_CHUNK_CHARS) });
        }
      } else buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
    if (buffer) chunks.push({ heading, content: buffer });
  }
  return chunks.slice(0, 1000);
}

function scoreEvidence(row, terms, scope) {
  const text = normalizeText(
    `${row.source_title || ""} ${row.chapter || ""} ${row.section_name || ""} ${row.content_text || ""}`,
  );
  let hits = 0;
  let weight = 0;
  for (const term of terms) {
    if (!text.includes(term)) continue;
    hits += 1;
    weight += Math.min(2.5, Math.max(0.4, term.length / 3));
  }
  return {
    ...row,
    scope,
    score: terms.length ? (hits / terms.length) * 0.55 + Math.min(0.45, weight / 12) : 0,
  };
}

function queryTerms(value) {
  const text = normalizeText(value);
  const words =
    String(value)
      .toLowerCase()
      .match(/[a-z][a-z0-9_+-]{1,}|[\p{Script=Han}]{2,}/gu) || [];
  const grams = [];
  for (const word of words.filter((item) => /[\p{Script=Han}]/u.test(item))) {
    for (let i = 0; i < word.length - 1 && grams.length < 80; i += 1) grams.push(word.slice(i, i + 2));
  }
  return [
    ...new Set([...words, ...grams, text.length <= 40 ? text : ""].filter((item) => item.length >= 2)),
  ].slice(0, 100);
}

function toDocument(row) {
  return {
    id: Number(row.id),
    title: row.title,
    fileName: row.file_name || null,
    mimeType: row.mime_type || "text/plain",
    subject: row.subject,
    chunkCount: Number(row.chunk_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function normalizeStudentId(value) {
  return positiveId(value, "studentId");
}
function positiveId(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw requestError(`${name} 无效`);
  return number;
}
function requiredText(value, name, max) {
  const text = String(value || "").trim();
  if (!text) throw requestError(`${name} 不能为空`);
  return text.slice(0, max);
}
function optionalText(value, max) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}
function requestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "INVALID_PERSONAL_KNOWLEDGE_INPUT";
  return error;
}

module.exports = {
  createPersonalDocument,
  listPersonalDocuments,
  deletePersonalDocument,
  retrieveCourseEvidence,
  getKnowledgeGraph,
  splitText,
  queryTerms,
};
