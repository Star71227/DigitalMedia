/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Download, Image, Maximize2, RotateCcw } from "lucide-react";
import CitationPanel, { type Citation } from "../knowledge/CitationPanel";

export interface MindNode {
  id: string;
  label: string;
  description: string;
  nodeType: string;
  importance: "high" | "medium" | "low";
  children: MindNode[];
  citations?: number[];
}

export interface MindMapContent {
  root: MindNode;
  crossLinks: Array<{ sourceId: string; targetId: string; label: string }>;
  highlightNodeIds: string[];
  misconceptionNodeIds: string[];
  recommendedSequence: string[];
}

/**
 * 分支配色（照参考导图样式）：每个主干一种颜色，子结点用同色浅底 + 同色描边，连线也跟分支同色。
 * 与后端导出到本地思维导图时的配色保持一致（见 backend/src/services/mindMapExportService.js）。
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
const NODE_WIDTH = 158;
const NODE_HEIGHT = 40;
const ROOT_WIDTH = 188;
const ROOT_HEIGHT = 56;
const ROW_GAP = 84;
const LEVEL_GAP = 322;

export default function MindMapViewer({
  content,
  title,
  citations = [],
}: {
  content: MindMapContent;
  title: string;
  citations?: Citation[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<MindNode | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1040, height: 600 });
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootScrollRef = useRef(0);

  // 画布尺寸变化后（首次渲染 / 展开折叠 / 切换全屏）把滚动位置对准根结点
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollTop = rootScrollRef.current;
  }, [canvasSize.width, canvasSize.height, fullscreen]);

  useEffect(() => {
    const sync = () => {
      const element =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
        null;
      setFullscreen(Boolean(containerRef.current && element === containerRef.current));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggleFullscreen = async () => {
    const node = containerRef.current as
      (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    if (!node) return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element | null;
    };
    const requestFullscreen = node.requestFullscreen as (() => Promise<void>) | undefined;
    const exitFullscreen = doc.exitFullscreen as (() => Promise<void>) | undefined;
    const webkitRequestFullscreen = node.webkitRequestFullscreen;
    const webkitExitFullscreen = doc.webkitExitFullscreen;
    try {
      const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (active) {
        if (exitFullscreen) await exitFullscreen.call(doc);
        else if (webkitExitFullscreen) await webkitExitFullscreen.call(doc);
        else setFullscreen(false);
      } else if (requestFullscreen) {
        await requestFullscreen.call(node);
      } else if (webkitRequestFullscreen) {
        await webkitRequestFullscreen.call(node);
      } else {
        setFullscreen(true);
      }
    } catch {
      setFullscreen((value) => !value);
    }
  };

  const visible = useMemo(() => {
    const clone = (node: MindNode): MindNode => ({
      ...node,
      children: collapsed.has(node.id) ? [] : (node.children || []).map(clone),
    });
    return clone(content.root);
  }, [content, collapsed]);

  const nodeLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const visit = (node: MindNode) => {
      labels.set(node.id, node.label);
      (node.children || []).forEach(visit);
    };
    visit(content.root);
    return labels;
  }, [content.root]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const selection = d3.select(svg);
    selection.selectAll("*").remove();
    const viewport = selection.append("g");
    const root = d3.hierarchy(visible);
    // 行距与层间距都留足：方框 158×40，父子连线只在自己的行带上小幅起伏，不会压到别人的方框
    d3
      .tree<MindNode>()
      .nodeSize([ROW_GAP, LEVEL_GAP])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.5))(root);
    const nodes = root.descendants();
    const minX = d3.min(nodes, (node) => node.x) ?? 0;
    nodes.forEach((node) => {
      node.x = node.x - minX + 52;
      node.y = node.depth * LEVEL_GAP + 60;
    });

    // 每条主干一种颜色：把顶层分支的序号沿子树传下去
    const branchOf = new Map<string, number>();
    nodes.forEach((item) => {
      const top = item.ancestors().filter((node) => node.depth === 1)[0];
      if (top && typeof top.data.id === "string" && item.depth >= 1) {
        const branchIndex = nodes
          .filter((node) => node.depth === 1)
          .findIndex((node) => node.data.id === top.data.id);
        branchOf.set(item.data.id, Math.max(0, branchIndex));
      }
    });
    const paletteOf = (id: string) => BRANCH_PALETTE[(branchOf.get(id) ?? 0) % BRANCH_PALETTE.length];

    // 连线和方框必须画在同一个 <g> 里：之前连线挂在了 SVG 根节点上，一旦 viewport 带位移，
    // 方框被平移而连线没跟上，看起来就像"图和框分家"。
    const linkLayer = viewport.append("g").attr("class", "tree-links");
    linkLayer
      .selectAll("path.tree-link")
      .data(root.links())
      .join("path")
      .attr("class", "tree-link")
      .attr(
        "d",
        d3
          .linkHorizontal<d3.HierarchyPointLink<MindNode>, d3.HierarchyPointNode<MindNode>>()
          .x((node) => node.y)
          .y((node) => node.x),
      )
      .attr("fill", "none")
      .attr("stroke", (link) => paletteOf(link.target.data.id).line)
      .attr("stroke-width", 1.8)
      .attr("stroke-opacity", 0.85);

    const byId = new Map(nodes.map((node) => [node.data.id, node]));
    viewport
      .selectAll("path.cross")
      .data(content.crossLinks.filter((link) => byId.has(link.sourceId) && byId.has(link.targetId)))
      .join("path")
      .attr("d", (link) => {
        const source = byId.get(link.sourceId)!;
        const target = byId.get(link.targetId)!;
        return `M${source.y},${source.x} Q${(source.y + target.y) / 2},${Math.min(source.x, target.x) - 35} ${target.y},${target.x}`;
      })
      .attr("fill", "none")
      .attr("stroke", (link) => paletteOf(link.targetId).line)
      .attr("stroke-width", 1.2)
      .attr("stroke-opacity", 0.3)
      .attr("stroke-dasharray", "5 4");

    const node = viewport
      .selectAll<SVGGElement, d3.HierarchyPointNode<MindNode>>("g.node")
      .data(nodes, (item) => item.data.id)
      .join("g")
      .attr("class", "node")
      .attr("transform", (item) => `translate(${item.y},${item.x})`)
      .style("cursor", "pointer")
      .on("click", (_, item) => {
        setSelected(item.data);
        if (item.data.children?.length) {
          setCollapsed((current) => {
            const next = new Set(current);
            next.has(item.data.id) ? next.delete(item.data.id) : next.add(item.data.id);
            return next;
          });
        }
      });

    node
      .append("rect")
      .attr("x", (item) => (item.depth === 0 ? -ROOT_WIDTH / 2 : -8))
      .attr("y", (item) => (item.depth === 0 ? -ROOT_HEIGHT / 2 : -NODE_HEIGHT / 2))
      .attr("rx", 9)
      .attr("width", (item) => (item.depth === 0 ? ROOT_WIDTH : NODE_WIDTH))
      .attr("height", (item) => (item.depth === 0 ? ROOT_HEIGHT : NODE_HEIGHT))
      .attr("fill", (item) => (item.depth === 0 ? ROOT_STYLE.fill : paletteOf(item.data.id).fill))
      .attr("stroke", (item) => (item.depth === 0 ? ROOT_STYLE.line : paletteOf(item.data.id).line))
      .attr("stroke-width", (item) =>
        item.depth === 0
          ? 2.2
          : content.misconceptionNodeIds.includes(item.data.id) || item.data.importance === "high"
            ? 2.2
            : 1.4,
      );

    node
      .append("text")
      .attr("x", (item) => (item.depth === 0 ? 0 : 4))
      .attr("y", 5)
      .attr("text-anchor", (item) => (item.depth === 0 ? "middle" : "start"))
      .attr("font-size", (item) => (item.depth === 0 ? 15 : 13))
      .attr("font-family", "LXGW WenKai Screen, LXGW WenKai, Microsoft YaHei, sans-serif")
      .attr("font-weight", (item) => (item.depth === 0 ? 800 : 600))
      .attr("fill", (item) => (item.depth === 0 ? ROOT_STYLE.text : "#37352F"))
      .text((item) => item.data.label.slice(0, item.depth === 0 ? 14 : 13));

    // 画布尺寸按内容 1:1 计算（不做等比缩放：否则 3000px 高的导图会被压到 0.5 倍、字号只剩 7px，
    // 方框和连线看起来像"分家"）。超出容器高度时由外层容器滚动，滚轮仍可缩放、拖拽可平移。
    const xs = nodes.map((item) => item.x);
    const ys = nodes.map((item) => item.y);
    const boxLeft = Math.min(...ys) - ROOT_WIDTH / 2 - 28;
    const boxRight = Math.max(...ys) + NODE_WIDTH + 44;
    const boxTop = Math.min(...xs) - Math.max(ROOT_HEIGHT, NODE_HEIGHT) / 2 - 26;
    const boxBottom = Math.max(...xs) + Math.max(ROOT_HEIGHT, NODE_HEIGHT) / 2 + 26;
    viewport.attr("transform", `translate(${-boxLeft},${-boxTop})`);
    const width = Math.round(boxRight - boxLeft);
    const height = Math.round(boxBottom - boxTop);
    svg.dataset.canvasSize = `${width}x${height}`;
    // 根结点在整张图的垂直中部，初始滚动位置对准根结点，否则一进来看到的是最上面那条分支
    rootScrollRef.current = Math.max(0, Math.round(root.x - boxTop - 120));
    if (canvasSize.width !== width || canvasSize.height !== height) setCanvasSize({ width, height });

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 2.5])
      .on("zoom", (event) => {
        viewport.attr(
          "transform",
          `translate(${event.transform.x - boxLeft * event.transform.k},${event.transform.y - boxTop * event.transform.k}) scale(${event.transform.k})`,
        );
      });
    selection.call(zoom);
    selection.on("dblclick.zoom", null);
    zoomRef.current = zoom;
  }, [visible, content]);

  const reset = () => {
    setCollapsed(new Set());
    setSelected(null);
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  /**
   * 导出用 SVG：
   *  - 尺寸必须用当前画布真实尺寸，并补上 viewBox —— 以前写死 1100×650 且没有 viewBox，
   *    导出的只是左上角那一小块（现在画布接近 1290×3888，那块基本是空白），看起来就像"啥也没有"；
   *  - 补一层浅色底，否则透明底的 PNG 在白色背景上看不出边界。
   */
  const svgBlob = () => {
    const svg = svgRef.current!;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.setAttribute("width", String(canvasSize.width));
    clone.setAttribute("height", String(canvasSize.height));
    clone.setAttribute("viewBox", `0 0 ${canvasSize.width} ${canvasSize.height}`);
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(canvasSize.width));
    background.setAttribute("height", String(canvasSize.height));
    background.setAttribute("fill", "#F7F6F3");
    clone.insertBefore(background, clone.firstChild);
    return new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  };

  /**
   * 触发下载：必须先把 a 挂到 body、点完等一拍再 revoke，
   * 否则同步 revoke 会把还在读取的 blob 掐断，落盘文件是空的。
   */
  const download = (blob: Blob, ext: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.${ext}`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  };

  const exportPng = () => {
    const blob = svgBlob();
    const url = URL.createObjectURL(blob);
    const image = new window.Image();
    image.onload = () => {
      // 2 倍导出，但总边长压到 8000px 以内，避免超出画布上限后变成空白图
      const scale = Math.min(2, 8000 / Math.max(canvasSize.width, canvasSize.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(canvasSize.width * scale));
      canvas.height = Math.max(1, Math.round(canvasSize.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#F7F6F3";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((png) => {
        if (png) download(png, "png");
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  };

  const recommended = content.recommendedSequence.map((id) => nodeLabels.get(id)).filter(Boolean);

  return (
    <div
      ref={containerRef}
      className={`lm-mindmap-view ${fullscreen ? "fixed inset-0 z-50 flex flex-col gap-3 overflow-hidden bg-[#F7F6F3] p-4" : "space-y-3"}`}
    >
      <div className="flex flex-wrap gap-2">
        <ToolButton onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          重置
        </ToolButton>
        <ToolButton onClick={() => void toggleFullscreen()}>
          <Maximize2 className="h-4 w-4" />
          {fullscreen ? "退出全屏" : "全屏"}
        </ToolButton>
        <ToolButton onClick={() => download(svgBlob(), "svg")}>
          <Download className="h-4 w-4" />
          SVG
        </ToolButton>
        <ToolButton onClick={exportPng}>
          <Image className="h-4 w-4" />
          PNG
        </ToolButton>
      </div>
      <div
        ref={scrollRef}
        className={
          fullscreen
            ? "min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50"
            : "max-h-[620px] overflow-auto rounded-lg border border-slate-200 bg-slate-50"
        }
      >
        <svg ref={svgRef} width={canvasSize.width} height={canvasSize.height} className="block" />
      </div>
      {!fullscreen && (
        <p className="text-xs leading-5 text-slate-500">
          导图较长时可在框内滚动查看；滚轮缩放、拖拽平移，点结点可折叠/展开分支。
        </p>
      )}
      {selected && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
          <strong>{selected.label}</strong>
          <p className="mt-1 leading-6 text-slate-600">{selected.description}</p>
          <CitationPanel citations={citations.filter((item) => selected.citations?.includes(item.chunkId))} />
        </div>
      )}
      {recommended.length > 0 && (
        <div className="text-xs leading-5 text-slate-500">推荐顺序：{recommended.join(" -> ")}</div>
      )}
    </div>
  );
}

function ToolButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
    >
      {children}
    </button>
  );
}
