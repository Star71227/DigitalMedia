import { DepthScene } from "./depth/DepthScene";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, RefreshCw } from "lucide-react";
import {
  describeApiError,
  getDailyStudyTime,
  getStudentAssessment,
  type StudentAssessment,
  type StudyTimeSummary,
} from "../api";
import { Carrier, labelProps } from "./motion/Motion";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";
import { CountUp } from "../components/effects/CountUp";

interface Props {
  onNavigateToTab: (tab: string, data?: unknown) => void;
}

export default function BlueprintReportView({ onNavigateToTab }: Props) {
  const [assessment, setAssessment] = useState<StudentAssessment | null>(null);
  const [studyTime, setStudyTime] = useState<StudyTimeSummary | null>(null);
  const [error, setError] = useState("");
  const [periodDays, setPeriodDays] = useState<7 | 30>(7);

  const load = async (days = periodDays) => {
    setError("");
    const [assessmentResult, studyResult] = await Promise.allSettled([
      getStudentAssessment(),
      getDailyStudyTime(days),
    ]);
    if (assessmentResult.status === "fulfilled") setAssessment(assessmentResult.value);
    else setError(describeApiError(assessmentResult.reason, "学习报告读取失败"));
    if (studyResult.status === "fulfilled") setStudyTime(studyResult.value);
  };

  useEffect(() => {
    void load(periodDays);
  }, [periodDays]);

  const days = useMemo(() => {
    const source = studyTime?.days.slice(-periodDays) || [];
    return source.length
      ? source
      : Array.from({ length: periodDays }, (_, index) => ({ date: `D${index + 1}`, minutes: 0 }));
  }, [periodDays, studyTime]);
  const maxMinutes = Math.max(120, ...days.map((day) => day.minutes));
  // 折线图高度压到 250：给右侧的雷达/错误分布腾出空间，页面整体更协调
  const chartHeight = 250;
  const chartBaseline = 196;
  const points = days.map((day, index) => ({
    x: 60 + index * (840 / Math.max(1, days.length - 1)),
    y: chartBaseline - (day.minutes / maxMinutes) * 146,
    ...day,
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const periodLabel = formatPeriodLabel(days, periodDays);
  const mastery = assessment?.metrics.overallMastery ?? 0;
  const mistakeCounts = [
    assessment?.errorPatterns.length ?? 0,
    assessment?.weaknesses.length ?? 0,
    assessment?.risks.length ?? 0,
  ];
  const mistakeTotal = Math.max(
    1,
    mistakeCounts.reduce((sum, value) => sum + value, 0),
  );
  const masteryBySubject = useMemo(() => {
    const grouped = new Map<string, number[]>();
    assessment?.mastery.forEach((item) =>
      grouped.set(item.subject, [...(grouped.get(item.subject) || []), item.mastery ?? 0]),
    );
    return Array.from(grouped, ([subject, values]) => ({
      subject,
      value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    })).slice(0, 5);
  }, [assessment]);
  /** 雷达图：取练习次数最多的 6 个知识点，形状能反映强弱分布。 */
  const radarPoints = useMemo(() => {
    const rows = [...(assessment?.mastery || [])]
      .filter((item) => item.mastery != null)
      .sort((a, b) => (b.practiceCount || 0) - (a.practiceCount || 0))
      .slice(0, 6);
    return rows.map((item) => ({
      label: item.knowledgePoint,
      value: Math.max(0, Math.min(100, Math.round(item.mastery ?? 0))),
    }));
  }, [assessment]);
  /** 柱状图：各知识点掌握度（按练习量取前 8 个）。 */
  const barPoints = useMemo(() => {
    const rows = [...(assessment?.mastery || [])]
      .filter((item) => item.mastery != null)
      .sort((a, b) => (b.practiceCount || 0) - (a.practiceCount || 0))
      .slice(0, 8);
    return rows.map((item) => ({
      label: item.knowledgePoint,
      value: Math.max(0, Math.min(100, Math.round(item.mastery ?? 0))),
      count: item.practiceCount || 0,
    }));
  }, [assessment]);
  /** 饼图（环形）：错误类型分布。errorPatterns 的 text 形如「知识点：错误类型」，这里按错误类型聚合。 */
  const errorSlices = useMemo(() => {
    const grouped = new Map<string, number>();
    (assessment?.errorPatterns || []).forEach((item) => {
      const parts = String(item.text || "").split("：");
      const raw = (parts[1] || parts[0] || "未知").trim() || "未知";
      const type = errorTypeLabel(raw);
      grouped.set(type, (grouped.get(type) || 0) + 1);
    });
    return [...grouped.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [assessment]);

  return (
    <section className="bp-page bp-report-page">
      <BlueprintMotif variant="squares" />
      <BlueprintHeader title="学习报告" english="LEARNING REPORT" />

      <div className="bp-report-title">
        <div>
          <span>LEARNING REPORT</span>
          <h2>学习报告</h2>
          <p>
            {periodLabel} · {periodDays === 7 ? "本周学习概览" : "近 30 天学习概览"}
          </p>
        </div>
        <div className="bp-report-actions">
          <button onClick={() => setPeriodDays((value) => (value === 7 ? 30 : 7))}>
            <RefreshCw />
            切换至近 {periodDays === 7 ? 30 : 7} 天
          </button>
          <button onClick={() => window.print()}>
            <Download />
            导出
          </button>
        </div>
      </div>

      {error && <div className="bp-inline-error">{error}</div>}

      <div className="bp-report-summary">
        <div>
          <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">
            {periodDays === 7 ? "本周" : "近 30 天"}专注时长 <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">TOTAL FOCUS</small>
          </span>
          <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F05" data-mg-behavior="reveal">
            <CountUp to={totalMinutes} duration={0.32} />
            <i>分钟</i>
          </strong>
        </div>
        <div>
          <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">
            综合掌握度 <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">MASTERY</small>
          </span>
          <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F05" data-mg-behavior="reveal">
            <CountUp to={Math.round(mastery)} duration={0.32} />
            <i>%</i>
          </strong>
        </div>
        <div>
          <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">
            路径完成度 <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">PATH PROGRESS</small>
          </span>
          <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F05" data-mg-behavior="reveal">
            <CountUp to={Math.round(assessment?.metrics.pathProgress ?? 0)} duration={0.32} />
            <i>%</i>
          </strong>
        </div>
      </div>

      <div className="bp-report-grid">
        <div className="bp-report-grid__main">
          <section className="bp-report-chart bp-report-chart--daily">
            <header>
              <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">每日学习时长</strong>
              <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">DAILY FOCUS</span>
            </header>
            {/* 描线入场:deps 挂 days(useMemo 稳定引用),7/30 天切换与数据到达都会杀旧重播 */}
            <div>
              <svg
                viewBox={`0 0 980 ${chartHeight}`}
                role="img"
                aria-label={`近 ${periodDays} 天每日学习时长折线图`}
              >
                <defs>
                  <linearGradient id="bp-chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#058ee8" stopOpacity=".26" />
                    <stop offset="1" stopColor="#058ee8" stopOpacity="0" />
                  </linearGradient>
                  <filter id="bp-line-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {[50, 98, 146, 194].map((y) => (
                  <line key={y} x1="40" x2="940" y1={y} y2={y} className="bp-chart-grid" />
                ))}
                <path
                  d={`${points.length ? `M ${points[0].x} ${chartBaseline + 16} L ${polyline.replaceAll(" ", " L ")} L ${points.at(-1)?.x} ${chartBaseline + 16} Z` : ""}`}
                  fill="url(#bp-chart-fill)"
                />
                <polyline
                  points={polyline}
                  className="bp-chart-line bp-chart-line--glow"
                  filter="url(#bp-line-glow)"
                />
                <polyline points={polyline} className="bp-chart-line mg-draw" pathLength="1" />
                {points.map((point, index) => (
                  <g key={point.date}>
                    <line
                      x1={point.x}
                      x2={point.x}
                      y1={point.y}
                      y2={chartBaseline + 16}
                      className="bp-chart-drop"
                    />
                    <circle cx={point.x} cy={point.y} r={periodDays === 7 ? 6 : 4} />
                    {shouldLabelPoint(index, points.length) && (
                      <text x={point.x} y={Math.max(14, point.y - 14)} data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
                        {point.minutes}
                      </text>
                    )}
                    {shouldLabelPoint(index, points.length) && (
                      <text x={point.x} y={chartHeight - 12} className="bp-chart-date" data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
                        {formatDay(point.date)}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
          </section>

          <section className="bp-report-chart bp-report-chart--bars">
            <header>
              <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">各知识点掌握度</strong>
              <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">MASTERY BY POINT</span>
            </header>
            <BarChart points={barPoints} />
          </section>
        </div>

        <div className="bp-report-grid__side">
          <section className="bp-report-chart bp-report-chart--radar">
            <Carrier shape="snow" className="mg-report-snow" />
            <header>
              <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">知识点掌握雷达</strong>
              <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">MASTERY RADAR</span>
            </header>
            <RadarChart points={radarPoints} />
          </section>
          <section className="bp-report-chart bp-report-chart--donut">
            <header>
              <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">错误类型分布</strong>
              <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">ERROR MIX</span>
            </header>
            <DonutChart slices={errorSlices} />
          </section>
        </div>
      </div>

      <div className="bp-report-detail">
        <section>
          <header>
            <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">知识点掌握度</strong>
            <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">MASTERY LEVEL</span>
          </header>
          {(masteryBySubject.length ? masteryBySubject : [{ subject: "暂无课程数据", value: 0 }]).map(
            (item) => (
              <div className="bp-report-bar" key={item.subject}>
                <span data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">{item.subject}</span>
                <i>
                  <b style={{ width: `${item.value}%` }} />
                </i>
                <strong>{item.value}</strong>
              </div>
            ),
          )}
        </section>
        <section>
          <header>
            <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">错误分布</strong>
            <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">MISTAKE DISTRIBUTION</span>
          </header>
          <div className="bp-mistake-stack">
            {mistakeCounts.map((value, index) => (
              <i key={index} style={{ width: `${(value / mistakeTotal) * 100}%` }} />
            ))}
          </div>
          <div className="bp-mistake-labels">
            <span data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
              <b>{mistakeCounts[0]}</b>概念理解
            </span>
            <span data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
              <b>{mistakeCounts[1]}</b>边界条件
            </span>
            <span data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
              <b>{mistakeCounts[2]}</b>执行策略
            </span>
          </div>
        </section>
        <section className="bp-insight">
          <header>
            <strong data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">本周洞察</strong>
            <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">INSIGHTS</span>
          </header>
          <p>{assessment?.recommendations[0]?.text || "完成一次能力检测后，这里会显示下一条学习建议。"}</p>
          <button onClick={() => onNavigateToTab("path")}>
            查看更新后的路径
            <span className="bp-arrow-chip" aria-hidden="true" {...labelProps("B", "ring", "attach")} data-level="B" data-carrier="ring" data-enter="attach" data-family="F02" data-mg-behavior="reveal">
              <ArrowRight />
            </span>
          </button>
        </section>
      </div>
      <DepthScene variant="sheet" section="SECTION 06" title={["REPORT", `${periodDays}D`]}
        caption="ASSESSMENT / 学习报告"
        meta={assessment?.metrics.quiz?.averageAccuracy != null ? `ACC ${Math.round(assessment.metrics.quiz.averageAccuracy)}%` : undefined} />
    </section>
  );
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  concept_misunderstanding: "概念理解偏差",
  procedure_confusion: "步骤顺序错误",
  implementation_error: "实现细节错误",
  formula_misuse: "公式/条件误用",
  mirror_confusion: "相似概念混淆",
  boundary_condition: "边界条件遗漏",
  calculation_error: "计算失误",
  unknown: "未归类错误",
};

function errorTypeLabel(value: string) {
  return ERROR_TYPE_LABELS[value] || value;
}

interface RadarPoint {
  label: string;
  value: number;
}

/** 知识点掌握度雷达图：纯 SVG 手绘，避免为此引入图表库。 */
function RadarChart({ points }: { points: RadarPoint[] }) {
  const data =
    points.length >= 3
      ? points
      : [
          ...points,
          ...Array.from({ length: Math.max(0, 3 - points.length) }, (_, index) => ({
            label: `待补充${index + 1}`,
            value: 0,
          })),
        ];
  const size = 320;
  const center = size / 2;
  const radius = 118;
  const rings = [0.25, 0.5, 0.75, 1];
  const angleAt = (index: number) => (Math.PI * 2 * index) / data.length - Math.PI / 2;
  const pointAt = (index: number, ratio: number) => [
    center + Math.cos(angleAt(index)) * radius * ratio,
    center + Math.sin(angleAt(index)) * radius * ratio,
  ];
  const polygon = data
    .map((item, index) => pointAt(index, Math.max(0.04, item.value / 100)).join(","))
    .join(" ");
  const ringPolygons = rings.map((ratio) =>
    data.map((_, index) => pointAt(index, ratio).join(",")).join(" "),
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="知识点掌握度雷达图">
      <defs>
        <radialGradient id="bp-radar-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#058ee8" stopOpacity=".42" />
          <stop offset="100%" stopColor="#058ee8" stopOpacity=".14" />
        </radialGradient>
      </defs>
      {ringPolygons.map((ring, index) => (
        <polygon key={index} points={ring} className="bp-radar-ring" />
      ))}
      {data.map((item, index) => {
        const [x, y] = pointAt(index, 1);
        return <line key={item.label} x1={center} y1={center} x2={x} y2={y} className="bp-radar-axis" />;
      })}
      <polygon points={polygon} fill="url(#bp-radar-fill)" stroke="#058ee8" strokeWidth="2" />
      {data.map((item, index) => {
        const [x, y] = pointAt(index, Math.max(0.04, item.value / 100));
        return <circle key={`${item.label}-dot`} cx={x} cy={y} r="4" className="bp-radar-dot" />;
      })}
      {data.map((item, index) => {
        const [x, y] = pointAt(index, 1.18);
        return (
          <text
            key={`${item.label}-label`}
            x={x}
            y={y}
            className="bp-radar-label"
            textAnchor={x < center - 6 ? "end" : x > center + 6 ? "start" : "middle"} data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist"
          >
            <tspan x={x} dy="0">
              {item.label.length > 8 ? `${item.label.slice(0, 7)}…` : item.label}
            </tspan>
            <tspan x={x} dy="13" className="bp-radar-value" data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
              {item.value}%
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

interface DonutSlice {
  label: string;
  value: number;
}

const DONUT_COLORS = ["#086fe7", "#0aa27e", "#d99419", "#b8402a", "#8b5cf6", "#0ea5b7"];

/** 错误类型分布环形图：中心显示总次数，右侧图例标注占比。 */
function DonutChart({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  if (!total)
    return <p className="bp-report-empty">当前没有错误记录，完成一次测验后这里会显示错误类型分布。</p>;
  const radius = 78;
  const stroke = 26;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="bp-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label="错误类型分布环形图">
        <g transform="rotate(-90 100 100)">
          {slices.map((item, index) => {
            const length = (item.value / total) * circumference;
            const circle = (
              <circle
                key={item.label}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return circle;
          })}
        </g>
        <text x="100" y="96" className="bp-donut-total" textAnchor="middle" data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
          {total}
        </text>
        <text x="100" y="118" className="bp-donut-caption" textAnchor="middle" data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
          次错误记录
        </text>
      </svg>
      <ul className="bp-donut-legend" data-level="B" data-carrier="rail" data-enter="persist" data-family="F06" data-mg-behavior="persist" data-mg-container="">
        {slices.map((item, index) => (
          <li key={item.label}>
            <i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <span data-level="B" data-carrier="tab" data-enter="persist" data-family="F06" data-mg-behavior="persist">{item.label}</span>
            <b data-level="B" data-carrier="tab" data-enter="persist" data-family="F06" data-mg-behavior="persist">{Math.round((item.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 各知识点掌握度柱状图：低于 60% 用暖色，突出薄弱点。 */
function BarChart({ points }: { points: Array<RadarPoint & { count?: number }> }) {
  if (!points.length) return <p className="bp-report-empty">还没有知识点掌握度记录。</p>;
  const width = 640;
  const height = 260;
  const padding = { left: 44, right: 20, top: 18, bottom: 46 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const slot = innerWidth / points.length;
  const barWidth = Math.min(46, slot * 0.55);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="各知识点掌握度柱状图">
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = padding.top + innerHeight - (tick / 100) * innerHeight;
        return (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="bp-chart-grid" />
            <text x={padding.left - 8} y={y + 4} className="bp-bar-tick" textAnchor="end">
              {tick}
            </text>
          </g>
        );
      })}
      {points.map((item, index) => {
        const barHeight = Math.max(2, (item.value / 100) * innerHeight);
        const x = padding.left + slot * index + (slot - barWidth) / 2;
        const y = padding.top + innerHeight - barHeight;
        return (
          <g key={item.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              className={item.value < 60 ? "bp-bar is-weak" : "bp-bar"}
            />
            <text x={x + barWidth / 2} y={y - 6} className="bp-bar-value" textAnchor="middle" data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist">
              {item.value}
            </text>
            <text
              x={x + barWidth / 2}
              y={height - padding.bottom + 18}
              className="bp-bar-label"
              textAnchor="middle" data-level="B" data-carrier="tab" data-enter="persist" data-family="F07" data-mg-behavior="persist"
            >
              {item.label.length > 6 ? `${item.label.slice(0, 5)}…` : item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function shouldLabelPoint(index: number, total: number) {
  return total <= 10 || index === 0 || index === total - 1 || index % 5 === 0;
}

function formatPeriodLabel(days: Array<{ date: string }>, periodDays: number) {
  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  if (!first || !last || first.startsWith("D") || last.startsWith("D")) return `近 ${periodDays} 天`;
  return `${formatDay(first)}—${formatDay(last)}`;
}
