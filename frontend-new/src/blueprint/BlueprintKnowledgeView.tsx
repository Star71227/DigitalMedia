import { DepthScene } from "./depth/DepthScene";
import { Carrier } from "./motion/Motion";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Database,
  FileText,
  Maximize2,
  MessageSquare,
  Minimize2,
  Network,
  Upload,
} from "lucide-react";
import {
  describeApiError,
  getKnowledgeGraph,
  uploadPersonalKnowledge,
  type KnowledgeGraphResponse,
} from "../api";
import type { Course, WeakPoint } from "../types";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";

interface Props {
  courses: Course[];
  weakPoints: WeakPoint[];
  onNavigateToTab: (tab: string, data?: unknown) => void;
  subject?: string;
  focus?: string;
}

/* 本地知识库覆盖的五门课程（与后端 knowledgeSubjects.js、下方放射知识导图的学科一致）。 */
const KNOWLEDGE_SUBJECTS = ["数据结构", "计算机组成原理", "操作系统", "计算机网络", "C语言"];

export default function BlueprintKnowledgeView({
  courses,
  weakPoints,
  onNavigateToTab,
  subject = "",
  focus = "",
}: Props) {
  const [graph, setGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [selectedSubject, setSelectedSubject] = useState(subject || courses[0]?.name || "数据结构");
  const [uploadState, setUploadState] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    getKnowledgeGraph()
      .then((value) => {
        if (active) setGraph(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  /* 全屏状态以浏览器的 fullscreenchange 为准：用户按 Esc、切换标签页都会回到非全屏，
     按钮文案与图标因此不会和真实状态脱节。 */
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPseudoFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function toggleFullscreen() {
    const node = embedRef.current;
    if (isFullscreen) {
      await document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      return;
    }
    if (!node) return;
    const request =
      node.requestFullscreen?.bind(node) ||
      (
        node as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }
      ).webkitRequestFullscreen?.bind(node);
    if (!request) {
      setPseudoFullscreen(true);
      return;
    }
    try {
      await request();
    } catch {
      // 某些浏览器策略（如非用户手势触发的全屏、iframe 权限）会拒绝，退回大窗模式
      setPseudoFullscreen(true);
    }
  }

  const subjects = knowledgeSubjects(graph);
  const subjectKey = subjects.join("|");
  const counts = countGraph(graph, courses, weakPoints, subjects);

  /* 图谱加载完成后，把当前选中课程收敛到知识库真正覆盖的课程，避免下拉出现空选项。 */
  useEffect(() => {
    if (!subjects.length) return;
    setSelectedSubject((current) => (subjects.includes(current) ? current : subjects[0]));
  }, [subjectKey]);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploadState("正在导入资料…");
    try {
      const contentText = await file.text();
      await uploadPersonalKnowledge({
        title: file.name.replace(/\.[^.]+$/, ""),
        fileName: file.name,
        mimeType: file.type,
        subject: selectedSubject,
        contentText,
      });
      setUploadState("资料已导入，后续回答与资源生成会引用该资料。 ");
    } catch (reason) {
      setUploadState(describeApiError(reason, "资料导入失败"));
    }
  };

  return (
    <section className="bp-page bp-knowledge-page">
      <BlueprintMotif variant="branch" />
      <BlueprintHeader title="知识图谱" english="KNOWLEDGE GRAPH" />
      <div className="bp-knowledge-intro">
        <h2 data-level="A" data-carrier="plate" data-enter="persist" data-family="F15" data-mg-behavior="persist">课程 · 章节 · 总学科知识导图</h2>
        <p>在知识的连接中，看见更大的学习世界。</p>
        <span>A MORE CONNECTED LEARNING WORLD.</span>
      </div>

      <div className="bp-knowledge-stats">
        <Stat label="课程" value={counts.courses} icon={<BookOpen />} tone="green" />
        <Stat label="章节" value={counts.chapters} icon={<FileText />} tone="indigo" />
        <Stat label="知识点" value={counts.knowledge} icon={<Network />} tone="amber" />
        <Stat label="薄弱点" value={counts.weak} icon={<AlertTriangle />} tone="red" />
      </div>

      <section className="bp-local-knowledge">
        <header>
          <Database />
          <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">本地知识库</strong>
        </header>
        <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>
          {subjects.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.csv,.json"
          hidden
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <button type="button" className="bp-primary-action" onClick={() => fileInput.current?.click()}>
          <Upload />
          导入资料
        </button>
        <button
          type="button"
          className="bp-line-button"
          onClick={() =>
            onNavigateToTab("mentor", `请结合${selectedSubject}课程资料与知识图谱回答我的问题。`)
          }
        >
          <MessageSquare />
          去助手提问
        </button>
        <div className="bp-local-knowledge__counts">
          <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
            课程<b>{counts.courses}</b>
          </span>
          <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
            资料<b>{graph?.resources.length ?? 0}</b>
          </span>
          <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
            节点<b>{graph?.nodes.length ?? 0}</b>
          </span>
          <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
            关系<b>{graph?.edges.length ?? 0}</b>
          </span>
        </div>
        {uploadState && <p>{uploadState}</p>}
      </section>

      <section className="bp-knowledge-canvas">
        <Carrier shape="fan" className="mg-knowledge-fan" />
        <header>
          <Network />
          <div>
            <strong data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">学科知识导图</strong>
            <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
              中心向外发散：课程 → 章节 → 知识点；滚轮缩放、拖拽平移，点击任意节点进入该知识点的详情页。
            </span>
          </div>
          {/* 全屏交给浏览器 Fullscreen API：整个导图容器（含 iframe 内的搜索、图例、缩放控制）一起放大，
              iframe 内部不用改任何逻辑；不支持全屏的浏览器退化成「大窗模式」（给容器加类名，CSS 里铺满视口）。 */}
          <button
            type="button"
            className="bp-mindmap-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? "退出全屏（也可以按 Esc）" : "全屏查看知识导图"}
            aria-label={isFullscreen ? "退出全屏查看知识导图" : "全屏查看知识导图"}
          >
            {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            <span>{isFullscreen ? "退出全屏" : "全屏展示"}</span>
          </button>
        </header>
        {/* 直接把完整的放射思维导图页面内嵌在这里（搜索定位 / 只看跨课程关系 / 展开·折叠章节 /
            重置视图 / 图例 / 连线文字标签 / 悬浮高亮 / 点击节点进详情页 全部保留），
            不再让用户去另开一个页面看。 */}
        <div className={`bp-mindmap-embed${pseudoFullscreen ? " is-pseudo-fullscreen" : ""}`} ref={embedRef}>
          <iframe
            className="bp-mindmap-embed__frame"
            src="/knowledge-graph.html"
            title="学科知识导图（放射思维导图）"
            loading="eager"
          />
        </div>
      </section>
      <DepthScene variant="rail" section="SECTION 04" title={["MAP", "04"]}
        caption="KNOWLEDGE GRAPH / 知识图谱" meta={graph ? `${counts.courses} COURSES` : undefined} />
    </section>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <article className={`is-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i>{icon}</i>
    </article>
  );
}

/* 本地知识库课程集合：直接取图谱里出现过的学科（= 下方知识导图的五门课程），
   后端没数据时退回固定的五门课程，保证下拉与「课程」统计始终是 5 门。 */
function knowledgeSubjects(graph: KnowledgeGraphResponse | null) {
  const subjects: string[] = [];
  (graph?.nodes || []).forEach((node) => {
    const name = String(node.subject || "").trim();
    if (name && !subjects.includes(name)) subjects.push(name);
  });
  if (!subjects.length) return [...KNOWLEDGE_SUBJECTS];
  const known = KNOWLEDGE_SUBJECTS.filter((name) => subjects.includes(name));
  const rest = subjects.filter((name) => !KNOWLEDGE_SUBJECTS.includes(name));
  return [...known, ...rest];
}

function countGraph(
  graph: KnowledgeGraphResponse | null,
  courses: Course[],
  weakPoints: WeakPoint[],
  subjects: string[],
) {
  const nodes = graph?.nodes || [];
  const nodeType = (node: Record<string, unknown>) =>
    String(node.kind || node.type || node.nodeType || "").toLowerCase();
  const chapters = new Set<string>();
  nodes.forEach((node) => {
    const chapter = String(node.chapter || "").trim();
    if (chapter) chapters.add(`${String(node.subject || "")}::${chapter}`);
  });
  const knowledge = nodes.filter(
    (node) =>
      nodeType(node).includes("knowledge") ||
      nodeType(node).includes("point") ||
      nodeType(node).includes("知识"),
  ).length;
  return {
    courses: subjects.length || courses.length,
    chapters: chapters.size || Math.max(0, Math.round(nodes.length * 0.28)),
    knowledge: knowledge || nodes.length,
    weak: weakPoints.length,
  };
}
