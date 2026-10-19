/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Code2,
  Compass,
  FileText,
  Home,
  Loader2,
  LockKeyhole,
  MessageCircleQuestion,
  RefreshCw,
  Route,
} from "lucide-react";
import type { Course, LearningPathResponse, PathStage, WeakPoint } from "../types";
import {
  describeApiError,
  generateLearningPath,
  getLearningPath,
  getLearningProfile,
  listChatSessions,
  listLearningResources,
  type LearningResource,
  type LearningResourceType,
} from "../api";

interface PathViewProps {
  courses: Course[];
  weakPoints: WeakPoint[];
  onNavigateToTab: (tab: string, prefillData?: unknown) => void;
  onNavigateToExercise: (exerciseId: string) => void;
}

const RESOURCE_TYPES: LearningResourceType[] = ["study_note", "mind_map", "pptx", "quiz_pack", "code_case"];

const STATUS_LABELS: Record<
  PathStage["status"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  completed: { label: "已完成", icon: CheckCircle2 },
  active: { label: "学习中", icon: Clock3 },
  locked: { label: "暂不可用", icon: LockKeyhole },
};

export default function PathView({
  courses,
  weakPoints,
  onNavigateToTab,
  onNavigateToExercise,
}: PathViewProps) {
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [stageResources, setStageResources] = useState<Record<string, LearningResource[]>>({});
  const [evidence, setEvidence] = useState<{
    profileCompleteness: number | null;
    mentorSessions: number | null;
  }>({
    profileCompleteness: null,
    mentorSessions: null,
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getLearningPath();
      setPath(current);

      const [resources, profileResult, sessionsResult] = await Promise.all([
        listLearningResources({ status: "approved", limit: 100 }).catch((caught) => {
          setError(describeApiError(caught, "学习路径已加载，资源状态暂时无法同步"));
          return [];
        }),
        getLearningProfile().catch(() => null),
        listChatSessions().catch(() => null),
      ]);

      setStageResources(
        groupResourcesByStage(resources.filter((item) => item.pathVersion === current.version)),
      );
      setEvidence({
        profileCompleteness: profileResult ? profileResult.completeness : null,
        mentorSessions: sessionsResult ? sessionsResult.sessions.length : null,
      });
    } catch (caught) {
      const status = (caught as Error & { status?: number }).status;
      if (status !== 404) setError(describeApiError(caught, "学习路径加载失败"));
      setPath(null);
      setStageResources({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const regeneratePath = async () => {
    setGenerating(true);
    setError("");
    try {
      const next = await generateLearningPath();
      setPath(next);
      void load();
    } catch (caught) {
      setError(describeApiError(caught, "学习路径生成失败"));
    } finally {
      setGenerating(false);
    }
  };

  const pathState = useMemo(() => {
    if (!path) return null;
    const completedCount = path.stages.filter((stage) => stage.status === "completed").length;
    const activeStage = path.stages.find((stage) => stage.status === "active") || null;
    const currentStage =
      activeStage ||
      path.stages.find((stage) => stage.status !== "completed") ||
      path.stages[path.stages.length - 1] ||
      null;
    const currentIndex = currentStage ? path.stages.findIndex((stage) => stage.key === currentStage.key) : -1;
    const upcomingStage =
      currentIndex >= 0
        ? path.stages.slice(currentIndex + 1).find((stage) => stage.status !== "completed") || null
        : null;
    return { completedCount, activeStage, currentStage, currentIndex, upcomingStage };
  }, [path]);

  const goResource = (stage: PathStage | null) => {
    if (!stage) {
      onNavigateToTab("resource");
      return;
    }
    const resources = stageResources[stage.key] || [];
    onNavigateToTab("resource", {
      resourceType: pickResourceType(stage, resources),
      subject: stage.subject,
      knowledgePointId: stage.knowledgePoints[0],
      stageKey: stage.key,
      pathVersion: path?.version,
    });
  };

  const askMentor = (stage: PathStage | null) => {
    if (!stage) {
      onNavigateToTab("mentor");
      return;
    }
    onNavigateToTab(
      "mentor",
      "我正在学习「" +
        stage.title +
        "」，知识点是「" +
        stage.knowledgePoints.join("、") +
        "」。请帮我确认当前应先理解什么、怎样完成这一节点。",
    );
  };

  const goQuiz = (stage: PathStage | null) => {
    if (!stage) {
      onNavigateToTab("quiz");
      return;
    }
    onNavigateToTab("quiz", { subject: stage.subject, knowledgePoint: stage.knowledgePoints[0] });
  };

  const goCodeLab = (stage: PathStage | null) => {
    if (stage && stage.completion.type === "codelab" && stage.codeExerciseIds[0]) {
      onNavigateToExercise(stage.codeExerciseIds[0]);
      return;
    }
    onNavigateToTab("codelab");
  };

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在读取你的学习路径
      </div>
    );
  }

  if (!path || !pathState) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Compass className="mx-auto mb-4 h-10 w-10 text-blue-600" />
        <h2 className="text-xl font-bold text-slate-950">还没有可执行的学习路径</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          生成后这里会给出当前节点、完成条件和下一步安排。
        </p>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button
          disabled={generating}
          onClick={regeneratePath}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
          生成学习路径
        </button>
      </section>
    );
  }

  const currentStage = pathState.currentStage;
  const completionPercent = path.stages.length
    ? Math.round((pathState.completedCount / path.stages.length) * 100)
    : 0;
  const evidenceTags = [
    { label: "画像", value: courses.length + " 门课" },
    { label: "错题", value: weakPoints.length + " 道" },
    {
      label: "个人资料",
      value: evidence.profileCompleteness === null ? "未同步" : evidence.profileCompleteness + "%",
    },
    {
      label: "助手提问",
      value: evidence.mentorSessions === null ? "未同步" : evidence.mentorSessions + " 次",
    },
    { label: "路径版本", value: "V" + path.version },
  ];
  const ports = [
    { key: "dashboard", label: "首页", icon: Home, open: () => onNavigateToTab("dashboard") },
    { key: "mentor", label: "助手", icon: MessageCircleQuestion, open: () => askMentor(currentStage) },
    { key: "analytics", label: "画像", icon: Award, open: () => onNavigateToTab("analytics") },
    { key: "resource", label: "资源", icon: BookOpen, open: () => goResource(currentStage) },
    { key: "quiz", label: "测验", icon: Brain, open: () => goQuiz(currentStage) },
    { key: "codelab", label: "CodeLab", icon: Code2, open: () => goCodeLab(currentStage) },
    { key: "assignment", label: "作业", icon: ClipboardList, open: () => onNavigateToTab("assignment") },
    { key: "errors", label: "错题本", icon: AlertTriangle, open: () => onNavigateToTab("errors") },
    { key: "report", label: "学习评估", icon: FileText, open: () => onNavigateToTab("report") },
  ];

  return (
    <div className="lm-path-view space-y-5 font-sans">
      <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Route className="h-3.5 w-3.5" />
              当前学习路径
            </div>
            <h2 className="mt-3 break-words text-2xl font-bold text-slate-950">{path.title}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <button
              type="button"
              disabled={generating}
              onClick={() => void regeneratePath()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
              生成新路径
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => void regeneratePath()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              <RefreshCw className={generating ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              更新当前路径
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase text-slate-500">生成材料依据</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {evidenceTags.map((tag) => (
              <span
                key={tag.label}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
              >
                <span className="text-slate-500">{tag.label}</span>
                <strong className="text-slate-950">{tag.value}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: completionPercent + "%" }} />
          </div>
          <strong className="shrink-0 text-sm text-blue-700">{completionPercent}%</strong>
        </div>
        {error && (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>

      <section className="lm-path-flight-map" aria-labelledby="path-flight-title">
        <header>
          <div>
            <span>PATH SEQUENCE · V{path.version}</span>
            <h3 id="path-flight-title">阶段不是固定课表，而是一组会重新编排的学习动作</h3>
          </div>
          <p>每次测验、错题和资源完成记录都会成为下一次规划的依据。</p>
        </header>
        <div className="lm-path-flight-map__visual" aria-hidden="true">
          <img src="/art/path-paper-cranes.png" alt="" />
        </div>
        <ol>
          {path.stages.slice(0, 7).map((stage, index) => (
            <li key={stage.key} className={`is-${stage.status}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.title}</strong>
              <small>
                {STATUS_LABELS[stage.status].label} · {Math.round(stage.progress)}%
              </small>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="rounded-lg border border-slate-200 bg-white p-5 md:p-6"
        aria-labelledby="path-ports-title"
      >
        <h3 id="path-ports-title" className="flex items-center gap-2 text-base font-bold text-slate-950">
          <Route className="h-5 w-5 text-blue-600" />
          路径端口
        </h3>
        <ol className="mt-5 flex flex-wrap items-center gap-2">
          {ports.map((port, index) => {
            const PortIcon = port.icon;
            return (
              <li key={port.key} className="flex items-center gap-2">
                {index > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={port.open}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
                >
                  <PortIcon className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  {port.label}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        className="rounded-lg border border-slate-200 bg-white p-5 md:p-6"
        aria-labelledby="path-progress-title"
      >
        <h3 id="path-progress-title" className="flex items-center gap-2 text-base font-bold text-slate-950">
          <BookOpenCheck className="h-5 w-5 text-blue-600" />
          当前进度详情
        </h3>
        <ol className="mt-5 space-y-4">
          {path.stages.map((stage, index) => {
            const meta = STATUS_LABELS[stage.status];
            const StatusIcon = meta.icon;
            const percent = Math.max(0, Math.min(100, Math.round(stage.progress)));
            return (
              <li
                key={stage.key}
                aria-current={stage.status === "active" ? "step" : undefined}
                className="rounded-lg border border-slate-200 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusIcon
                      className={"h-4 w-4 shrink-0 " + statusTone(stage.status)}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-semibold text-slate-950">
                      {index + 1}. {stage.title}
                    </span>
                  </div>
                  <strong className="shrink-0 text-sm text-slate-600">{percent}%</strong>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={"h-full rounded-full " + statusBarTone(stage.status)}
                    style={{ width: percent + "%" }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{stageProgressNote(stage)}</p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function statusTone(status: PathStage["status"]) {
  if (status === "completed") return "text-emerald-600";
  if (status === "active") return "text-blue-600";
  return "text-slate-400";
}

function statusBarTone(status: PathStage["status"]) {
  if (status === "completed") return "bg-emerald-500";
  if (status === "active") return "bg-blue-600";
  return "bg-slate-300";
}

function stageProgressNote(stage: PathStage) {
  const meta = STATUS_LABELS[stage.status];
  if (stage.completedAt) return meta.label + " · 完成于 " + formatMoment(stage.completedAt);
  return meta.label + " · 预计 " + stage.durationMinutes + " 分钟";
}

function formatMoment(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => (part < 10 ? "0" + part : String(part));
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

function groupResourcesByStage(resources: LearningResource[]) {
  return resources.reduce<Record<string, LearningResource[]>>((groups, item) => {
    (groups[item.stageKey] ??= []).push(item);
    return groups;
  }, {});
}

function isResourceType(value: string | undefined): value is LearningResourceType {
  return RESOURCE_TYPES.includes(value as LearningResourceType);
}

function pickResourceType(stage: PathStage, resources: LearningResource[]): LearningResourceType {
  const existingCompletionResource = resources.find((resource) =>
    stage.completion.ids.some((id) => id === resource.resourceType),
  );
  if (existingCompletionResource) return existingCompletionResource.resourceType;
  const completionResource = stage.completion.ids.find(isResourceType);
  if (completionResource) return completionResource;
  return resources[0]?.resourceType || "study_note";
}
