/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { labelProps } from "../blueprint/motion/Motion";
import {
  AlertCircle,
  BookOpen,
  Braces,
  CheckCircle2,
  Download,
  FileQuestion,
  FileText,
  Loader2,
  Network,
  NotebookText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  completeLearningResource,
  createLearningResourceJob,
  describeApiError,
  downloadLearningResource,
  downloadMindMapJson,
  downloadPptistJson,
  getLatestResourceGenerationJob,
  getLearningPath,
  listLearningResources,
  openLearningResource,
  updateLearningResourceProgress,
  type LearningResource,
  type LearningResourceType,
} from "../api";
import type { LearningPathResponse, PathStage } from "../types";
import { useResourceGenerationStream } from "../hooks/useResourceGenerationStream";
import GenerationProgressPanel from "./resources/GenerationProgressPanel";
import MindMapViewer, { type MindMapContent } from "./resources/MindMapViewer";
import StudyNotePreview from "./resources/StudyNotePreview";
import { exportStudyNotePdf } from "./resources/studyNoteExport";
import PresentationEditor from "./resources/PresentationEditor";
import PptxPreview from "./resources/PptxPreview";

interface Props {
  onNavigateToTab: (tab: string, prefill?: unknown) => void;
  initialRecommendation?: {
    resourceType?: string;
    title?: string;
    reason?: string;
    knowledgePointId?: string;
    subject?: string;
    stageKey?: string;
    pathVersion?: number;
  } | null;
}

const RESOURCE_TYPES: LearningResourceType[] = ["study_note", "mind_map", "pptx"];
const TYPE_META: Record<
  LearningResourceType,
  { name: string; short: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  study_note: {
    name: "个性化学习讲义",
    short: "讲义",
    description: "先把概念、方法、例题和易错点整理成一份可阅读材料。",
    icon: NotebookText,
  },
  mind_map: {
    name: "个性化思维导图",
    short: "思维导图",
    description: "用可缩放、可导出的结构图梳理当前知识点之间的关系。",
    icon: Network,
  },
  pptx: {
    name: "个性化课件",
    short: "课件",
    description: "生成可预览、可下载的课件文件，适合课堂复盘或汇报式复习。",
    icon: FileText,
  },
  quiz_pack: {
    name: "自适应练习包",
    short: "练习",
    description: "围绕当前知识点整理练习，并可直接进入能力检测继续完成。",
    icon: FileQuestion,
  },
  code_case: {
    name: "代码实操案例",
    short: "代码",
    description: "围绕现有 CodeLab 练习或生成案例，拆解输入输出、边界和常见错误。",
    icon: Braces,
  },
};

type TypeStatus = "ready" | "learning" | "completed" | "empty" | "generating" | "error" | "review";

/** 本地「思绪思维导图」(simple-mind-map) 的默认地址，与 runtime\start.ps1 的端口保持一致。 */
const LOCAL_MIND_MAP_URL = "http://127.0.0.1:5317/";

export default function ResourceView({ onNavigateToTab, initialRecommendation }: Props) {
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [stage, setStage] = useState<PathStage | null>(null);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [selected, setSelected] = useState<LearningResource | null>(null);
  const [selectedType, setSelectedType] = useState<LearningResourceType>(
    isResourceType(initialRecommendation?.resourceType) ? initialRecommendation.resourceType : "study_note",
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [failedType, setFailedType] = useState<LearningResourceType | null>(null);
  const [error, setError] = useState("");
  const [completeBusy, setCompleteBusy] = useState(false);
  const [pptistBusy, setPptistBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [mindMapBusy, setMindMapBusy] = useState(false);
  // 课件默认按「放映预览」呈现版式（卡片、配色、页脚页码），需要改字时切到「在线编辑」。
  const [pptMode, setPptMode] = useState<"preview" | "edit">("preview");
  const studyNoteAnchor = useRef<HTMLElement>(null);
  const mindMapAnchor = useRef<HTMLElement>(null);
  const pptAnchor = useRef<HTMLElement>(null);
  const pendingScroll = useRef<LearningResourceType | null>(null);

  const { snapshot, connectionState, error: streamError } = useResourceGenerationStream(activeJobId);

  const context = useMemo(() => {
    if (!stage || !path) return null;
    return {
      subject: stage.subject,
      knowledgePoint: stage.knowledgePoints[0],
      stageKey: stage.key,
      pathVersion: path.version,
    };
  }, [stage, path]);

  const stageLocked = stage?.status === "locked";
  const jobActive = Boolean(
    activeJobId && (!snapshot || snapshot.job.status === "queued" || snapshot.job.status === "running"),
  );

  useEffect(() => {
    const target = pendingScroll.current;
    if (!target || !selected || selected.resourceType !== target) return;
    pendingScroll.current = null;
    scrollToResource(target);
  }, [selected?.id, selected?.resourceType]);

  async function loadPath() {
    setLoading(true);
    setError("");
    try {
      const nextPath = await getLearningPath();
      const chosen =
        nextPath.stages.find((item) => item.key === initialRecommendation?.stageKey) ||
        nextPath.stages.find((item) => item.status === "active") ||
        nextPath.stages[0] ||
        null;

      setPath(nextPath);
      setStage(chosen);
      setSelected(null);
      setSelectedType(resolveRecommendedType(chosen, [], initialRecommendation?.resourceType));

      const active = await getLatestResourceGenerationJob(undefined, true).catch(() => null);
      if (active?.job?.jobId) setActiveJobId(active.job.jobId);
    } catch (caught) {
      setPath(null);
      setStage(null);
      setError(describeApiError(caught, "学习路径读取失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPath();
  }, [initialRecommendation?.stageKey]);

  useEffect(() => {
    if (context) void loadResources();
  }, [context?.stageKey, context?.pathVersion, initialRecommendation?.resourceType]);

  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.job.status === "completed") {
      setFailedType(null);
      const preferredId = snapshot.resource?.id;
      if (isResourceType(snapshot.resource?.resourceType)) setSelectedType(snapshot.resource.resourceType);
      void loadResources(preferredId).finally(() => setActiveJobId(null));
    } else if (snapshot.job.status === "failed") {
      setFailedType(snapshot.job.resourceType);
      setError(snapshot.job.errorMessage || "资源生成暂时失败，请稍后重试。");
    }
  }, [snapshot?.job.status, snapshot?.job.resourceId]);

  async function loadResources(preferredId?: number) {
    if (!context) return;
    setRefreshing(true);
    try {
      const list = await listLearningResources({ stageKey: context.stageKey, status: "approved", limit: 50 });
      const filtered = list.filter(
        (item) => item.pathVersion === context.pathVersion && RESOURCE_TYPES.includes(item.resourceType),
      );
      const nextType = resolveRecommendedType(stage, filtered, initialRecommendation?.resourceType);
      const preferred =
        filtered.find((item) => item.id === preferredId) ||
        (isResourceType(initialRecommendation?.resourceType)
          ? filtered.find((item) => item.resourceType === initialRecommendation.resourceType)
          : null) ||
        filtered.find((item) => item.resourceType === selectedType) ||
        filtered[0] ||
        null;

      setResources(filtered);
      setSelectedType(preferred?.resourceType || nextType);
      if (preferred) {
        await selectResource(preferred);
      } else {
        setSelected(null);
      }
    } catch (caught) {
      setError(describeApiError(caught, "资源列表加载失败"));
    } finally {
      setRefreshing(false);
    }
  }

  async function selectResource(resource: LearningResource) {
    setError("");
    try {
      const opened = await openLearningResource(resource.id);
      setSelected(opened);
      setSelectedType(opened.resourceType);
      setResources((current) => current.map((item) => (item.id === opened.id ? opened : item)));
    } catch (caught) {
      setError(describeApiError(caught, "资源打开失败"));
    }
  }

  function scrollToResource(resourceType: LearningResourceType) {
    const anchor =
      resourceType === "pptx"
        ? pptAnchor.current
        : resourceType === "mind_map"
          ? mindMapAnchor.current
          : studyNoteAnchor.current;
    anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function continueLearning(resourceType: LearningResourceType) {
    const resource = resources.find((item) => item.resourceType === resourceType) || null;
    if (!resource) {
      if (jobActive || stageLocked) return;
      pendingScroll.current = resourceType;
      await generate(resourceType);
      return;
    }
    if (selected?.id === resource.id) {
      scrollToResource(resourceType);
      return;
    }
    pendingScroll.current = resourceType;
    await selectResource(resource);
  }

  async function generate(resourceType: LearningResourceType, regenerate = false) {
    if (!context || jobActive || stageLocked) return;
    setSelectedType(resourceType);
    setFailedType(null);
    setError("");
    try {
      const job = await createLearningResourceJob({ ...context, resourceType, regenerate });
      setActiveJobId(job.jobId);
    } catch (caught) {
      setFailedType(resourceType);
      setError(describeApiError(caught, "资源生成任务创建失败"));
    }
  }

  /**
   * 导出到本地 PPTist：下载 PPTist 可导入的 JSON，并打开本地编辑器（默认 127.0.0.1:5217）。
   * 内容依然由 LearnMate 的模型生成，PPTist 只负责可编辑与导出；PPTist 网页自带的 AI 按钮没有后端。
   */
  async function exportToPptist(resource: LearningResource) {
    try {
      setPptistBusy(true);
      setError("");
      await downloadPptistJson(resource.id, resource.version);
      window.open("http://127.0.0.1:5217/", "_blank", "noopener");
    } catch (error) {
      setError(describeApiError(error, "导出到本地 PPTist 失败"));
    } finally {
      setPptistBusy(false);
    }
  }

  /** 直接下载后端渲染好的 PPTX（与预览页内容一致，可直接用于课堂放映或汇报）。 */
  async function downloadPptx(resource: LearningResource) {
    try {
      setDownloadBusy(true);
      setError("");
      await downloadLearningResource(resource.id, resource.version);
    } catch (error) {
      setError(describeApiError(error, "下载 PPTX 失败"));
    } finally {
      setDownloadBusy(false);
    }
  }

  /**
   * 导出到本地思维导图：下载 simple-mind-map 可导入的 JSON，并打开本地编辑器（默认 127.0.0.1:5317）。
   * 内容依旧是 LearnMate 生成的，本地编辑器只负责继续编辑与导出图片/PDF。
   */
  async function exportToLocalMindMap(resource: LearningResource) {
    try {
      setMindMapBusy(true);
      setError("");
      await downloadMindMapJson(resource.id, resource.version);
      window.open(LOCAL_MIND_MAP_URL, "_blank", "noopener");
    } catch (error) {
      setError(describeApiError(error, "导出到本地思维导图失败"));
    } finally {
      setMindMapBusy(false);
    }
  }

  async function markComplete() {
    if (!selected) return;
    setCompleteBusy(true);
    setError("");
    try {
      const progressed = await updateLearningResourceProgress(selected.id, 100);
      setSelected(progressed);
      const completed = await completeLearningResource(selected.id);
      setSelected(completed);
      setResources((current) => current.map((item) => (item.id === completed.id ? completed : item)));
    } catch (caught) {
      const message =
        caught instanceof Error && /completion requirements/i.test(caught.message)
          ? "需要先打开资源并阅读至少 30 秒，再标记完成。"
          : describeApiError(caught, "需要先打开资源并阅读至少 30 秒，再标记完成。");
      setError(message);
    } finally {
      setCompleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="bp-resource-state">
        <Loader2 className="is-spinning" />
        <span>正在展开章节讲义</span>
      </div>
    );
  }

  if (!stage || !context) {
    return (
      <section className="bp-resource-state bp-resource-state--empty">
        <BookOpen />
        <h2>暂时没有可用的学习节点</h2>
        <p>资源中心需要先读取当前学习路径节点，之后才能生成或打开对应资源。</p>
        {error && <p className="bp-resource-error">{error}</p>}
        <button type="button" onClick={() => void loadPath()} className="bp-resource-primary">
          <RefreshCw className="h-4 w-4" />
          重新读取
        </button>
      </section>
    );
  }

  return (
    <div className="lm-resource-view bp-resource-page">
      <section className="bp-resource-hero">
        <div className="bp-resource-hero__copy">
          <p className="bp-resource-eyebrow" {...labelProps("B", "rail", "persist")} data-level="A" data-carrier="plate" data-enter="attach" data-family="F03" data-mg-behavior="reveal">CHAPTER ARCHIVE · KNOWLEDGE FOLD</p>
          <span className="mg-kicker-word" {...labelProps("A", "plate", "reveal")} data-level="B" data-carrier="rail" data-enter="attach" data-family="F03" data-mg-behavior="reveal">章节讲义</span>
          <h2>{stage.title}</h2>
          <p>沿着当前学习路径展开概念、方法、例题与练习。</p>
          <dl className="bp-resource-meta">
            <div>
              <dt>SUBJECT</dt>
              <dd>{context.subject}</dd>
            </div>
            <div>
              <dt>KNOWLEDGE</dt>
              <dd>{context.knowledgePoint}</dd>
            </div>
            <div>
              <dt>PATH</dt>
              <dd>V{context.pathVersion}</dd>
            </div>
          </dl>
        </div>
        <div className="bp-resource-hero__art" aria-hidden="true">
          <svg viewBox="0 0 620 220" preserveAspectRatio="none">
            <path d="M10 172 C142 35 260 204 386 88 S544 54 612 34" />
            <rect x="118" y="91" width="12" height="12" />
            <rect x="312" y="125" width="12" height="12" />
            <rect x="493" y="62" width="12" height="12" />
          </svg>
          <img src="/art/path-birds-monochrome-v3.png" alt="" />
        </div>
        <button
          type="button"
          onClick={() => void loadResources()}
          disabled={refreshing}
          className="bp-resource-refresh"
        >
          <RefreshCw className={refreshing ? "is-spinning" : ""} />
          {refreshing ? "正在同步" : "刷新资源"}
        </button>
      </section>

      <section className="bp-resource-controls">
        <header>
          <div>
            <span>01</span>
            <p>LEARNING MATERIALS</p>
            <h3>选择学习载体</h3>
          </div>
          <small>讲义、思维导图与 PPT 共享当前章节进度</small>
        </header>
        <div className="bp-resource-mode-grid">
          {RESOURCE_TYPES.map((type, index) => {
            const Icon = TYPE_META[type].icon;
            const status = typeStatus(type, resources, snapshot, failedType);
            const active = selectedType === type;
            return (
              <article key={type} className={active ? "bp-resource-mode is-active" : "bp-resource-mode"}>
                <span className="bp-resource-mode__number">0{index + 1}</span>
                <span className="bp-resource-mode__icon">
                  <Icon />
                </span>
                <div>
                  <h3>{TYPE_META[type].name}</h3>
                  <p>{TYPE_META[type].description}</p>
                </div>
                <StatusCompactLabel status={status} />
                <footer>
                  <button
                    type="button"
                    onClick={() => void generate(type, true)}
                    disabled={jobActive || stageLocked}
                  >
                    <Sparkles />
                    重新生成
                  </button>
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() => void continueLearning(type)}
                    disabled={stageLocked}
                  >
                    <BookOpen />
                    继续学习
                  </button>
                </footer>
              </article>
            );
          })}
        </div>

        {snapshot && (
          <div className="bp-resource-generation">
            <GenerationProgressPanel
              snapshot={snapshot}
              connectionState={connectionState}
              onRetry={failedType ? () => void generate(failedType, true) : undefined}
            />
          </div>
        )}

        {(streamError || error) && (
          <p className="bp-resource-error" role="alert">
            {streamError || error}
          </p>
        )}
      </section>

      <div className="bp-resource-workspace">
        <main className="bp-resource-document-stack">
          {selected?.resourceType === "pptx" && (
            <section ref={pptAnchor} className="bp-resource-document">
              <header className="bp-resource-document__head">
                <div>
                  <span>DOCUMENT / 03</span>
                  <h3>个性化 PPT · 预览与编辑</h3>
                </div>
                <div className="bp-resource-document__actions">
                  <button
                    type="button"
                    onClick={() => void downloadPptx(selected)}
                    disabled={downloadBusy}
                    title="下载后端渲染好的 PPTX 文件，内容与本页预览一致"
                  >
                    {downloadBusy ? <Loader2 className="is-spinning" /> : <Download />}下载 PPTX
                  </button>
                  <button
                    type="button"
                    className="is-complete"
                    onClick={() => void exportToPptist(selected)}
                    disabled={pptistBusy}
                    title="把这份课件导出成 PPTist 可导入的 JSON，然后在本地 PPTist（127.0.0.1:5217）导入继续编辑并导出 PPTX"
                  >
                    {pptistBusy ? <Loader2 className="is-spinning" /> : <Download />}导出到本地 PPTist
                  </button>
                </div>
              </header>
              <div className="bp-resource-ppt-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pptMode === "preview"}
                  className={pptMode === "preview" ? "is-active" : ""}
                  onClick={() => setPptMode("preview")}
                >
                  放映预览
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pptMode === "edit"}
                  className={pptMode === "edit" ? "is-active" : ""}
                  onClick={() => setPptMode("edit")}
                >
                  在线编辑
                </button>
                <small>
                  共 {(selected.content as { slides?: unknown[] })?.slides?.length ?? 0} 个内容页 ·
                  预览与下载内容一致
                </small>
              </div>
              {pptMode === "preview" ? (
                <PptxPreview
                  content={
                    selected.content as {
                      theme?: unknown;
                      slides?: Array<Record<string, unknown>>;
                      references?: Array<Record<string, string>>;
                    }
                  }
                  citations={selected.citations || []}
                />
              ) : (
                <PresentationEditor key={`${selected.id}-${selected.version}`} resource={selected} />
              )}
            </section>
          )}
          {selected?.resourceType === "study_note" && (
            <section ref={studyNoteAnchor} className="bp-resource-document">
              <header className="bp-resource-document__head">
                <div>
                  <span>DOCUMENT / 01</span>
                  <h3>{TYPE_META.study_note.name}</h3>
                </div>
                <div className="bp-resource-document__actions">
                  <button
                    type="button"
                    onClick={() => void generate("study_note", true)}
                    disabled={jobActive || stageLocked}
                  >
                    <Sparkles />
                    重新生成
                  </button>
                  <button
                    type="button"
                    className="is-complete"
                    onClick={() => {
                      try {
                        exportStudyNotePdf(selected.content as never, {
                          title: selected.title,
                          subject: stage?.subject,
                          knowledgePoint: stage?.knowledgePoints?.[0],
                          stageTitle: stage?.title,
                          version: selected.version,
                        });
                        setError("");
                      } catch (exportError) {
                        setError(
                          exportError instanceof Error ? exportError.message : "导出 PDF 失败，请重试。",
                        );
                      }
                    }}
                    title="把这份讲义排成 A4 文档并在打印窗口里「另存为 PDF」"
                  >
                    <Download />
                    导出 PDF
                  </button>
                  <button
                    type="button"
                    className="is-complete"
                    onClick={() => void markComplete()}
                    disabled={completeBusy}
                  >
                    {completeBusy ? <Loader2 className="is-spinning" /> : <CheckCircle2 />}标记完成
                  </button>
                </div>
              </header>
              <StudyNotePreview content={selected.content as never} />
            </section>
          )}

          {selected?.resourceType === "mind_map" && (
            <section ref={mindMapAnchor} className="bp-resource-document">
              <header className="bp-resource-document__head">
                <div>
                  <span>DOCUMENT / 02</span>
                  <h3>{TYPE_META.mind_map.name}</h3>
                </div>
                <div className="bp-resource-document__actions">
                  <button
                    type="button"
                    onClick={() => void generate("mind_map", true)}
                    disabled={jobActive || stageLocked}
                  >
                    <Sparkles />
                    重新生成
                  </button>
                  <button
                    type="button"
                    className="is-complete"
                    onClick={() => void exportToLocalMindMap(selected)}
                    title="把这份导图导出成可导入本地思维导图（127.0.0.1:5317）的 JSON，导入后可继续编辑并导出 PNG / SVG / PDF"
                  >
                    <Download />
                    导出到本地思维导图
                  </button>
                  <button
                    type="button"
                    className="is-complete"
                    onClick={() => void markComplete()}
                    disabled={completeBusy}
                  >
                    {completeBusy ? <Loader2 className="is-spinning" /> : <CheckCircle2 />}标记完成
                  </button>
                </div>
              </header>
              <MindMapViewer
                content={selected.content as unknown as MindMapContent}
                title={selected.title}
                citations={selected.citations || []}
              />
            </section>
          )}
        </main>

        <aside className="bp-resource-index">
          <header>
            <span>INDEX</span>
            <h3>本节点资源</h3>
          </header>
          {resources.length === 0 ? (
            <div className="bp-resource-index__empty">
              <BookOpen />
              <span>暂无资源</span>
            </div>
          ) : (
            <div className="bp-resource-index__list">
              {resources.map((resource) => {
                const active = selected?.id === resource.id;
                const Icon = TYPE_META[resource.resourceType].icon;
                return (
                  <button
                    key={resource.id}
                    type="button"
                    onClick={() => void selectResource(resource)}
                    aria-pressed={active}
                    className={active ? "is-active" : ""}
                  >
                    <Icon />
                    <span>{TYPE_META[resource.resourceType].short}</span>
                    <small>{active ? "正在阅读" : "打开"}</small>
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {stageLocked && (
        <p className="bp-resource-alert">
          <AlertCircle />
          当前节点尚未解锁，建议先回到学习路径完成前置节点。
        </p>
      )}
    </div>
  );
}

function isResourceType(value: string | undefined): value is LearningResourceType {
  return RESOURCE_TYPES.includes(value as LearningResourceType);
}

function resolveRecommendedType(
  stage: PathStage | null,
  resources: LearningResource[],
  incoming?: string,
): LearningResourceType {
  if (isResourceType(incoming)) return incoming;
  const completionResource =
    stage?.completion.type === "resource" ? stage.completion.ids.find(isResourceType) : undefined;
  if (completionResource) return completionResource;
  return resources[0]?.resourceType || "study_note";
}

function typeStatus(
  type: LearningResourceType,
  resources: LearningResource[],
  snapshot: ReturnType<typeof useResourceGenerationStream>["snapshot"],
  failedType: LearningResourceType | null,
): TypeStatus {
  if (
    snapshot?.job.resourceType === type &&
    (snapshot.job.status === "queued" || snapshot.job.status === "running")
  )
    return "generating";
  if (failedType === type || (snapshot?.job.resourceType === type && snapshot.job.status === "failed"))
    return "error";
  const resource = resources.find((item) => item.resourceType === type);
  if (!resource) return "empty";
  if (resource.progress?.status === "completed") return "completed";
  if (
    resource.progress?.status === "opened" ||
    resource.progress?.status === "in_progress" ||
    resource.progress?.status === "completed_unverified"
  )
    return "learning";
  if (resource.review.status !== "approved") return "review";
  return "ready";
}

function StatusCompactLabel({ status }: { status: TypeStatus }) {
  const meta = statusMeta(status);
  return <span className={`bp-resource-status is-${status}`} data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">{meta.label}</span>;
}

function statusMeta(status: TypeStatus) {
  switch (status) {
    case "completed":
      return { label: "已完成", className: "bg-emerald-50 text-emerald-700" };
    case "learning":
      return { label: "学习中", className: "bg-blue-50 text-blue-700" };
    case "ready":
      return { label: "可阅读", className: "bg-slate-100 text-slate-700" };
    case "generating":
      return { label: "生成中", className: "bg-blue-50 text-blue-700" };
    case "error":
      return { label: "需重试", className: "bg-rose-50 text-rose-700" };
    case "review":
      return { label: "需复核", className: "bg-amber-50 text-amber-800" };
    default:
      return { label: "未生成", className: "bg-slate-100 text-slate-500" };
  }
}
