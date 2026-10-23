/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 知识图谱数据组装逻辑（纯函数，无 React / 无运行时依赖）。
 *
 * 这一层只做两件事：
 *  1. buildStructure：把 /api/knowledge/graph 的 nodes + edges 组装成
 *     「总览 → 课程 → 章节 → 知识点」四层结构，并把 /api/profile/knowledge-mastery
 *     的掌握度按「课程 + 知识点名称」精确匹配叠加到知识点节点上。
 *  2. computeView：按当前交互状态（课程筛选 / 章节折叠 / 只看跨课程 / 搜索）
 *     算出「当前应该画出来的节点与边」，并把落在折叠区域里的关系边提升到
 *     最近的可见祖先，保证跨课程关系在任何折叠状态下都看得见。
 *
 * 注意：本文件不能出现运行时 import，否则 Node 复算脚本无法直接用 esbuild 转译。
 */
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3";
import type { KnowledgeMasteryRecord } from "../api";

export type NodeKind = "overview" | "course" | "chapter" | "knowledge";
export type LinkKind = "hierarchy" | "prerequisite" | "cross_subject";

export const ALL_COURSES = "__all__";
export const OVERVIEW_ID = "overview";

export const DIFFICULTY_LABELS: Record<string, string> = {
  foundation: "基础",
  intermediate: "提高",
  advanced: "进阶",
};

export function difficultyLabel(value?: string): string {
  if (!value) return "未标注难度";
  return DIFFICULTY_LABELS[value] || value;
}

/* ------------------------------------------------------------------ */
/* 后端返回结构                                                        */
/* ------------------------------------------------------------------ */

export interface RawGraphNode {
  id: number | string;
  key?: string;
  label?: string;
  subject?: string;
  chapter?: string;
  difficulty?: string;
  description?: string;
  resourceCount?: number;
}

/** edges[].source 依赖 edges[].target（target 是前置/基础）。 */
export interface RawGraphEdge {
  source: number | string;
  target: number | string;
  type?: string;
  confidence?: number;
}

export interface KnowledgeGraphPayload {
  nodes?: RawGraphNode[];
  edges?: RawGraphEdge[];
  resources?: unknown[];
}

/* ------------------------------------------------------------------ */
/* 前端图模型                                                          */
/* ------------------------------------------------------------------ */

export interface NormalizedRecord {
  subject: string;
  knowledgePoint: string;
  /** 后端按别名表解析出的知识图谱规范知识点名（如「红黑树旋转」→「红黑树」），解析不到为 null。 */
  canonicalKnowledgePoint: string | null;
  mastery: number | null;
  wrongCount: number;
  practiceCount: number;
  updatedAt?: string;
}

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  kind: NodeKind;
  label: string;
  /** 父节点 id：知识点 → 章节 → 课程 → 总览。 */
  parentId: string;
  /** 所属课程节点 id；总览为空串。 */
  courseId: string;
  subject?: string;
  chapter?: string;
  difficulty?: string;
  description?: string;
  resourceCount: number;
  mastery: number | null;
  wrongCount: number;
  practiceCount: number;
  updatedAt?: string;
  /** 该节点下辖的知识点总数（总览 / 课程 / 章节用）。 */
  knowledgeCount: number;
  /** 该节点下辖的章节总数（总览 / 课程用）。 */
  chapterCount: number;
  /** 是否匹配到掌握度记录。 */
  masteryMatched: boolean;
  /** 章节节点：当前是否展开。 */
  expanded: boolean;
  /** 知识点节点：是否命中当前搜索。 */
  matchedInQuery: boolean;
  /** 该节点所属课程不在当前筛选范围内，只是因为跨课程关系被带入。 */
  contextOnly: boolean;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: LinkKind;
  /** 面向用户的说明文案。 */
  relation: string;
  /** 该边聚合了多少条原始关系（折叠提升后会 > 1）。 */
  count: number;
  /** 是否由折叠提升而来（端点不是原始知识点）。 */
  lifted: boolean;
  crossFrom?: string;
  crossTo?: string;
  confidence?: number;
}

export interface StructureCourse {
  id: string;
  subject: string;
  chapterIds: string[];
  knowledgeIds: string[];
}

export interface StructureChapter {
  id: string;
  subject: string;
  chapter: string;
  courseId: string;
  knowledgeIds: string[];
}

export interface CrossPair {
  from: string;
  to: string;
  count: number;
}

export interface StructureStats {
  courses: number;
  chapters: number;
  knowledge: number;
  prerequisite: number;
  crossSubject: number;
  /** 原始关系边总数 = prerequisite + crossSubject。 */
  relations: number;
  /** 层次边总数 = 课程 + 章节 + 知识点。 */
  hierarchy: number;
  resources: number;
  difficultyCounts: Record<string, number>;
  totalRecords: number;
  matchedRecords: number;
}

export interface Structure {
  nodes: GraphNode[];
  nodeById: Map<string, GraphNode>;
  courses: StructureCourse[];
  courseById: Map<string, StructureCourse>;
  chapters: StructureChapter[];
  chapterById: Map<string, StructureChapter>;
  hierarchyLinks: GraphLink[];
  relations: GraphLink[];
  /** 知识点 id → 它依赖的前置知识点（source 为它自己的边）。 */
  dependsOn: Map<string, GraphLink[]>;
  /** 知识点 id → 依赖它的后继知识点（target 为它自己的边）。 */
  requiredBy: Map<string, GraphLink[]>;
  /** 知识点 id → 它参与的跨课程关系。 */
  crossOf: Map<string, GraphLink[]>;
  crossPairs: CrossPair[];
  unmatchedRecords: NormalizedRecord[];
  stats: StructureStats;
}

export interface ViewOptions {
  /** ALL_COURSES 或某个课程名。 */
  courseFilter: string;
  expandedChapters: ReadonlySet<string> | readonly string[];
  crossOnly: boolean;
  query: string;
  /**
   * 聚焦模式：给定知识点或章节节点 id 时，只保留该节点、与它直接相关的
   * 知识点（前置/后继/章节内成员）以及跨课程依赖节点（外加承载它们的最小
   * 层级骨架），其余全部收起。传 OVERVIEW_ID / 课程 id 时不启用聚焦。
   */
  focusId?: string | null;
}

/** 聚焦模式下中心节点的邻域信息，供画布高亮与文案使用。 */
export interface GraphFocusInfo {
  /** 中心节点 id。 */
  id: string;
  label: string;
  /** 中心节点类型：知识点或章节。 */
  kind: "knowledge" | "chapter";
  /** 直接前置（指向中心节点）。 */
  prerequisites: string[];
  /** 直接后继（中心节点指向它们）。 */
  successors: string[];
  /** 通过跨课程关系直接相连的知识点。 */
  cross: string[];
  /** 邻域内知识点总数（不含中心节点）。 */
  neighborCount: number;
}

export interface GraphView {
  nodes: GraphNode[];
  links: GraphLink[];
  nodeById: Map<string, GraphNode>;
  crossPairs: CrossPair[];
  /** 聚焦模式生效时非空。 */
  focus: GraphFocusInfo | null;
  counts: {
    courses: number;
    chapters: number;
    knowledge: number;
    hierarchy: number;
    prerequisite: number;
    cross: number;
    /** 两端都被折叠进同一个章节、因而无法在画布上表达的关系条数。 */
    prerequisiteHidden: number;
    crossHidden: number;
    /** 被折叠隐藏的知识点数。 */
    hiddenKnowledge: number;
    searchHits: number;
    /** 因跨课程关系带入的课程数。 */
    contextCourses: number;
  };
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

export function courseNodeId(subject: string): string {
  return `course::${subject}`;
}

export function chapterNodeId(subject: string, chapter: string): string {
  return `chapter::${subject}::${chapter}`;
}

export function knowledgeNodeId(rawId: number | string): string {
  return `knowledge::${String(rawId)}`;
}

export function linkNodeId(value: string | GraphNode): string {
  return typeof value === "string" ? value : value.id;
}

function asNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeMastery(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

/**
 * 名称归一化：全角转半角、去空白、去常见标点、转小写。
 * 只用于「精确匹配失败后的兜底匹配」，命中率更高但仍然是确定性的字符串比较。
 */
export function normalizeKey(value: string): string {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u3000]+/g, "")
    .replace(/[·・•:：,，.。;；'"“”‘’`()（）[\]【】{}<>《》\-—_/\\|+*#~!?！？]/g, "")
    .toLowerCase();
}

function latestDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * 掌握度记录归一化：同一「课程 + 知识点」的多条记录按练习次数加权合并。
 * 只要知识点名称存在就保留，没有匹配到图谱节点时会在界面上单独列出。
 */
export function normalizeMasteryRecords(records: readonly KnowledgeMasteryRecord[]): NormalizedRecord[] {
  const merged = new Map<string, NormalizedRecord>();

  records.forEach((record) => {
    const knowledgePoint = String(record.knowledge_point || "").trim();
    if (!knowledgePoint) return;
    const subject = String(record.subject || "").trim();
    const canonicalKnowledgePoint = String(record.knowledge_point_canonical || "").trim() || null;

    const practiceCount = Math.max(0, asNumber(record.practice_count));
    const mastery = practiceCount > 0 ? normalizeMastery(record.mastery) : null;
    const key = `${subject}\u0000${knowledgePoint}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        subject,
        knowledgePoint,
        canonicalKnowledgePoint,
        mastery,
        wrongCount: asNumber(record.wrong_count),
        practiceCount,
        updatedAt: record.last_updated,
      });
      return;
    }

    const totalPractice = existing.practiceCount + practiceCount;
    const weighted =
      totalPractice > 0
        ? Math.round(
            ((existing.mastery ?? 0) * existing.practiceCount + (mastery ?? 0) * practiceCount) /
              totalPractice,
          )
        : null;

    merged.set(key, {
      ...existing,
      mastery: weighted,
      wrongCount: existing.wrongCount + asNumber(record.wrong_count),
      practiceCount: totalPractice,
      updatedAt: latestDate(existing.updatedAt, record.last_updated),
    });
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      a.subject.localeCompare(b.subject, "zh-CN") ||
      a.knowledgePoint.localeCompare(b.knowledgePoint, "zh-CN"),
  );
}

/* ------------------------------------------------------------------ */
/* 组装结构                                                            */
/* ------------------------------------------------------------------ */

export function emptyStructure(): Structure {
  return {
    nodes: [],
    nodeById: new Map(),
    courses: [],
    courseById: new Map(),
    chapters: [],
    chapterById: new Map(),
    hierarchyLinks: [],
    relations: [],
    dependsOn: new Map(),
    requiredBy: new Map(),
    crossOf: new Map(),
    crossPairs: [],
    unmatchedRecords: [],
    stats: {
      courses: 0,
      chapters: 0,
      knowledge: 0,
      prerequisite: 0,
      crossSubject: 0,
      relations: 0,
      hierarchy: 0,
      resources: 0,
      difficultyCounts: {},
      totalRecords: 0,
      matchedRecords: 0,
    },
  };
}

function pushInto<T>(map: Map<string, T[]>, key: string, value: T) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

export function buildStructure(
  payload: KnowledgeGraphPayload | null,
  records: readonly NormalizedRecord[],
): Structure {
  const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload?.edges) ? payload.edges : [];

  const nodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();
  const courses: StructureCourse[] = [];
  const courseById = new Map<string, StructureCourse>();
  const chapters: StructureChapter[] = [];
  const chapterById = new Map<string, StructureChapter>();
  const hierarchyLinks: GraphLink[] = [];

  const overview: GraphNode = {
    id: OVERVIEW_ID,
    kind: "overview",
    label: "知识图谱总览",
    parentId: "",
    courseId: "",
    description: "全部课程、章节与知识点的整体结构。",
    resourceCount: 0,
    mastery: null,
    wrongCount: 0,
    practiceCount: 0,
    knowledgeCount: 0,
    chapterCount: 0,
    masteryMatched: false,
    expanded: true,
    matchedInQuery: false,
    contextOnly: false,
  };
  nodes.push(overview);
  nodeById.set(overview.id, overview);

  let hierarchySeq = 0;
  const addHierarchyLink = (source: string, target: string, relation: string) => {
    hierarchySeq += 1;
    hierarchyLinks.push({
      id: `hierarchy::${hierarchySeq}::${source}->${target}`,
      source,
      target,
      kind: "hierarchy",
      relation,
      count: 1,
      lifted: false,
    });
  };

  const labelIndex = new Map<string, GraphNode[]>();
  const normalizedIndex = new Map<string, GraphNode[]>();

  rawNodes.forEach((raw) => {
    if (!raw) return;
    const label = String(raw.label ?? raw.key ?? "").trim();
    const id = knowledgeNodeId(raw.id);
    if (!label || nodeById.has(id)) return;

    const subject = String(raw.subject || "").trim() || "未归类课程";
    const chapter = String(raw.chapter || "").trim() || "未归类章节";
    const courseId = courseNodeId(subject);

    let course = courseById.get(courseId);
    if (!course) {
      const courseNode: GraphNode = {
        id: courseId,
        kind: "course",
        label: subject,
        parentId: OVERVIEW_ID,
        courseId,
        subject,
        resourceCount: 0,
        mastery: null,
        wrongCount: 0,
        practiceCount: 0,
        knowledgeCount: 0,
        chapterCount: 0,
        masteryMatched: false,
        expanded: true,
        matchedInQuery: false,
        contextOnly: false,
      };
      nodes.push(courseNode);
      nodeById.set(courseId, courseNode);
      course = { id: courseId, subject, chapterIds: [], knowledgeIds: [] };
      courseById.set(courseId, course);
      courses.push(course);
      addHierarchyLink(OVERVIEW_ID, courseId, "总览 → 课程");
    }

    const chapterId = chapterNodeId(subject, chapter);
    let chapterEntry = chapterById.get(chapterId);
    if (!chapterEntry) {
      const chapterNode: GraphNode = {
        id: chapterId,
        kind: "chapter",
        label: chapter,
        parentId: courseId,
        courseId,
        subject,
        chapter,
        resourceCount: 0,
        mastery: null,
        wrongCount: 0,
        practiceCount: 0,
        knowledgeCount: 0,
        chapterCount: 0,
        masteryMatched: false,
        expanded: false,
        matchedInQuery: false,
        contextOnly: false,
      };
      nodes.push(chapterNode);
      nodeById.set(chapterId, chapterNode);
      chapterEntry = { id: chapterId, subject, chapter, courseId, knowledgeIds: [] };
      chapterById.set(chapterId, chapterEntry);
      chapters.push(chapterEntry);
      course.chapterIds.push(chapterId);
      addHierarchyLink(courseId, chapterId, "课程 → 章节");
    }

    const resourceCount = Math.max(0, Math.round(asNumber(raw.resourceCount)));
    const knowledgeNode: GraphNode = {
      id,
      kind: "knowledge",
      label,
      parentId: chapterId,
      courseId,
      subject,
      chapter,
      difficulty: raw.difficulty ? String(raw.difficulty) : undefined,
      description: raw.description ? String(raw.description) : undefined,
      resourceCount,
      mastery: null,
      wrongCount: 0,
      practiceCount: 0,
      knowledgeCount: 0,
      chapterCount: 0,
      masteryMatched: false,
      expanded: false,
      matchedInQuery: false,
      contextOnly: false,
    };
    nodes.push(knowledgeNode);
    nodeById.set(id, knowledgeNode);
    chapterEntry.knowledgeIds.push(id);
    course.knowledgeIds.push(id);
    addHierarchyLink(chapterId, id, "章节 → 知识点");
    pushInto(labelIndex, label, knowledgeNode);
    pushInto(normalizedIndex, `${normalizeKey(subject)}\u0000${normalizeKey(label)}`, knowledgeNode);
  });

  /* ---- 掌握度叠加 ---------------------------------------------------
   * 第一层：课程名 + 知识点名 双精确匹配。
   * 第二层：名称归一化后再匹配（仅当归一化结果唯一时采用），
   *         用来吸收全角/半角、空格、书名号等写法差异。
   * 两层都匹配不上的记录不会丢弃，会放进 unmatchedRecords 在界面上单独列出。
   * ------------------------------------------------------------------ */
  const unmatchedRecords: NormalizedRecord[] = [];
  let matchedRecords = 0;

  records.forEach((record) => {
    let target: GraphNode | undefined;

    // 第一层优先：用后端解析出的「规范知识点名」精确匹配。
    // 掌握度里存的是测验使用的原始名称（如「红黑树旋转」「数据表示」「函数与递归」），
    // 与图谱节点名（「红黑树」「数据的表示」「函数」）并不一致，
    // 后端已按别名表解析成规范名并通过 knowledge_point_canonical 返回。
    if (record.canonicalKnowledgePoint) {
      const canonicalCandidates = labelIndex.get(record.canonicalKnowledgePoint) || [];
      if (record.subject) {
        target = canonicalCandidates.find((node) => node.subject === record.subject);
      } else if (canonicalCandidates.length === 1) {
        target = canonicalCandidates[0];
      }
    }

    // 第二层：用原始名称精确匹配（保持原有行为）。
    const candidates = labelIndex.get(record.knowledgePoint) || [];

    if (!target && record.subject) {
      target = candidates.find((node) => node.subject === record.subject);
    } else if (!target && !record.subject && candidates.length === 1) {
      target = candidates[0];
    }

    if (!target) {
      const key = `${normalizeKey(record.subject)}\u0000${normalizeKey(record.knowledgePoint)}`;
      const normalizedCandidates = normalizedIndex.get(key) || [];
      if (normalizedCandidates.length === 1) target = normalizedCandidates[0];
      else if (!record.subject && candidates.length === 1) target = candidates[0];
    }

    if (!target) {
      unmatchedRecords.push(record);
      return;
    }
    matchedRecords += 1;

    const practice = Math.max(0, record.practiceCount);
    if (target.mastery === null) {
      target.mastery = record.mastery;
      target.practiceCount = practice;
    } else {
      const total = target.practiceCount + practice;
      target.mastery =
        total > 0
          ? Math.round((target.mastery * target.practiceCount + (record.mastery ?? 0) * practice) / total)
          : target.mastery;
      target.practiceCount = total;
    }
    target.wrongCount += record.wrongCount;
    target.updatedAt = latestDate(target.updatedAt, record.updatedAt);
    target.masteryMatched = true;
  });

  /* ---- 课程 / 章节聚合 ---- */
  chapters.forEach((chapterEntry) => {
    const chapterNode = nodeById.get(chapterEntry.id);
    if (!chapterNode) return;
    const children = chapterEntry.knowledgeIds
      .map((id) => nodeById.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    chapterNode.knowledgeCount = children.length;
    chapterNode.resourceCount = children.reduce((sum, node) => sum + node.resourceCount, 0);
    chapterNode.practiceCount = children.reduce((sum, node) => sum + node.practiceCount, 0);
    chapterNode.wrongCount = children.reduce((sum, node) => sum + node.wrongCount, 0);
    chapterNode.mastery = average(
      children.filter((node) => node.mastery !== null).map((node) => node.mastery as number),
    );
    chapterNode.masteryMatched = children.some((node) => node.masteryMatched);
    chapterNode.updatedAt = children.reduce<string | undefined>(
      (latest, node) => latestDate(latest, node.updatedAt),
      undefined,
    );
  });

  courses.forEach((course) => {
    const courseNode = nodeById.get(course.id);
    if (!courseNode) return;
    const children = course.knowledgeIds
      .map((id) => nodeById.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    courseNode.chapterCount = course.chapterIds.length;
    courseNode.knowledgeCount = children.length;
    courseNode.resourceCount = children.reduce((sum, node) => sum + node.resourceCount, 0);
    courseNode.practiceCount = children.reduce((sum, node) => sum + node.practiceCount, 0);
    courseNode.wrongCount = children.reduce((sum, node) => sum + node.wrongCount, 0);
    courseNode.mastery = average(
      children.filter((node) => node.mastery !== null).map((node) => node.mastery as number),
    );
    courseNode.masteryMatched = children.some((node) => node.masteryMatched);
    courseNode.updatedAt = children.reduce<string | undefined>(
      (latest, node) => latestDate(latest, node.updatedAt),
      undefined,
    );
  });

  overview.chapterCount = chapters.length;
  overview.knowledgeCount = nodes.filter((node) => node.kind === "knowledge").length;
  {
    const all = nodes.filter((node) => node.kind === "knowledge");
    overview.resourceCount = all.reduce((sum, node) => sum + node.resourceCount, 0);
    overview.practiceCount = all.reduce((sum, node) => sum + node.practiceCount, 0);
    overview.wrongCount = all.reduce((sum, node) => sum + node.wrongCount, 0);
    overview.mastery = average(
      all.filter((node) => node.mastery !== null).map((node) => node.mastery as number),
    );
    overview.masteryMatched = all.some((node) => node.masteryMatched);
  }

  /* ---- 关系边 ---- */
  const relations: GraphLink[] = [];
  const dependsOn = new Map<string, GraphLink[]>();
  const requiredBy = new Map<string, GraphLink[]>();
  const crossOf = new Map<string, GraphLink[]>();
  const pairCount = new Map<string, number>();
  let prerequisiteCount = 0;
  let crossCount = 0;
  let relationSeq = 0;

  rawEdges.forEach((raw) => {
    if (!raw) return;
    const sourceId = knowledgeNodeId(raw.source);
    const targetId = knowledgeNodeId(raw.target);
    const sourceNode = nodeById.get(sourceId);
    const targetNode = nodeById.get(targetId);
    // 后端保证 edges 都指向存在的 nodes，这里兜底跳过悬空边。
    if (!sourceNode || !targetNode || sourceId === targetId) return;

    const kind: LinkKind = String(raw.type || "") === "cross_subject" ? "cross_subject" : "prerequisite";
    if (kind === "cross_subject") {
      if (sourceNode.subject === targetNode.subject) return;
      crossCount += 1;
    } else {
      prerequisiteCount += 1;
    }

    relationSeq += 1;
    const link: GraphLink = {
      id: `relation::${relationSeq}::${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId,
      kind,
      relation:
        kind === "cross_subject"
          ? `跨课程前置：${sourceNode.subject} → ${targetNode.subject}`
          : `课程内前置：${sourceNode.subject}`,
      count: 1,
      lifted: false,
      crossFrom: kind === "cross_subject" ? sourceNode.subject : undefined,
      crossTo: kind === "cross_subject" ? targetNode.subject : undefined,
      confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : undefined,
    };
    relations.push(link);
    pushInto(dependsOn, sourceId, link);
    pushInto(requiredBy, targetId, link);
    if (kind === "cross_subject") {
      pushInto(crossOf, sourceId, link);
      pushInto(crossOf, targetId, link);
      const pairKey = `${sourceNode.subject}\u0000${targetNode.subject}`;
      pairCount.set(pairKey, (pairCount.get(pairKey) || 0) + 1);
    }
  });

  const crossPairs: CrossPair[] = Array.from(pairCount.entries())
    .map(([key, count]) => {
      const [from, to] = key.split("\u0000");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from, "zh-CN"));

  const difficultyCounts: Record<string, number> = {};
  let resourceTotal = 0;
  nodes.forEach((node) => {
    if (node.kind !== "knowledge") return;
    resourceTotal += node.resourceCount;
    const key = node.difficulty || "unknown";
    difficultyCounts[key] = (difficultyCounts[key] || 0) + 1;
  });

  return {
    nodes,
    nodeById,
    courses,
    courseById,
    chapters,
    chapterById,
    hierarchyLinks,
    relations,
    dependsOn,
    requiredBy,
    crossOf,
    crossPairs,
    unmatchedRecords,
    stats: {
      courses: courses.length,
      chapters: chapters.length,
      knowledge: nodes.filter((node) => node.kind === "knowledge").length,
      prerequisite: prerequisiteCount,
      crossSubject: crossCount,
      relations: prerequisiteCount + crossCount,
      hierarchy: hierarchyLinks.length,
      resources: resourceTotal,
      difficultyCounts,
      totalRecords: records.length,
      matchedRecords,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 计算当前可见视图                                                    */
/* ------------------------------------------------------------------ */

function relationText(
  kind: LinkKind,
  structure: Structure,
  sourceId: string,
  targetId: string,
  count: number,
  lifted: boolean,
): string {
  const suffix = count > 1 ? `（${count} 条）` : "";
  if (kind === "cross_subject") {
    return `${structure.nodeById.get(sourceId)?.subject ?? ""} → ${structure.nodeById.get(targetId)?.subject ?? ""} 跨课程前置${suffix}`;
  }
  const liftedHint = lifted ? "（已折叠到章节）" : "";
  return `课程内前置${suffix}${liftedHint}`;
}

export function computeView(structure: Structure, options: ViewOptions): GraphView {
  const emptyView: GraphView = {
    nodes: [],
    links: [],
    nodeById: new Map(),
    crossPairs: [],
    focus: null,
    counts: {
      courses: 0,
      chapters: 0,
      knowledge: 0,
      hierarchy: 0,
      prerequisite: 0,
      cross: 0,
      prerequisiteHidden: 0,
      crossHidden: 0,
      hiddenKnowledge: 0,
      searchHits: 0,
      contextCourses: 0,
    },
  };
  if (!structure.nodes.length) return emptyView;

  const expanded: ReadonlySet<string> =
    options.expandedChapters instanceof Set
      ? options.expandedChapters
      : new Set(options.expandedChapters as readonly string[]);
  const keyword = options.query.trim().toLowerCase();

  const baseCourses =
    options.courseFilter === ALL_COURSES
      ? structure.courses
      : structure.courses.filter((course) => course.subject === options.courseFilter);
  const baseCourseIds = new Set(baseCourses.map((course) => course.id));
  /* 关系边的可见范围：用户显式选中的课程 + 搜索命中的课程。
     不在这个集合里的课程只能作为「跨课程关系的另一端」以章节/课程形态出现，
     它们之间的关系边不会被画出来，避免单课程筛选时泄漏别课程的关系。 */
  const scopeCourseIds = new Set(baseCourseIds);

  /* 视图里不再包含「总览」节点：画布以课程 / 章节 / 知识点为中心，
     总览只作为结构内部的聚合节点保留（stats 仍由它汇总）。 */
  const visible = new Set<string>();
  const searchHits = new Set<string>();

  /* 1) 基础可见集：选中课程 + 这些课程的全部章节（章节总是可见，它是折叠开关本身） */
  baseCourses.forEach((course) => {
    visible.add(course.id);
    course.chapterIds.forEach((chapterId) => {
      visible.add(chapterId);
      if (expanded.has(chapterId)) {
        (structure.chapterById.get(chapterId)?.knowledgeIds || []).forEach((id) => visible.add(id));
      }
    });
  });

  /* 1b) 聚焦模式：以某个知识点或章节为中心，只保留它的直接邻域。
     知识点中心（从中心节点看的方向命名）：
       prereqOfFocus  指向中心节点 → 中心节点的前置
       succOfFocus    中心节点指向 → 中心节点的后继
     章节中心：章节本身作为中心，域 = 该章节的全部知识点（它们之间的前置关系一并画出）。
     两者都会带上跨课程关系的另一端；relation 的 source 是前置、target 是后继。 */
  const focusId = typeof options.focusId === "string" ? options.focusId : "";
  const focusNode = focusId ? structure.nodeById.get(focusId) : undefined;
  const focusKind: "knowledge" | "chapter" | null =
    focusNode && (focusNode.kind === "knowledge" || focusNode.kind === "chapter") ? focusNode.kind : null;
  const focusActive = Boolean(focusNode && focusKind);
  const focusDomain = new Set<string>();
  const prereqOfFocus: string[] = [];
  const succOfFocus: string[] = [];
  const crossOfFocus: string[] = [];

  if (focusActive && focusNode && focusKind) {
    focusDomain.add(focusNode.id);
    if (focusKind === "chapter") {
      (structure.chapterById.get(focusNode.id)?.knowledgeIds || []).forEach((id) => focusDomain.add(id));
    }
    /* 先按「域内知识点」收集关系：知识点中心时域内只有它自己，
       章节中心时域内有该章节的全部知识点，章节内部的成员关系也因此被保留。 */
    structure.relations.forEach((relation) => {
      const sourceId = linkNodeId(relation.source);
      const targetId = linkNodeId(relation.target);
      if (relation.kind === "cross_subject") {
        if (focusDomain.has(sourceId)) crossOfFocus.push(targetId);
        else if (focusDomain.has(targetId)) crossOfFocus.push(sourceId);
        return;
      }
      if (focusKind !== "knowledge") return;
      if (targetId === focusNode.id) prereqOfFocus.push(sourceId);
      else if (sourceId === focusNode.id) succOfFocus.push(targetId);
    });
    [...prereqOfFocus, ...succOfFocus, ...crossOfFocus].forEach((id) => {
      const node = structure.nodeById.get(id);
      if (node && node.kind === "knowledge") focusDomain.add(id);
    });
    // 邻域可能包含跨课程节点，去重后重新收口
    if (focusDomain.size > 1) {
      visible.clear();
    } else {
      // 孤立节点（没有任何关联）：只画它本身，不假装有结构
      focusDomain.clear();
    }
  }

  if (focusActive && focusDomain.size > 1) {
    focusDomain.forEach((id) => {
      let current: string | undefined = id;
      while (current) {
        visible.add(current);
        const parentId: string | undefined = structure.nodeById.get(current)?.parentId || undefined;
        // 课程以上不再上溯，避免把整门课的章节骨架都带进来
        if (structure.nodeById.get(current)?.kind === "course") break;
        current = parentId;
      }
    });
  }

  /* 2) 搜索：命中节点连同祖先一起显现（跨出当前课程筛选也照样显现，避免“搜不到”） */
  if (keyword) {
    structure.nodes.forEach((node) => {
      if (node.kind === "overview") return;
      const haystack =
        `${node.label} ${node.subject || ""} ${node.chapter || ""} ${node.description || ""}`.toLowerCase();
      if (!haystack.includes(keyword)) return;
      searchHits.add(node.id);
      scopeCourseIds.add(node.courseId);
      /* 向上补齐祖先，但到课程为止 —— 再往上就是已从视图移除的总览。 */
      let current: string | undefined = node.id;
      while (current) {
        const ancestor = structure.nodeById.get(current);
        visible.add(current);
        if (ancestor?.kind === "course") break;
        current = ancestor?.parentId || undefined;
      }
    });
  }

  /* 3) 跨课程关系带入：让被筛选掉的一端以「课程 / 章节」形式出现，
        这样任何筛选组合下都能看出“哪门课指向哪门课”。
        只处理「一端在用户选中范围内」的跨课程关系，不做传递性扩张。 */
  structure.relations.forEach((relation) => {
    if (relation.kind !== "cross_subject") return;
    const sourceNode = structure.nodeById.get(linkNodeId(relation.source));
    const targetNode = structure.nodeById.get(linkNodeId(relation.target));
    if (!sourceNode || !targetNode) return;
    const sourceIn = scopeCourseIds.has(sourceNode.courseId);
    const targetIn = scopeCourseIds.has(targetNode.courseId);
    if (sourceIn === targetIn) return;
    const outside = sourceIn ? targetNode : sourceNode;
    /* 同样只上溯到课程，避免把总览带进视图。 */
    let current: string | undefined = outside.courseId;
    while (current) {
      const ancestor = structure.nodeById.get(current);
      visible.add(current);
      if (ancestor?.kind === "course") break;
      current = ancestor?.parentId || undefined;
    }
    const outsideChapter = structure.nodeById.get(outside.parentId);
    if (outsideChapter && outsideChapter.kind === "chapter") visible.add(outsideChapter.id);
  });

  const lift = (id: string): string | null => {
    let current: string | undefined = id;
    while (current) {
      if (visible.has(current)) return current;
      current = structure.nodeById.get(current)?.parentId || undefined;
    }
    return null;
  };

  const viewNodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();
  structure.nodes.forEach((node) => {
    if (!visible.has(node.id)) return;
    const clone: GraphNode = {
      ...node,
      contextOnly: Boolean(node.courseId) && !baseCourseIds.has(node.courseId),
      matchedInQuery: searchHits.has(node.id),
      expanded:
        node.kind === "chapter"
          ? expanded.has(node.id) ||
            (structure.chapterById.get(node.id)?.knowledgeIds || []).some((id) => visible.has(id))
          : node.expanded,
    };
    viewNodes.push(clone);
    nodeById.set(clone.id, clone);
  });

  /* 4) 层次边 */
  const links: GraphLink[] = [];
  let hierarchyCount = 0;
  structure.hierarchyLinks.forEach((link) => {
    if (!visible.has(linkNodeId(link.source)) || !visible.has(linkNodeId(link.target))) return;
    links.push(link);
    hierarchyCount += 1;
  });

  /* 5) 关系边：折叠部分提升到最近可见祖先，同向同类型合并计数 */
  const aggregated = new Map<string, GraphLink>();
  let prerequisiteCount = 0;
  let crossCount = 0;
  let prerequisiteHidden = 0;
  let crossHidden = 0;

  structure.relations.forEach((relation) => {
    // 聚焦模式下跨课程虚线是需求的一部分，不受「只看跨课程关系」开关限制；
    // 其余情况仍按开关过滤。
    const inFocusDomain =
      focusActive &&
      focusDomain.size > 1 &&
      (focusDomain.has(linkNodeId(relation.source)) || focusDomain.has(linkNodeId(relation.target)));
    if (options.crossOnly && relation.kind !== "cross_subject" && !inFocusDomain) return;
    const sourceNode = structure.nodeById.get(linkNodeId(relation.source));
    const targetNode = structure.nodeById.get(linkNodeId(relation.target));
    if (!sourceNode || !targetNode) return;
    // 只要一端属于用户选中的课程范围就画出来（跨课程关系的另一端允许在范围外）。
    // 聚焦模式的邻域关系直接放行，避免因课程筛选而丢掉紫色的跨课程虚线。
    if (
      !inFocusDomain &&
      !scopeCourseIds.has(sourceNode.courseId) &&
      !scopeCourseIds.has(targetNode.courseId)
    )
      return;

    if (focusActive && focusDomain.size > 1) {
      // 聚焦模式：只画中心节点与域内节点之间的关系，其余一律不画
      const sourceInDomain = focusDomain.has(sourceNode.id);
      const targetInDomain = focusDomain.has(targetNode.id);
      if (!sourceInDomain && !targetInDomain) return;
      if (relation.kind !== "cross_subject" && !(sourceInDomain && targetInDomain)) return;
    }

    const source = lift(sourceNode.id);
    const target = lift(targetNode.id);
    if (!source || !target) return;
    if (source === target) {
      // 折叠后两端落在同一个章节节点上（同一个章节内部的前置关系），无法在画布上表达。
      if (relation.kind === "cross_subject") crossHidden += 1;
      else prerequisiteHidden += 1;
      return;
    }

    const key = `${source}->${target}::${relation.kind}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.count += 1;
      if ((relation.confidence ?? 0) > (existing.confidence ?? 0)) existing.confidence = relation.confidence;
      return;
    }
    const lifted = source !== sourceNode.id || target !== targetNode.id;
    aggregated.set(key, {
      id: `aggregated::${key}`,
      source,
      target,
      kind: relation.kind,
      relation: relationText(relation.kind, structure, source, target, 1, lifted),
      count: 1,
      lifted,
      crossFrom: relation.kind === "cross_subject" ? structure.nodeById.get(source)?.subject : undefined,
      crossTo: relation.kind === "cross_subject" ? structure.nodeById.get(target)?.subject : undefined,
      confidence: relation.confidence,
    });
  });

  aggregated.forEach((link) => {
    link.relation = relationText(
      link.kind,
      structure,
      linkNodeId(link.source),
      linkNodeId(link.target),
      link.count,
      link.lifted,
    );
    if (link.kind === "cross_subject") crossCount += link.count;
    else prerequisiteCount += link.count;
    links.push(link);
  });

  /* 6) 当前视图下的跨课程课程对汇总 */
  const viewPairCount = new Map<string, number>();
  aggregated.forEach((link) => {
    if (link.kind !== "cross_subject") return;
    const from = structure.nodeById.get(linkNodeId(link.source))?.subject;
    const to = structure.nodeById.get(linkNodeId(link.target))?.subject;
    if (!from || !to || from === to) return;
    const key = `${from}\u0000${to}`;
    viewPairCount.set(key, (viewPairCount.get(key) || 0) + link.count);
  });
  const crossPairs: CrossPair[] = Array.from(viewPairCount.entries())
    .map(([key, count]) => {
      const [from, to] = key.split("\u0000");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from, "zh-CN"));

  const contextCourses = new Set<string>();
  viewNodes.forEach((node) => {
    if (node.contextOnly && node.subject) contextCourses.add(node.subject);
  });

  return {
    nodes: viewNodes,
    links,
    nodeById,
    crossPairs,
    focus:
      focusActive && focusNode && focusKind && focusDomain.size > 1
        ? {
            id: focusNode.id,
            label: focusNode.label,
            kind: focusKind,
            prerequisites: prereqOfFocus.filter((id) => focusDomain.has(id)),
            successors: succOfFocus.filter((id) => focusDomain.has(id)),
            cross: crossOfFocus.filter((id) => focusDomain.has(id)),
            neighborCount: focusDomain.size - 1,
          }
        : null,
    counts: {
      courses: viewNodes.filter((node) => node.kind === "course").length,
      chapters: viewNodes.filter((node) => node.kind === "chapter").length,
      knowledge: viewNodes.filter((node) => node.kind === "knowledge").length,
      hierarchy: hierarchyCount,
      prerequisite: prerequisiteCount,
      cross: crossCount,
      prerequisiteHidden,
      crossHidden,
      hiddenKnowledge:
        structure.stats.knowledge - viewNodes.filter((node) => node.kind === "knowledge").length,
      searchHits: searchHits.size,
      contextCourses: contextCourses.size,
    },
  };
}
