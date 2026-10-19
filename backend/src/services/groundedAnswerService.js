/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { retrieveKnowledge } = require("./knowledgeRetrievalService");
const { buildGroundingContext } = require("./groundingContextService");
const { validateCitations, persistCitations } = require("./citationValidationService");

async function prepareGrounding(db, input, options = {}) {
  const retrieveKnowledgeFn = options.retrieveKnowledgeFn || retrieveKnowledge;
  try {
    const retrieval = await retrieveKnowledgeFn(db, { ...input, requestType: input.requestType || "chat" });
    return {
      retrieval,
      hasEvidence: !retrieval.insufficient && retrieval.results.length > 0,
      unsupportedForRag: Boolean(retrieval.unsupportedForRag),
      context: retrieval.results.length ? buildGroundingContext(retrieval) : null,
      warning: null,
    };
  } catch (error) {
    if (!options.tolerateFailure) throw error;
    return {
      retrieval: emptyRetrieval(input),
      hasEvidence: false,
      unsupportedForRag: false,
      context: null,
      warning: "knowledge_retrieval_unavailable",
    };
  }
}

function validateAnswerCitations(answerMarkdown, retrieval) {
  const results = Array.isArray(retrieval?.results) ? retrieval.results : [];
  const references = extractCitationReferences(answerMarkdown);
  const claims = references.map((reference, index) => ({
    locationKey: `answer.citations[${index}]`,
    text: reference.claimText,
    chunkIds:
      reference.index >= 0 && results[reference.index] ? [results[reference.index].chunkId] : [Number.NaN],
  }));
  const validation = validateCitations({ claims, retrieval: retrieval || { results: [] } });
  const citations = validation.citations
    .filter((item) => item.validationStatus !== "unsupported")
    .map(formatCitation);
  return {
    approved: references.length > 0 && validation.approved,
    coverage: validation.coverage,
    issues: references.length ? validation.issues : [{ type: "citation_missing", locationKey: "answer" }],
    citations: deduplicateCitations(citations),
    validation,
  };
}

function buildDeterministicGroundedAnswer(question, retrieval, options = {}) {
  // 回退原因可能是「模型服务不可用」，也可能是「模型回答未通过教学质量校验」，正文要如实区分。
  const qualityFailed = options.reason === "quality";
  const selected = (retrieval?.results || []).slice(0, 5);
  const claims = selected.map((item, index) => ({
    text: evidenceExcerpt(item.content),
    chunkIds: [item.chunkId],
    label: `S${index + 1}`,
  }));
  const answerMarkdown = [
    "# 基于本地课程资料的回答",
    "",
    qualityFailed
      ? "本次模型回答未通过教学质量校验，以下内容依据本地课程资料整理。"
      : "当前模型服务不可用，以下内容依据本地课程资料整理。",
    "",
    "## 核心结论",
    "",
    claims[0] ? `${claims[0].text} [${claims[0].label}]` : "本地资料暂未形成可用结论。",
    "",
    "## 关键概念",
    "",
    ...claims.slice(0, 3).map((claim) => `- ${claim.text} [${claim.label}]`),
    "",
    "## 分步说明",
    "",
    ...claims.map((claim, index) => `${index + 1}. 对照资料要点：${claim.text} [${claim.label}]`),
    "",
    "## 与当前问题的对应关系",
    "",
    `你的问题是“${String(question || "").slice(0, 300)}”。上面的资料要点给出了当前本地课程库能够确认的范围；未被资料覆盖的细节没有补造。`,
    "",
    "## 下一步建议",
    "",
    "- 对照引用原文复核关键术语、前提和边界。",
    qualityFailed
      ? "- 可换一种更具体的问法或缩小问题范围后重新提问，以获得更完整的示例、代码和推导。"
      : "- 模型服务恢复后，可重新提问以获得更完整的示例、代码和推导。",
  ]
    .join("\n")
    .trim();
  const validation = validateCitations({
    claims: claims.map((claim, index) => ({
      locationKey: `answer.claims[${index}]`,
      text: claim.text,
      chunkIds: claim.chunkIds,
    })),
    retrieval,
  });
  return {
    answerMarkdown,
    claims,
    validation,
    citations: deduplicateCitations(validation.citations.map(formatCitation)),
    coverage: validation.coverage,
  };
}

async function persistGroundedCitations(db, input) {
  if (!input.validation?.approved || !input.validation.citations?.length) return false;
  await persistCitations(db, {
    studentId: input.studentId,
    generationType: "chat_answer",
    generationId: input.generationId,
    generationVersion: 1,
    validation: input.validation,
  });
  return true;
}

async function generateGroundedAnswer(db, input, options = {}) {
  const prepared = await prepareGrounding(db, input, options);
  if (!prepared.hasEvidence) return insufficientResult(prepared.retrieval);
  const generated = buildDeterministicGroundedAnswer(input.query, prepared.retrieval);
  if (!generated.validation.approved)
    return insufficientResult(prepared.retrieval, generated.validation.issues);
  const generationId = crypto.randomUUID();
  await persistGroundedCitations(db, {
    studentId: input.studentId,
    generationId,
    validation: generated.validation,
  });
  return {
    generationId,
    retrievalRunId: prepared.retrieval.retrievalRunId,
    status: "grounded",
    answer: generated.answerMarkdown,
    answerMarkdown: generated.answerMarkdown,
    claims: generated.claims,
    citations: generated.citations,
    confidence: prepared.retrieval.confidence,
    coverage: generated.coverage,
  };
}

function extractCitationReferences(answerMarkdown) {
  const source = String(answerMarkdown || "");
  const references = [];
  const pattern = /\[S(\d+)\]/g;
  let match = pattern.exec(source);
  while (match) {
    const start = Math.max(
      0,
      Math.max(source.lastIndexOf("\n", match.index - 1), source.lastIndexOf("。", match.index - 1)) + 1,
    );
    const endCandidates = [
      source.indexOf("\n", match.index),
      source.indexOf("。", match.index + match[0].length),
    ].filter((value) => value >= 0);
    const end = endCandidates.length
      ? Math.min(...endCandidates)
      : Math.min(source.length, match.index + 400);
    references.push({
      index: Number(match[1]) - 1,
      claimText: source
        .slice(start, end)
        .replace(/\[S\d+\]/g, "")
        .trim()
        .slice(0, 1200),
    });
    match = pattern.exec(source);
  }
  return references;
}

function formatCitation(item) {
  return {
    label: item.citationLabel,
    chunkId: item.chunkId,
    sourceKey: item.source.sourceKey,
    sourceTitle: item.source.sourceTitle,
    chapter: item.source.chapter,
    section: item.source.section,
    license: item.source.license,
    version: item.source.sourceVersion,
    excerpt: String(item.source.content || "").slice(0, 500),
    supportScore: Number(Number(item.supportScore || 0).toFixed(3)),
  };
}

function deduplicateCitations(citations) {
  const seen = new Set();
  return citations.filter((item) => {
    const key = `${item.label}:${item.chunkId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceExcerpt(text) {
  const cleaned = String(text || "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 700);
}

function emptyRetrieval(input) {
  return {
    retrievalRunId: null,
    query: String(input.query || ""),
    strategy: "unavailable",
    confidence: "insufficient",
    insufficient: true,
    unsupportedForRag: false,
    results: [],
  };
}

function insufficientResult(retrieval, issues = []) {
  return {
    retrievalRunId: retrieval?.retrievalRunId || null,
    status: "insufficient",
    answer: "本地课程资料未检索到足以形成带引用回答的内容。",
    answerMarkdown: "本地课程资料未检索到足以形成带引用回答的内容。",
    claims: [],
    citations: [],
    confidence: "insufficient",
    coverage: 0,
    issues,
  };
}

module.exports = {
  generateGroundedAnswer,
  prepareGrounding,
  validateAnswerCitations,
  buildDeterministicGroundedAnswer,
  persistGroundedCitations,
  extractCitationReferences,
};
