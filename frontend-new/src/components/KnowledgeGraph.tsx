/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GitBranch,
  Layers,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  Route,
  Search,
  Target,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Course, WeakPoint } from "../types";
import { apiRequest, describeApiError, fetchApiData, type KnowledgeMasteryRecord } from "../api";
import KnowledgeBaseOverview from "./KnowledgeBaseOverview";
import {
  ALL_COURSES,
  OVERVIEW_ID,
  buildStructure,
  computeView,
  difficultyLabel,
  emptyStructure,
  linkNodeId,
  normalizeMasteryRecords,
  type CrossPair,
  type GraphLink,
  type GraphNode,
  type KnowledgeGraphPayload,
  type NodeKind,
  type NormalizedRecord,
  type Structure,
} from "./knowledgeGraphModel";

interface KnowledgeGraphProps {
  courses: Course[];
  weakPoints: WeakPoint[];
  onNavigateToTab: (
    tab: string,
    prefillData?:
      | string
      | {
          subject?: string;
          knowledgePoint?: string;
          title?: string;
          reason?: string;
          view?: string;
          focus?: string;
        },
  ) => void;
  /** 页面B（力导向知识网络）时传 "graph"；缺省是页面A（知识导图列表）。 */
  pageView?: "list" | "graph";
  /** 页面B 初始课程筛选。 */
  subject?: string;
  /** 页面B 初始聚焦中心（知识点或章节节点 id），为空则画全图。 */
  focus?: string;
}

type FetchStatus = "loading" | "ready" | "error";

interface RenderLink extends GraphLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
}

const CROSS_COLOR = "#6D3BEE";
const KNOWLEDGE_LABEL_ZOOM = 0.72;

export default function KnowledgeGraph({
  courses,
  weakPoints,
  onNavigateToTab,
  pageView,
  subject,
  focus,
}: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphFrameRef = useRef<HTMLDivElement | null>(null);
  const graphPanelRef = useRef<HTMLDivElement | null>(null);
  const nodeSelRef = useRef<d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null>(null);
  const linkSelRef = useRef<d3.Selection<SVGPathElement, RenderLink, SVGGElement, unknown> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  /* 放射布局是椭圆形（纵向压缩），自适应缩放按实际包围盒算出来存这里，供「适应窗口」复用 */
  const fitScaleRef = useRef(0.8);

  const [graphPayload, setGraphPayload] = useState<KnowledgeGraphPayload | null>(null);
  const [graphStatus, setGraphStatus] = useState<FetchStatus>("loading");
  const [graphError, setGraphError] = useState("");
  const [records, setRecords] = useState<KnowledgeMasteryRecord[]>([]);
  const [masteryStatus, setMasteryStatus] = useState<FetchStatus>("loading");
  const [masteryError, setMasteryError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [courseFilter, setCourseFilter] = useState<string>(ALL_COURSES);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [crossOnly, setCrossOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  /* 聚焦模式：点击某个知识点后只画它的直接邻域；OVERVIEW_ID 或课程/章节 id 时为空 */
  const [focusId, setFocusId] = useState<string | null>(null);

  /* 两页结构：
       页面A /student/knowledge                              知识导图列表（默认）
       页面B /student/knowledge?view=graph&subject=X&focus=Y 放射思维导图知识网络
     视图、课程与聚焦中心都由 URL 决定（App 解析后经 props 传入），刷新与前进/后退都一致。 */
  const page: "list" | "graph" = pageView === "graph" ? "graph" : "list";
  const urlSubject = subject || "";
  const urlFocus = focus || "";

  useEffect(() => {
    if (page !== "graph") return;
    setCourseFilter(urlSubject || ALL_COURSES);
    /* 进入页面B：URL 带 focus 就以该节点为中心展开；
       只带课程时就以该课程为中心（不再落到已移除的总览）。 */
    setFocusId(urlFocus || null);
    setSelectedId(urlFocus || (urlSubject ? `course::${urlSubject}` : ""));
  }, [page, urlSubject, urlFocus]);

  /* 页面A → 页面B：点课程卡片的绿色课程图标，带着该课程进入网络图 */
  const openCourseGraph = useCallback(
    (courseSubject: string) => {
      onNavigateToTab("knowledge", { view: "graph", subject: courseSubject });
    },
    [onNavigateToTab],
  );

  /* 页面A → 页面B：点知识点/章节名称，网络图以该节点为中心展开 */
  const openFocusGraph = useCallback(
    (nodeId: string, courseSubject?: string) => {
      onNavigateToTab("knowledge", { view: "graph", subject: courseSubject || "", focus: nodeId });
    },
    [onNavigateToTab],
  );

  /* 页面B → 页面A：返回知识导图列表 */
  const backToList = useCallback(() => {
    onNavigateToTab("knowledge");
  }, [onNavigateToTab]);

  const deferredQuery = useDebouncedValue(query, 240);

  /* ---------------- 数据读取：两条接口互不影响 ---------------- */
  useEffect(() => {
    let cancelled = false;
    setGraphStatus("loading");
    setGraphError("");

    apiRequest<KnowledgeGraphPayload>("/api/knowledge/graph")
      .then((payload) => {
        if (cancelled) return;
        setGraphPayload(payload && typeof payload === "object" ? payload : null);
        setGraphStatus("ready");
      })
      .catch((reason) => {
        if (cancelled) return;
        setGraphPayload(null);
        setGraphError(describeApiError(reason, "知识结构暂时无法读取"));
        setGraphStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setMasteryStatus("loading");
    setMasteryError("");

    fetchApiData<KnowledgeMasteryRecord>("/api/profile/knowledge-mastery")
      .then((items) => {
        if (cancelled) return;
        setRecords(Array.isArray(items) ? items : []);
        setMasteryStatus("ready");
      })
      .catch((reason) => {
        if (cancelled) return;
        setRecords([]);
        setMasteryError(describeApiError(reason, "掌握度记录暂时无法读取"));
        setMasteryStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /* ---------------- 组装 ---------------- */
  const normalizedRecords = useMemo(() => normalizeMasteryRecords(records), [records]);
  const structure = useMemo<Structure>(
    () => (graphPayload ? buildStructure(graphPayload, normalizedRecords) : emptyStructure()),
    [graphPayload, normalizedRecords],
  );
  const hasStructure = structure.nodes.length > 1;

  const view = useMemo(
    () =>
      computeView(structure, { courseFilter, expandedChapters, crossOnly, query: deferredQuery, focusId }),
    [structure, courseFilter, expandedChapters, crossOnly, deferredQuery, focusId],
  );

  /* 从下方「学科知识导图」点击知识点时，关系图在上方、可能不在视口内，
     聚焦后自动把它滚进来，省得用户手动回滚。 */
  useEffect(() => {
    if (!focusId) return;
    const panel = graphPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusId]);

  /* 结构首次就绪时：默认展开全部章节（= 完整四层结构一次画全） */
  useEffect(() => {
    if (!structure.chapters.length) return;
    setExpandedChapters((current) =>
      current.size ? current : new Set(structure.chapters.map((chapter) => chapter.id)),
    );
  }, [structure]);

  const selectedNode = useMemo(() => {
    /* 总览已从视图中移除，所以不再回退到它；退而取当前课程节点或第一个节点。 */
    const courseNode =
      courseFilter !== ALL_COURSES ? view.nodeById.get(`course::${courseFilter}`) : undefined;
    return view.nodeById.get(selectedId) || courseNode || view.nodes[0] || null;
  }, [view, selectedId, courseFilter]);

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = structure.nodeById.get(nodeId);
      setSelectedId(nodeId);
      /* 知识点进入聚焦模式（只显示直接邻域）；总览 / 课程 / 章节只做选中，不裁剪画布 */
      setFocusId(node && node.kind === "knowledge" ? nodeId : null);
      if (!node) return;
      if (node.kind === "knowledge") {
        setExpandedChapters((current) => {
          if (current.has(node.parentId)) return current;
          const next = new Set(current);
          next.add(node.parentId);
          return next;
        });
      }
      if (node.courseId && courseFilter !== ALL_COURSES && node.courseId !== `course::${courseFilter}`) {
        setCourseFilter(ALL_COURSES);
      }
    },
    [structure, courseFilter],
  );

  /* d3 渲染在 effect 里，直接引用 focusNode 会让 effect 随每次渲染重跑；
     用一个 ref 暴露最新实现，effect 内只依赖这个稳定引用。 */
  const focusNodeRef = useRef(focusNode);
  focusNodeRef.current = focusNode;
  const focusNodeForGraph = useCallback((nodeId: string) => {
    focusNodeRef.current(nodeId);
  }, []);

  const toggleChapter = useCallback((chapterId: string) => {
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const selectCourse = useCallback(
    (subject: string) => {
      setCourseFilter(subject);
      if (subject === ALL_COURSES) return;
      const course = structure.courseById.get(`course::${subject}`);
      if (!course) return;
      setExpandedChapters((current) => {
        const next = new Set(current);
        course.chapterIds.forEach((chapterId) => next.add(chapterId));
        return next;
      });
    },
    [structure],
  );

  const expandAllChapters = useCallback(() => {
    setExpandedChapters(new Set(structure.chapters.map((chapter) => chapter.id)));
  }, [structure]);

  const collapseAllChapters = useCallback(() => {
    setExpandedChapters(new Set());
  }, []);

  const resetView = useCallback(() => {
    setQuery("");
    setCrossOnly(false);
    setCourseFilter(ALL_COURSES);
    setExpandedChapters(new Set(structure.chapters.map((chapter) => chapter.id)));
    setSelectedId("");
    setFocusId(null);
  }, [structure]);

  /* ---------------- 放射思维导图（纯几何布局；不跑力的导向仿真，节点坐标恒定不漂移） ---------------- */
  useEffect(() => {
    const svgElement = svgRef.current;
    const frame = graphFrameRef.current;
    if (!svgElement || !frame) return;

    const width = Math.max(360, Math.round(frame.clientWidth || 720));
    const focusInfo = view.focus;
    /* 画布高度：节点越多画越高，保证放射扇区有足够的纵向空间 */
    const height = focusInfo ? 460 : view.nodes.length > 120 ? 760 : view.nodes.length > 70 ? 640 : 520;

    /* 「只看跨课程关系」时与独立图谱页保持一致：只保留课程、跨课程相关知识点及其所属章节 */
    const crossOnlyIds = new Set<string>();
    if (crossOnly) {
      view.links.forEach((link) => {
        if (link.kind !== "cross_subject") return;
        crossOnlyIds.add(linkNodeId(link.source));
        crossOnlyIds.add(linkNodeId(link.target));
      });
    }
    const shownNodes = view.nodes.filter((node) => {
      if (!crossOnly) return true;
      if (node.kind === "course") return true;
      if (crossOnlyIds.has(node.id)) return true;
      if (node.kind === "chapter") {
        return view.nodes.some((child) => child.parentId === node.id && crossOnlyIds.has(child.id));
      }
      return false;
    });
    const shownIds = new Set(shownNodes.map((node) => node.id));
    const shownLinks = view.links.filter(
      (link) => shownIds.has(linkNodeId(link.source)) && shownIds.has(linkNodeId(link.target)),
    );

    /* 1) 布局：中心向外发散——课程扇区（按知识规模加权）→ 章节子扇区 → 知识点扇形展开 */
    const mind = buildMindMapLayout(shownNodes, width, height, focusInfo ? focusInfo.id : "");
    const nodes: GraphNode[] = shownNodes.map((node) => {
      const point = mind.points.get(node.id) || { x: width / 2, y: height / 2, angle: 0, radius: 0 };
      return { ...node, x: point.x, y: point.y, fx: null, fy: null };
    });
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const links: RenderLink[] = shownLinks.map((link) => ({
      ...link,
      /* 没有力导向后 source/target 不会再被就地替换成节点对象，这里手动解析 */
      source: nodesById.get(linkNodeId(link.source)) || link.source,
      target: nodesById.get(linkNodeId(link.target)) || link.target,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      angle: 0,
    }));

    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("role", "img")
      .attr(
        "aria-label",
        `知识结构图：${view.counts.courses} 门课程、${view.counts.chapters} 个章节、${view.counts.knowledge} 个知识点、${view.links.length} 条边`,
      )
      .style("height", `${height}px`);
    nodeSelRef.current = null;
    linkSelRef.current = null;

    const layer = svg.append("g");
    /* 课程扇区浅色底（最底层，不参与交互） */
    const sectorLayer = layer.append("g").attr("class", "lm-knowledge-svg-sectors");
    sectorLayer
      .selectAll<SVGPathElement, MindSector>("path")
      .data(mind.sectors)
      .enter()
      .append("path")
      .attr("class", "lm-knowledge-svg-sector")
      .attr("fill", (sector) => sector.color)
      .attr("fill-opacity", 0.8)
      .attr("d", (sector) => {
        const p1 = polarPoint(sector.a0, sector.inner, width / 2, height / 2);
        const p2 = polarPoint(sector.a1, sector.inner, width / 2, height / 2);
        const p3 = polarPoint(sector.a1, sector.outer, width / 2, height / 2);
        const p4 = polarPoint(sector.a0, sector.outer, width / 2, height / 2);
        const large = sector.a1 - sector.a0 > Math.PI ? 1 : 0;
        return (
          `M${p1.x},${p1.y}A${sector.inner},${sector.inner * MIND_SQUASH_Y} 0 ${large} 1 ${p2.x},${p2.y}` +
          `L${p3.x},${p3.y}A${sector.outer},${sector.outer * MIND_SQUASH_Y} 0 ${large} 0 ${p4.x},${p4.y}Z`
        );
      });
    const linkLayer = layer.append("g").attr("class", "lm-knowledge-svg-links");
    const arrowLayer = layer.append("g").attr("class", "lm-knowledge-svg-arrows");
    const nodeLayer = layer.append("g").attr("class", "lm-knowledge-svg-nodes");

    /* 2) 层级连线用曲线表现放射分支；关系连线保持直线（末端带箭头表示依赖方向） */
    const linkElements = linkLayer
      .selectAll<SVGPathElement, RenderLink>("path")
      .data(links)
      .enter()
      .append("path")
      .attr("class", (link) => linkClass(link))
      .attr("fill", "none");
    linkSelRef.current = linkElements;

    const arrowElements = arrowLayer
      .selectAll<SVGPolygonElement, RenderLink>("polygon")
      .data(links.filter((link) => link.kind !== "hierarchy"))
      .enter()
      .append("polygon")
      .attr("class", (link) =>
        link.kind === "cross_subject" ? "lm-knowledge-svg-arrow is-cross" : "lm-knowledge-svg-arrow",
      )
      .attr("points", "-7,-3.2 0,0 -7,3.2");

    const nodeElements = nodeLayer
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", (node) => nodeClass(node))
      .attr("tabindex", (node) => (node.kind === "overview" ? null : 0))
      .attr("role", (node) => (node.kind === "overview" ? "presentation" : "button"))
      .attr("aria-label", (node) => nodeAriaLabel(node))
      .on("click", (event, node) => {
        event.stopPropagation();
        /* 走 focusNode：点知识点会进入聚焦模式，点课程/章节只做选中 */
        focusNodeForGraph(node.id);
      })
      .on("dblclick", (event, node) => {
        if (node.kind !== "chapter") return;
        event.stopPropagation();
        toggleChapter(node.id);
      })
      .on("keydown", (event, node) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        focusNodeForGraph(node.id);
      });

    /* 节点固定在放射位置上，不再支持拖拽（从根上避免任何“节点漂移”）。
       点击 / 回车：知识点进入聚焦模式，课程与章节只做选中。 */
    nodeSelRef.current = nodeElements;

    nodeElements
      .append("circle")
      .attr("r", (node) => (focusInfo && node.id === focusInfo.id ? 17 : nodeRadius(node)))
      .attr("fill", (node) => (focusInfo && node.id === focusInfo.id ? "#0A7A5E" : nodeColor(node)))
      .attr("stroke", "#FFFFFF")
      .attr("stroke-width", (node) => (focusInfo && node.id === focusInfo.id ? 3.5 : 2));

    /* 聚焦中心的外圈光环，突出「以它为圆心」 */
    if (focusInfo) {
      nodeElements
        .filter((node) => node.id === focusInfo.id)
        .append("circle")
        .attr("class", "lm-knowledge-svg-focus-halo")
        .attr("r", 25)
        .attr("fill", "none")
        .attr("stroke", "#0FA47F")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4 5");
    }

    const labelLayer = nodeElements.append("g").attr("class", "lm-knowledge-svg-label");
    /* 画布上的视觉角度（椭圆压缩之后）：左半圈翻转 180°，让知识点标签沿半径朝外且保持正立 */
    const labelAngle = (node: GraphNode) => {
      const point = mind.points.get(node.id);
      if (!point) return 0;
      return (Math.atan2(point.y - height / 2, point.x - width / 2) * 180) / Math.PI;
    };
    const labelFlipped = (node: GraphNode) => {
      if (node.kind !== "knowledge") return false;
      const deg = labelAngle(node);
      return deg > 90 || deg < -90;
    };
    labelLayer.attr("transform", (node) => {
      if (node.kind !== "knowledge") return null;
      const deg = labelAngle(node);
      return `rotate(${labelFlipped(node) ? deg + 180 : deg})`;
    });
    labelLayer
      .append("text")
      .attr("text-anchor", (node) => (labelFlipped(node) ? "end" : "start"))
      .attr("x", (node) => {
        if (focusInfo && node.id === focusInfo.id) return 23;
        if (node.kind === "knowledge") return labelFlipped(node) ? -10 : 10;
        return nodeRadius(node) + 6;
      })
      .attr("y", (node) => (node.kind === "knowledge" ? 3.4 : 4))
      .attr("font-size", (node) => (focusInfo && node.id === focusInfo.id ? 14 : nodeFontSize(node)))
      .attr("font-weight", (node) => (node.kind === "knowledge" ? 620 : 760))
      .attr("fill", "#37352F")
      .text((node) => truncateLabel(node.label, node.kind === "knowledge" ? 12 : 16));

    const badges = nodeElements
      .filter((node) => node.kind === "chapter")
      .append("g")
      .attr("class", "lm-knowledge-svg-badge")
      .attr("transform", (node) => `translate(${-(nodeRadius(node) + 12)},0)`)
      .attr("role", "button")
      .attr("aria-label", (node) => `${node.expanded ? "折叠" : "展开"}章节 ${node.label}`)
      .on("click", (event, node) => {
        event.stopPropagation();
        toggleChapter(node.id);
      });
    badges.append("circle").attr("r", 7.5);
    badges
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 3.6)
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .text((node) => (node.expanded ? "−" : "+"));

    nodeElements.append("title").text((node) => nodeTooltip(node));

    const applyZoom = (transform: d3.ZoomTransform) => {
      layer.attr("transform", transform.toString());
      const showKnowledgeLabels = transform.k >= KNOWLEDGE_LABEL_ZOOM;
      nodeElements.classed("is-label-hidden", (node) => node.kind === "knowledge" && !showKnowledgeLabels);
    };

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      /* 关键：鼠标按在节点上时不启动画布平移手势。
         否则 d3-zoom 会在 mousedown/mouseup 上调用 noevent()（preventDefault +
         stopImmediatePropagation），浏览器就不会合成 click —— 节点点了没反应。 */
      .filter((event) => {
        const target = event.target as Element | null;
        if (target && typeof target.closest === "function" && target.closest("g.lm-knowledge-svg-node")) {
          return false;
        }
        return !event.ctrlKey || event.type === "wheel";
      })
      .on("zoom", (event) => applyZoom(event.transform as d3.ZoomTransform));
    zoomRef.current = zoom;
    /* 章节节点用双击折叠/展开，所以关掉 d3-zoom 自带的双击缩放 */
    svg.call(zoom).on("dblclick.zoom", null);

    const fitScale = clamp(Math.min(width / mind.width, height / mind.height) * 0.96, 0.3, 1.6);
    fitScaleRef.current = fitScale;
    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(fitScale)
        .translate(-width / 2, -height / 2),
    );

    const updateGeometry = () => {
      links.forEach((link) => {
        const source = link.source as GraphNode;
        const target = link.target as GraphNode;
        const sx = source.x ?? 0;
        const sy = source.y ?? 0;
        const tx = target.x ?? 0;
        const ty = target.y ?? 0;
        const dx = tx - sx;
        const dy = ty - sy;
        const distance = Math.hypot(dx, dy) || 1;
        const gap = nodeRadius(target) + 3;
        link.x1 = sx;
        link.y1 = sy;
        link.x2 = tx - (dx / distance) * gap;
        link.y2 = ty - (dy / distance) * gap;
        link.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      });

      /* 层级边：经过「中角 / 中半径」控制点的曲线，形成放射分支；
         关系边：直线 + 末端箭头（沿用原来的角度计算） */
      linkElements.attr("d", (link) => {
        if (link.kind !== "hierarchy") return `M${link.x1},${link.y1}L${link.x2},${link.y2}`;
        const source = link.source as GraphNode;
        const target = link.target as GraphNode;
        const from = mind.points.get(source.id);
        const to = mind.points.get(target.id);
        if (!from || !to) return `M${link.x1},${link.y1}L${link.x2},${link.y2}`;
        const mid = polarPoint(
          (from.angle + to.angle) / 2,
          (from.radius + to.radius) / 2,
          width / 2,
          height / 2,
        );
        return `M${from.x},${from.y}Q${mid.x},${mid.y} ${to.x},${to.y}`;
      });

      arrowElements.attr("transform", (link) => `translate(${link.x2},${link.y2}) rotate(${link.angle})`);
      nodeElements.attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
    };

    updateGeometry();
    applyZoom(d3.zoomTransform(svgElement));

    return () => {
      svg.on(".zoom", null);
      nodeSelRef.current = null;
      linkSelRef.current = null;
      zoomRef.current = null;
    };
  }, [view, toggleChapter, focusNodeForGraph]);

  /* 选中态只改 class，不重跑布局 */
  useEffect(() => {
    const nodeSelection = nodeSelRef.current;
    const linkSelection = linkSelRef.current;
    const focus = view.focus;
    if (nodeSelection) {
      nodeSelection
        .classed("is-selected", (node) => node.id === selectedId)
        .classed("is-pinned", (node) => node.id === selectedId || node.matchedInQuery)
        .classed("is-search-hit", (node) => node.matchedInQuery)
        .classed("is-focus-center", (node) => Boolean(focus) && node.id === focus!.id);
    }
    if (linkSelection) {
      linkSelection
        .classed(
          "is-active",
          (link) => linkNodeId(link.source) === selectedId || linkNodeId(link.target) === selectedId,
        )
        .classed("is-focus-link", (link) => {
          if (!focus) return false;
          return linkNodeId(link.source) === focus.id || linkNodeId(link.target) === focus.id;
        });
    }
  }, [selectedId, view]);

  const zoomBy = useCallback((factor: number) => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;
    d3.select(svgElement).call(zoom.scaleBy, factor);
  }, []);

  const fitView = useCallback(() => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;
    const box = svgElement.viewBox.baseVal;
    const width = box.width || 720;
    const height = box.height || 460;
    const scale = fitScaleRef.current;
    d3.select(svgElement).call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-width / 2, -height / 2),
    );
  }, []);

  /* ---------------- 节点列表 ---------------- */
  const listNodes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const ordered = view.nodes.filter((node) => node.kind !== "overview");
    const sorted = ordered.slice().sort((a, b) => {
      const rank = kindRank(a.kind) - kindRank(b.kind);
      if (rank !== 0) return rank;
      return (
        (a.subject || "").localeCompare(b.subject || "", "zh-CN") || a.label.localeCompare(b.label, "zh-CN")
      );
    });
    if (!keyword) return sorted;
    return sorted.filter((node) =>
      `${node.label} ${node.subject || ""} ${node.chapter || ""}`.toLowerCase().includes(keyword),
    );
  }, [view, query]);

  /* ---------------- 状态分支 ---------------- */
  if (graphStatus === "loading") {
    return (
      <div className="lm-knowledge">
        <KnowledgeHeader stats={null} weakPointCount={weakPoints.length} />
        <KnowledgeState
          icon={<Loader2 aria-hidden="true" />}
          title="正在读取知识结构"
          description="正在从 /api/knowledge/graph 读取课程、章节、知识点与它们之间的关系。"
        />
      </div>
    );
  }

  if (graphStatus === "error") {
    return (
      <div className="lm-knowledge">
        <KnowledgeHeader stats={null} weakPointCount={weakPoints.length} />
        <KnowledgeBaseOverview
          onAskWithCourse={(subject) =>
            onNavigateToTab(
              "mentor",
              "请对照" + subject + "的课程资料，帮我梳理这门课的重点，并指出我目前的薄弱环节。",
            )
          }
        />
        <KnowledgeState
          icon={<AlertCircle aria-hidden="true" />}
          title="知识结构暂时无法读取"
          description={`${graphError}。知识结构图依赖 /api/knowledge/graph，读取失败时不会用示例数据补齐。`}
          actionLabel="重试"
          onAction={() => setReloadKey((value) => value + 1)}
        />
      </div>
    );
  }

  if (!hasStructure) {
    return (
      <div className="lm-knowledge">
        <KnowledgeHeader stats={structure.stats} weakPointCount={weakPoints.length} />
        <KnowledgeBaseOverview
          onAskWithCourse={(subject) =>
            onNavigateToTab(
              "mentor",
              "请对照" + subject + "的课程资料，帮我梳理这门课的重点，并指出我目前的薄弱环节。",
            )
          }
        />
        <KnowledgeState
          icon={<Network aria-hidden="true" />}
          title="后端没有返回知识点结构"
          description="/api/knowledge/graph 返回的 nodes 为空，因此没有可绘制的课程 / 章节 / 知识点层级，也没有用示例节点补齐。"
          actionLabel="重试"
          onAction={() => setReloadKey((value) => value + 1)}
        />
      </div>
    );
  }

  const { stats } = structure;

  /* ---------------------------- 页面A：知识导图列表页 ---------------------------- */
  if (page === "list") {
    return (
      <div className="lm-knowledge">
        <KnowledgeHeader stats={stats} weakPointCount={weakPoints.length} />

        <KnowledgeBaseOverview
          onAskWithCourse={(subject) =>
            onNavigateToTab(
              "mentor",
              "请对照" + subject + "的课程资料，帮我梳理这门课的重点，并指出我目前的薄弱环节。",
            )
          }
        />

        {masteryStatus === "error" && (
          <p className="lm-knowledge-notice" role="status">
            <AlertCircle aria-hidden="true" />
            {masteryError} —— 学科知识导图不受影响，掌握度相关的位置按「暂无数据」显示。
          </p>
        )}

        <section className="lm-knowledge-node-browser" aria-labelledby="knowledge-node-browser-title">
          <div className="lm-knowledge-node-browser__head">
            <div>
              <h2 id="knowledge-node-browser-title">
                <Network aria-hidden="true" />
                学科知识导图
              </h2>
              <p>点击课程卡片的绿色课程图标，进入该课程的知识网络图。</p>
            </div>
          </div>

          <SubjectMindMap
            structure={structure}
            selectedId={selectedNode ? selectedNode.id : ""}
            onOpenGraph={openCourseGraph}
            onOpenFocus={openFocusGraph}
          />
        </section>

        <section className="lm-knowledge-heatmap" aria-labelledby="knowledge-heatmap-title">
          <div className="lm-knowledge-heatmap__head">
            <div>
              <h2 id="knowledge-heatmap-title">
                <CheckCircle2 aria-hidden="true" />
                知识点掌握明细
              </h2>
            </div>
          </div>

          {masteryStatus === "loading" && <p className="lm-knowledge-note">正在读取掌握度记录…</p>}

          {normalizedRecords.length === 0 ? (
            <div className="lm-knowledge-empty">
              <CircleDot aria-hidden="true" />
              <strong>暂无掌握度记录</strong>
              <p>
                后端还没有你的知识点掌握度记录，所以这一块是空态。上方的学科知识导图不受影响： 已完整画出{" "}
                {stats.courses} 门课程、{stats.chapters} 个章节、{stats.knowledge} 个知识点。
              </p>
            </div>
          ) : (
            <SubjectMasteryProgress records={normalizedRecords} />
          )}

          {structure.unmatchedRecords.length > 0 && (
            <div className="lm-knowledge-unmatched">
              <h3>
                <CircleDot aria-hidden="true" />
                未匹配到图谱节点的掌握度记录（{structure.unmatchedRecords.length} 条，已匹配{" "}
                {structure.stats.matchedRecords} / {structure.stats.totalRecords}）
              </h3>
              <p>
                这些知识点名称在图谱节点里没有同名条目（测验原始名称与图谱名称可能不同），所以没有叠加到图上。
                它们不会被静默丢弃，需要补齐时可以反馈给教研侧。
              </p>
              <ul>
                {structure.unmatchedRecords.map((record) => (
                  <li key={`${record.subject}-${record.knowledgePoint}`}>
                    <span>{record.knowledgePoint}</span>
                    <small>
                      {record.subject || "未标注课程"} ·{" "}
                      {record.mastery === null ? "暂无掌握度数据" : `${record.mastery}%`} · 错题{" "}
                      {record.wrongCount} 次 · 练习 {record.practiceCount} 次
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    );
  }

  /* ---------------------------- 页面B：知识网络图页 ---------------------------- */
  return (
    <div className="lm-knowledge">
      <div className="lm-knowledge-graph-page__bar">
        <button type="button" className="lm-button" onClick={backToList}>
          <ArrowLeft aria-hidden="true" />
          返回知识导图
        </button>
        <span className="lm-knowledge-graph-page__title">
          <Network aria-hidden="true" />
          {courseFilter === ALL_COURSES ? "全部课程知识网络" : `${courseFilter} · 知识网络`}
        </span>
        <span className="lm-knowledge-graph-page__meta">
          {view.counts.courses} 门课程 · {view.counts.chapters} 个章节 · {view.counts.knowledge} 个知识点 ·{" "}
          {view.links.length} 条边
        </span>
      </div>

      {masteryStatus === "error" && (
        <p className="lm-knowledge-notice" role="status">
          <AlertCircle aria-hidden="true" />
          {masteryError} —— 知识网络不受影响，掌握度相关的位置按「暂无数据」显示。
        </p>
      )}

      <section className="lm-knowledge-layout" aria-label="知识网络工作区">
        <div className="lm-knowledge-graph-panel" ref={graphPanelRef}>
          <div className="lm-knowledge-graph-panel__head">
            <h2>
              <Network aria-hidden="true" />
              知识结构关系图
            </h2>
            <span className="lm-knowledge-graph-panel__hint">
              中心向外发散：课程 → 章节 → 知识点；点击知识点可聚焦它的上下游，节点位置固定不会漂移
            </span>
            <div className="lm-knowledge-graph-panel__actions">
              <button type="button" className="lm-button" onClick={() => zoomBy(1.25)} aria-label="放大">
                <ZoomIn aria-hidden="true" />
              </button>
              <button type="button" className="lm-button" onClick={() => zoomBy(0.8)} aria-label="缩小">
                <ZoomOut aria-hidden="true" />
              </button>
              <button type="button" className="lm-button" onClick={fitView}>
                <Maximize2 aria-hidden="true" />
                适应窗口
              </button>
              <button type="button" className="lm-button" onClick={resetView}>
                <RefreshCw aria-hidden="true" />
                重置视图
              </button>
            </div>
          </div>

          <div className="lm-knowledge-toolbar">
            <label className="lm-knowledge-toolbar__field">
              <span>课程筛选</span>
              <select value={courseFilter} onChange={(event) => selectCourse(event.target.value)}>
                <option value={ALL_COURSES}>全部课程（{stats.courses}）</option>
                {structure.courses.map((course) => (
                  <option key={course.id} value={course.subject}>
                    {course.subject}（{course.chapterIds.length} 章 / {course.knowledgeIds.length} 知识点）
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={crossOnly ? "lm-knowledge-toggle is-on" : "lm-knowledge-toggle"}
              aria-pressed={crossOnly}
              onClick={() => setCrossOnly((value) => !value)}
            >
              <Route aria-hidden="true" />
              只看跨课程关系
              <small>{stats.crossSubject}</small>
            </button>

            <div className="lm-knowledge-toolbar__group">
              <button type="button" className="lm-button" onClick={expandAllChapters}>
                <ChevronDown aria-hidden="true" />
                展开全部章节
              </button>
              <button type="button" className="lm-button" onClick={collapseAllChapters}>
                <ChevronRight aria-hidden="true" />
                折叠全部章节
              </button>
            </div>
          </div>

          {/* 聚焦模式状态条：点知识点后出现，可一键回到全图 */}
          {view.focus && (
            <div className="lm-knowledge-focus-bar" role="status">
              <span className="lm-knowledge-focus-bar__label">
                <Target aria-hidden="true" />
                正在聚焦「{view.focus.label}」
              </span>
              <span className="lm-knowledge-focus-bar__meta">
                {view.focus.prerequisites.length + view.focus.successors.length} 个课程内邻接 · 跨课程{" "}
                {view.focus.cross.length} 个
              </span>
              <button type="button" className="lm-button" onClick={resetView}>
                <RefreshCw aria-hidden="true" />
                返回全图
              </button>
            </div>
          )}

          <div ref={graphFrameRef} className="lm-knowledge-graph-frame">
            <svg ref={svgRef} />
          </div>

          <div className="lm-knowledge-graph-legend" aria-label="图例">
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-course" />
              课程
            </span>
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-chapter" />
              章节
            </span>
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-knowledge" />
              知识点（按掌握度上色）
            </span>
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-hierarchy" />
              层级边（放射分支）
            </span>
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-prerequisite" />
              课程内前置（实线箭头）
            </span>
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-cross" />
              跨课程关系（紫色虚线）
            </span>
            <span className="lm-knowledge-graph-legend__item">
              <i className="is-hierarchy" />
              滚轮缩放 · 拖拽平移画布
            </span>
          </div>

          <p className="lm-knowledge-graph-note">
            当前画布：课程 {view.counts.courses} · 章节 {view.counts.chapters} · 知识点{" "}
            {view.counts.knowledge}
            {view.counts.hiddenKnowledge > 0
              ? `（另有 ${view.counts.hiddenKnowledge} 个知识点因章节折叠而收起）`
              : ""}
            {" · "}边 {view.links.length} 条（层级 {view.counts.hierarchy}，课程内前置{" "}
            {view.counts.prerequisite}，跨课程 {view.counts.cross}）。
            {view.focus
              ? " 已进入聚焦模式：只显示中心知识点与其直接前置 / 后继 / 跨课程依赖，点「返回全图」恢复。"
              : " 节点点击选中，点知识点可聚焦它的上下游；章节节点可折叠/展开。"}
          </p>

          {view.crossPairs.length > 0 && (
            <div className="lm-knowledge-cross-summary">
              <h3>
                <GitBranch aria-hidden="true" />
                当前画布上的跨课程依赖（谁依赖谁）
              </h3>
              <div className="lm-knowledge-cross-summary__chips">
                {view.crossPairs.map((pair) => (
                  <span key={`${pair.from}-${pair.to}`} className="lm-knowledge-chip">
                    {pair.from}
                    <ArrowRight aria-hidden="true" />
                    {pair.to}
                    <em>{pair.count}</em>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lm-knowledge-inspector" aria-label="节点详情">
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              structure={structure}
              view={view}
              masteryStatus={masteryStatus}
              onFocus={focusNode}
              onToggleChapter={toggleChapter}
              onNavigateToTab={onNavigateToTab}
            />
          ) : (
            <p className="lm-knowledge-note">当前画布没有可选中的节点。</p>
          )}
        </aside>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 右侧详情面板                                                        */
/* ------------------------------------------------------------------ */

function NodeInspector({
  node,
  structure,
  view,
  masteryStatus,
  onFocus,
  onToggleChapter,
  onNavigateToTab,
}: {
  node: GraphNode;
  structure: Structure;
  view: ReturnType<typeof computeView>;
  masteryStatus: FetchStatus;
  onFocus: (nodeId: string) => void;
  onToggleChapter: (chapterId: string) => void;
  onNavigateToTab: KnowledgeGraphProps["onNavigateToTab"];
}) {
  return (
    <>
      <div className="lm-knowledge-inspector__head">
        <span>{nodeKindLabel(node.kind)}</span>
        <h2>{node.label}</h2>
        <p>
          {node.kind === "overview"
            ? "全部课程"
            : `${node.subject || "未归类课程"}${node.chapter && node.kind === "knowledge" ? ` · ${node.chapter}` : ""}`}
        </p>
      </div>

      {node.kind === "overview" && <OverviewInspector structure={structure} onFocus={onFocus} />}
      {node.kind === "course" && <CourseInspector node={node} structure={structure} onFocus={onFocus} />}
      {node.kind === "chapter" && (
        <ChapterInspector
          node={node}
          structure={structure}
          view={view}
          onFocus={onFocus}
          onToggleChapter={onToggleChapter}
        />
      )}
      {node.kind === "knowledge" && (
        <KnowledgeInspector
          node={node}
          structure={structure}
          masteryStatus={masteryStatus}
          onFocus={onFocus}
        />
      )}

      {node.kind === "knowledge" && (
        <div className="lm-knowledge-actions">
          <button
            type="button"
            className="lm-button lm-button--primary"
            onClick={() => onNavigateToTab("quiz", { subject: node.subject, knowledgePoint: node.label })}
          >
            <Target aria-hidden="true" />
            去测验巩固
          </button>
          <button
            type="button"
            className="lm-button"
            onClick={() =>
              onNavigateToTab("resource", {
                subject: node.subject,
                title: `${node.label} 学习资源`,
                reason: "来自知识图谱节点的结构关系",
              })
            }
          >
            <BookOpen aria-hidden="true" />
            找学习资源
          </button>
        </div>
      )}
    </>
  );
}

function MasteryMeter({ node, masteryStatus }: { node: GraphNode; masteryStatus: FetchStatus }) {
  if (!node.masteryMatched || node.mastery === null) {
    return (
      <div className="lm-knowledge-meter">
        <strong>{masteryStatus === "loading" ? "读取中…" : "暂无掌握度数据"}</strong>
        <div aria-hidden="true">
          <span style={{ width: "0%" }} />
        </div>
      </div>
    );
  }
  return (
    <div className="lm-knowledge-meter">
      <strong>{node.mastery}%</strong>
      <div aria-hidden="true">
        <span style={{ width: `${node.mastery}%` }} />
      </div>
      <small>
        来自真实练习记录（练习 {node.practiceCount} 次 / 错题 {node.wrongCount} 次）。
      </small>
    </div>
  );
}

function OverviewInspector({
  structure,
  onFocus,
}: {
  structure: Structure;
  onFocus: (nodeId: string) => void;
}) {
  const { stats } = structure;
  return (
    <>
      <dl className="lm-knowledge-facts">
        <div>
          <dt>课程</dt>
          <dd>{stats.courses}</dd>
        </div>
        <div>
          <dt>章节</dt>
          <dd>{stats.chapters}</dd>
        </div>
        <div>
          <dt>知识点</dt>
          <dd>{stats.knowledge}</dd>
        </div>
        <div>
          <dt>课程内前置</dt>
          <dd>{stats.prerequisite}</dd>
        </div>
        <div>
          <dt>跨课程关系</dt>
          <dd>{stats.crossSubject}</dd>
        </div>
        <div>
          <dt>关联资源</dt>
          <dd>{stats.resources}</dd>
        </div>
      </dl>

      <section className="lm-knowledge-relations">
        <h3>难度分布</h3>
        <ul>
          {Object.entries(stats.difficultyCounts).map(([key, count]) => (
            <li key={key}>
              <Layers aria-hidden="true" />
              <span>{difficultyLabel(key === "unknown" ? undefined : key)}</span>
              <small>{count} 个知识点</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="lm-knowledge-relations">
        <h3>课程列表（点击查看该课程统计）</h3>
        <p>选中一门课程后，图中只保留该课程，并自动展开它的章节。</p>
        <ul>
          {structure.courses.map((course) => (
            <li
              key={course.id}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(course.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFocus(course.id);
                }
              }}
            >
              <Layers aria-hidden="true" />
              <span>{course.subject}</span>
              <small>
                {course.chapterIds.length} 个章节 · {course.knowledgeIds.length} 个知识点
              </small>
            </li>
          ))}
        </ul>
      </section>

      <CrossPairSummary pairs={structure.crossPairs} title="全局跨课程依赖汇总" />
    </>
  );
}

function CourseInspector({
  node,
  structure,
  onFocus,
}: {
  node: GraphNode;
  structure: Structure;
  onFocus: (nodeId: string) => void;
}) {
  const course = structure.courseById.get(node.id);
  const chapters = (course?.chapterIds || [])
    .map((id) => structure.chapterById.get(id))
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));

  return (
    <>
      <MasteryMeter node={node} masteryStatus="ready" />

      <dl className="lm-knowledge-facts">
        <div>
          <dt>章节数</dt>
          <dd>{node.chapterCount}</dd>
        </div>
        <div>
          <dt>知识点数</dt>
          <dd>{node.knowledgeCount}</dd>
        </div>
        <div>
          <dt>关联资源</dt>
          <dd>{node.resourceCount}</dd>
        </div>
        <div>
          <dt>练习次数</dt>
          <dd>{node.practiceCount}</dd>
        </div>
        <div>
          <dt>错题次数</dt>
          <dd>{node.wrongCount}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>{formatDate(node.updatedAt)}</dd>
        </div>
      </dl>

      <section className="lm-knowledge-relations">
        <h3>章节与知识点统计</h3>
        <ul>
          {chapters.map((chapter) => (
            <li
              key={chapter.id}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(chapter.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFocus(chapter.id);
                }
              }}
            >
              <Layers aria-hidden="true" />
              <span>{chapter.chapter}</span>
              <small>{chapter.knowledgeIds.length} 个知识点</small>
            </li>
          ))}
        </ul>
      </section>

      <CrossPairSummary
        pairs={structure.crossPairs.filter((pair) => pair.from === node.subject || pair.to === node.subject)}
        title={`${node.subject} 参与的跨课程依赖`}
      />
    </>
  );
}

function ChapterInspector({
  node,
  structure,
  view,
  onFocus,
  onToggleChapter,
}: {
  node: GraphNode;
  structure: Structure;
  view: ReturnType<typeof computeView>;
  onFocus: (nodeId: string) => void;
  onToggleChapter: (chapterId: string) => void;
}) {
  const chapter = structure.chapterById.get(node.id);
  const knowledge = (chapter?.knowledgeIds || [])
    .map((id) => structure.nodeById.get(id))
    .filter((item): item is GraphNode => Boolean(item));

  return (
    <>
      <MasteryMeter node={node} masteryStatus="ready" />

      <dl className="lm-knowledge-facts">
        <div>
          <dt>课程</dt>
          <dd>{node.subject || "—"}</dd>
        </div>
        <div>
          <dt>知识点数</dt>
          <dd>{node.knowledgeCount}</dd>
        </div>
        <div>
          <dt>关联资源</dt>
          <dd>{node.resourceCount}</dd>
        </div>
        <div>
          <dt>练习次数</dt>
          <dd>{node.practiceCount}</dd>
        </div>
        <div>
          <dt>错题次数</dt>
          <dd>{node.wrongCount}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>{formatDate(node.updatedAt)}</dd>
        </div>
      </dl>

      <div className="lm-knowledge-actions">
        <button type="button" className="lm-button" onClick={() => onToggleChapter(node.id)}>
          {view.nodeById.get(node.id)?.expanded ? (
            <ChevronDown aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
          {view.nodeById.get(node.id)?.expanded ? "折叠本章节的知识点" : "展开本章节的知识点"}
        </button>
      </div>

      <section className="lm-knowledge-relations">
        <h3>本章节下的知识点（{knowledge.length}）</h3>
        <ul>
          {knowledge.map((item) => (
            <li
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFocus(item.id);
                }
              }}
            >
              <CircleDot aria-hidden="true" />
              <span>{item.label}</span>
              <small>
                {difficultyLabel(item.difficulty)} · 关联资源 {item.resourceCount} ·{" "}
                {item.mastery === null ? "暂无掌握度数据" : `掌握度 ${item.mastery}%`}
              </small>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function KnowledgeInspector({
  node,
  structure,
  masteryStatus,
  onFocus,
}: {
  node: GraphNode;
  structure: Structure;
  masteryStatus: FetchStatus;
  onFocus: (nodeId: string) => void;
}) {
  const dependsOn = structure.dependsOn.get(node.id) || [];
  const requiredBy = structure.requiredBy.get(node.id) || [];
  const crossLinks = structure.crossOf.get(node.id) || [];

  return (
    <>
      <MasteryMeter node={node} masteryStatus={masteryStatus} />

      <dl className="lm-knowledge-facts">
        <div>
          <dt>课程</dt>
          <dd>{node.subject || "—"}</dd>
        </div>
        <div>
          <dt>章节</dt>
          <dd>{node.chapter || "—"}</dd>
        </div>
        <div>
          <dt>难度</dt>
          <dd>{difficultyLabel(node.difficulty)}</dd>
        </div>
        <div>
          <dt>关联资源</dt>
          <dd>{node.resourceCount}</dd>
        </div>
        <div>
          <dt>练习次数</dt>
          <dd>{node.practiceCount}</dd>
        </div>
        <div>
          <dt>错题次数</dt>
          <dd>{node.wrongCount}</dd>
        </div>
      </dl>

      {node.description && <p className="lm-knowledge-description">{node.description}</p>}

      <RelationGroup
        title={`前置知识点 · 它依赖谁（${dependsOn.length}）`}
        empty="该知识点在图谱里没有前置关系。"
        hint="箭头由本知识点指向这些前置知识点。"
        links={dependsOn}
        direction="outgoing"
        otherOf={(link) => linkNodeId(link.target)}
        structure={structure}
        onFocus={onFocus}
      />

      <RelationGroup
        title={`后继知识点 · 谁依赖它（${requiredBy.length}）`}
        empty="没有其它知识点依赖它。"
        hint="这些知识点以它为前置。"
        links={requiredBy}
        direction="incoming"
        otherOf={(link) => linkNodeId(link.source)}
        structure={structure}
        onFocus={onFocus}
      />

      <section className="lm-knowledge-relations">
        <h3>跨课程关系（{crossLinks.length}）</h3>
        {crossLinks.length ? (
          <ul>
            {crossLinks.map((link) => {
              const outgoing = linkNodeId(link.source) === node.id;
              const otherId = outgoing ? linkNodeId(link.target) : linkNodeId(link.source);
              const other = structure.nodeById.get(otherId);
              return (
                <li
                  key={link.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onFocus(otherId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFocus(otherId);
                    }
                  }}
                >
                  <Route aria-hidden="true" />
                  <span>{other ? `${other.subject} · ${other.label}` : otherId}</span>
                  <small>
                    {outgoing
                      ? `${node.subject} → ${other?.subject || "其它课程"}：本知识点依赖它`
                      : `${other?.subject || "其它课程"} → ${node.subject}：它依赖本知识点`}
                    {other?.chapter ? ` · ${other.chapter}` : ""}
                  </small>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>该知识点没有跨课程关系。</p>
        )}
      </section>
    </>
  );
}

function RelationGroup({
  title,
  empty,
  hint,
  links,
  direction,
  otherOf,
  structure,
  onFocus,
}: {
  title: string;
  empty: string;
  hint: string;
  links: GraphLink[];
  direction: "incoming" | "outgoing";
  otherOf: (link: GraphLink) => string;
  structure: Structure;
  onFocus: (nodeId: string) => void;
}) {
  return (
    <section className="lm-knowledge-relations">
      <h3>{title}</h3>
      {links.length ? (
        <>
          <p>{hint}</p>
          <ul>
            {links.map((link) => {
              const otherId = otherOf(link);
              const other = structure.nodeById.get(otherId);
              return (
                <li
                  key={link.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onFocus(otherId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFocus(otherId);
                    }
                  }}
                >
                  {link.kind === "cross_subject" ? (
                    <Route aria-hidden="true" />
                  ) : (
                    <CircleDot aria-hidden="true" />
                  )}
                  <span>
                    {other ? `${other.label}${link.lifted ? `（${link.count} 条）` : ""}` : otherId}
                  </span>
                  <small>
                    {other?.subject || "—"}
                    {other?.chapter ? ` · ${other.chapter}` : ""} ·{" "}
                    {other?.mastery === null || other?.mastery === undefined
                      ? "暂无掌握度数据"
                      : `掌握度 ${other.mastery}%`}
                    {link.kind === "cross_subject" ? " · 跨课程" : " · 课程内"}
                    {direction === "incoming" ? " · 依赖本节点" : ""}
                  </small>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function CrossPairSummary({ pairs, title }: { pairs: CrossPair[]; title: string }) {
  if (!pairs.length) {
    return (
      <section className="lm-knowledge-relations">
        <h3>{title}</h3>
        <p>没有跨课程依赖。</p>
      </section>
    );
  }

  return (
    <section className="lm-knowledge-relations">
      <h3>{title}</h3>
      <p>格式：依赖方 → 被依赖的前置课程（条数）。</p>
      <ul>
        {pairs.map((pair) => (
          <li key={`${pair.from}-${pair.to}`}>
            <Route aria-hidden="true" />
            <span>
              {pair.from} → {pair.to}
            </span>
            <small>{pair.count} 条跨课程关系</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 总学科知识导图（取代原力导向关系网）                                 */
/* ------------------------------------------------------------------ */

const BRANCH_TONES = [
  { dot: "bg-[#0FA47F]", chip: "bg-[#0FA47F]/10 text-[#0B7A5E]", rail: "border-[#0FA47F]/30" },
  { dot: "bg-[#5B6BE8]", chip: "bg-[#5B6BE8]/10 text-[#3B47A8]", rail: "border-[#5B6BE8]/30" },
  { dot: "bg-[#E0913A]", chip: "bg-[#E0913A]/12 text-[#9A5F14]", rail: "border-[#E0913A]/30" },
  { dot: "bg-[#D9534F]", chip: "bg-[#D9534F]/10 text-[#9C3634]", rail: "border-[#D9534F]/30" },
];

function branchTone(index: number) {
  return BRANCH_TONES[index % BRANCH_TONES.length];
}

function SubjectMindMap({
  structure,
  selectedId,
  onOpenGraph,
  onOpenFocus,
}: {
  structure: Structure;
  selectedId: string;
  /** 点击课程卡片的绿色课程图标：进入该课程的知识网络图（页面B） */
  onOpenGraph: (subject: string) => void;
  /** 点击知识点名称：进入网络图并以该知识点为中心展开（页面B） */
  onOpenFocus: (nodeId: string, subject?: string) => void;
}) {
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
  /* 课程卡默认收起：只显示课程标题，点展开按钮向下展示该课程的全部章节 */
  const [openCourses, setOpenCourses] = useState<Set<string>>(new Set());

  const toggleCourse = useCallback((courseId: string) => {
    setOpenCourses((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }, []);

  const toggleBranch = useCallback((chapterId: string) => {
    setOpenChapters((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  if (!structure.courses.length) {
    return (
      <div className="lm-knowledge-empty">
        <Network aria-hidden="true" />
        <strong>暂无可展示的学科结构</strong>
        <p>后端还没有返回课程 / 章节 / 知识点层级，导入课程资料后这里会自动生成思维导图。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {structure.courses.map((course, index) => {
          const tone = branchTone(index);
          const chapters = structure.chapters.filter((chapter) => chapter.courseId === course.id);
          const courseOpen = openCourses.has(course.id);
          return (
            <li
              key={course.id}
              className="relative min-w-0 rounded-[22px] border border-[#EAE8E3] bg-white p-4 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_18px_32px_-18px_rgba(55,53,47,0.45)]"
            >
              <span
                aria-hidden="true"
                className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-[#EAE8E3]"
              />
              <div className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5">
                {/* 绿色课程图标 = 以该课程为中心进入知识网络图（页面B） */}
                <button
                  type="button"
                  onClick={() => onOpenGraph(course.subject)}
                  title={`以「${course.subject}」为中心打开知识网络图`}
                  aria-label={`以「${course.subject}」为中心打开知识网络图`}
                  className="group/icon relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <span aria-hidden="true" className={tone.dot + " h-9 w-9 rounded-full"} />
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -bottom-0.5 grid h-4 w-4 place-items-center rounded-full border border-[#EAE8E3] bg-white opacity-0 transition-opacity duration-200 group-hover/icon:opacity-100"
                  >
                    <Network className="h-2.5 w-2.5 text-[#0FA47F]" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenGraph(course.subject)}
                  aria-pressed={selectedId === course.id}
                  title={`打开「${course.subject}」知识网络图`}
                  className="min-w-0 flex-1 rounded-xl text-left transition-colors duration-200 hover:text-[#0FA47F]"
                >
                  <strong className="block truncate text-base font-bold text-[#37352F]">
                    {course.subject}
                  </strong>
                  <small className="text-xs font-semibold text-[#8A867E]">
                    {chapters.length} 章 · {course.knowledgeIds.length} 个知识点
                  </small>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenGraph(course.subject)}
                  aria-label={`打开「${course.subject}」知识网络图`}
                  title={`打开「${course.subject}」知识网络图`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#8A867E] transition-all duration-200 hover:-translate-y-0.5 hover:text-[#0FA47F]"
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
                {/* 课程级展开/收起：点一下向下展示该课程的全部章节 */}
                <button
                  type="button"
                  onClick={() => toggleCourse(course.id)}
                  aria-expanded={courseOpen}
                  aria-controls={`course-chapters-${course.id}`}
                  aria-label={`${courseOpen ? "收起" : "展开"}「${course.subject}」的 ${chapters.length} 个章节`}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#EAE8E3] bg-white px-2 text-[11px] font-bold text-[#55524B] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0FA47F] hover:text-[#0FA47F]"
                >
                  {courseOpen ? (
                    <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {courseOpen ? "收起" : "展开"}
                </button>
              </div>

              {courseOpen && (
                <ul
                  id={`course-chapters-${course.id}`}
                  className={"mt-3 grid gap-2 border-l border-dashed pl-3 " + tone.rail}
                >
                  {chapters.map((chapter) => {
                    const open = openChapters.has(chapter.id);
                    return (
                      <li key={chapter.id} className="min-w-0">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenFocus(chapter.id, course.subject)}
                            aria-pressed={selectedId === chapter.id}
                            title={`以「${chapter.chapter}」为中心打开知识网络图`}
                            className="group/chapter flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors duration-200 hover:bg-[#FBFAF8] hover:text-[#0FA47F]"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#37352F] group-hover/chapter:text-[#0FA47F]">
                              {chapter.chapter}
                            </span>
                            <small className="shrink-0 text-[11px] font-bold text-[#8A867E]">
                              {chapter.knowledgeIds.length}
                            </small>
                            <ChevronRight
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0 text-transparent transition-colors duration-200 group-hover/chapter:text-[#0FA47F]"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBranch(chapter.id)}
                            aria-expanded={open}
                            aria-label={(open ? "收起" : "展开") + chapter.chapter}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#EAE8E3] bg-white text-[#55524B] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0FA47F] hover:text-[#0FA47F]"
                          >
                            {open ? (
                              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        {open && (
                          <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-2">
                            {chapter.knowledgeIds.map((knowledgeId) => {
                              const knowledgeNode = structure.nodeById.get(knowledgeId);
                              if (!knowledgeNode) return null;
                              return (
                                <li key={knowledgeId}>
                                  <button
                                    type="button"
                                    onClick={() => onOpenFocus(knowledgeId, course.subject)}
                                    aria-pressed={selectedId === knowledgeId}
                                    title={`以「${knowledgeNode.label}」为中心打开知识网络图`}
                                    className={
                                      "rounded-full px-2.5 py-1 text-[11px] font-bold transition-all duration-200 hover:-translate-y-0.5 " +
                                      tone.chip
                                    }
                                  >
                                    {knowledgeNode.label}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 键盘可达节点列表：按科目收纳的三级下钻                               */
/* ------------------------------------------------------------------ */

function SubjectDrilldown({
  structure,
  selectedId,
  onFocus,
}: {
  structure: Structure;
  selectedId: string;
  onFocus: (nodeId: string) => void;
}) {
  const [subject, setSubject] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const keywordLower = keyword.trim().toLowerCase();
  const hit = (value: string) => !keywordLower || value.toLowerCase().includes(keywordLower);

  const course = subject === null ? undefined : structure.courses.find((item) => item.subject === subject);
  const chapters = course ? structure.chapters.filter((chapter) => chapter.courseId === course.id) : [];
  const chapter = chapterId === null ? undefined : structure.chapters.find((item) => item.id === chapterId);

  const visibleCourses = structure.courses.filter((item) => hit(item.subject));
  const visibleChapters = chapters.filter((item) => hit(item.chapter));
  const visibleKnowledge = chapter
    ? chapter.knowledgeIds
        .map((knowledgeId) => structure.nodeById.get(knowledgeId))
        .filter((node): node is GraphNode => Boolean(node))
        .filter((node) => hit(node.label))
    : [];

  const crumbClass =
    "rounded-full px-2.5 py-1 transition-colors duration-200 hover:bg-[#FBFAF8] hover:text-[#0FA47F]";
  const chipClass =
    "flex w-full items-center gap-3 rounded-2xl border border-[#EAE8E3] bg-white px-4 py-3 text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#0FA47F] hover:shadow-[0_14px_28px_-18px_rgba(15,164,127,0.6)]";

  return (
    <div className="grid gap-4">
      <nav
        className="flex flex-wrap items-center gap-1 text-xs font-bold text-[#8A867E]"
        aria-label="节点列表层级"
      >
        <button
          type="button"
          onClick={() => {
            setSubject(null);
            setChapterId(null);
          }}
          aria-current={course ? undefined : "page"}
          className={crumbClass}
        >
          全部学科
        </button>
        {course && (
          <>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            <button
              type="button"
              onClick={() => setChapterId(null)}
              aria-current={chapter ? undefined : "page"}
              className={crumbClass}
            >
              {course.subject}
            </button>
          </>
        )}
        {chapter && (
          <>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="rounded-full bg-[#FBFAF8] px-2.5 py-1 text-[#37352F]">{chapter.chapter}</span>
          </>
        )}
      </nav>

      <label className="flex flex-col gap-1 text-xs font-bold text-[#37352F]">
        <span>在当前层级搜索</span>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="输入学科 / 章节 / 知识点名称"
          className="h-11 w-full rounded-2xl border border-[#EAE8E3] bg-white px-3 text-sm font-medium text-[#37352F] outline-none transition-colors duration-200 focus:border-[#0FA47F]"
        />
      </label>

      {chapter ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {visibleKnowledge.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onFocus(node.id)}
                aria-pressed={node.id === selectedId}
                className={chipClass + (node.id === selectedId ? " border-[#0FA47F]" : "")}
              >
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-bold text-[#37352F]">{node.label}</strong>
                  <small className="text-[11px] font-semibold text-[#8A867E]">{nodeListSubtitle(node)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : course ? (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleChapters.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setChapterId(item.id);
                  setKeyword("");
                }}
                aria-pressed={item.id === selectedId}
                className={chipClass}
              >
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-bold text-[#37352F]">{item.chapter}</strong>
                  <small className="text-[11px] font-semibold text-[#8A867E]">
                    {item.knowledgeIds.length} 个知识点
                  </small>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8A867E]" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleCourses.map((item, index) => {
            const tone = branchTone(index);
            const itemChapters = structure.chapters.filter((chapter) => chapter.courseId === item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSubject(item.subject);
                    setChapterId(null);
                    setKeyword("");
                  }}
                  aria-pressed={item.id === selectedId}
                  className={chipClass}
                >
                  <span aria-hidden="true" className={tone.dot + " h-2.5 w-2.5 shrink-0 rounded-full"} />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-bold text-[#37352F]">
                      {item.subject}
                    </strong>
                    <small className="text-[11px] font-semibold text-[#8A867E]">
                      {itemChapters.length} 个章节 · {item.knowledgeIds.length} 个知识点
                    </small>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8A867E]" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!visibleCourses.length && !course && <p className="lm-knowledge-note">没有匹配的学科。</p>}
      {course && !chapter && !visibleChapters.length && <p className="lm-knowledge-note">没有匹配的章节。</p>}
      {chapter && !visibleKnowledge.length && <p className="lm-knowledge-note">没有匹配的知识点。</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 各学科知识点掌握进度条                                               */
/* ------------------------------------------------------------------ */

function masteryBand(average: number | null) {
  if (average === null) return { bar: "bg-[#D9D6CF]", text: "text-[#8A867E]", label: "暂无数据" };
  if (average >= 80) return { bar: "bg-[#0FA47F]", text: "text-[#0B7A5E]", label: "掌握良好" };
  if (average >= 60) return { bar: "bg-[#E0913A]", text: "text-[#9A5F14]", label: "基本掌握" };
  return { bar: "bg-[#D9534F]", text: "text-[#9C3634]", label: "需要加强" };
}

function SubjectMasteryProgress({ records }: { records: NormalizedRecord[] }) {
  const rows = useMemo(() => {
    const groups = groupBySubject(records);
    return Object.keys(groups)
      .map((subject) => {
        const items = groups[subject];
        const scored = items.filter((item) => typeof item.mastery === "number");
        const sum = scored.reduce((total, item) => total + (item.mastery === null ? 0 : item.mastery), 0);
        return {
          subject,
          total: items.length,
          practiced: scored.length,
          average: scored.length ? Math.round(sum / scored.length) : null,
          wrongTotal: items.reduce((total, item) => total + item.wrongCount, 0),
          practiceTotal: items.reduce((total, item) => total + item.practiceCount, 0),
        };
      })
      .sort((a, b) => (b.average === null ? -1 : b.average) - (a.average === null ? -1 : a.average));
  }, [records]);

  if (!rows.length) {
    return (
      <div className="lm-knowledge-empty">
        <CircleDot aria-hidden="true" />
        <strong>暂无掌握度记录</strong>
        <p>后端还没有返回知识点掌握度，完成练习后这里会按学科显示掌握进度。</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {rows.map((row) => {
        const band = masteryBand(row.average);
        const percent = row.average === null ? 0 : Math.max(0, Math.min(100, row.average));
        return (
          <li
            key={row.subject}
            className="grid gap-2 rounded-[22px] border border-[#EAE8E3] bg-white px-4 py-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-18px_rgba(55,53,47,0.45)]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="text-base font-bold text-[#37352F]">{row.subject}</strong>
              <span className={"text-lg font-extrabold " + band.text}>
                {row.average === null ? "--" : row.average + "%"}
              </span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-[#FBFAF8] ring-1 ring-[#EAE8E3] ring-inset"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={row.subject + " 知识点掌握进度"}
            >
              <span
                className={"block h-full rounded-full transition-all duration-500 ease-out " + band.bar}
                style={{ width: percent + "%" }}
              />
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#8A867E]">
              <span>
                已练 {row.practiced} / {row.total} 个知识点
              </span>
              <span>平均掌握 {row.average === null ? "暂无" : row.average + "%"}</span>
              <span>
                错题 {row.wrongTotal} 次 · 练习 {row.practiceTotal} 次
              </span>
              <span className={band.text}>{band.label}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* 头部 / 状态                                                         */
/* ------------------------------------------------------------------ */

function KnowledgeHeader({
  stats,
  weakPointCount,
}: {
  stats: Structure["stats"] | null;
  weakPointCount: number;
}) {
  return (
    <header className="lm-knowledge-header flex-col">
      <div>
        <span>
          <Brain aria-hidden="true" />
          知识图谱
        </span>
        <h1>课程 · 章节 · 总学科知识导图</h1>
      </div>
      <div className="w-full grid grid-cols-2 sm:grid-cols-4">
        <div className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-[22px] border border-[#EAE8E3] bg-white px-6 pb-7 pt-5 text-center shadow-[0_1px_2px_rgba(55,53,47,0.04)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#0FA47F] hover:shadow-[0_18px_36px_-18px_rgba(15,164,127,0.55)]">
          <span className="text-sm font-bold tracking-wide text-[#8A867E]">课程</span>
          <strong className="text-[2rem] font-extrabold leading-tight text-[#37352F]">
            {stats ? stats.courses : "—"}
          </strong>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0FA47F]/15 to-transparent"
          />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#0FA47F]" />
        </div>
        <div className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-[22px] border border-[#EAE8E3] bg-white px-6 pb-7 pt-5 text-center shadow-[0_1px_2px_rgba(55,53,47,0.04)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#5B6BE8] hover:shadow-[0_18px_36px_-18px_rgba(91,107,232,0.55)]">
          <span className="text-sm font-bold tracking-wide text-[#8A867E]">章节</span>
          <strong className="text-[2rem] font-extrabold leading-tight text-[#37352F]">
            {stats ? stats.chapters : "—"}
          </strong>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#5B6BE8]/15 to-transparent"
          />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#5B6BE8]" />
        </div>
        <div className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-[22px] border border-[#EAE8E3] bg-white px-6 pb-7 pt-5 text-center shadow-[0_1px_2px_rgba(55,53,47,0.04)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#E0913A] hover:shadow-[0_18px_36px_-18px_rgba(224,145,58,0.55)]">
          <span className="text-sm font-bold tracking-wide text-[#8A867E]">知识点</span>
          <strong className="text-[2rem] font-extrabold leading-tight text-[#37352F]">
            {stats ? stats.knowledge : "—"}
          </strong>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#E0913A]/15 to-transparent"
          />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#E0913A]" />
        </div>
        <div className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-[22px] border border-[#EAE8E3] bg-white px-6 pb-7 pt-5 text-center shadow-[0_1px_2px_rgba(55,53,47,0.04)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#D9534F] hover:shadow-[0_18px_36px_-18px_rgba(217,83,79,0.55)]">
          <span className="text-sm font-bold tracking-wide text-[#8A867E]">薄弱点</span>
          <strong className="text-[2rem] font-extrabold leading-tight text-[#37352F]">
            {weakPointCount}
          </strong>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#D9534F]/15 to-transparent"
          />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#D9534F]" />
        </div>
      </div>
    </header>
  );
}

function KnowledgeState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="lm-knowledge-state">
      {icon}
      <h1>{title}</h1>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="lm-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 布局与视觉辅助                                                      */
/* ------------------------------------------------------------------ */

/* 放射思维导图的三层半径（课程 / 章节双层交错 / 知识点双层交错）与纵向压缩比 */
const MIND_RADIUS = { course: 190, chapterA: 320, chapterB: 374, leafA: 540, leafB: 588 };
const MIND_GAP = (5 * Math.PI) / 180;
const MIND_SQUASH_Y = 0.62;
/* 每门课程整体径向错落，避免所有簇落在同一组同心圆上 */
const MIND_OFFSET = [0, 30, -22, 18, -14];

interface MindPoint {
  x: number;
  y: number;
  angle: number;
  radius: number;
}

interface MindSector {
  courseId: string;
  a0: number;
  a1: number;
  inner: number;
  outer: number;
  color: string;
}

interface MindLayout {
  points: Map<string, MindPoint>;
  sectors: MindSector[];
  width: number;
  height: number;
}

/** 极坐标（椭圆压缩）→ 画布坐标 */
function polarPoint(angle: number, radius: number, cx: number, cy: number) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * MIND_SQUASH_Y };
}

/** 子树规模：课程 / 章节用下辖知识点数，知识点算 1，保证扇区宽度与内容量成正比 */
function subtreeWeight(node: GraphNode) {
  if (node.kind === "knowledge") return 1;
  return Math.max(1, node.knowledgeCount);
}

/**
 * 放射思维导图布局：中心向外发散。
 *   课程 → 按知识规模分配扇区；章节 → 在课程扇区内再分子扇区（双层交错半径）；
 *   知识点 → 在章节子扇区内扇形展开（双层交错半径）。
 * 坐标完全由几何计算得到（不跑力的导向仿真），所以节点固定不动、不会漂移。
 * 聚焦模式（focusId）下：聚焦节点置中，其余直接邻域均分在一个环上。
 */
function buildMindMapLayout(nodes: GraphNode[], width: number, height: number, focusId = ""): MindLayout {
  const cx = width / 2;
  const cy = height / 2;
  const points = new Map<string, MindPoint>();
  const sectors: MindSector[] = [];
  const visible = nodes.filter((node) => node.kind !== "overview");
  const visibleIds = new Set(visible.map((node) => node.id));

  const childrenOf = new Map<string, GraphNode[]>();
  const roots: GraphNode[] = [];
  visible.forEach((node) => {
    if (node.parentId && visibleIds.has(node.parentId)) {
      const bucket = childrenOf.get(node.parentId);
      if (bucket) bucket.push(node);
      else childrenOf.set(node.parentId, [node]);
    } else {
      roots.push(node);
    }
  });
  const byLabel = (a: GraphNode, b: GraphNode) => a.label.localeCompare(b.label, "zh-CN");
  childrenOf.forEach((bucket) => bucket.sort(byLabel));
  roots.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || byLabel(a, b));

  /* 聚焦模式：中心节点置中，直接邻域均分在一个椭圆环上 */
  const focusNode = focusId ? visible.find((node) => node.id === focusId) : undefined;
  if (focusNode && visible.length > 1) {
    points.set(focusNode.id, { x: cx, y: cy, angle: 0, radius: 0 });
    const ringRadius = Math.max(MIND_RADIUS.chapterB, Math.min(width, height) * 0.62);
    const others = visible.filter((node) => node.id !== focusNode.id);
    others.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / others.length) * Math.PI * 2;
      const point = polarPoint(angle, ringRadius, cx, cy);
      points.set(node.id, { ...point, angle, radius: ringRadius });
    });
    return { points, sectors, width: ringRadius * 2 + 140, height: ringRadius * 2 * MIND_SQUASH_Y + 140 };
  }

  const totalWeight = roots.reduce((sum, node) => sum + subtreeWeight(node), 0) || 1;
  const usable = Math.PI * 2 - MIND_GAP * roots.length;
  let cursor = -Math.PI / 2; /* 从 12 点方向起，顺时针分配扇区 */

  const place = (node: GraphNode, a0: number, a1: number, offset: number, parity: number) => {
    const angle = (a0 + a1) / 2;
    let radius: number;
    if (node.kind === "course") radius = MIND_RADIUS.course + offset * 0.4;
    else if (node.kind === "chapter") {
      radius = (parity % 2 === 0 ? MIND_RADIUS.chapterA : MIND_RADIUS.chapterB) + offset;
    } else {
      radius = (parity % 2 === 0 ? MIND_RADIUS.leafA : MIND_RADIUS.leafB) + offset;
    }
    const point = polarPoint(angle, radius, cx, cy);
    points.set(node.id, { ...point, angle, radius });

    const children = childrenOf.get(node.id);
    if (!children || !children.length) return;
    const weights = children.map((child) => subtreeWeight(child));
    const sum = weights.reduce((acc, value) => acc + value, 0) || 1;
    let childCursor = a0;
    children.forEach((child, index) => {
      const span = (a1 - a0) * (weights[index] / sum);
      /* 章节按自己在课程内的序号交错半径；知识点沿用所属章节的交错 */
      const childParity = node.kind === "course" ? index % 2 : parity;
      place(child, childCursor, childCursor + span, offset, childParity);
      childCursor += span;
    });
  };

  roots.forEach((root, index) => {
    const span = usable * (subtreeWeight(root) / totalWeight);
    const a0 = cursor;
    const a1 = cursor + span;
    cursor = a1 + MIND_GAP;
    const offset = MIND_OFFSET[index % MIND_OFFSET.length];
    place(root, a0, a1, offset, index % 2);
    /* 课程扇区浅色底：与独立图谱页一样，一眼看出每门课的知识簇归属 */
    if (root.kind === "course") {
      sectors.push({
        courseId: root.id,
        a0,
        a1,
        inner: MIND_RADIUS.course + offset * 0.4 + 46,
        outer: MIND_RADIUS.leafB + offset + 74,
        color: courseTint(root.subject ?? root.label),
      });
    }
  });

  /* 包围盒（含标签外扩）用于自适应缩放 */
  let maxX = 0;
  let maxY = 0;
  points.forEach((point) => {
    maxX = Math.max(maxX, Math.abs(point.x - cx));
    maxY = Math.max(maxY, Math.abs(point.y - cy));
  });
  const reach = 96; /* 标签与节点半径的余量 */
  return { points, sectors, width: (maxX + reach) * 2, height: (maxY + reach) * 2 };
}

function nodeRadius(node: GraphNode) {
  if (node.kind === "overview") return 26;
  if (node.kind === "course") return 18;
  if (node.kind === "chapter") return 10;
  return 6.5;
}

function nodeFontSize(node: GraphNode) {
  if (node.kind === "overview") return 15;
  if (node.kind === "course") return 14;
  if (node.kind === "chapter") return 11.5;
  return 10.5;
}

/* 每门课程一个色相（与独立图谱页一致），章节用同色相的浅一号，扇区底用更浅的 tint */
const COURSE_HUES: Record<string, string> = {
  "数据结构": "#d94436",
  "计算机组成原理": "#e08a1e",
  "操作系统": "#7c5cf0",
  "计算机网络": "#0f9bb5",
  "C语言": "#12a37f",
};
const COURSE_LIGHT: Record<string, string> = {
  "数据结构": "#e9827a",
  "计算机组成原理": "#eeb45f",
  "操作系统": "#a893f6",
  "计算机网络": "#5cc0d3",
  "C语言": "#4cc4a5",
};
const COURSE_TINTS: Record<string, string> = {
  "数据结构": "#fdeeec",
  "计算机组成原理": "#fdf4e7",
  "操作系统": "#f1eefe",
  "计算机网络": "#e8f7fa",
  "C语言": "#e9f8f3",
};

function courseHue(subject?: string) {
  return (subject && COURSE_HUES[subject]) || "#0FA47F";
}
function courseLight(subject?: string) {
  return (subject && COURSE_LIGHT[subject]) || "#5EC7AC";
}
function courseTint(subject?: string) {
  return (subject && COURSE_TINTS[subject]) || "#EAF7F3";
}

function nodeColor(node: GraphNode) {
  if (node.kind === "overview") return "#37352F";
  /* 课程 / 章节按所属课程色相区分分组；有掌握度数据时仍优先显示掌握度 */
  if (node.kind === "course") return courseHue(node.subject ?? node.label);
  if (node.kind === "chapter") {
    return node.masteryMatched && node.mastery !== null
      ? masteryColor(node.mastery)
      : courseLight(node.subject);
  }
  if (node.mastery === null) return "#B5B1A8";
  return masteryColor(node.mastery);
}

function masteryColor(mastery: number) {
  if (mastery >= 80) return "#1D9E63";
  if (mastery >= 60) return "#B25000";
  return "#D70015";
}

function nodeClass(node: GraphNode) {
  const parts = ["lm-knowledge-svg-node", `is-${node.kind}`];
  if (node.contextOnly) parts.push("is-context");
  if (node.kind === "knowledge") parts.push("is-label-hidden");
  if (node.matchedInQuery) parts.push("is-pinned", "is-search-hit");
  return parts.join(" ");
}

function linkClass(link: RenderLink) {
  const parts = ["lm-knowledge-svg-link", `is-${link.kind}`];
  if (link.lifted) parts.push("is-lifted");
  return parts.join(" ");
}

function nodeAriaLabel(node: GraphNode) {
  const mastery = node.mastery === null ? "，暂无掌握度数据" : `，掌握度 ${node.mastery}%`;
  if (node.kind === "overview") return `总览，${node.knowledgeCount} 个知识点`;
  if (node.kind === "course")
    return `课程 ${node.label}，${node.chapterCount} 个章节，${node.knowledgeCount} 个知识点${mastery}`;
  if (node.kind === "chapter")
    return `章节 ${node.label}${node.expanded ? "，已展开" : "，已折叠"}，${node.knowledgeCount} 个知识点${mastery}`;
  return `${node.label}，${node.subject} · ${node.chapter}${mastery}`;
}

function nodeTooltip(node: GraphNode) {
  const lines = [nodeAriaLabel(node)];
  if (node.kind === "knowledge") {
    lines.push(`难度：${difficultyLabel(node.difficulty)}`);
    lines.push(`关联资源：${node.resourceCount}`);
    if (node.description) lines.push(node.description);
  }
  return lines.join("\n");
}

function nodeKindLabel(kind: NodeKind) {
  if (kind === "overview") return "总览";
  if (kind === "course") return "课程";
  if (kind === "chapter") return "章节";
  return "知识点";
}

function kindRank(kind: NodeKind) {
  if (kind === "course") return 0;
  if (kind === "chapter") return 1;
  return 2;
}

function nodeListSubtitle(node: GraphNode) {
  if (node.kind === "course") return `${node.chapterCount} 章节 · ${node.knowledgeCount} 知识点`;
  if (node.kind === "chapter") {
    return `${node.subject} · ${node.knowledgeCount} 知识点 · ${node.expanded ? "已展开" : "已折叠"}`;
  }
  const mastery = node.mastery === null ? "暂无掌握度" : `${node.mastery}%`;
  return `${node.subject} · ${node.chapter} · ${difficultyLabel(node.difficulty)} · ${mastery}`;
}

function groupBySubject(records: NormalizedRecord[]) {
  return records.reduce<Record<string, NormalizedRecord[]>>((groups, record) => {
    const key = record.subject || "未标注课程";
    groups[key] = [...(groups[key] || []), record];
    return groups;
  }, {});
}

function masteryClass(mastery: number | null, practiceCount: number) {
  if (practiceCount <= 0 || mastery === null) return "is-empty";
  if (mastery >= 80) return "is-good";
  if (mastery >= 60) return "is-mid";
  return "is-low";
}

function formatDate(value?: string) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
