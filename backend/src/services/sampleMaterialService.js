/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 预置样例资源目录：课堂演示时「秒出」用的是哪一套课件与导图。
 *
 * 目前两套：
 *   tree-chapter6  —— 数据结构 · 第 6 章 树和二叉树（默认，与「学习路径」页当前节点对得上）
 *   os-scheduling  —— 操作系统 · 处理机调度
 *
 * 由 INSTANT_SAMPLE_SOURCE 选择（不设置则用 tree-chapter6）；两套都走同一套 publish 写库，
 * 区别只是内容与标题，因此切换只是换一个 key，不会改动生成/预览/导出链路。
 */
const { buildDeck: buildTreeDeck, DEFAULT_TITLE: TREE_DECK_TITLE } = require("../../scripts/buildSampleDeck");
const {
  buildEnvelope: buildTreeMindMapEnvelope,
  DEFAULT_TITLE: TREE_MIND_MAP_TITLE,
} = require("../../scripts/buildSampleMindMap");
const {
  buildDeckContent: buildSchedulingDeck,
  buildMindMapEnvelope: buildSchedulingMindMapEnvelope,
  DECK_TITLE: SCHEDULING_DECK_TITLE,
  MIND_MAP_TITLE: SCHEDULING_MIND_MAP_TITLE,
} = require("../../scripts/buildSchedulingMaterials");

const MATERIALS = {
  "tree-chapter6": {
    key: "tree-chapter6",
    label: "数据结构 · 第 6 章 树和二叉树",
    deckTitle: TREE_DECK_TITLE,
    mindMapTitle: TREE_MIND_MAP_TITLE,
    deck: () => buildTreeDeck(),
    mindMap: () => buildTreeMindMapEnvelope(require("../config/db").pool),
  },
  "os-scheduling": {
    key: "os-scheduling",
    label: "操作系统 · 处理机调度",
    deckTitle: SCHEDULING_DECK_TITLE,
    mindMapTitle: SCHEDULING_MIND_MAP_TITLE,
    deck: () => buildSchedulingDeck(),
    mindMap: () => buildSchedulingMindMapEnvelope(),
  },
};

const DEFAULT_KEY = "tree-chapter6";

function list() {
  return Object.keys(MATERIALS).map((key) => ({ key, label: MATERIALS[key].label }));
}

/** 解析素材 key：支持完整 key、label 关键字（tree / scheduling）、不区分大小写。 */
function resolve(key) {
  const raw = String(key || "")
    .trim()
    .toLowerCase();
  if (!raw) return MATERIALS[DEFAULT_KEY];
  if (MATERIALS[raw]) return MATERIALS[raw];
  if (/sched|调度|os/.test(raw)) return MATERIALS["os-scheduling"];
  if (/tree|树/.test(raw)) return MATERIALS[DEFAULT_KEY];
  return MATERIALS[DEFAULT_KEY];
}

function current(env = process.env) {
  return resolve(env.INSTANT_SAMPLE_SOURCE);
}

module.exports = { list, resolve, current, DEFAULT_KEY };
