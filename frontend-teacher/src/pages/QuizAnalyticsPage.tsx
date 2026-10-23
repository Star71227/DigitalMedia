/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
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
import { teacherApi } from "../api/teacher";
import type { QuizAnalytics } from "../types";
import { Metric, PageTitle, State, fmt, pct } from "../components/Ui";
import { navigate } from "../router";
const OUTCOME_COLORS = { correct: "#3c8b76", wrong: "#bd565b" };
const DIFFICULTY_COLORS = ["#086fe7", "#6491bb", "#bf9239", "#bd565b"];
export function QuizAnalyticsPage() {
  const [data, setData] = useState<QuizAnalytics>(),
    [error, setError] = useState(""),
    [days, setDays] = useState(30),
    [page, setPage] = useState(1),
    [subject, setSubject] = useState(""),
    [draft, setDraft] = useState("");
  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError("");
    teacherApi
      .quizAnalytics({ rangeDays: days, page, pageSize: 10, subject })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [days, page, subject]);
  const maxWrong = Math.max(1, ...(data?.frequentWrongKnowledgePoints || []).map((p) => p.wrong_count));
  const radarPoints = data?.knowledgePointStats || [];
  const outcome = data?.answerOutcome || { total: 0, correct: 0, wrong: 0 };
  const outcomeSlices = [
    { name: "答对", value: outcome.correct, color: OUTCOME_COLORS.correct },
    { name: "答错", value: outcome.wrong, color: OUTCOME_COLORS.wrong },
  ].filter((slice) => slice.value > 0);
  const difficulties = data?.difficultyStats || [];
  return (
    <>
      <PageTitle
        title="测验进度与结果分析"
        description="观察答题分布，定位高频错误，为下一次课堂讲评提供依据"
      />
      <form
        className="analytics-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSubject(draft.trim());
          setPage(1);
        }}
      >
        <select
          aria-label="统计周期"
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setPage(1);
          }}
        >
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
          <option value={90}>最近 90 天</option>
        </select>
        <input
          aria-label="科目筛选"
          placeholder="输入科目名称，如：数据结构"
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit">筛选</button>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setSubject("");
            setPage(1);
          }}
        >
          重置
        </button>
        <small>按提交时间统计 · 正确率按实际作答题数加权</small>
      </form>
      <State loading={!data && !error} error={error}>
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="周期内测验提交" value={data?.summary.attemptCount || 0} />
          <Metric label="参与学生" value={data?.summary.participantCount || 0} />
          <Metric label="平均正确率" value={pct(data?.summary.averageAccuracy)} />
        </div>
        <p className="analytics-note">{data?.codeLab.message}</p>
        <div className="analytics-grid">
          <section className="analytics-panel">
            <h2>正确率分布</h2>
            <p className="analytics-note">每次提交按答对题数 / 作答题数归入对应区间</p>
            {data?.accuracyDistribution.length ? (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={data.accuracyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="score_range" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} 次`, "提交数"]} />
                  <Bar dataKey="count" barSize={40}>
                    {data.accuracyDistribution.map((r) => (
                      <Cell
                        key={r.score_range}
                        fill={
                          (
                            {
                              "0-49": "#bd565b",
                              "50-69": "#bf9239",
                              "70-84": "#6491bb",
                              "85-100": "#3c8b76",
                            } as Record<string, string>
                          )[r.score_range] || "#89939c"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="analytics-empty">所选周期暂无测验提交</p>
            )}
          </section>
          <section className="analytics-panel">
            <h2>高频错误知识点</h2>
            <p className="analytics-note">按错误次数排序；可据此安排知识点讲评与复测</p>
            {data?.frequentWrongKnowledgePoints.length ? (
              data.frequentWrongKnowledgePoints.map((p, i) => (
                <div className="quiz-wrong" key={p.knowledge_point}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{p.knowledge_point}</strong>
                    <div className="assessment-track">
                      <i style={{ width: `${(p.wrong_count / maxWrong) * 100}%` }} />
                    </div>
                  </div>
                  <small>{p.wrong_count} 次</small>
                </div>
              ))
            ) : (
              <p className="analytics-empty">暂无错误知识点记录</p>
            )}
          </section>
        </div>
        {/* 柱图下方的两块：知识点正确率雷达 + 答题结果构成饼图，数据都来自本班学生的逐题作答 */}
        <div className="analytics-grid">
          <section className="analytics-panel">
            <h2>知识点正确率雷达</h2>
            <p className="analytics-note">按答题量取前 8 个知识点，外圈代表 100% 正确率</p>
            {radarPoints.length >= 3 ? (
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarPoints} outerRadius="72%">
                  <PolarGrid />
                  <PolarAngleAxis dataKey="knowledgePoint" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} angle={90} />
                  <Radar
                    name="正确率"
                    dataKey="accuracy"
                    stroke="#086fe7"
                    fill="#086fe7"
                    fillOpacity={0.28}
                  />
                  <Tooltip
                    formatter={(v: number, _name, item: { payload?: { answerCount?: number } }) => [
                      `${Number(v).toFixed(1)}%（共 ${item?.payload?.answerCount ?? 0} 题作答）`,
                      "正确率",
                    ]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="analytics-empty">所选周期的作答记录不足 3 个知识点，暂不能绘制雷达</p>
            )}
          </section>
          <section className="analytics-panel">
            <h2>答题结果构成</h2>
            <p className="analytics-note">按逐题作答统计；右侧是各难度题目的正确率</p>
            {outcomeSlices.length ? (
              <div className="quiz-outcome">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={outcomeSlices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={96}
                      label={({ percent }: { percent?: number }) => `${Math.round((percent || 0) * 100)}%`}
                    >
                      {outcomeSlices.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Legend formatter={(value: string) => value} />
                    <Tooltip formatter={(v: number, name: string) => [`${v} 题`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="quiz-outcome__side">
                  <p className="quiz-outcome__total">
                    <b>{outcome.total}</b> 题作答记录
                  </p>
                  {outcomeSlices.map((slice) => (
                    <p key={slice.name}>
                      <i style={{ background: slice.color }} />
                      {slice.name}
                      <strong>
                        {slice.value} 题 ·{" "}
                        {outcome.total ? Math.round((slice.value / outcome.total) * 100) : 0}%
                      </strong>
                    </p>
                  ))}
                  {difficulties.map((item, index) => (
                    <p key={item.difficulty}>
                      <i style={{ background: DIFFICULTY_COLORS[index % DIFFICULTY_COLORS.length] }} />
                      {item.difficulty}
                      <strong>
                        {pct(item.accuracy)} · {item.answerCount} 题
                      </strong>
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="analytics-empty">所选周期暂无逐题作答记录</p>
            )}
          </section>
        </div>
        <section className="analytics-panel">
          <h2>最近答题记录</h2>
          <p className="analytics-note">点击学生姓名查看学习档案；低于 60% 的提交建议安排错题复盘</p>
          <div className="analytics-table">
            <table>
              <thead>
                <tr>
                  <th>学生</th>
                  <th>科目</th>
                  <th>答对 / 作答</th>
                  <th>正确率</th>
                  <th>建议</th>
                  <th>提交时间</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentAttempts.map((q) => {
                  const accuracy = q.total_count ? (q.correct_count / q.total_count) * 100 : null;
                  return (
                    <tr key={q.id}>
                      <td>
                        <button onClick={() => navigate(`/students/${q.student_id}`)}>
                          {q.display_name}
                        </button>
                      </td>
                      <td>{q.subject || "未分类"}</td>
                      <td>
                        {q.correct_count} / {q.total_count}
                      </td>
                      <td>{pct(accuracy)}</td>
                      <td>
                        {accuracy === null
                          ? "无有效作答"
                          : accuracy < 60
                            ? "错题复盘"
                            : accuracy < 85
                              ? "巩固练习"
                              : "继续拓展"}
                      </td>
                      <td>{fmt(q.submitted_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data?.recentAttempts.length && <p className="analytics-empty">暂无符合条件的提交记录</p>}
          </div>
          <div className="analytics-toolbar">
            <small>
              共 {data?.pagination.total || 0} 条 · 第 {page} 页
            </small>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <button
              disabled={page * 10 >= (data?.pagination.total || 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </section>
      </State>
    </>
  );
}
