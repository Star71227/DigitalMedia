/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { retrieveKnowledge } = require("./knowledgeRetrievalService");
const { validateCitations } = require("./citationValidationService");
const MIND_TYPES_REQUIRING_CITATIONS = new Set(["concept", "condition", "step", "misconception"]);
const SLIDE_TYPES_REQUIRING_CITATIONS = new Set([
  "concept",
  "process",
  "comparison",
  "misconception",
  "misconceptions",
  "example",
  "code",
  "summary",
]);

async function groundResource(db, envelope, context) {
  const retrieval = await retrieveKnowledge(db, {
    studentId: context.studentId,
    requestType: context.resourceType,
    subject: context.subject,
    knowledgePoint: context.knowledgePoint,
    query: `${context.knowledgePoint} ${context.stageGoals.join(" ")}`,
    stageGoals: context.stageGoals,
    errorPatterns: context.errorPatterns,
    topK: 8,
    minimumScore: 0.12,
  });
  if (retrieval.insufficient)
    throw resourceError("insufficient evidence for resource", "insufficient_evidence");
  const citations = retrieval.results.map((item, index) => ({
    label: `S${index + 1}`,
    chunkId: item.chunkId,
    sourceKey: item.sourceKey,
    sourceTitle: item.sourceTitle,
    chapter: item.chapter,
    section: item.section,
    license: item.license,
    version: item.sourceVersion,
    excerpt: item.content.slice(0, 500),
    supportScore: item.score,
  }));
  const claims = [];
  if (envelope.resourceType === "mind_map") attachMindMap(envelope.content, retrieval, claims);
  else attachSlides(envelope.content, retrieval, claims);
  const validation = validateCitations({ claims, retrieval });
  if (!validation.approved)
    throw resourceError(
      `resource citation validation failed: ${validation.issues.map((item) => item.type).join(",")}`,
      "invalid_resource_citation",
    );
  return {
    envelope: { ...envelope, retrievalRunId: retrieval.retrievalRunId, citations },
    retrieval,
    validation,
  };
}

function attachMindMap(content, retrieval, claims) {
  const visit = (node) => {
    if (MIND_TYPES_REQUIRING_CITATIONS.has(node.nodeType)) {
      const source = bestEvidence(`${node.label} ${node.description}`, retrieval.results);
      node.description = evidenceSentence(source.content);
      node.citations = [source.chunkId];
      claims.push({
        text: node.description,
        chunkIds: node.citations,
        locationKey: `mindmap.node.${node.id}`,
      });
    } else node.citations = [];
    (node.children || []).forEach(visit);
  };
  visit(content.root);
}
function attachSlides(content, retrieval, claims) {
  content.slides.forEach((slide, index) => {
    if (!SLIDE_TYPES_REQUIRING_CITATIONS.has(slide.slideType)) {
      slide.citations = [];
      return;
    }
    const source = bestEvidence(
      [slide.title, slide.body, ...(slide.bullets || [])].join(" "),
      retrieval.results,
    );
    const sentence = evidenceSentence(source.content);
    if (slide.body) slide.body = `${slide.body}\n\n证据摘要：${sentence}`.slice(0, 1200);
    else slide.bullets = [...(slide.bullets || []), `证据摘要：${sentence}`].slice(0, 12);
    slide.citations = [source.chunkId];
    claims.push({ text: sentence, chunkIds: slide.citations, locationKey: `slides[${index}]` });
  });
  content.references = mergeReferences(retrieval.results);
}
function bestEvidence(text, results) {
  const terms = new Set(
    String(text)
      .normalize("NFKC")
      .match(/[\p{Script=Han}]{2,}|[A-Za-z0-9]{2,}/gu) || [],
  );
  return [...results].sort((a, b) => score(b, terms) - score(a, terms))[0];
}
function score(item, terms) {
  const text = String(item.content).toLowerCase();
  let value = item.score || 0;
  for (const term of terms) if (text.includes(String(term).toLowerCase())) value += 0.1;
  return value;
}
function evidenceSentence(text) {
  return (
    String(text)
      .replace(/^#{1,6}\s+.*$/gm, "")
      .split(/[。！？\n]/)
      .map((item) => item.trim())
      .find((item) => item.length >= 18)
      ?.slice(0, 300) || String(text).slice(0, 300)
  );
}
function mergeReferences(results) {
  const seen = new Set();
  return results
    .filter((item) => {
      const key = `${item.sourceKey}@${item.sourceVersion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      sourceKey: item.sourceKey,
      title: item.sourceTitle,
      chapter: item.chapter,
      section: item.section,
      version: item.sourceVersion,
      license: item.license,
    }));
}
function resourceError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}
module.exports = { groundResource, MIND_TYPES_REQUIRING_CITATIONS, SLIDE_TYPES_REQUIRING_CITATIONS };
