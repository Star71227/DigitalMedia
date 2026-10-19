/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { ReportItem } from "../types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { errorTypeLabel } from "../lib/errorLabels";
import { fmt, pct } from "./Ui";

export const riskLabel = (level?: string) =>
  ({ high: "重点关注", medium: "持续关注", low: "常规跟进" })[level || ""] || "待评估";

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  study_note: "个性化讲义",
  mind_map: "思维导图",
  pptx: "学习课件",
  quiz_pack: "智能练习包",
  code_case: "代码实操案例",
};
const resourceTypeLabel = (type: string) => RESOURCE_TYPE_LABELS[type] || type || "其他资源";
const COMPLETION_TYPE_LABELS: Record<string, string> = {
  quiz: "测验达标",
  resource: "完成资源学习",
  codelab: "通过代码练习",
};
const STAGE_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  in_progress: "进行中",
  pending: "待开始",
};
const DISTRIBUTION_COLORS = ["#3c8b76", "#6491bb", "#bf9239", "#bd565b"];
const ERROR_COLORS = ["#bd565b", "#bf9239", "#6491bb", "#7a6bb5", "#3c8b76", "#89939c", "#c07f4f"];
const RESOURCE_COLORS = ["#086fe7", "#3c8b76", "#bf9239", "#7a6bb5", "#bd565b"];

/** 知识点较多时按掌握度均匀抽样，让雷达图既覆盖薄弱项也覆盖优势项。 */
function sampleEvenly<T>(items: T[], limit = 8): T[] {
  if (items.length <= limit) return items;
  const step = (items.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => items[Math.round(index * step)]);
}

export function AssessmentReport({ item }: { item: ReportItem }) {
  const r = item.report;
  if (!r) return <p>该报告尚无可用内容。</p>;
  const knowledgePoints = r.knowledgePoints || [];
  const radarPoints = sampleEvenly(knowledgePoints, 8).map((point) => ({
    ...point,
    name: point.knowledgePoint,
  }));
  const accuracySlices = (r.quizAnalysis?.accuracyDistribution || [])
    .filter((bucket) => bucket.count > 0)
    .map((bucket, index) => ({
      name: bucket.label,
      value: bucket.count,
      color: DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length],
    }));
  const attemptTrend = [...(r.quizAnalysis?.recentAttempts || [])]
    .reverse()
    .map((attempt, index) => ({
      name: `第 ${index + 1} 次`,
      accuracy:
        attempt.accuracy === null || attempt.accuracy === undefined
          ? 0
          : Math.round(attempt.accuracy * 10) / 10,
      subject: attempt.subject || "—",
      correctCount: attempt.correctCount,
      totalCount: attempt.totalCount,
    }));
  const errorSlices = (r.errorProfile?.typeBreakdown || []).map((entry, index) => ({
    name: errorTypeLabel(entry.errorType),
    value: entry.occurrenceCount,
    color: ERROR_COLORS[index % ERROR_COLORS.length],
  }));
  const errorTotal = errorSlices.reduce((sum, slice) => sum + slice.value, 0);
  const resourceRows = (r.resourceAnalysis?.typeBreakdown || []).map((entry, index) => ({
    name: resourceTypeLabel(entry.type),
    total: entry.total,
    completed: entry.completed,
    pending: Math.max(0, entry.total - entry.completed),
    color: RESOURCE_COLORS[index % RESOURCE_COLORS.length],
  }));
  const stages = r.pathAnalysis?.stages || [];
  const completedStages = stages.filter((stage) => stage.status === "completed").length;
  return (
    <article className="assessment-paper">
      <header className="assessment-cover">
        <span className="assessment-kicker">智课研伴 / LEARNING ASSESSMENT</span>
        <div className="assessment-heading">
          <div>
            <h2>{r.student?.displayName || item.studentName} · 学习评估报告</h2>
            <p>
              最近 {item.rangeDays} 天 · V{item.reportVersion} · {r.student?.className || "学习档案"}
            </p>
          </div>
          <span className={`assessment-risk risk-${r.riskAssessment?.level}`}>
            {riskLabel(r.riskAssessment?.level)}
          </span>
        </div>
      </header>
      <section className="assessment-summary">
        <h3>01 / 评估结论</h3>
        <p>{r.executiveSummary || "本报告记录生成时的学习状态，请结合下方指标与风险依据进行评估。"}</p>
        <div className="assessment-metrics">
          {[
            ["测验正确率", pct(r.quizAnalysis?.averageAccuracy)],
            ["平均掌握度", pct(r.masteryAnalysis?.averageMastery)],
            ["路径进度", pct(r.pathAnalysis?.progress)],
            ["测验提交", `${r.quizAnalysis?.attemptCount ?? "—"} 次`],
            [
              "已掌握知识点",
              `${r.masteryAnalysis?.masteredCount ?? "—"} / ${r.masteryAnalysis?.knowledgePointCount ?? knowledgePoints.length}`,
            ],
            [
              "资源完成",
              `${r.resourceAnalysis?.completedCount ?? "—"} / ${r.resourceAnalysis?.resourceCount ?? "—"}`,
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <p className="assessment-note">
          作答 {r.evidence?.answeredCount ?? "—"} 题 · 答对 {r.evidence?.correctCount ?? "—"} 题 · 待巩固{" "}
          {r.masteryAnalysis?.developingCount ?? r.evidence?.developingCount ?? "—"} 个知识点 · 薄弱{" "}
          {r.masteryAnalysis?.weakCount ?? r.evidence?.weakCount ?? "—"} 个 · 检索{" "}
          {r.ragActivity?.retrievalCount ?? "—"} 次 · 引用作答 {r.ragActivity?.citationAnswerCount ?? "—"} 次
        </p>
      </section>

      <section>
        <h3>02 / 当前学习进度</h3>
        <div className="assessment-grid">
          <div className="assessment-panel">
            <h4>
              学习路径阶段推进（{completedStages} / {stages.length || r.pathAnalysis?.stageCount || 0}{" "}
              阶段已完成）
            </h4>
            {stages.length ? (
              <div className="assessment-stages">
                {stages.map((stage, index) => (
                  <div
                    key={stage.key || index}
                    className={`assessment-stage assessment-stage--${stage.status}`}
                  >
                    <span className="assessment-stage__index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="assessment-stage__body">
                      <p className="assessment-stage__title">{stage.title || `阶段 ${index + 1}`}</p>
                      <div className="assessment-track">
                        <i style={{ width: `${Math.max(0, Math.min(100, stage.progress))}%` }} />
                      </div>
                      <small>
                        {STAGE_STATUS_LABELS[stage.status] || stage.status} · 验收方式：
                        {COMPLETION_TYPE_LABELS[stage.completionType || ""] || "待配置"}
                        {stage.evidenceCount ? ` · ${stage.evidenceCount} 项证据` : ""}
                        {stage.durationMinutes ? ` · 建议 ${stage.durationMinutes} 分钟` : ""}
                        {stage.completedAt ? ` · 完成于 ${fmt(stage.completedAt)}` : ""}
                      </small>
                      {stage.goals?.length ? (
                        <ul className="assessment-stage__goals">
                          {stage.goals.slice(0, 3).map((goal) => (
                            <li key={goal}>{goal}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <strong className="assessment-stage__value">{pct(stage.progress)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="assessment-note">
                该周期内没有可解析的学习路径快照，建议先为学生生成个性化学习路径。
              </p>
            )}
          </div>
          <div className="assessment-panel">
            <h4>资源学习完成情况</h4>
            {resourceRows.length ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={resourceRows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value} 个资源`,
                        name === "completed" ? "已完成" : "待完成",
                      ]}
                    />
                    <Legend formatter={(value: string) => (value === "completed" ? "已完成" : "待完成")} />
                    <Bar dataKey="completed" stackId="resource" barSize={34}>
                      {resourceRows.map((row) => (
                        <Cell key={`c-${row.name}`} fill="#3c8b76" />
                      ))}
                    </Bar>
                    <Bar dataKey="pending" stackId="resource" barSize={34}>
                      {resourceRows.map((row) => (
                        <Cell key={`p-${row.name}`} fill="#dfe5ea" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="assessment-note">
                  共{" "}
                  {r.resourceAnalysis?.resourceCount ?? resourceRows.reduce((sum, row) => sum + row.total, 0)}{" "}
                  个资源 · 已完成{" "}
                  {r.resourceAnalysis?.completedCount ??
                    resourceRows.reduce((sum, row) => sum + row.completed, 0)}{" "}
                  个 · 进行中 {r.resourceAnalysis?.inProgressCount ?? "—"} 个
                </p>
                <div className="assessment-knowledge assessment-knowledge--compact">
                  {resourceRows.map((row) => (
                    <div key={row.name}>
                      <span>{row.name}</span>
                      <div className="assessment-track">
                        <i
                          style={{
                            width: `${row.total ? Math.round((row.completed / row.total) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <strong>
                        {row.completed}/{row.total}
                      </strong>
                      <small>{row.pending ? `待完成 ${row.pending} 个` : "已全部完成"}</small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="assessment-note">
                该周期内没有资源学习记录。资源完成情况会随学生学习讲义 / 思维导图 / 练习包而更新。
              </p>
            )}
            <p className="assessment-note">
              画像版本 V{r.profileAnalysis?.currentVersion ?? "—"}（历史{" "}
              {r.profileAnalysis?.historyCount ?? 0} 版）· 路径版本 V{r.pathAnalysis?.currentVersion ?? "—"}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3>03 / 作答情况</h3>
        <div className="assessment-grid">
          <div className="assessment-panel">
            <h4>测验正确率分布</h4>
            {accuracySlices.length ? (
              <>
                <SlicePie slices={accuracySlices} unit="次" />
                <p className="assessment-note">
                  按每次提交的答对题数 / 作答题数归入区间，共 {r.quizAnalysis?.attemptCount ?? 0} 次提交、
                  {r.quizAnalysis?.answeredQuestionCount ?? r.evidence?.answeredCount ?? 0} 题作答。
                </p>
              </>
            ) : (
              <p className="assessment-note">该周期内没有测验提交记录。</p>
            )}
          </div>
          <div className="assessment-panel">
            <h4>最近 {attemptTrend.length || 0} 次测验正确率</h4>
            {attemptTrend.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={attemptTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(
                      value: number,
                      _name,
                      entry: { payload?: { subject?: string; correctCount?: number; totalCount?: number } },
                    ) => [
                      `${value}%（答对 ${entry?.payload?.correctCount ?? 0}/${entry?.payload?.totalCount ?? 0} 题）`,
                      entry?.payload?.subject || "测验",
                    ]}
                  />
                  <Bar dataKey="accuracy" fill="#086fe7" barSize={26} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="assessment-note">该周期内没有测验提交记录，无法观察正确率变化趋势。</p>
            )}
            <p className="assessment-note">图中按提交时间由早到晚排列，可看出本周期内的作答波动。</p>
          </div>
        </div>
        {(r.quizAnalysis?.recentAttempts || []).length ? (
          <div className="analytics-table assessment-table">
            <table>
              <thead>
                <tr>
                  <th>科目</th>
                  <th>提交时间</th>
                  <th>答对 / 作答</th>
                  <th>正确率</th>
                  <th>得分</th>
                </tr>
              </thead>
              <tbody>
                {r.quizAnalysis?.recentAttempts?.map((attempt, index) => (
                  <tr key={`${attempt.submittedAt || index}-${index}`}>
                    <td>{attempt.subject || "—"}</td>
                    <td>{fmt(attempt.submittedAt)}</td>
                    <td>
                      {attempt.correctCount} / {attempt.totalCount}
                    </td>
                    <td>{pct(attempt.accuracy)}</td>
                    <td>{attempt.score === null || attempt.score === undefined ? "—" : attempt.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section>
        <h3>04 / 知识点掌握程度</h3>
        <div className="assessment-grid">
          <div className="assessment-panel">
            <h4>掌握度雷达（按掌握度均匀取 {radarPoints.length} 个知识点）</h4>
            {radarPoints.length >= 3 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarPoints} outerRadius="70%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} angle={90} />
                    <Radar
                      name="掌握度"
                      dataKey="mastery"
                      stroke="#086fe7"
                      fill="#086fe7"
                      fillOpacity={0.28}
                    />
                    <Tooltip
                      formatter={(value: number, _name, entry: { payload?: { subject?: string } }) => [
                        `${Number(value).toFixed(1)}%`,
                        `${entry?.payload?.subject || ""}掌握度`.trim(),
                      ]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
                <p className="assessment-note">
                  外圈代表掌握度 100%，中心为 0%；网格每圈 25%。低于 60% 的知识点会在下方优先排出复习顺序。
                </p>
              </>
            ) : (
              <p className="assessment-note">
                知识点记录不足 3 个，暂不能绘制雷达图；建议先完成基础测验积累掌握度证据。
              </p>
            )}
          </div>
          <div className="assessment-panel">
            <h4>优势知识点（掌握度前 8）</h4>
            {(r.masteryAnalysis?.topMastery || []).length ? (
              <div className="assessment-knowledge">
                {r.masteryAnalysis?.topMastery?.map((point) => (
                  <div key={`${point.subject}-${point.knowledgePoint}`}>
                    <span>{point.knowledgePoint}</span>
                    <div className="assessment-track">
                      <i style={{ width: `${Math.max(0, Math.min(100, point.mastery))}%` }} />
                    </div>
                    <strong>{pct(point.mastery)}</strong>
                    <small>
                      练习 {point.practiceCount ?? "—"} 次 · 错 {point.wrongCount ?? "—"} 次
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="assessment-note">暂无达到优势标准的知识点记录。</p>
            )}
          </div>
        </div>
        <h4 className="assessment-subtitle">全部知识点掌握度（由低到高）</h4>
        {knowledgePoints.length ? (
          <div className="assessment-knowledge">
            {knowledgePoints.map((p) => (
              <div key={`${p.subject}-${p.knowledgePoint}`}>
                <span>{p.knowledgePoint}</span>
                <div className="assessment-track">
                  <i style={{ width: `${Math.max(0, Math.min(100, p.mastery))}%` }} />
                </div>
                <strong>{pct(p.mastery)}</strong>
                <small>{p.mastery >= 80 ? "掌握良好" : p.mastery >= 60 ? "继续巩固" : "优先复习"}</small>
              </div>
            ))}
          </div>
        ) : (
          <ReportSection
            title="薄弱点记录"
            items={r.weaknesses}
            empty="暂无知识点记录，建议先完成基础测验。"
          />
        )}
      </section>

      <section>
        <h3>05 / 薄弱点与错因分析</h3>
        <div className="assessment-grid">
          <div className="assessment-panel">
            <h4>待突破知识点清单</h4>
            <ReportSection
              title="掌握度低于 60% 的知识点"
              items={r.weaknesses}
              empty="本周期没有掌握度低于 60% 的知识点，可转向下一阶段难度。"
            />
            {(r.masteryAnalysis?.weakCount ?? 0) + (r.masteryAnalysis?.developingCount ?? 0) > 0 ? (
              <p className="assessment-note">
                薄弱 {r.masteryAnalysis?.weakCount ?? 0} 个 · 待巩固 {r.masteryAnalysis?.developingCount ?? 0}{" "}
                个 · 已掌握 {r.masteryAnalysis?.masteredCount ?? 0} 个
              </p>
            ) : null}
          </div>
          <div className="assessment-panel">
            <h4>错误类型分布</h4>
            {errorSlices.length ? (
              <>
                <SlicePie slices={errorSlices} unit="次" />
                <p className="assessment-note">
                  共 {errorTotal} 次错误记录 · {r.errorProfile?.patternCount ?? errorSlices.length}{" "}
                  个错误模式。错因占比最高的类型应优先在课堂上讲评。
                </p>
              </>
            ) : (
              <p className="assessment-note">暂无错因聚合记录。</p>
            )}
          </div>
        </div>
        {(r.errorProfile?.topPatterns || []).length ? (
          <div className="analytics-table assessment-table">
            <table>
              <thead>
                <tr>
                  <th>错误类型</th>
                  <th>关联知识点</th>
                  <th>出现次数</th>
                  <th>置信度</th>
                  <th>最近出现</th>
                </tr>
              </thead>
              <tbody>
                {r.errorProfile?.topPatterns?.map((pattern, index) => (
                  <tr key={`${pattern.errorType}-${pattern.knowledgePoint}-${index}`}>
                    <td>{errorTypeLabel(pattern.errorType)}</td>
                    <td>{pattern.knowledgePoint}</td>
                    <td>{pattern.occurrenceCount}</td>
                    <td>
                      {pattern.confidence === null || pattern.confidence === undefined
                        ? "—"
                        : `${Math.round(pattern.confidence * 100)}%`}
                    </td>
                    <td>{fmt(pattern.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section>
        <h3>06 / 推荐复习与学习规划</h3>
        {r.actionPlan?.length ? (
          <div className="assessment-plan">
            {r.actionPlan.map((p) => (
              <div key={p.priority}>
                <span className="assessment-step">{String(p.priority).padStart(2, "0")}</span>
                <div>
                  <h4>
                    {p.knowledgePoint}
                    {p.mastery === null || p.mastery === undefined ? "" : ` · 当前掌握度 ${pct(p.mastery)}`}
                  </h4>
                  <p>{p.action}</p>
                  <small>
                    {p.target} · {p.review}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ReportSection title="后续建议" items={r.recommendations} />
        )}
        {r.recommendations?.length ? (
          <div className="assessment-panel assessment-panel--inline">
            <h4>系统补充建议</h4>
            <ul>
              {r.recommendations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {r.progressHighlights?.length ? (
          <div className="assessment-panel assessment-panel--inline">
            <h4>周期内学习优势</h4>
            <ul>
              {r.progressHighlights.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="assessment-quality">
        <h3>07 / 数据范围与评估说明</h3>
        <p>{r.dataQuality?.note || "本报告依据生成时的数据快照展示，缺失记录不会被视为零分。"}</p>
        {r.dataQuality?.gaps?.map((g) => (
          <p key={g}>· {g}</p>
        ))}
        <details>
          <summary>查看数据版本与来源</summary>
          <p>
            画像 V{r.profileAnalysis?.currentVersion ?? "—"} · 路径 V{r.pathAnalysis?.currentVersion ?? "—"} ·
            风险依据 {r.riskAssessment?.reasons?.length ?? 0} 条 · 活跃记录 {r.summary?.activeRecords ?? "—"}{" "}
            条
          </p>
          <p>{r.dataSources?.join(" · ") || "历史报告未记录来源清单"}</p>
        </details>
      </section>
    </article>
  );
}
/** 实心饼图：占比数字画在扇形外侧（带指示线），避免压住扇形或与图例重叠。 */
function SlicePie({
  slices,
  unit,
  height = 320,
}: {
  slices: Array<{ name: string; value: number; color: string }>;
  unit: string;
  height?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const renderLabel = (props: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    percent?: number;
  }) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0 } = props;
    const radius = outerRadius + 22;
    const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180);
    const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180);
    return (
      <text
        x={x}
        y={y}
        fill="var(--lm-text-muted)"
        fontSize={11.5}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
      >{`${Math.round(percent * 100)}%`}</text>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 12, right: 28, bottom: 4, left: 28 }}>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cy="42%"
          outerRadius={80}
          labelLine={{ stroke: "#c9d2d9" }}
          label={renderLabel}
          stroke="none"
        >
          {slices.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          wrapperStyle={{ paddingTop: 22 }}
          formatter={(value: string) => value}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            `${value} ${unit}（占 ${total ? Math.round((value / total) * 100) : 0}%）`,
            name,
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
function ReportSection({
  title,
  items,
  empty = "暂无可用记录",
}: {
  title: string;
  items?: string[];
  empty?: string;
}) {
  return (
    <section className="assessment-inline-section">
      <h4>{title}</h4>
      {items?.length ? (
        <ul>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="assessment-note">{empty}</p>
      )}
    </section>
  );
}
