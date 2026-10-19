/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Compass,
  FileCheck2,
  GitBranch,
  RotateCcw,
  Sparkles,
  Users,
  RefreshCw,
  Target,
} from "lucide-react";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  describeApiError,
  getDailyCheckIn,
  getDailyStudyTime,
  postDailyCheckIn,
  getLearningPath,
  getLearningProfile,
  getMyClasses,
  getClassDirectory,
  getMyClassRequests,
  createClassJoinRequest,
  cancelClassJoinRequest,
  getStoredUser,
  getStudentAssessment,
  getStudentOverview,
  type DailyCheckInSummary,
  type ProfileResponse,
  type StudyTimeSummary,
  type StudentAssessment,
  type ClassDirectoryItem,
  type ClassJoinRequest,
  type MyClassesResponse,
  type StudentOverview,
} from "../api";
import type { LearningPathResponse, PathStage } from "../types";
import AsyncState from "./ui/AsyncState";

interface Props {
  onNavigateToTab: (tab: string, data?: unknown) => void;
}

interface RegionState<T> {
  data: T | null;
  loading: boolean;
  error: string;
}

interface CurrentTask {
  title: string;
  reason: string;
  context: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const initialRegion = <T,>(): RegionState<T> => ({ data: null, loading: true, error: "" });

export default function Dashboard({ onNavigateToTab }: Props) {
  const [profile, setProfile] = useState<RegionState<ProfileResponse>>(initialRegion);
  const [overview, setOverview] = useState<RegionState<StudentOverview>>(initialRegion);
  const [path, setPath] = useState<RegionState<LearningPathResponse>>(initialRegion);
  const [assessment, setAssessment] = useState<RegionState<StudentAssessment>>(initialRegion);
  const [classes, setClasses] = useState<RegionState<MyClassesResponse>>(initialRegion);
  const [checkIn, setCheckIn] = useState<RegionState<DailyCheckInSummary>>(initialRegion);
  const [studyTime, setStudyTime] = useState<RegionState<StudyTimeSummary>>(initialRegion);
  const [checkingIn, setCheckingIn] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfile((current) => ({ ...current, loading: true, error: "" }));
    try {
      setProfile({ data: await getLearningProfile(), loading: false, error: "" });
    } catch (reason) {
      setProfile((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "学习画像读取失败"),
      }));
    }
  }, []);

  const loadOverview = useCallback(async () => {
    setOverview((current) => ({ ...current, loading: true, error: "" }));
    try {
      setOverview({ data: await getStudentOverview(), loading: false, error: "" });
    } catch (reason) {
      setOverview((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "学习状态读取失败"),
      }));
    }
  }, []);

  const loadPath = useCallback(async () => {
    setPath((current) => ({ ...current, loading: true, error: "" }));
    try {
      setPath({ data: await getLearningPath(), loading: false, error: "" });
    } catch (reason) {
      if ((reason as { status?: number })?.status === 404) {
        setPath({ data: null, loading: false, error: "" });
        return;
      }
      setPath((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "学习路径读取失败"),
      }));
    }
  }, []);

  const loadAssessment = useCallback(async () => {
    setAssessment((current) => ({ ...current, loading: true, error: "" }));
    try {
      setAssessment({ data: await getStudentAssessment(), loading: false, error: "" });
    } catch (reason) {
      setAssessment((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "学习洞察读取失败"),
      }));
    }
  }, []);

  const loadClasses = useCallback(async () => {
    setClasses((current) => ({ ...current, loading: true, error: "" }));
    try {
      setClasses({ data: await getMyClasses(), loading: false, error: "" });
    } catch (reason) {
      setClasses((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "班级信息读取失败"),
      }));
    }
  }, []);

  const loadCheckIn = useCallback(async () => {
    setCheckIn((current) => ({ ...current, loading: true, error: "" }));
    try {
      setCheckIn({ data: await getDailyCheckIn(), loading: false, error: "" });
    } catch (reason) {
      setCheckIn((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "签到状态读取失败"),
      }));
    }
  }, []);

  const loadStudyTime = useCallback(async () => {
    setStudyTime((current) => ({ ...current, loading: true, error: "" }));
    try {
      setStudyTime({ data: await getDailyStudyTime(), loading: false, error: "" });
    } catch (reason) {
      setStudyTime((current) => ({
        ...current,
        loading: false,
        error: describeApiError(reason, "学习时长读取失败"),
      }));
    }
  }, []);

  const handleCheckIn = useCallback(async () => {
    setCheckingIn(true);
    setCheckIn((current) => ({ ...current, error: "" }));
    try {
      setCheckIn({ data: await postDailyCheckIn(), loading: false, error: "" });
    } catch (reason) {
      setCheckIn((current) => ({ ...current, error: describeApiError(reason, "签到失败，请稍后重试") }));
    } finally {
      setCheckingIn(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      loadProfile(),
      loadOverview(),
      loadPath(),
      loadAssessment(),
      loadClasses(),
      loadCheckIn(),
      loadStudyTime(),
    ]);
  }, [loadAssessment, loadCheckIn, loadClasses, loadOverview, loadPath, loadProfile, loadStudyTime]);

  const currentTask = useMemo(
    () =>
      buildCurrentTask({ profile: profile.data, overview: overview.data, path: path.data, onNavigateToTab }),
    [onNavigateToTab, overview.data, path.data, profile.data],
  );

  const initialLoading = [profile, overview, path, assessment].every(
    (region) => region.loading && !region.data,
  );
  const allFailed =
    !profile.data &&
    !overview.data &&
    !path.data &&
    !assessment.data &&
    !profile.loading &&
    !overview.loading &&
    !path.loading &&
    !assessment.loading &&
    Boolean(profile.error || overview.error || path.error || assessment.error);

  if (initialLoading) {
    return (
      <AsyncState
        kind="loading"
        title="正在整理今天的学习任务"
        description="画像、学习路径和最近学习记录会分别加载，完成的区域会先显示。"
      />
    );
  }

  if (allFailed) {
    return (
      <AsyncState
        kind="error"
        title="暂时无法读取学习首页"
        description="学习服务当前没有返回可用数据。你的学习记录没有改变。"
        preserved="恢复网络或服务后，可以从这里重新读取。"
        action={{
          label: "重新加载",
          onClick: () =>
            void Promise.all([loadProfile(), loadOverview(), loadPath(), loadAssessment(), loadClasses()]),
        }}
      />
    );
  }

  return (
    <div className="lm-dashboard">
      <section className="lm-dashboard-task" aria-labelledby="current-learning-task">
        <div className="lm-dashboard-task__heading">
          <span>
            <Target aria-hidden="true" />
            当前学习任务
          </span>
        </div>
        <div className="lm-dashboard-task__body">
          <h2 id="current-learning-task">{currentTask.title}</h2>
          <p>{currentTask.reason}</p>
        </div>
        <div className="lm-dashboard-task__actions">
          <button type="button" className="lm-button lm-button--primary" onClick={currentTask.onPrimary}>
            {currentTask.primaryLabel}
            <ArrowRight aria-hidden="true" />
          </button>
          {currentTask.secondaryLabel && currentTask.onSecondary && (
            <button
              type="button"
              className="lm-button lm-dashboard-secondary-button"
              onClick={currentTask.onSecondary}
            >
              {currentTask.secondaryLabel}
            </button>
          )}
        </div>
        {profile.error && !profile.data && <InlineError message={profile.error} onRetry={loadProfile} />}
        {path.error && !path.data && <InlineError message={path.error} onRetry={loadPath} />}
      </section>

      <LearningLoopRibbon onNavigateToTab={onNavigateToTab} />

      {/* 左右两列各自独立成 flex 列：
          右栏展开/收起学习时长图时只影响自己，不会把左栏的板块整体推下去 */}
      <div className="lm-dashboard-overview">
        <div className="lm-dashboard-overview__column">
          <LearningStatus
            profile={profile.data}
            overview={overview.data}
            path={path.data}
            loading={overview.loading}
            error={overview.error}
            onRetry={loadOverview}
          />
          <ContinueLearning
            data={overview.data}
            loading={overview.loading}
            error={overview.error}
            onRetry={loadOverview}
            onNavigateToTab={onNavigateToTab}
          />
          {/* 紧跟「继续上次学习」下方，与右栏高度无关 */}
          <WeakPointSummary
            data={assessment.data}
            loading={assessment.loading}
            error={assessment.error}
            onRetry={loadAssessment}
            onNavigateToTab={onNavigateToTab}
          />
        </div>
        <div className="lm-dashboard-overview__column">
          <StudyOverviewCard
            checkIn={checkIn.data}
            studyTime={studyTime.data}
            loadingCheckIn={checkIn.loading}
            loadingStudyTime={studyTime.loading}
            errorCheckIn={checkIn.error}
            errorStudyTime={studyTime.error}
            checkingIn={checkingIn}
            onCheckIn={handleCheckIn}
            onRetryCheckIn={loadCheckIn}
            onRetryStudyTime={loadStudyTime}
          />
          <LearningPathEntry
            path={path.data}
            loading={path.loading}
            error={path.error}
            onRetry={loadPath}
            onNavigateToTab={onNavigateToTab}
          />
          <MyClasses
            data={classes.data}
            loading={classes.loading}
            error={classes.error}
            onRetry={loadClasses}
          />
        </div>
      </div>
    </div>
  );
}

function LearningLoopRibbon({ onNavigateToTab }: Props) {
  const steps = [
    { key: "画像", detail: "目标 · 基础 · 偏好", tab: "analytics", icon: Sparkles },
    { key: "图谱诊断", detail: "掌握度 · 前置关系", tab: "knowledge", icon: GitBranch },
    { key: "路径生成", detail: "阶段 · 次序 · 条件", tab: "path", icon: Compass },
    { key: "资源生成", detail: "讲义 · 导图 · 案例", tab: "resource", icon: BookOpen },
    { key: "检测反馈", detail: "测验 · 代码 · 错因", tab: "quiz", icon: Brain },
    { key: "策略更新", detail: "证据回流 · 再规划", tab: "report", icon: RotateCcw },
  ];

  return (
    <section className="lm-learning-loop" aria-labelledby="learning-loop-title">
      <header>
        <div>
          <span>
            <FileCheck2 aria-hidden="true" /> 个性化学习闭环
          </span>
          <h2 id="learning-loop-title">不是一条静态章节路径，而是持续更新的学习系统</h2>
        </div>
        <small>每一步都读取上一步的真实结果</small>
      </header>
      <ol>
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.key}>
              <button type="button" onClick={() => onNavigateToTab(step.tab)}>
                <span className="lm-learning-loop__index">{String(index + 1).padStart(2, "0")}</span>
                <Icon aria-hidden="true" />
                <strong>{step.key}</strong>
                <small>{step.detail}</small>
              </button>
              {index < steps.length - 1 && (
                <ArrowRight className="lm-learning-loop__arrow" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function buildCurrentTask({
  profile,
  overview,
  path,
  onNavigateToTab,
}: {
  profile: ProfileResponse | null;
  overview: StudentOverview | null;
  path: LearningPathResponse | null;
  onNavigateToTab: Props["onNavigateToTab"];
}): CurrentTask {
  const profileVersion = profile?.version ?? overview?.profile.version;
  const completeness = profile?.completeness ?? overview?.profile.completeness;
  const profileKnown = typeof profileVersion === "number" && typeof completeness === "number";

  /* 真实学习存档：只有发生过真实学习行为（测验/资源/CodeLab/其它活动）才算有存档。
     初始种子数据（如「红黑树旋转」路径）不算，避免新学生一进来就看到别人的进度。 */
  const latestActivity = overview?.recentActivities[0];
  const hasArchive = Boolean(
    latestActivity ||
    overview?.quiz.attemptCount ||
    overview?.resources.totalCount ||
    overview?.resources.completedCount ||
    overview?.codeLab.submissionCount,
  );

  /* 没有真实存档时：显示空白等待态，只引导开始学习 */
  if (!hasArchive) {
    return {
      title: "还没有开始学习",
      reason: "完成学习画像、进入一次测验或 CodeLab 练习后，这里会显示你上一次的学习进度。",
      context: "等待开始",
      primaryLabel: "完善学习画像",
      onPrimary: () => onNavigateToTab("analytics"),
      secondaryLabel: "去做一次练习",
      onSecondary: () => onNavigateToTab("codelab"),
    };
  }

  if (profileKnown && (profileVersion === 0 || completeness < 1)) {
    return {
      title: "先让 AI 了解你的学习情况",
      reason:
        "完成学习画像后，系统才能更准确地安排学习路径、讲解难度和资源类型。你仍然可以继续使用其他学习功能。",
      context: "学习画像尚未完善",
      primaryLabel: "完善学习画像",
      onPrimary: () => onNavigateToTab("analytics"),
      secondaryLabel: "先问 AI 助手",
      onSecondary: () => onNavigateToTab("mentor"),
    };
  }

  /* 先按最近一次真实学习活动续接；只有没有活动记录时才回落到路径阶段 */
  if (latestActivity) {
    const destination = activityDestination(latestActivity.type);
    return {
      title: "继续上次学习",
      reason: `${studentActivityText(latestActivity)}。`,
      context: formatStudentTime(latestActivity.time),
      primaryLabel: destination.label,
      onPrimary: () => onNavigateToTab(destination.tab),
      secondaryLabel: "查看学习路径",
      onSecondary: () => onNavigateToTab("path"),
    };
  }

  const activeStage = path?.stages.find((stage) => stage.status === "active");
  if (path && activeStage) return taskFromActiveStage(path, activeStage, onNavigateToTab);

  if (overview?.resources.inProgressCount) {
    return {
      title: "继续未完成的学习资源",
      reason: `你有 ${overview.resources.inProgressCount} 项已经开始的学习资源，先完成其中一项可以保留当前学习节奏。`,
      context: overview.profile.currentCourse || "最近学习",
      primaryLabel: "继续学习资源",
      onPrimary: () => onNavigateToTab("resource"),
      secondaryLabel: "查看学习路径",
      onSecondary: () => onNavigateToTab("path"),
    };
  }

  return {
    title: "从一个具体问题开始学习",
    reason: "当前没有可继续的路径或活动记录。可以先向 AI 学习助手说明正在学习的课程和遇到的问题。",
    context: "暂无待继续任务",
    primaryLabel: "进入 AI 学习助手",
    onPrimary: () => onNavigateToTab("mentor"),
    secondaryLabel: "查看学习路径",
    onSecondary: () => onNavigateToTab("path"),
  };
}

function taskFromActiveStage(
  path: LearningPathResponse,
  stage: PathStage,
  onNavigateToTab: Props["onNavigateToTab"],
): CurrentTask {
  const base = {
    title: stage.title,
    reason: "这是学习路径中当前已解锁的阶段。完成当前阶段的真实验收条件后，才能继续下一步。",
    context: `${stage.subject} · ${path.title}`,
    secondaryLabel: "查看完整路径",
    onSecondary: () => onNavigateToTab("path"),
  };

  if (stage.completion.type === "quiz" && stage.questionIds.length > 0) {
    return {
      ...base,
      primaryLabel: "进入智能测验",
      onPrimary: () =>
        onNavigateToTab("quiz", { subject: stage.subject, knowledgePoint: stage.knowledgePoints[0] }),
    };
  }
  if (stage.completion.type === "resource") {
    return {
      ...base,
      primaryLabel: "继续当前阶段",
      onPrimary: () =>
        onNavigateToTab("resource", {
          subject: stage.subject,
          knowledgePointId: stage.knowledgePoints[0],
          stageKey: stage.key,
          pathVersion: path.version,
        }),
    };
  }
  return {
    ...base,
    primaryLabel: "查看当前阶段",
    onPrimary: () => onNavigateToTab("path"),
  };
}

function ContinueLearning({
  data,
  loading,
  error,
  onRetry,
  onNavigateToTab,
}: {
  data: StudentOverview | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNavigateToTab: Props["onNavigateToTab"];
}) {
  const activities = data?.recentActivities.slice(0, 3) ?? [];
  return (
    <section className="lm-dashboard-section" aria-labelledby="continue-learning-title">
      <div className="lm-dashboard-section__heading">
        <div>
          <Activity aria-hidden="true" />
          <h2 id="continue-learning-title">继续上次学习</h2>
        </div>
      </div>
      {loading && !data ? (
        <RegionLoading text="正在读取最近学习活动" />
      ) : error && !data ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : activities.length ? (
        <ol className="lm-dashboard-action-list">
          {activities.map((activity, index) => {
            const destination = activityDestination(activity.type);
            return (
              <li key={`${activity.type}-${activity.time}-${index}`}>
                <button type="button" onClick={() => onNavigateToTab(destination.tab)}>
                  <span>
                    <strong>{studentActivityText(activity)}</strong>
                    <small>{formatStudentTime(activity.time)}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="lm-dashboard-empty">
          <p>暂无最近学习活动。完成一次测验、资源学习或画像确认后，这里会出现继续入口。</p>
          <button type="button" onClick={() => onNavigateToTab("mentor")}>
            先向 AI 助手提问
          </button>
        </div>
      )}
    </section>
  );
}

function LearningStatus({
  profile,
  overview,
  path,
  loading,
  error,
  onRetry,
}: {
  profile: ProfileResponse | null;
  overview: StudentOverview | null;
  path: LearningPathResponse | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const activeStage = path?.stages.find((stage) => stage.status === "active");
  return (
    <aside className="lm-dashboard-status" aria-labelledby="learning-status-title">
      <div className="lm-dashboard-section__heading">
        <div>
          <Compass aria-hidden="true" />
          <h2 id="learning-status-title">学习状态</h2>
        </div>
      </div>
      {loading && !overview ? (
        <RegionLoading text="正在读取学习状态" />
      ) : error && !overview ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : (
        <dl>
          <StatusRow
            label="当前课程"
            value={profile?.profile.currentCourse || overview?.profile.currentCourse || "暂无数据"}
          />
          <StatusRow
            label="当前阶段"
            value={activeStage?.title || (path ? "暂无进行中阶段" : "暂无学习路径")}
          />
          <StatusRow
            label="测验记录"
            value={
              overview
                ? overview.quiz.attemptCount
                  ? `${overview.quiz.attemptCount} 次${overview.quiz.averageAccuracy === null ? "" : ` · 平均正确率 ${overview.quiz.averageAccuracy}%`}`
                  : "暂无测验记录"
                : "暂无数据"
            }
          />
          <StatusRow
            label="学习资源"
            value={
              overview
                ? overview.resources.totalCount
                  ? `共 ${overview.resources.totalCount} 项 · ${overview.resources.completedCount} 项已完成 · ${overview.resources.inProgressCount} 项进行中`
                  : "暂无资源记录"
                : "暂无数据"
            }
          />
          <StatusRow
            label="代码练习"
            value={
              overview
                ? overview.codeLab.submissionCount
                  ? `${overview.codeLab.submissionCount} 次提交 · ${overview.codeLab.successCount} 次通过`
                  : "暂无 CodeLab 记录"
                : "暂无数据"
            }
          />
        </dl>
      )}
    </aside>
  );
}

const CALENDAR_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/* 学习时长图的界面偏好持久化 key：
   首页组件切换页面时会卸载，用 localStorage 记住展开状态与纵轴档位 */
const STUDY_CHART_OPEN_KEY = "learnmate_student_study_chart_open";
const STUDY_CHART_SCALE_KEY = "learnmate_student_study_chart_scale";

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

function writeStoredBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "1" : "0");
}

function readStoredScale(): "auto" | number {
  if (typeof window === "undefined") return "auto";
  const raw = window.localStorage.getItem(STUDY_CHART_SCALE_KEY);
  if (raw === null || raw === "auto") return "auto";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "auto";
}

function writeStoredScale(value: "auto" | number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STUDY_CHART_SCALE_KEY, String(value));
}

function localTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 月历周一起始，1 号前需要补的空格数
function calendarLeadingBlanks(firstDateKey: string) {
  const [year, month] = firstDateKey.split("-").map(Number);
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

function monthTitleOf(firstDateKey: string) {
  const [year, month] = (firstDateKey || "").split("-").map(Number);
  if (!year || !month) return "";
  return `${year}年${month}月`;
}

// 放大后的纵轴上限档位（分钟）：30 分钟档贴合小数据，小时档保证刻度是整点或半点小时
const AXIS_TOPS = [30, 60, 90, 120, 240, 360, 720, 1080, 1440];

function StudyOverviewCard({
  checkIn,
  studyTime,
  loadingCheckIn,
  loadingStudyTime,
  errorCheckIn,
  errorStudyTime,
  checkingIn,
  onCheckIn,
  onRetryCheckIn,
  onRetryStudyTime,
}: {
  checkIn: DailyCheckInSummary | null;
  studyTime: StudyTimeSummary | null;
  loadingCheckIn: boolean;
  loadingStudyTime: boolean;
  errorCheckIn: string;
  errorStudyTime: string;
  checkingIn: boolean;
  onCheckIn: () => void;
  onRetryCheckIn: () => void;
  onRetryStudyTime: () => void;
}) {
  const days = checkIn?.monthDays ?? [];
  const today = localTodayKey();
  const monthTitle = monthTitleOf(days[0]?.date ?? "");
  const leadingBlanks = days.length ? calendarLeadingBlanks(days[0].date) : 0;
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [yScale, setYScale] = useState<"auto" | number>(readStoredScale);
  /* 学习时长图默认收起：它偏高，长期展开会把首页拉得很长。
     展开状态与纵轴档位写进 localStorage —— 首页组件在切换页面时会被卸载，
     只放在 useState 里的话每次回到首页都会重新收起。 */
  const [chartOpen, setChartOpen] = useState(readStoredBoolean(STUDY_CHART_OPEN_KEY, false));
  const chartDays = studyTime?.days ?? [];
  const zoomed = Boolean(
    brushRange &&
    chartDays.length > 0 &&
    (brushRange.startIndex > 0 || brushRange.endIndex < chartDays.length - 1),
  );
  const visibleDays =
    zoomed && brushRange ? chartDays.slice(brushRange.startIndex, brushRange.endIndex + 1) : chartDays;
  const visibleMax = visibleDays.reduce((max, item) => Math.max(max, item.minutes), 0);
  const autoTop = zoomed ? (AXIS_TOPS.find((top) => top >= Math.max(30, visibleMax)) ?? 1440) : 1440;
  const axisTop = yScale === "auto" ? autoTop : yScale;
  const yTicks =
    yScale === "auto"
      ? zoomed
        ? [0, axisTop / 2, axisTop]
        : [0, 360, 720, 1080, 1440]
      : axisTop === 1440
        ? [0, 360, 720, 1080, 1440]
        : [0, axisTop / 2, axisTop];

  return (
    <section className="lm-dashboard-section lm-checkin" aria-labelledby="daily-checkin-title">
      <div className="lm-dashboard-section__heading">
        <div>
          <CalendarCheck aria-hidden="true" />
          <h2 id="daily-checkin-title">每日签到</h2>
        </div>
      </div>
      {loadingCheckIn && !checkIn ? (
        <RegionLoading text="正在读取签到状态" />
      ) : errorCheckIn && !checkIn ? (
        <InlineError message={errorCheckIn} onRetry={onRetryCheckIn} />
      ) : (
        <div className="lm-checkin__body">
          <div className="lm-checkin__info">
            <p className="lm-checkin__status">
              {checkIn?.todayCheckedIn ? "今日已签到，明天继续加油！" : "今天还没签到，坚持就是胜利！"}
            </p>
            <div className="lm-checkin__stats">
              <span className={`lm-label-chip${checkIn?.todayCheckedIn ? " is-on" : ""}`}>
                连续 {checkIn?.currentStreak ?? 0} 天
              </span>
              <span className="lm-label-chip">累计 {checkIn?.totalCount ?? 0} 天</span>
            </div>
          </div>
          {days.length > 0 && (
            <div className="lm-calendar" aria-label={`${monthTitle}签到月历，已签到日期以绿色标记`}>
              <div className="lm-calendar__head" aria-hidden="true">
                {CALENDAR_WEEKDAYS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <span key={`blank-${index}`} className="lm-calendar__cell is-blank" aria-hidden="true" />
              ))}
              {days.map((item) => {
                const className = `lm-calendar__cell${item.checked ? " is-done" : ""}${item.date === today ? " is-today" : ""}${item.date > today ? " is-future" : ""}`;
                return (
                  <span key={item.date} className={className}>
                    {item.checked ? "✓" : Number(item.date.slice(8))}
                  </span>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="lm-button lm-button--primary"
            onClick={onCheckIn}
            disabled={checkingIn || Boolean(checkIn?.todayCheckedIn)}
          >
            {checkingIn ? (
              "签到中…"
            ) : checkIn?.todayCheckedIn ? (
              "今日已签到 ✓"
            ) : (
              <>
                <CalendarCheck aria-hidden="true" />
                立即签到
              </>
            )}
          </button>
        </div>
      )}
      {errorCheckIn && checkIn && <InlineError message={errorCheckIn} onRetry={onRetryCheckIn} />}

      <div className="lm-checkin__chart">
        {/* 学习时长图默认收起，避免长期占用首页高度；在签到卡右下角一键展开 */}
        <div className="lm-checkin__chart-toggle">
          <button
            type="button"
            className="lm-chart-toggle"
            aria-expanded={chartOpen}
            aria-controls="study-chart-panel"
            onClick={() => {
              setChartOpen((open) => {
                const next = !open;
                writeStoredBoolean(STUDY_CHART_OPEN_KEY, next);
                return next;
              });
            }}
          >
            {chartOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            {chartOpen ? "收起学习时长" : "展开学习时长"}
          </button>
        </div>

        {chartOpen && (
          <div id="study-chart-panel" className="lm-checkin__chart-panel">
            <div className="lm-checkin__chart-heading">
              <div className="lm-checkin__chart-title">
                <h3 id="study-chart-title">最近 30 天学习时长</h3>
                <p>含专注计时与测验用时，拖动下方滑条放大查看</p>
              </div>
              <label className="lm-chart-scale">
                <span>纵轴</span>
                <select
                  value={String(yScale)}
                  onChange={(event) => {
                    const next: "auto" | number =
                      event.target.value === "auto" ? "auto" : Number(event.target.value);
                    setYScale(next);
                    writeStoredScale(next);
                  }}
                  aria-label="纵轴刻度"
                >
                  <option value="auto">自动适配</option>
                  <option value="30">30 分钟</option>
                  <option value="60">1 小时</option>
                  <option value="120">2 小时</option>
                  <option value="240">4 小时</option>
                  <option value="360">6 小时</option>
                  <option value="720">12 小时</option>
                  <option value="1440">24 小时</option>
                </select>
              </label>
            </div>
            {loadingStudyTime && !studyTime ? (
              <RegionLoading text="正在读取学习时长" />
            ) : errorStudyTime && !studyTime ? (
              <InlineError message={errorStudyTime} onRetry={onRetryStudyTime} />
            ) : (
              <div className="lm-study-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDays} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--lm-border)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => String(value).slice(5)}
                      interval="preserveStartEnd"
                      tick={{ fontSize: 10, fill: "var(--lm-text-muted)" }}
                      axisLine={{ stroke: "var(--lm-border-strong)" }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, axisTop]}
                      ticks={yTicks}
                      tickFormatter={(value) => (axisTop <= 90 ? `${value}分` : `${value / 60}h`)}
                      tick={{ fontSize: 10, fill: "var(--lm-text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} 分钟`, "学习时长"]}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="minutes"
                      stroke="var(--lm-brand)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Brush
                      dataKey="date"
                      height={18}
                      stroke="var(--lm-brand)"
                      fill="#E3F4EE"
                      onChange={(range) => {
                        const start = range?.startIndex ?? 0;
                        const end = range?.endIndex ?? Math.max(0, chartDays.length - 1);
                        setBrushRange({ startIndex: start, endIndex: end });
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {errorStudyTime && studyTime && (
              <InlineError message={errorStudyTime} onRetry={onRetryStudyTime} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function WeakPointSummary({
  data,
  loading,
  error,
  onRetry,
  onNavigateToTab,
}: {
  data: StudentAssessment | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNavigateToTab: Props["onNavigateToTab"];
}) {
  const weaknesses = data?.weaknesses.slice(0, 3) ?? [];
  return (
    <section className="lm-dashboard-section" aria-labelledby="weak-points-title">
      <div className="lm-dashboard-section__heading">
        <div>
          <AlertTriangle aria-hidden="true" />
          <h2 id="weak-points-title">需要重点复习</h2>
        </div>
      </div>
      {loading && !data ? (
        <RegionLoading text="正在读取学习洞察" />
      ) : error && !data ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : weaknesses.length ? (
        <ul className="lm-dashboard-weak-list">
          {weaknesses.map((item, index) => (
            <li key={`${item.subject}-${item.knowledgePoint}-${index}`}>
              <div>
                <strong>{item.knowledgePoint || item.subject || "待复习内容"}</strong>
                <p>{item.text}</p>
                {item.evidence[0] && <small>{item.evidence[0]}</small>}
              </div>
              <button
                type="button"
                onClick={() =>
                  onNavigateToTab("quiz", { subject: item.subject, knowledgePoint: item.knowledgePoint })
                }
              >
                去练习
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="lm-dashboard-empty">
          <p>完成一次测验或练习后，这里会出现需要重点复习的内容。</p>
          <button type="button" onClick={() => onNavigateToTab("quiz")}>
            <Brain aria-hidden="true" />
            查看智能测验
          </button>
        </div>
      )}
    </section>
  );
}

/* 学习路径入口：路径页已从侧栏移到首页，这里给出与其它板块一致的快捷入口 */
function LearningPathEntry({
  path,
  loading,
  error,
  onRetry,
  onNavigateToTab,
}: {
  path: LearningPathResponse | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNavigateToTab: Props["onNavigateToTab"];
}) {
  const activeStage = path?.stages.find((stage) => stage.status === "active");
  const doneCount = path?.stages.filter((stage) => stage.status === "completed").length ?? 0;
  return (
    <section
      className="lm-dashboard-section lm-dashboard-path-entry"
      aria-labelledby="learning-path-entry-title"
    >
      <div className="lm-dashboard-section__heading">
        <div>
          <Compass aria-hidden="true" />
          <h2 id="learning-path-entry-title">学习路径</h2>
        </div>
        <button
          type="button"
          className="lm-dashboard-section__action"
          onClick={() => onNavigateToTab("path")}
        >
          {loading && !path ? "读取中…" : "进入学习路径"}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      {error && !path ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : (
        <p>
          {activeStage ? (
            <>
              当前阶段：<strong>{activeStage.title}</strong>，共 {path?.stages.length ?? 0} 个阶段（已完成{" "}
              {doneCount} 个）。
            </>
          ) : path ? (
            <>
              共 {path.stages.length} 个阶段（已完成 {doneCount} 个），暂无进行中的阶段。
            </>
          ) : (
            "暂无学习路径，进入后可以生成一条个性化路径。"
          )}
        </p>
      )}
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="lm-dashboard-inline-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        重试
      </button>
    </div>
  );
}

function RegionLoading({ text }: { text: string }) {
  return (
    <p className="lm-dashboard-region-loading" role="status" aria-live="polite">
      {text}…
    </p>
  );
}

function activityDestination(type: string) {
  if (type === "quiz" || type === "test" || type === "quiz_submitted")
    return { tab: "quiz", label: "查看智能测验" };
  if (type === "resource") return { tab: "resource", label: "继续学习资源" };
  if (type === "codelab") return { tab: "codelab", label: "进入 CodeLab" };
  if (type === "profile" || type === "profile_confirmed") return { tab: "analytics", label: "查看学习画像" };
  return { tab: "mentor", label: "进入 AI 学习助手" };
}

function studentActivityText(item: StudentOverview["recentActivities"][number]) {
  if (item.type === "codelab")
    return item.text.includes("成功") ? "最近一次 CodeLab 练习已通过" : "继续检查最近的 CodeLab 练习";
  if (item.type === "profile_confirmed" || item.type === "profile") return "学习画像已更新";
  return item.text;
}

function formatStudentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
    date,
  );
  if (startTarget === startToday) return `今天 ${time}`;
  if (startTarget === startToday - 86_400_000) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
}

function MyClasses({
  data,
  loading,
  error,
  onRetry,
}: {
  data: MyClassesResponse | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const items = data && Array.isArray(data.data) ? data.data : [];
  const [panelOpen, setPanelOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [directory, setDirectory] = useState<ClassDirectoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHint, setSearchHint] = useState("");
  const [requests, setRequests] = useState<ClassJoinRequest[]>([]);
  const [busyClassId, setBusyClassId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const isStudent = getStoredUser()?.role === "STUDENT";

  const loadRequests = useCallback(async () => {
    try {
      const result = await getMyClassRequests();
      setRequests(result && Array.isArray(result.data) ? result.data : []);
    } catch {
      setRequests([]);
    }
  }, []);

  const search = async () => {
    setSearching(true);
    setSearchHint("");
    setActionError("");
    setActionMessage("");
    try {
      const result = await getClassDirectory(keyword);
      const rows = result && Array.isArray(result.data) ? result.data : [];
      setDirectory(rows);
      if (!rows.length) setSearchHint("没有找到匹配的班级。可以试试任课老师的姓名，或者班级名称。");
    } catch (reason) {
      setDirectory([]);
      setSearchHint(describeApiError(reason, "班级列表读取失败"));
    } finally {
      setSearching(false);
    }
  };

  const apply = async (item: ClassDirectoryItem) => {
    setBusyClassId(item.classId);
    setActionError("");
    setActionMessage("");
    try {
      await createClassJoinRequest(item.classId, "");
      setActionMessage(`已向「${item.className}」提交入班申请，等待 ${item.teacherName} 审核。`);
      setDirectory((current) =>
        current.map((row) => (row.classId === item.classId ? { ...row, myStatus: "pending" } : row)),
      );
      await loadRequests();
    } catch (reason) {
      setActionError(describeApiError(reason, "提交申请失败"));
    } finally {
      setBusyClassId(null);
    }
  };

  const cancel = async (request: ClassJoinRequest) => {
    setBusyClassId(request.classId);
    setActionError("");
    setActionMessage("");
    try {
      await cancelClassJoinRequest(request.requestId);
      setActionMessage(`已撤回对「${request.className}」的入班申请。`);
      await loadRequests();
      setDirectory((current) =>
        current.map((row) =>
          row.classId === request.classId && row.myStatus === "pending" ? { ...row, myStatus: "none" } : row,
        ),
      );
    } catch (reason) {
      setActionError(describeApiError(reason, "撤回申请失败"));
    } finally {
      setBusyClassId(null);
    }
  };

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    if (next) {
      void loadRequests();
      if (!directory.length) void search();
    }
  };

  return (
    <section className="lm-dashboard-section" aria-labelledby="my-classes-title">
      <div className="lm-dashboard-section__heading">
        <div>
          <Users aria-hidden="true" />
          <h2 id="my-classes-title">我的班级</h2>
        </div>
        <p>加入班级需要任课教师审核</p>
      </div>
      {loading && !data ? (
        <RegionLoading text="正在读取班级信息" />
      ) : error && !data ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : (
        <>
          {items.length ? (
            <ul className="lm-dashboard-action-list">
              {items.map((item) => (
                <li key={item.classId}>
                  <div>
                    <span>
                      <strong>{item.className}</strong>
                      <small>
                        {item.subject} · 任课教师 {item.teacherName}
                      </small>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="lm-dashboard-empty">
              <p>你还没有加入任何班级。可以搜索老师的班级并提交申请，老师审核通过后就会出现在这里。</p>
            </div>
          )}

          {isStudent && (
            <div className="mt-4">
              <button type="button" className="lm-button lm-dashboard-secondary-button" onClick={togglePanel}>
                {panelOpen ? "收起入班申请" : "加入班级"}
              </button>
            </div>
          )}

          {isStudent && panelOpen && (
            <div className="mt-4 rounded-lg border p-4">
              <label className="block text-sm text-slate-600" htmlFor="class-directory-search">
                找老师 / 找班级
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="class-directory-search"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void search();
                    }
                  }}
                  placeholder="输入老师姓名、用户名或班级名称"
                  maxLength={100}
                  className="h-11 min-w-[220px] flex-1 rounded-md border px-3 text-sm"
                />
                <button
                  type="button"
                  className="lm-button lm-button--primary"
                  onClick={() => void search()}
                  disabled={searching}
                >
                  {searching ? "搜索中…" : "搜索"}
                </button>
              </div>
              {searchHint && <p className="mt-2 text-sm text-slate-500">{searchHint}</p>}

              {directory.length > 0 && (
                <ul className="mt-3">
                  {directory.map((row) => (
                    <li
                      key={row.classId}
                      className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-b-0"
                    >
                      <div className="text-sm">
                        <strong>{row.className}</strong>
                        <small className="block text-slate-500">
                          {row.subject} · 任课教师 {row.teacherName} · {row.memberCount} 人
                        </small>
                      </div>
                      {row.myStatus === "member" ? (
                        <span className="text-xs text-emerald-700">已加入</span>
                      ) : row.myStatus === "pending" ? (
                        <span className="text-xs text-amber-700">待审核</span>
                      ) : (
                        <button
                          type="button"
                          className="lm-button"
                          onClick={() => void apply(row)}
                          disabled={busyClassId === row.classId}
                        >
                          申请加入
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {requests.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium">我的申请</h3>
                  <ul className="mt-2 space-y-2">
                    {requests.map((request) => (
                      <li
                        key={request.requestId}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {request.className}（{request.teacherName}）·{" "}
                          {joinRequestStatusLabel(request.status)}
                          {request.reviewNote ? ` · 备注：${request.reviewNote}` : ""}
                        </span>
                        {request.status === "pending" && (
                          <button
                            type="button"
                            className="lm-button"
                            onClick={() => void cancel(request)}
                            disabled={busyClassId === request.classId}
                          >
                            撤回申请
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {actionMessage && <p className="mt-3 text-sm text-emerald-700">{actionMessage}</p>}
              {actionError && <p className="mt-3 text-sm text-rose-700">{actionError}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function joinRequestStatusLabel(status: ClassJoinRequest["status"]) {
  if (status === "pending") return "待审核";
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已拒绝";
  return "已撤回";
}
