/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs/promises");
const path = require("path");
const { splitMarkdown, sha256, normalizeText, slug } = require("./knowledgeChunkingService");
const { inspectKnowledgeText } = require("./knowledgeSafetyService");
const { KNOWLEDGE_SUBJECT_SET } = require("../config/knowledgeSubjects");

const REQUIRED = [
  "sourceKey",
  "title",
  "author",
  "publisher",
  "license",
  "version",
  "subject",
  "chapter",
  "language",
  "sourceType",
];
const ALLOWED_LICENSES = new Set(["CC-BY-4.0", "CC0-1.0", "PUBLIC-DOMAIN", "USER-AUTHORIZED"]);
const ALLOWED_TYPES = new Set(["team_authored", "open_license", "user_provided", "public_domain"]);

function parseFrontMatter(raw) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/m.exec(raw);
  if (!match) throw new Error("missing front matter");
  const metadata = {};
  for (const line of match[1].split("\n")) {
    const position = line.indexOf(":");
    if (position > 0)
      metadata[line.slice(0, position).trim()] = line
        .slice(position + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
  }
  return { metadata, content: match[2] };
}

function validateMetadata(meta) {
  for (const key of REQUIRED)
    if (!String(meta[key] || "").trim()) throw new Error(`missing metadata: ${key}`);
  if (!ALLOWED_LICENSES.has(meta.license)) throw new Error(`license not allowed: ${meta.license}`);
  if (!ALLOWED_TYPES.has(meta.sourceType)) throw new Error(`source type not allowed: ${meta.sourceType}`);
  if (!KNOWLEDGE_SUBJECT_SET.has(meta.subject)) throw new Error(`subject not allowed: ${meta.subject}`);
}

async function walk(root) {
  const output = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(full)));
    else output.push(full);
  }
  return output;
}

async function importKnowledgeBase({ db, rootDir }) {
  const root = path.resolve(rootDir);
  const files = (await walk(root)).filter(
    (file) =>
      path.basename(file) !== "catalog.json" &&
      [".md", ".txt", ".json"].includes(path.extname(file).toLowerCase()),
  );
  const report = {
    files: files.length,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    documents: 0,
    chunks: 0,
    knowledgePoints: 0,
    duplicateChunks: 0,
    unlicensed: 0,
    unlinkedChunks: 0,
    promptInjectionChunks: 0,
    errors: [],
  };
  for (const file of files) await importFile({ db, root, file, report });
  const [[count]] = await db.query("SELECT COUNT(*) count FROM knowledge_points WHERE status='active'");
  report.knowledgePoints = Number(count.count);
  return report;
}

async function importFile({ db, root, file, report }) {
  let connection;
  try {
    if (!path.resolve(file).startsWith(`${root}${path.sep}`)) throw new Error("path outside allowlist");
    const raw = await fs.readFile(file, "utf8");
    const parsed = path.extname(file) === ".json" ? JSON.parse(raw) : parseFrontMatter(raw);
    const meta = parsed.metadata || parsed;
    const content = parsed.content || "";
    validateMetadata(meta);
    // Git may materialize the same tracked source with CRLF on Windows and LF in
    // Linux/containers.  A source fingerprint must describe its content, not the
    // checkout platform, while still rejecting any real same-version change.
    const fileHash = sourceFingerprint(raw);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT id,checksum_sha256 FROM knowledge_sources WHERE source_key=? AND version=?",
      [meta.sourceKey, meta.version],
    );
    if (existing[0]?.checksum_sha256 === fileHash) {
      await connection.rollback();
      report.succeeded += 1;
      report.skipped += 1;
      return;
    }
    if (existing.length) throw new Error("source version changed; increment version");
    const quality = meta.sourceType === "team_authored" || meta.sourceType === "open_license" ? "A" : "B";
    const [source] = await connection.query(
      `INSERT INTO knowledge_sources(source_key,title,author,publisher,license_name,source_type,source_url,subject,language,version,status,quality_grade,checksum_sha256,metadata_json,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?,?,NOW())`,
      [
        meta.sourceKey,
        meta.title,
        meta.author,
        meta.publisher,
        meta.license,
        meta.sourceType,
        meta.sourceUrl || null,
        meta.subject,
        meta.language,
        meta.version,
        quality,
        fileHash,
        JSON.stringify(meta),
      ],
    );
    const documentKey = meta.documentKey || `${meta.sourceKey}-${slug(meta.chapter)}`;
    const [document] = await connection.query(
      `INSERT INTO knowledge_documents(source_id,document_key,title,chapter,section_name,content_text,content_checksum,status) VALUES(?,?,?,?,?,?,?,'active')`,
      [
        source.insertId,
        documentKey,
        meta.title,
        meta.chapter,
        meta.section || null,
        content,
        sha256(content),
      ],
    );
    const chunks = splitMarkdown(content, {
      sourceKey: meta.sourceKey,
      documentKey,
      subject: meta.subject,
      title: meta.title,
    });
    const [points] = await connection.query(
      `SELECT DISTINCT kp.id,kp.name,kp.chapter,a.alias FROM knowledge_points kp LEFT JOIN knowledge_point_aliases a ON a.knowledge_point_id=kp.id WHERE kp.subject=? AND kp.status='active'`,
      [meta.subject],
    );
    for (const chunk of chunks)
      await insertChunk({
        connection,
        sourceId: source.insertId,
        documentId: document.insertId,
        chunk,
        points,
        chapter: meta.chapter,
        report,
      });
    await connection.commit();
    report.succeeded += 1;
    report.documents += 1;
    report.chunks += chunks.length;
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    report.failed += 1;
    if (/license/.test(error.message)) report.unlicensed += 1;
    report.errors.push({ file: path.basename(file), error: error.message });
  } finally {
    if (connection) connection.release();
  }
}

function sourceFingerprint(raw) {
  return sha256(String(raw).replace(/\r\n?/g, "\n"));
}

async function insertChunk({ connection, sourceId, documentId, chunk, points, chapter, report }) {
  const safety = inspectKnowledgeText(chunk.content);
  if (!safety.safe) report.promptInjectionChunks += 1;
  const [insert] = await connection.query(
    `INSERT INTO knowledge_chunks(source_id,document_id,chunk_key,subject,chapter,section_name,heading_path_json,content_text,normalized_text,token_estimate,char_count,chunk_index,checksum_sha256,status,safety_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)`,
    [
      sourceId,
      documentId,
      chunk.chunkKey,
      chunk.subject,
      chunk.chapter,
      chunk.section,
      JSON.stringify(chunk.headingPath),
      chunk.content,
      chunk.normalizedText,
      chunk.tokenEstimate,
      chunk.charCount,
      chunk.chunkIndex,
      chunk.checksum,
      safety.status,
    ],
  );
  const linked = new Set();
  for (const point of points) {
    const needle = normalizeText(point.alias || point.name).toLowerCase();
    if (needle.length > 1 && chunk.normalizedText.toLowerCase().includes(needle) && !linked.has(point.id)) {
      await connection.query(
        "INSERT IGNORE INTO knowledge_chunk_links(chunk_id,knowledge_point_id,relevance_score,annotation_source) VALUES(?,?,?,?)",
        [insert.insertId, point.id, point.name === point.alias ? 1 : 0.85, "rule"],
      );
      linked.add(point.id);
    }
  }
  if (!linked.size) {
    for (const point of points.filter((item) => item.chapter === chapter).slice(0, 8)) {
      if (linked.has(point.id)) continue;
      await connection.query(
        "INSERT IGNORE INTO knowledge_chunk_links(chunk_id,knowledge_point_id,relevance_score,annotation_source) VALUES(?,?,?,?)",
        [insert.insertId, point.id, 0.7, "manual"],
      );
      linked.add(point.id);
    }
  }
  if (!linked.size) report.unlinkedChunks += 1;
}

module.exports = {
  importKnowledgeBase,
  parseFrontMatter,
  validateMetadata,
  sourceFingerprint,
  ALLOWED_LICENSES,
};
