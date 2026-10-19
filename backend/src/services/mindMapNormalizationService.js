/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");

const NODE_TYPES = new Set([
  "root",
  "concept",
  "condition",
  "step",
  "example",
  "warning",
  "misconception",
  "formula",
  "code",
  "summary",
]);
const IMPORTANCE = new Set(["high", "medium", "low"]);

function normalizeMindMapContent(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mind_map content must be object");
  }
  const state = { idMap: new Map() };
  const root =
    value.root && typeof value.root === "object" && !Array.isArray(value.root)
      ? normalizeNode(value.root, ["root"], state, options)
      : normalizeFlatGraph(value, state, options);
  if (!root) throw new Error("mind_map root is required");
  if (root.nodeType !== "root") root.nodeType = "root";
  root.importance = root.importance || "high";
  const crossLinks = normalizeLinks(value.crossLinks || value.links || [], state, options);
  return {
    root,
    crossLinks,
    ...listFields(value, root, state, options),
  };
}

function listFields(value, root, state, options) {
  const ids = collectIds(root);
  return {
    highlightNodeIds: normalizeIdList(value.highlightNodeIds, state, ids, options),
    misconceptionNodeIds: normalizeIdList(value.misconceptionNodeIds, state, ids, options),
    recommendedSequence: normalizeIdList(value.recommendedSequence, state, ids, options),
  };
}

function normalizeNode(node, path, state, options) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const label = cleanText(node.label ?? node.title ?? node.name);
  const rawId = cleanText(node.id ?? node.key);
  const id = normalizeId(rawId, label, path, options);
  if (rawId) state.idMap.set(rawId, id);
  const nodeType = cleanEnum(
    node.nodeType ?? node.type ?? node.category,
    NODE_TYPES,
    path.length === 1 ? "root" : "concept",
  );
  const importance = cleanEnum(node.importance, IMPORTANCE, path.length <= 2 ? "high" : "medium");
  const children = array(node.children)
    .map((child) => normalizeNode(child, [...path, label || id], state, options))
    .filter(Boolean);
  return {
    id,
    label,
    description: cleanText(node.description ?? node.explanation ?? node.detail),
    nodeType,
    importance,
    children,
    citations: normalizeCitationIds(node.citations ?? node.sourceRefs),
  };
}

function normalizeFlatGraph(value, state, options) {
  const rawNodes = array(value.nodes);
  if (!rawNodes.length) return null;
  const normalized = rawNodes.map((node) =>
    normalizeNode(
      { ...node, children: [] },
      ["nodes", node?.label || node?.title || node?.id || ""],
      state,
      options,
    ),
  );
  const byRaw = new Map();
  rawNodes.forEach((node, index) => {
    const normalizedNode = normalized[index];
    for (const key of [node?.id, node?.key, normalizedNode?.id].filter(Boolean))
      byRaw.set(String(key), normalizedNode);
  });
  const childIds = new Set();
  const attach = (parentKey, childKey) => {
    const parent = byRaw.get(String(parentKey || ""));
    const child = byRaw.get(String(childKey || ""));
    if (!parent || !child || parent === child) return;
    parent.children.push(child);
    childIds.add(child.id);
  };
  rawNodes.forEach((node) => {
    if (node?.parentId !== undefined && node.parentId !== null && String(node.parentId).trim())
      attach(node.parentId, node.id ?? node.key);
  });
  for (const edge of array(value.edges)) {
    const source = edge.sourceId ?? edge.source ?? edge.from ?? edge.parentId;
    const target = edge.targetId ?? edge.target ?? edge.to ?? edge.childId;
    const type = String(edge.type || edge.kind || "hierarchy");
    if (!/cross/i.test(type)) attach(source, target);
  }
  return (
    normalized.find((node) => node.nodeType === "root") ||
    normalized.find((node) => !childIds.has(node.id)) ||
    normalized[0]
  );
}

function normalizeLinks(links, state, options) {
  return array(links)
    .map((link) => {
      if (!link || typeof link !== "object" || Array.isArray(link)) return null;
      const sourceId = mapId(link.sourceId ?? link.source ?? link.from, state, options);
      const targetId = mapId(link.targetId ?? link.target ?? link.to, state, options);
      const label = cleanText(link.label ?? link.relation ?? link.description);
      return sourceId && targetId ? { sourceId, targetId, label } : null;
    })
    .filter(Boolean);
}

function normalizeIdList(value, state, ids, options) {
  return array(value)
    .map((item) => mapId(item, state, options))
    .filter((id) => ids.has(id))
    .slice(0, 60);
}

function mapId(value, state, options) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (state.idMap.has(raw)) return state.idMap.get(raw);
  return options.repairIds ? safeId(raw) : raw;
}

function normalizeId(rawId, label, path, options) {
  const raw = cleanText(rawId);
  if (!options.repairIds) return raw;
  const candidate = safeId(raw || label);
  if (candidate) return candidate;
  return `mm-${crypto.createHash("sha1").update(path.join(">")).digest("hex").slice(0, 10)}`;
}

function safeId(value) {
  const ascii = String(value || "")
    .normalize("NFKC")
    .replace(/[\u4e00-\u9fff]+/g, (match) =>
      crypto.createHash("sha1").update(match).digest("hex").slice(0, 8),
    )
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return ascii || "";
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/javascript:|data:text\/html|vbscript:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEnum(value, allowed, fallback) {
  const text = cleanText(value);
  return allowed.has(text) ? text : fallback;
}

function normalizeCitationIds(value) {
  return [
    ...new Set(
      array(value)
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ].slice(0, 8);
}

function collectIds(root) {
  const ids = new Set();
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (node.id) ids.add(node.id);
    array(node.children).forEach(visit);
  };
  visit(root);
  return ids;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { normalizeMindMapContent, collectIds, cleanText, safeId, NODE_TYPES, IMPORTANCE };
