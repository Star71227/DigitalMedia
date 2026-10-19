/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
function tokenSet(text) {
  const value = String(text || "")
    .normalize("NFKC")
    .toLowerCase();
  const tokens = value.match(/[a-z0-9]{2,}/g) || [];
  const han = (value.match(/[\p{Script=Han}]/gu) || []).join("");
  for (let index = 0; index < han.length - 1; index += 1) tokens.push(han.slice(index, index + 2));
  return new Set(tokens);
}
function overlap(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / left.size;
}

function validateCitations({ claims, retrieval }) {
  const allowed = new Map(
    (retrieval.results || []).map((item, index) => [
      Number(item.chunkId),
      { ...item, label: `S${index + 1}` },
    ]),
  );
  const normalized = [];
  const issues = [];
  for (let index = 0; index < (claims || []).length; index += 1) {
    const claim = claims[index];
    const locationKey = claim.locationKey || `answer.claims[${index}]`;
    const ids = [...new Set((claim.chunkIds || []).map(Number))];
    if (!ids.length) {
      issues.push({ type: "citation_missing", locationKey });
      continue;
    }
    for (const id of ids) {
      const source = allowed.get(id);
      if (!source) {
        issues.push({ type: "invalid_reference", chunkId: id, locationKey });
        continue;
      }
      const supportScore = overlap(claim.text, source.content);
      const validationStatus = supportScore >= 0.12 ? "valid" : supportScore >= 0.05 ? "weak" : "unsupported";
      if (validationStatus === "unsupported")
        issues.push({ type: "unsupported_claim", chunkId: id, locationKey });
      normalized.push({
        locationKey,
        claimText: String(claim.text || "").slice(0, 1200),
        chunkId: id,
        citationLabel: source.label,
        supportScore,
        validationStatus,
        source,
      });
    }
  }
  const validClaims = new Set(
    normalized.filter((item) => item.validationStatus !== "unsupported").map((item) => item.locationKey),
  ).size;
  const coverage = (claims || []).length ? validClaims / claims.length : 0;
  return { approved: issues.length === 0 && coverage === 1, coverage, issues, citations: normalized };
}

async function persistCitations(
  db,
  { studentId, generationType, generationId, generationVersion = 1, validation },
) {
  for (const citation of validation.citations)
    await db.query(
      `INSERT INTO generation_citations(student_id,generation_type,generation_id,generation_version,location_key,claim_text,chunk_id,citation_label,support_score,validation_status,source_snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        studentId,
        generationType,
        generationId,
        generationVersion,
        citation.locationKey,
        citation.claimText,
        citation.chunkId,
        citation.citationLabel,
        citation.supportScore,
        citation.validationStatus,
        JSON.stringify({
          sourceKey: citation.source.sourceKey,
          title: citation.source.sourceTitle,
          chapter: citation.source.chapter,
          section: citation.source.section,
          license: citation.source.license,
          version: citation.source.sourceVersion,
          excerpt: String(citation.source.content).slice(0, 500),
        }),
      ],
    );
}
module.exports = { validateCitations, persistCitations, overlap };
