import { DepthScene } from "./depth/DepthScene";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, LockKeyhole, RefreshCw } from "lucide-react";
import { describeApiError, generateLearningPath, getLearningPath } from "../api";
import type { Course, LearningPathResponse, PathStage, WeakPoint } from "../types";
import { Carrier, labelProps } from "./motion/Motion";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";

interface Props {
  courses: Course[];
  weakPoints: WeakPoint[];
  onNavigateToTab: (tab: string, data?: unknown) => void;
  onNavigateToExercise: (exerciseId?: string) => void;
}

export default function BlueprintPathView({ onNavigateToTab, onNavigateToExercise }: Props) {
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [selected, setSelected] = useState<PathStage | null>(null);
  /* 鼠标滑过某个阶段时，下方详情同步切换成该阶段的数据；移开则回到已选阶段 */
  const [hovered, setHovered] = useState<PathStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const value = await getLearningPath();
      setPath(value);
      setSelected(value.stages.find((stage) => stage.status === "active") || value.stages[0] || null);
    } catch (reason) {
      setError(describeApiError(reason, "学习路径读取失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const regenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const value = await generateLearningPath();
      setPath(value);
      setSelected(value.stages.find((stage) => stage.status === "active") || value.stages[0] || null);
    } catch (reason) {
      setError(describeApiError(reason, "个性化路径生成失败"));
    } finally {
      setGenerating(false);
    }
  };

  const stages = useMemo(() => path?.stages.slice(0, 8) || [], [path]);
  const shown = hovered ?? selected;
  const nextAction = () => {
    if (!selected) return;
    if (selected.completion.type === "codelab") return onNavigateToExercise(selected.codeExerciseIds[0]);
    if (selected.completion.type === "quiz")
      return onNavigateToTab("quiz", {
        subject: selected.subject,
        knowledgePoint: selected.knowledgePoints[0],
      });
    onNavigateToTab("resource", {
      subject: selected.subject,
      title: selected.title,
      stageKey: selected.key,
      pathVersion: path?.version,
    });
  };

  return (
    <section className="bp-page bp-path-page">
      <BlueprintMotif variant="squares" />
      <BlueprintHeader title="学习路径" english="LEARNING PATH" />

      <div className="bp-flight-guide" aria-hidden="true">
        <svg viewBox="0 0 1200 290" preserveAspectRatio="none">
          <path
            className="bp-flight-guide__shadow"
            d="M12 190 C180 40 330 255 488 132 S770 20 905 132 S1080 258 1190 82"
          />
          <path
            className="bp-flight-guide__line"
            d="M12 190 C180 40 330 255 488 132 S770 20 905 132 S1080 258 1190 82"
          />
          {[150, 360, 590, 820, 1040].map((x, index) => (
            <rect key={x} x={x} y={[82, 188, 92, 98, 180][index]} width="13" height="13" />
          ))}
          <circle r="5" className="bp-flight-guide__pulse">
            <animateMotion
              dur="8s"
              repeatCount="indefinite"
              path="M12 190 C180 40 330 255 488 132 S770 20 905 132 S1080 258 1190 82"
            />
          </circle>
        </svg>
        <img src="/art/path-birds-monochrome-v3.png" alt="" />
      </div>

      <div className="bp-path-intro">
        <div>
          <h2>{path?.title || "个性化学习全链路"}</h2>
          <p>沿着阶段依次完成学习、练习与检测，每一步都会保存进度。</p>
          <span>LEARN · PRACTISE · CHECK · ADVANCE</span>
        </div>
        <button type="button" className="bp-line-button" disabled={generating} onClick={regenerate}>
          <RefreshCw className={generating ? "is-spinning" : ""} />
          {generating ? "正在生成" : "重新生成路径"}
        </button>
      </div>

      {error && (
        <div className="bp-inline-error">
          {error}
          <button onClick={load}>重试</button>
        </div>
      )}

      <div
        className={`bp-path-stairs${loading ? " is-loading" : ""}${hovered ? " is-previewing" : ""}`}
        onMouseLeave={() => setHovered(null)}
      >
        <Carrier shape="mesh" className="mg-path-floor" />
        {stages.length === 0 && !loading && (
          <p className="bp-empty-line">还没有学习路径，请先完善学习资料，再生成第一版方案。</p>
        )}
        {stages.map((stage, index) => (
          <button
            key={stage.key}
            type="button"
            className={`bp-path-step is-${stage.status}${selected?.key === stage.key ? " is-selected" : ""}`}
            style={{ "--step-index": index } as React.CSSProperties}
            onClick={() => setSelected(stage)}
            onMouseEnter={() => setHovered(stage)}
            onFocus={() => setHovered(stage)}
            aria-pressed={selected?.key === stage.key}
          >
            <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">{String(index + 1).padStart(2, "0")}</span>
            <strong {...labelProps("A", "plate", "persist")} data-level="A" data-carrier="plate" data-enter="attach" data-family="F14" data-mg-behavior="reveal">{stage.title}</strong>
            {stage.status === "completed" ? <Check /> : stage.status === "locked" ? <LockKeyhole /> : <i />}
            {/* 悬浮时从卡片上斜向扫过的高光层 */}
            <span className="bp-step-sheen" aria-hidden="true" />
          </button>
        ))}
      </div>

      {shown && (
        <div className="bp-stage-detail" key={shown.key}>
          <div className="bp-stage-connector" aria-hidden="true" data-level="C" data-carrier="rail" data-enter="persist" data-family="F14" data-mg-behavior="persist">
            <i />
            <i />
            <i />
            <i />
          </div>
          <header>
            <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">{String(stages.findIndex((item) => item.key === shown.key) + 1).padStart(2, "0")}</span>
            <div>
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">CURRENT STAGE</small>
              <h3 data-level="A" data-carrier="plate" data-enter="attach" data-family="F14" data-mg-behavior="reveal">{shown.title}</h3>
            </div>
            <b data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{Math.round(shown.progress)}%</b>
          </header>
          <nav className="bp-stage-journey" aria-label={`${shown.title}学习入口`}>
            <button
              type="button"
              onClick={() =>
                onNavigateToTab("knowledge", {
                  view: "graph",
                  subject: shown.subject,
                  focus: shown.knowledgePoints[0],
                })
              }
            >
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">01</small>
              <strong>知识导图</strong>
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigateToTab("resource", {
                  subject: shown.subject,
                  title: shown.title,
                  stageKey: shown.key,
                  pathVersion: path?.version,
                })
              }
            >
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">02</small>
              <strong>章节讲义</strong>
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigateToTab("mentor", `请帮我梳理「${shown.title}」的重点，并带我完成本阶段学习。`)
              }
            >
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">03</small>
              <strong>助手答疑</strong>
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigateToTab("quiz", { subject: shown.subject, knowledgePoint: shown.knowledgePoints[0] })
              }
            >
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">04</small>
              <strong>知识检测</strong>
            </button>
            <button type="button" onClick={() => onNavigateToExercise(shown.codeExerciseIds[0])}>
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">05</small>
              <strong>编程实战</strong>
            </button>
            <button type="button" onClick={() => onNavigateToTab("report")}>
              <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">06</small>
              <strong>学习报告</strong>
            </button>
          </nav>
          <div className="bp-stage-detail__lines">
            {shown.knowledgePoints.slice(0, 5).map((point, index) => (
              <button
                key={point}
                type="button"
                onClick={() =>
                  onNavigateToTab("knowledge", { view: "graph", subject: shown.subject, focus: point })
                }
              >
                <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F14" data-mg-behavior="reveal">
                  {stages.findIndex((item) => item.key === shown.key) + 1}.{index + 1}
                </span>
                <strong>{point}</strong>
                {index < Math.ceil((shown.knowledgePoints.length * shown.progress) / 100) ? <Check /> : <i />}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="bp-path-footer">
        <div>
          <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">课程总进度</span>
          <strong>{Math.round(path?.progress ?? 0)}%</strong>
          <div className="bp-progress" data-mg-progress data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist" data-mg-container="">
            <i style={{ width: `${path?.progress ?? 0}%` }} />
          </div>
        </div>
        <div>
          <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">路径版本</span>
          <strong>V{path?.version ?? "—"}</strong>
          <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">{path?.stages.length ?? 0} 个联动阶段</small>
        </div>
        <button
          type="button"
          className="bp-primary-action"
          disabled={!selected || selected.status === "locked"}
          onClick={nextAction}
        >
          进入下一步：{selected?.title || "等待生成"}
          <span className="bp-arrow-chip" aria-hidden="true" {...labelProps("B", "ring", "attach")} data-level="B" data-carrier="ring" data-enter="attach" data-family="F02" data-mg-behavior="reveal">
            <ArrowRight />
          </span>
        </button>
      </footer>
      <DepthScene variant="stage" section="SECTION 02" title={["PATH", "02"]}
        caption="STAGE JOURNEY / 阶段路径"
        meta={path ? `${path.stages.length} STAGES · ${new Set(path.stages.flatMap(stage => stage.knowledgePoints)).size} POINTS` : undefined} />
    </section>
  );
}
