import { DepthScene } from "../components/depth/DepthScene";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { ClassAnalytics } from "../types";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { teacherApi } from "../api/teacher";
import { Metric, PageTitle, State, pct } from "../components/Ui";
import { navigate } from "../router";
const labels: Record<string, string> = {
  high: "重点关注",
  medium: "持续关注",
  low: "常规跟进",
  unknown: "未分类",
  procedure_confusion: "步骤混淆",
  concept_misunderstanding: "概念理解偏差",
  implementation_error: "实现错误",
  memory_confusion: "记忆混淆",
  boundary_condition: "边界条件遗漏",
  calculation_error: "计算失误",
  formula_misuse: "公式/条件误用",
  mirror_confusion: "相似概念混淆",
  condition_omission: "遗漏条件",
  ordering_error: "步骤顺序错误",
  terminology_misuse: "术语使用不当",
  careless_reading: "审题遗漏",
  time_management: "时间分配不当",
};
const colors: Record<string, string> = { high: "#bd565b", medium: "#bf9239", low: "#3c8b76" };
export function ClassAnalyticsPage({ classId }: { classId: number }) {
  const [data, setData] = useState<ClassAnalytics>(),
    [error, setError] = useState(""),
    [range, setRange] = useState("30d"),
    [keyword, setKeyword] = useState(""),
    [weakOnly, setWeakOnly] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError("");
    teacherApi
      .classAnalytics(classId, range)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, range]);
  const columns = data?.radar.map((p) => p.knowledgePoint) || [];
  const rows =
    data?.masteryMatrix.filter(
      (r) => r.displayName.includes(keyword) && (!weakOnly || r.values.some((v) => v.mastery < 60)),
    ) || [];
  const risks = (data?.riskDistribution || []).map((r) => ({ ...r, name: labels[r.level] }));
  return (
    <>
      <PageTitle
        title={data?.class.className || "班级学情"}
        description="定位共性薄弱点，追踪学习表现，安排分层教学"
        action={
          <select aria-label="趋势周期" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
            <option value="6w">最近 6 周</option>
          </select>
        }
      />
      <State loading={!data && !error} error={error} empty={data?.summary.studentCount === 0}>
        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="班级学生" value={data?.summary.studentCount || 0} />
          <Metric label="近 7 天活跃" value={data?.summary.activeStudentCount || 0} />
          <Metric label="累计测验正确率" value={pct(data?.summary.averageQuizAccuracy)} />
          <Metric label="当前路径进度" value={pct(data?.summary.averagePathProgress)} />
        </div>
        <p className="analytics-note">
          周期选择用于下方测验趋势；掌握度、风险及路径进度显示当前状态，测验汇总为累计记录。
        </p>
        <div className="analytics-grid">
          <Panel title="测验正确率趋势" note="按所选周期展示；无作答的日期不计为零分">
            {data?.trends?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "正确率"]} />
                  <Line type="monotone" dataKey="accuracy" stroke="var(--lm-brand)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel title="学生风险分布" note="结合测验、活跃度和知识点掌握记录判定">
            <div className="analytics-risk">
              {risks.some((r) => r.count > 0) && (
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie data={risks} dataKey="count" nameKey="name" innerRadius={58} outerRadius={88}>
                      {risks.map((r) => (
                        <Cell key={r.level} fill={colors[r.level]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} 人`, "学生数"]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div>
                {risks.map((r) => (
                  <p key={r.level}>
                    <i style={{ background: colors[r.level] }} />
                    {r.name}
                    <strong>{r.count} 人</strong>
                  </p>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="知识点雷达" note="以班级平均掌握度描绘学习轮廓，外圈代表 100%">
            <KnowledgeRadar points={data?.radar || []} />
          </Panel>
          <Panel title="常见错误类型" note="累计错误记录；未分类记录需结合具体答题过程核查">
            {data?.errorPatternDistribution.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={data.errorPatternDistribution.map((x) => ({ ...x, label: labels[x.name] || x.name }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} 次`, "错误次数"]} />
                  <Bar dataKey="value" fill="#bf9239" barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Panel>
        </div>
        <Panel title="知识点掌握度矩阵" note="A ≥80% · B 60–79% · C <60% · — 无记录。点击姓名查看学生档案。">
          <div className="analytics-toolbar">
            <input
              aria-label="搜索学生"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索学生姓名"
            />
            <label>
              <input type="checkbox" checked={weakOnly} onChange={(e) => setWeakOnly(e.target.checked)} />{" "}
              仅看存在薄弱点的学生
            </label>
            <small>
              {rows.length} 名学生 · {columns.length} 个知识点
            </small>
          </div>
          <div className="analytics-table mastery-table">
            <table>
              <thead>
                <tr>
                  <th>学生</th>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId}>
                    <th>
                      <button onClick={() => navigate(`/students/${r.studentId}`)}>{r.displayName}</button>
                    </th>
                    {columns.map((c) => {
                      const v = r.values.find((x) => x.knowledgePoint === c);
                      return (
                        <td key={c}>
                          <span
                            className={`mastery-cell grade-${v?.grade || "none"}`}
                            title={v ? `${c}：${pct(v.mastery)}` : `${c}：暂无记录`}
                          >
                            {v ? `${v.grade} ${Math.round(v.mastery)}%` : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty />}
          </div>
        </Panel>
      </State>
      <DepthScene variant="sheet" section="SECTION 03" title={["CLASS", "DATA"]}
        caption="CLASS ANALYTICS / 班级分析" meta={range === "6w" ? "6 WEEKS" : `${range.slice(0, -1)} DAYS`} />
    </>
  );
}
function Empty() {
  return <p className="analytics-empty">暂无符合条件的学习记录</p>;
}
function KnowledgeRadar({ points }: { points: ClassAnalytics["radar"] }) {
  const [page, setPage] = useState(0);
  const measured = points
    .filter((p) => p.mastery !== null && Number.isFinite(p.mastery))
    .sort((a, b) => Number(a.mastery) - Number(b.mastery));
  // Balanced groups keep labels legible without dropping knowledge points.
  const groupCount = Math.max(1, Math.ceil(measured.length / 8));
  const groupSize = Math.ceil(measured.length / groupCount);
  const currentPage = Math.min(page, groupCount - 1);
  const visible = measured.slice(currentPage * groupSize, (currentPage + 1) * groupSize);
  if (!measured.length) return <Empty />;
  return (
    <div className="knowledge-radar">
      <div className="knowledge-radar__meta">
        <span>
          <i />
          班级平均掌握度
        </span>
        <small>
          {measured.length} 个知识点
          {points.length > measured.length ? ` · ${points.length - measured.length} 项暂无记录` : ""}
        </small>
      </div>
      <div className="knowledge-radar__chart">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={visible} outerRadius="80%" margin={{ top: 28, right: 42, bottom: 28, left: 42 }}>
            <PolarGrid gridType="polygon" stroke="var(--lm-border)" />
            <PolarAngleAxis dataKey="knowledgePoint" tick={<RadarLabel />} tickLine={false} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              ticks={[20, 40, 60, 80, 100]}
              axisLine={false}
              tick={false}
            />
            <Radar
              name="班级平均掌握度"
              dataKey="mastery"
              stroke="var(--lm-brand)"
              strokeWidth={2}
              fill="var(--lm-brand)"
              fillOpacity={0.13}
              dot={{ r: 3, fill: "var(--lm-surface)", stroke: "var(--lm-brand)", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "var(--lm-brand)", stroke: "var(--lm-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Tooltip
              formatter={(value) => [pct(Number(value)), "班级平均掌握度"]}
              contentStyle={{
                background: "var(--lm-surface)",
                border: "1px solid var(--lm-border)",
                borderRadius: 2,
                color: "var(--lm-ink)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--lm-ink)", marginBottom: 6 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="knowledge-radar__footer">
        <small>
          {measured.length < 3
            ? "当前记录少于 3 项，待补充后可形成完整雷达轮廓。"
            : "越靠近外圈，掌握越充分；优先关注向内收缩的方向。"}
        </small>
        {groupCount > 1 && (
          <div>
            <button
              aria-label="上一组知识点"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ←
            </button>
            <span>
              第 {currentPage + 1} / {groupCount} 组
            </span>
            <button
              aria-label="下一组知识点"
              disabled={currentPage >= groupCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function RadarLabel({
  x = 0,
  y = 0,
  textAnchor,
  payload,
}: {
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end";
  payload?: { value?: string };
}) {
  const name = String(payload?.value || "");
  const lines =
    name.length <= 7
      ? [name]
      : [name.slice(0, 7), name.length > 14 ? `${name.slice(7, 13)}…` : name.slice(7)];
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill="var(--lm-text-muted)" fontSize={11}>
      <title>{name}</title>
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? (lines.length > 1 ? -3 : 3) : 15}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      <p className="analytics-note">{note}</p>
      {children}
    </section>
  );
}
