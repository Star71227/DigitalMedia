/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  LineDrawShape,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { teacherApi } from "../api/teacher";
import { navigate } from "../router";
import type { StudentCard, TeacherStudyAttendance } from "../types";
import { Metric, PageTitle, State, fmt, pct } from "../components/Ui";
import { ChartOnView } from "../components/effects/ChartOnView";
import { RevealOnScroll } from "../components/effects/RevealOnScroll";

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}/${date.getDate()}`;
}

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

// 放大后的纵轴上限档位（分钟）：30 分钟档贴合小数据，小时档保证刻度是整点或半点小时
const AXIS_TOPS = [30, 60, 90, 120, 240, 360, 720, 1080, 1440];

function StudyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string | number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const checkIn = payload.find((item) => item.dataKey === "checkInCount")?.value ?? 0;
  const minutes = payload.find((item) => item.dataKey === "studyMinutes")?.value ?? 0;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_4px_8px_rgba(15,23,42,0.1)]">
      <div className="text-slate-500">{label ? formatDate(String(label)) : ""}</div>
      <div className="mt-1 font-semibold text-brand-700">打卡 {checkIn} 人</div>
      <div className="mt-0.5 font-semibold text-slate-600">学习 {minutes} 分钟</div>
    </div>
  );
}

type AttendanceSortKey = "checkInDays" | "studyMinutes";

export function StudentsPage() {
  const [data, setData] = useState<StudentCard[]>([]),
    [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 }),
    [keyword, setKeyword] = useState(""),
    [riskLevel, setRisk] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [attendance, setAttendance] = useState<TeacherStudyAttendance | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");
  const [sort, setSort] = useState<{ key: AttendanceSortKey; dir: "asc" | "desc" }>({
    key: "studyMinutes",
    dir: "desc",
  });
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [yScale, setYScale] = useState<"auto" | number>("auto");
  const load = (page = 1) => {
    setLoading(true);
    teacherApi
      .students({ page, pageSize: 20, keyword, riskLevel, sortBy: "riskLevel", sortOrder: "asc" })
      .then((r) => {
        setData(r.data);
        setPagination(r.pagination);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  const loadAttendance = () => {
    setAttendanceLoading(true);
    teacherApi
      .studyAttendance()
      .then((r) => {
        setAttendance(r);
        setAttendanceError("");
      })
      .catch((e) => setAttendanceError(e instanceof Error ? e.message : "数据读取失败"))
      .finally(() => setAttendanceLoading(false));
  };
  useEffect(() => {
    load();
    loadAttendance();
  }, []);
  const toggleSort = (key: AttendanceSortKey) =>
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));
  const sortedStudents = attendance
    ? [...attendance.students].sort((a, b) =>
        sort.dir === "desc" ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key],
      )
    : [];
  const maxMinutes = attendance?.students.length
    ? Math.max(...attendance.students.map((item) => item.studyMinutes))
    : 0;
  const chartDays = attendance?.daily ?? [];
  const zoomed = Boolean(
    brushRange &&
    chartDays.length > 0 &&
    (brushRange.startIndex > 0 || brushRange.endIndex < chartDays.length - 1),
  );
  const visibleDays =
    zoomed && brushRange ? chartDays.slice(brushRange.startIndex, brushRange.endIndex + 1) : chartDays;
  const visibleMax = visibleDays.reduce((max, item) => Math.max(max, item.studyMinutes), 0);
  const checkInMax = Math.max(1, ...visibleDays.map((item) => item.checkInCount));
  const checkInTicks =
    checkInMax <= 8 ? Array.from({ length: checkInMax + 1 }, (_, index) => index) : undefined;
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
  const hasTrend = Boolean(attendance?.daily.some((item) => item.checkInCount > 0 || item.studyMinutes > 0));
  const sortIcon = (key: AttendanceSortKey) =>
    sort.key !== key ? null : sort.dir === "desc" ? (
      <ChevronDown size={13} aria-hidden="true" />
    ) : (
      <ChevronUp size={13} aria-hidden="true" />
    );
  return (
    <>
      <PageTitle title="学生管理" description="学生近期表现与待跟进事项" />
      <RevealOnScroll stagger={0.12}>
        <section
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          aria-labelledby="study-attendance-heading"
          data-reveal
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="study-attendance-heading" className="text-base font-semibold text-slate-900">
                最近 30 天打卡与学习时长
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                含专注计时与测验用时，与学生端学习统计口径一致；拖动下方滑条放大查看
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-brand-600" aria-hidden="true" />
                打卡人数
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-slate-500" aria-hidden="true" />
                学习时长
              </span>
              <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
              <label className="flex items-center gap-1.5 text-slate-500">
                <span>纵轴</span>
                <select
                  value={String(yScale)}
                  onChange={(event) =>
                    setYScale(event.target.value === "auto" ? "auto" : Number(event.target.value))
                  }
                  aria-label="纵轴刻度"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition-colors focus:border-brand-500"
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
          </div>
          {attendanceError ? (
            <div
              className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
              role="alert"
            >
              <div className="flex items-center justify-between gap-3">
                <span>{attendanceError}</span>
                <button
                  type="button"
                  onClick={loadAttendance}
                  className="shrink-0 rounded-full border border-rose-300 bg-white px-4 py-1.5 font-medium transition-colors duration-200 hover:bg-rose-100"
                >
                  重试
                </button>
              </div>
            </div>
          ) : attendanceLoading && !attendance ? (
            <div
              className="mt-5 grid min-h-[240px] place-items-center text-sm text-slate-500"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2.5">
                <Loader2 size={18} className="animate-spin text-brand-500" aria-hidden="true" />
                正在统计打卡与学习时长…
              </div>
            </div>
          ) : attendance ? (
            <>
              <div className="lm-stagger mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="参与学生数"
                  value={attendance.summary.studentCount}
                  icon={Users}
                  countUpTo={attendance.summary.studentCount}
                />
                <Metric
                  label="已打卡学生数"
                  value={attendance.summary.checkedInStudentCount}
                  icon={CalendarCheck}
                  tone="green"
                  countUpTo={attendance.summary.checkedInStudentCount}
                />
                <Metric
                  label="总打卡人次"
                  value={attendance.summary.checkInTotal}
                  icon={CalendarDays}
                  tone="amber"
                  countUpTo={attendance.summary.checkInTotal}
                />
                <Metric
                  label="总学习时长"
                  value={minutesLabel(attendance.summary.studyMinutesTotal)}
                  icon={Clock}
                  tone="slate"
                />
              </div>
              <div className="mt-5 h-60">
                <ChartOnView minHeightClass="h-full">
                  {hasTrend ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartDays} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
                        <CartesianGrid stroke="#EAE8E3" strokeDasharray="2 4" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          interval={zoomed ? "preserveStartEnd" : 4}
                          tick={{ fontSize: 11, fill: "#8A867E" }}
                          tickLine={false}
                          axisLine={{ stroke: "#D8D5CE" }}
                        />
                        <YAxis
                          yAxisId="left"
                          allowDecimals={false}
                          domain={[0, checkInMax]}
                          ticks={checkInTicks}
                          tick={{ fontSize: 11, fill: "#8A867E" }}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                          tickFormatter={(value) => `${value}人`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          domain={[0, axisTop]}
                          ticks={yTicks}
                          tick={{ fontSize: 11, fill: "#8A867E" }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                          tickFormatter={(value) => (axisTop <= 90 ? `${value}分` : `${value / 60}h`)}
                        />
                        <Tooltip
                          content={<StudyTooltip />}
                          cursor={{ stroke: "#A0DFC9", strokeDasharray: "3 3" }}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="checkInCount"
                          name="打卡人数"
                          stroke="var(--lm-brand)"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: "var(--lm-surface)", stroke: "var(--lm-brand)", strokeWidth: 2 }}
                          activeDot={{
                            r: 5,
                            fill: "var(--lm-brand)",
                            stroke: "var(--lm-surface)",
                            strokeWidth: 2,
                          }}
                          shape={LineDrawShape}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="studyMinutes"
                          name="学习时长"
                          stroke="var(--lm-text-muted)"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4, fill: "#64748B", stroke: "#fff", strokeWidth: 2 }}
                          shape={LineDrawShape}
                        />
                        <Brush
                          dataKey="date"
                          height={20}
                          stroke="var(--lm-brand)"
                          fill="var(--lm-brand-soft)"
                          onChange={(range) => {
                            const start = range?.startIndex ?? 0;
                            const end = range?.endIndex ?? Math.max(0, chartDays.length - 1);
                            setBrushRange({ startIndex: start, endIndex: end });
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center rounded-md bg-slate-50 text-center text-sm text-slate-500">
                      <div>
                        <div className="font-medium text-slate-700">暂无打卡与学习时长记录</div>
                        <p className="mt-1 text-xs">最近 30 天内还没有学生打卡或产生学习时长</p>
                      </div>
                    </div>
                  )}
                </ChartOnView>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-100" data-reveal>
                {sortedStudents.length ? (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="p-4">学生</th>
                        <th>班级</th>
                        <th>
                          <button
                            type="button"
                            onClick={() => toggleSort("checkInDays")}
                            className="inline-flex items-center gap-1 transition-colors hover:text-slate-800"
                          >
                            30 天打卡 {sortIcon("checkInDays")}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            onClick={() => toggleSort("studyMinutes")}
                            className="inline-flex items-center gap-1 transition-colors hover:text-slate-800"
                          >
                            学习时长 {sortIcon("studyMinutes")}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedStudents.map((item, index) => (
                        <tr
                          key={item.studentId}
                          onClick={() => navigate(`/students/${item.studentId}`)}
                          style={{ "--i": index } as React.CSSProperties}
                          className="teacher-row-in cursor-pointer hover:bg-brand-50/40"
                        >
                          <td className="p-4">
                            <div className="font-medium">{item.displayName}</div>
                            <div className="text-xs text-slate-400">{item.username}</div>
                          </td>
                          <td className="text-slate-600">{item.className || "暂无班级"}</td>
                          <td className="font-medium tabular-nums text-slate-700">
                            {item.checkInDays > 0 ? `${item.checkInDays} 天` : "—"}
                          </td>
                          <td className="min-w-[180px] pr-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="whitespace-nowrap tabular-nums text-slate-700">
                                {item.studyMinutes > 0 ? minutesLabel(item.studyMinutes) : "—"}
                              </span>
                              {maxMinutes > 0 && item.studyMinutes > 0 && (
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-brand-500"
                                    style={{
                                      width: `${Math.round((item.studyMinutes / maxMinutes) * 100)}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">暂无学生数据</p>
                )}
              </div>
            </>
          ) : null}
        </section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="mb-5 flex gap-3 rounded-2xl border bg-white p-4"
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border px-3">
            <Search size={16} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              maxLength={100}
              placeholder="姓名或用户名"
              className="w-full py-2.5 outline-none"
            />
          </div>
          <select
            value={riskLevel}
            onChange={(e) => setRisk(e.target.value)}
            className="rounded-xl border px-3"
          >
            <option value="">全部风险</option>
            <option value="high">高风险</option>
            <option value="medium">中风险</option>
            <option value="low">低风险</option>
          </select>
          <button className="rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white">筛选</button>
        </form>
        <State loading={loading} error={error} empty={!data.length}>
          <div className="overflow-hidden rounded-2xl border bg-white" data-reveal>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-4">学生</th>
                  <th>班级/课程</th>
                  <th>测验</th>
                  <th>路径</th>
                  <th>最近活动</th>
                  <th>风险</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((item, index) => (
                  <tr
                    key={item.studentId}
                    onClick={() => navigate(`/students/${item.studentId}`)}
                    style={{ "--i": index } as React.CSSProperties}
                    className="teacher-row-in cursor-pointer hover:bg-brand-50/40"
                  >
                    <td className="p-4">
                      <div className="font-medium">{item.displayName}</div>
                      <div className="text-xs text-slate-400">{item.username}</div>
                    </td>
                    <td>
                      <div>{item.className}</div>
                      <div className="text-xs text-slate-400">{item.currentCourse || "暂无课程"}</div>
                    </td>
                    <td>{pct(item.recentQuizAccuracy)}</td>
                    <td>{pct(item.pathProgress)}</td>
                    <td className="text-xs text-slate-500">{fmt(item.lastActivityAt)}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${item.risk.level === "high" ? "bg-rose-50 text-rose-700" : item.risk.level === "medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                      >
                        {item.risk.level}
                      </span>
                      <div className="mt-1 max-w-xs text-[11px] text-slate-400">{item.risk.reasons[0]}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t p-4 text-xs text-slate-500">
              <span>共 {pagination.total} 名学生</span>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => load(pagination.page - 1)}
                  className="rounded border px-3 py-1 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  disabled={pagination.page * pagination.pageSize >= pagination.total}
                  onClick={() => load(pagination.page + 1)}
                  className="rounded border px-3 py-1 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </State>
      </RevealOnScroll>
    </>
  );
}
