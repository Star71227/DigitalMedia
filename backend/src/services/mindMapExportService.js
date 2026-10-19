/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

/**
 * 把 LearnMate 生成或导入的思维导图内容转换成 simple-mind-map（本地「思绪思维导图」）可导入的 JSON。
 *
 * 分工与 PPTist 导出一致：内容由 LearnMate 侧产生，simple-mind-map 只负责「可编辑 + 导出图片/PDF」。
 * 目标格式见上游 src/pages/Edit/components/... 的导入逻辑与 index.html 的 getDataFromBackend 示例：
 *   { root: { data: { text, note, tag, ... }, children: [...] }, theme, layout, config, view }
 *
 * 字段映射：
 *   label        → data.text
 *   description  → data.note（在右侧「备注」里显示，避免长文本挤在结点里）
 *   importance   → high 打「重点」标签，其余不打
 *   nodeType     → misconception 打「易错」标签
 *   highlightNodeIds / misconceptionNodeIds → 结点底色（与 LearnMate 预览里的配色一致）
 *   前两层       → data.expand = true，其余折叠，导入后不会一屏糊满
 */
/**
 * 分支配色：照「新时代高质量教师队伍建设」那张参考导图的样式——
 * 每个主干一种颜色，子结点用同色浅底 + 同色描边，连线也跟分支同色；根结点是白底深色描边的方框。
 * 颜色在 LearnMate 预览（MindMapViewer）与本地编辑器里保持一致。
 */
const BRANCH_PALETTE = [
  { line: "#4A90D9", fill: "#EAF3FC" },
  { line: "#57AE5B", fill: "#EAF7EA" },
  { line: "#9B7FD4", fill: "#F1ECFB" },
  { line: "#E39A4C", fill: "#FDF2E6" },
  { line: "#2FA8A0", fill: "#E4F5F3" },
  { line: "#5C6BC0", fill: "#ECEFFB" },
  { line: "#D2725B", fill: "#FBEDE9" },
  { line: "#6C8BA8", fill: "#EDF2F7" },
];
const ROOT_STYLE = { fill: "#FFFFFF", line: "#2F3B52", text: "#1F2937" };
const NODE_SHAPE = "roundedRectangle";

function str(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function buildNode(input, context, depth = 1) {
  const id = str(input && input.id);
  const label = str(input && input.label) || "未命名结点";
  const isRoot = depth === 1;
  const palette = context.palette || BRANCH_PALETTE[0];
  const isMisconception = context.misconception.has(id) || str(input && input.nodeType) === "misconception";
  const isHighlight = context.highlight.has(id);
  const tags = [];
  if (isMisconception) tags.push("易错");
  if (str(input && input.importance) === "high") tags.push("重点");
  if (str(input && input.nodeType) === "formula") tags.push("公式");
  if (str(input && input.nodeType) === "example") tags.push("例题");
  const data = { text: label, expand: depth <= 2, shape: NODE_SHAPE };
  const note = str(input && input.description);
  if (note) data.note = note;
  if (tags.length) data.tag = [...new Set(tags)];
  if (isRoot) {
    data.fillColor = ROOT_STYLE.fill;
    data.borderColor = ROOT_STYLE.line;
    data.color = ROOT_STYLE.text;
    data.borderWidth = 2;
  } else {
    data.fillColor = palette.fill;
    data.borderColor = palette.line;
    // 连线颜色取本结点的分支色：simple-mind-map 用「子结点自己的 lineColor」画它到父结点的连线
    data.lineColor = palette.line;
    if (isMisconception || isHighlight) data.borderWidth = 2;
  }
  const children = Array.isArray(input && input.children)
    ? input.children.map((child, index) =>
        buildNode(
          child,
          { ...context, palette: depth === 1 ? BRANCH_PALETTE[index % BRANCH_PALETTE.length] : palette },
          depth + 1,
        ),
      )
    : [];
  return { data, children };
}

/** 面包屑式的路径标签，用于把交叉连线写成可读备注 */
function flattenLabels(node, prefix = []) {
  const label = str(node && node.label);
  const path = [...prefix, label].filter(Boolean);
  const map = new Map();
  const walk = (current, trail) => {
    if (!current) return;
    const currentLabel = str(current.label);
    const nextTrail = [...trail, currentLabel].filter(Boolean);
    map.set(str(current.id), nextTrail);
    (current.children || []).forEach((child) => walk(child, nextTrail));
  };
  walk(node, prefix);
  return map;
}

function buildMindMap(content, meta = {}) {
  const root = content && content.root ? content.root : { label: meta.title || "思维导图" };
  const highlight = new Set(
    (Array.isArray(content && content.highlightNodeIds) ? content.highlightNodeIds : []).map(str),
  );
  const misconception = new Set(
    (Array.isArray(content && content.misconceptionNodeIds) ? content.misconceptionNodeIds : []).map(str),
  );
  const tree = buildNode(root, { highlight, misconception });
  // 根结点固定为课件标题，避免过长的知识点描述挤在中心
  tree.data.text = str(meta.title) || str(root.label) || "思维导图";
  tree.data.expand = true;

  const labels = flattenLabels(root);
  const crossLinks = Array.isArray(content && content.crossLinks) ? content.crossLinks : [];
  const linkNotes = crossLinks
    .map((link) => {
      const from = labels.get(str(link.sourceId));
      const to = labels.get(str(link.targetId));
      if (!from || !to) return "";
      return `关联：${from[from.length - 1]} ↔ ${to[to.length - 1]}${link.label ? `（${str(link.label)}）` : ""}`;
    })
    .filter(Boolean);
  const sequence = Array.isArray(content && content.recommendedSequence) ? content.recommendedSequence : [];
  const sequenceLabel = sequence.map((id) => (labels.get(str(id)) || []).slice(-1)[0]).filter(Boolean);
  const extras = [];
  if (sequenceLabel.length) extras.push(`推荐学习顺序：${sequenceLabel.join(" → ")}`);
  if (linkNotes.length) extras.push(...linkNotes.slice(0, 8));
  if (extras.length) tree.data.note = [str(tree.data.note), ...extras].filter(Boolean).join("\n\n");

  return {
    root: tree,
    theme: { template: "avocado", config: {} },
    layout: "logicalStructure",
    config: {
      // 导入时 setFullData 不会应用 config，这里保留一份供手工「另存为 smm」后仍然带上配色意图
      rainbowLinesConfig: { open: false, colorsList: BRANCH_PALETTE.map((item) => item.line) },
    },
    view: null,
  };
}

async function exportMindMapJson(studentId, resourceId, version) {
  const [[resource]] = await pool.query(
    "SELECT * FROM learning_resources WHERE id=? AND student_id=? LIMIT 1",
    [resourceId, studentId],
  );
  if (!resource) throw apiError("resource not found", 404);
  if (resource.resource_type !== "mind_map")
    throw apiError("只有思维导图资源可以导出为本地思维导图文稿。", 422);
  const selected = Number(version) || Number(resource.current_version);
  const [[row]] = await pool.query(
    "SELECT content_json FROM learning_resource_versions WHERE resource_id=? AND student_id=? AND version=? LIMIT 1",
    [resourceId, studentId, selected],
  );
  if (!row) throw apiError("resource version not found", 404);
  const envelope = parseJson(row.content_json);
  const deck = buildMindMap(envelope.content || {}, { title: resource.title || envelope.title });
  let nodeCount = 0;
  const walk = (item) => {
    nodeCount += 1;
    (item.children || []).forEach(walk);
  };
  walk(deck.root);
  return {
    deck,
    version: selected,
    nodeCount,
    fileName: `learnmate-mindmap-${resourceId}-v${selected}.json`,
  };
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function apiError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { exportMindMapJson, buildMindMap };
