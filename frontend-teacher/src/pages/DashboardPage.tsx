import { DepthScene } from "../components/depth/DepthScene";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { DashboardOverview, TrendPoint, ClassItem } from "../types";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  ArrowUpRight,
  LibraryBig,
  Route,
  ShieldAlert,
  Target,
  UploadCloud,
  Users,
} from "lucide-react";
import { teacherApi } from "../api/teacher";
import { navigate } from "../router";
import { Metric, PageTitle, State, pct } from "../components/Ui";
import { UploadTeachingMaterialModal, usePendingMaterials } from "../components/UploadTeachingMaterialModal";
import { ChartOnView } from "../components/effects/ChartOnView";
import { RevealOnScroll } from "../components/effects/RevealOnScroll";
import { MagneticButton } from "../components/effects/MagneticButton";

const foldoutBranches = [
  {
    key: "overview",
    label: "班级进展",
    icon: Activity,
    detail: "从课堂参与到测验反馈，了解每个班级的学习进展。",
    tags: [
      { label: "班级学情", href: "/classes" },
      { label: "测验反馈", href: "/quizzes" },
      { label: "学生档案", href: "/students" },
    ],
  },
  {
    key: "focus",
    label: "需要关注",
    icon: ShieldAlert,
    detail: "查看需要跟进的学生，为薄弱内容安排下一次练习。",
    tags: [
      { label: "学生表现", href: "/students" },
      { label: "薄弱内容", href: "#weakness-heading" },
      { label: "入班申请", href: "/class-requests" },
    ],
  },
  {
    key: "actions",
    label: "教学安排",
    icon: LibraryBig,
    detail: "把下一步教学安排落到作业、课件和学习反馈中。",
    tags: [
      { label: "布置作业", href: "/assignments" },
      { label: "准备资源", href: "/resources" },
      { label: "学习报告", href: "/reports" },
    ],
  },
] as const;

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}/${date.getDate()}`;
}

function riskLabel(level: string) {
  return level === "high" ? "高风险" : level === "medium" ? "需关注" : "稳定";
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { accuracy?: number | null } }>;
  label?: string;
}) {
  if (!active || !payload?.length || payload[0]?.value === null || payload[0]?.value === undefined)
    return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_4px_8px_rgba(15,23,42,0.1)]">
      <div className="text-slate-500">{label ? formatDate(label) : ""}</div>
      <div className="mt-1 font-semibold text-brand-700">正确率 {pct(Number(payload[0].value))}</div>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardOverview>();
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeBranch, setActiveBranch] = useState<string>("overview");
  const { pendingMaterials, setPendingMaterials } = usePendingMaterials();

  useEffect(() => {
    Promise.all([teacherApi.dashboard(), teacherApi.trends(), teacherApi.classes()])
      .then(([overview, trendResult, classResult]) => {
        setData(overview);
        setTrends(trendResult.data);
        setClasses(classResult.data);
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "数据读取失败"),
      );
  }, []);

  return (
    <>
      <PageTitle
        title="工作台"
        description="看见班级进展，及时安排下一步教学"
        action={
          <MagneticButton
            type="button"
            onClick={() => setUploadOpen(true)}
            ripple
            className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-brand-cta transition-colors duration-200 hover:bg-brand-500"
          >
            <UploadCloud size={17} strokeWidth={1.8} aria-hidden="true" />
            上传教学资料
          </MagneticButton>
        }
      />
      <section className="teacher-foldout" aria-labelledby="teacher-foldout-title">
        <div className="teacher-foldout__rail" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="teacher-foldout__heading">
          <div>
            <h2 id="teacher-foldout-title">教学一览</h2>
          </div>
          <img
            className="teacher-foldout__birds"
            src="/art/path-birds-monochrome-v3.png"
            alt=""
            aria-hidden="true"
          />
        </div>
        <div className="teacher-foldout__branches" role="tablist" aria-label="工作台视图">
          {foldoutBranches.map((branch, index) => (
            <button
              key={branch.key}
              type="button"
              className="teacher-foldout__branch"
              role="tab"
              id={`fold-tab-${branch.key}`}
              aria-controls={`fold-panel-${branch.key}`}
              aria-selected={activeBranch === branch.key}
              tabIndex={activeBranch === branch.key ? 0 : -1}
              onClick={() => setActiveBranch(branch.key)}
              onKeyDown={(event) => {
                const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!direction && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + direction + 3) % 3;
                setActiveBranch(foldoutBranches[next].key);
                document.getElementById(`fold-tab-${foldoutBranches[next].key}`)?.focus();
              }}
            >
              <branch.icon size={23} aria-hidden="true" />
              <strong>{branch.label}</strong>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="teacher-foldout__details">
          {foldoutBranches.map((branch) => (
            <div
              key={branch.key}
              role="tabpanel"
              id={`fold-panel-${branch.key}`}
              aria-labelledby={`fold-tab-${branch.key}`}
              hidden={activeBranch !== branch.key}
              className="teacher-foldout__detail"
            >
              <p>{branch.detail}</p>
              <div className="teacher-foldout__tags">
                {branch.tags.map((tag) => (
                  <button
                    key={tag.label}
                    type="button"
                    onClick={() => {
                      if (tag.href.startsWith("#")) {
                        const target = document.getElementById(tag.href.slice(1));
                        target?.scrollIntoView({
                          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                            ? "instant"
                            : "smooth",
                          block: "center",
                        });
                        target?.focus({ preventScroll: true });
                      } else navigate(tag.href);
                    }}
                    disabled={tag.href.startsWith("#") && !data}
                  >
                    <span>{tag.label}</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <State loading={!data && !error} error={error}>
        <div className="lm-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric
            label="管理学生"
            value={data?.summary.managedStudentCount ?? 0}
            icon={Users}
            countUpTo={data?.summary.managedStudentCount ?? 0}
          />
          <Metric
            label="7 天活跃"
            value={data?.summary.activeStudentCount7d ?? 0}
            icon={Activity}
            tone="green"
            countUpTo={data?.summary.activeStudentCount7d ?? 0}
          />
          <Metric
            label="测验正确率"
            value={pct(data?.summary.averageQuizAccuracy)}
            icon={Target}
            tone="blue"
            countUpTo={Math.round(Number(data?.summary.averageQuizAccuracy) || 0)}
            countUpSuffix="%"
          />
          <Metric
            label="路径平均进度"
            value={pct(data?.summary.averagePathProgress)}
            icon={Route}
            tone="slate"
            countUpTo={Math.round(Number(data?.summary.averagePathProgress) || 0)}
            countUpSuffix="%"
          />
          <Metric
            label="已完成资源"
            value={data?.summary.completedResourceCount ?? 0}
            icon={LibraryBig}
            tone="green"
            countUpTo={data?.summary.completedResourceCount ?? 0}
          />
          <Metric
            label="高风险学生"
            value={data?.summary.highRiskStudentCount ?? 0}
            icon={ShieldAlert}
            tone="amber"
            countUpTo={data?.summary.highRiskStudentCount ?? 0}
          />
        </div>

        <RevealOnScroll className="lm-reveal-contents" stagger={0.1}>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section
              className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2 sm:p-6"
              aria-labelledby="trend-heading"
              data-reveal
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="trend-heading" className="text-base font-semibold text-slate-900">
                    近 30 天测验趋势
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">按日汇总有效测验记录</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden="true" />
                  正确率
                </div>
              </div>
              <div className="teacher-chart-pop mt-5 h-72 sm:h-80">
                <ChartOnView minHeightClass="h-full">
                  {trends.some((item) => item.accuracy !== null && item.accuracy !== undefined) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        className="teacher-trend-chart"
                        data={trends}
                        margin={{ top: 8, right: 8, left: 0, bottom: 2 }}
                      >
                        <defs>
                          <linearGradient id="teacherTrendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4776da" stopOpacity={0.34} />
                            <stop offset="100%" stopColor="#4776da" stopOpacity={0.02} />
                          </linearGradient>
                          <filter id="teacherTrendGlow" x="-20%" y="-30%" width="140%" height="160%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>
                        <CartesianGrid stroke="#EAE8E3" strokeDasharray="2 4" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          interval={4}
                          tick={{ fontSize: 11, fill: "#8A867E" }}
                          tickLine={false}
                          axisLine={{ stroke: "#D8D5CE" }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 11, fill: "#8A867E" }}
                          tickLine={false}
                          axisLine={false}
                          width={46}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                          content={<TrendTooltip />}
                          cursor={{ stroke: "#A0DFC9", strokeDasharray: "3 3" }}
                        />
                        <Area
                          type="linear"
                          dataKey="accuracy"
                          name="正确率"
                          stroke="var(--lm-brand)"
                          strokeWidth={2.5}
                          fill="url(#teacherTrendFill)"
                          fillOpacity={1}
                          filter="url(#teacherTrendGlow)"
                          connectNulls={false}
                          dot={{ r: 3, fill: "var(--lm-surface)", stroke: "var(--lm-brand)", strokeWidth: 2 }}
                          activeDot={{
                            r: 5,
                            fill: "var(--lm-brand)",
                            stroke: "var(--lm-surface)",
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center rounded-md bg-slate-50 text-center text-sm text-slate-500">
                      <div>
                        <div className="font-medium text-slate-700">暂无测验趋势</div>
                        <p className="mt-1 text-xs">当前管理范围内还没有可统计的测验记录</p>
                      </div>
                    </div>
                  )}
                </ChartOnView>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">最近 30 天 · 无测验的日期保留空缺。</p>
            </section>

            <section
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="weakness-heading"
              data-reveal
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="weakness-heading" tabIndex={-1} className="text-base font-semibold text-slate-900">
                    高频薄弱点
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">按平均掌握度从低到高</p>
                </div>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  需关注
                </span>
              </div>
              <div className="mt-4 max-h-[360px] space-y-2.5 overflow-y-auto pr-1">
                {data?.topWeaknesses?.length ? (
                  data.topWeaknesses.map((item, index: number) => (
                    <div key={item.name} className="rounded-md border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${index < 3 ? "bg-brand-100 text-brand-700" : "bg-white text-slate-500"}`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                          {item.name}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">{pct(item.value)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div
                          className="teacher-progress h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
                          role="progressbar"
                          aria-label={`${item.name}掌握度`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.max(0, Math.min(100, Number(item.value) || 0))}
                        >
                          <div
                            className="teacher-progress__fill h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.max(0, Math.min(100, Number(item.value) || 0))}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-500">{item.count} 条记录</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                    暂无薄弱点数据
                  </div>
                )}
              </div>
            </section>
          </div>
        </RevealOnScroll>

        <RevealOnScroll className="lm-reveal-contents" stagger={0.1}>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="classes-heading"
              data-reveal
            >
              <div className="flex items-center justify-between">
                <h2 id="classes-heading" className="text-base font-semibold text-slate-900">
                  管理班级
                </h2>
                <span className="text-xs text-slate-500">{classes.length} 个班级</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {classes.length === 0 && (
                  <p className="py-8 text-sm text-slate-500">暂无班级，前往班级学情添加。</p>
                )}
                {classes.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/classes/${item.id}/analytics`)}
                    className="group flex min-h-[68px] w-full items-center justify-between rounded-md border border-slate-200 p-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{item.className}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{item.subject}</div>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700">
                      {item.studentCount} 人{" "}
                      <ArrowUpRight
                        size={15}
                        className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>
            <section
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="activity-heading"
              data-reveal
            >
              <div className="flex items-center justify-between">
                <h2 id="activity-heading" className="text-base font-semibold text-slate-900">
                  近期学生活动
                </h2>
                <span className="text-xs text-slate-500">最近更新</span>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {data?.recentActivity?.length ? (
                  data.recentActivity.map((item) => (
                    <button
                      key={item.studentId}
                      onClick={() => navigate(`/students/${item.studentId}`)}
                      className="flex min-h-[64px] w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{item.displayName}</div>
                        <div className="mt-1 truncate text-xs text-slate-500">{item.className}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${item.risk.level === "high" ? "bg-rose-50 text-rose-700" : item.risk.level === "medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                      >
                        {riskLabel(item.risk.level)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">暂无近期活动</p>
                )}
              </div>
            </section>
          </div>
        </RevealOnScroll>
        <RevealOnScroll className="lm-reveal-contents">
          <section className="teacher-basics" aria-label="教学基本信息" data-reveal>
            <img src="/art/mentor-sacred-hands-v2.png" alt="" aria-hidden="true" />
            <h2>教学档案</h2>
            <dl>
              <div>
                <dt>任课教师</dt>
                <dd>{data?.teacher.displayName || "暂无记录"}</dd>
              </div>
              <div>
                <dt>管理班级</dt>
                <dd>{data?.teacher.classCount ?? classes.length} 个</dd>
              </div>
              <div>
                <dt>在读学生</dt>
                <dd>{data?.summary.managedStudentCount ?? 0} 人</dd>
              </div>
              <div>
                <dt>教学科目</dt>
                <dd>{[...new Set(classes.map((item) => item.subject))].join("、") || "暂未设置"}</dd>
              </div>
            </dl>
          </section>
        </RevealOnScroll>
      </State>
      <UploadTeachingMaterialModal
        open={uploadOpen}
        pendingMaterials={pendingMaterials}
        onClose={() => setUploadOpen(false)}
        onAdd={(material) => setPendingMaterials((items) => [...items, material])}
        onRemove={(id) => setPendingMaterials((items) => items.filter((item) => item.id !== id))}
      />
      <DepthScene variant="stage" section="SECTION 01" title={["DESK", "01"]}
        caption="TEACHING OVERVIEW / 教学工作台"
        meta={data ? `${data.teacher.classCount} CLASSES · ${data.summary.managedStudentCount} STUDENTS` : undefined} />
    </>
  );
}
