/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { navigate } from "../router";
import type { StudentDetail } from "../types";
import { useEffect, useState } from "react";
import { teacherApi } from "../api/teacher";
import { Metric, PageTitle, State, fmt, pct } from "../components/Ui";
import { CountUp } from "../components/effects/CountUp";
import { RevealOnScroll } from "../components/effects/RevealOnScroll";
import { errorTypeLabel } from "../lib/errorLabels";
export function StudentDetailPage({ studentId }: { studentId: number }) {
  const [data, setData] = useState<StudentDetail>(),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError("");
    teacherApi
      .studentDetail(studentId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);
  return (
    <>
      <PageTitle
        title={data?.student.displayName || "学生详情"}
        description="学习进展、测验表现与跟进建议"
        action={
          <button
            className="rounded-xl bg-brand-600 px-4 py-2 text-white"
            onClick={() => navigate(`/resources?studentId=${studentId}`)}
          >
            为此学生制定资源干预
          </button>
        }
      />
      <State loading={!data && !error} error={error}>
        <RevealOnScroll stagger={0.08}>
          <div className="grid gap-4 md:grid-cols-4" data-reveal>
            <Metric label="档案版本" value={`V${data?.profile.currentVersion || 0}`} />
            <Metric label="路径版本" value={`V${data?.path.currentVersion || 0}`} />
            <Metric
              label="路径进度"
              value={pct(data?.path.progress)}
              countUpTo={Math.round(Number(data?.path.progress) || 0)}
              countUpSuffix="%"
            />
            <Metric
              label="风险等级"
              value={String(data?.risk.level || "-").toUpperCase()}
              detail={data?.risk.reasons?.[0]}
            />
          </div>
          <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
            <Panel title="学习档案">
              {data?.profile.snapshot ? (
                <div className="space-y-2 text-sm">
                  {Object.entries(data.profile.snapshot).map(([key, value]) => (
                    <div key={key} className="flex gap-4 border-b py-2 last:border-0">
                      <span className="w-32 shrink-0 text-slate-500">{key}</span>
                      <span className="break-all text-slate-800">{plainValue(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="当前学习路径">
              {data?.path.snapshot?.stages?.length ? (
                <div className="divide-y">
                  {data.path.snapshot.stages.map((stage) => (
                    <div key={stage.key} className="py-3">
                      <div className="font-medium">{stage.title}</div>
                      <div className="text-xs text-slate-500">
                        {stage.subject} · {stage.knowledgePoints?.join("、")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="知识点掌握度">
              {data?.mastery?.length ? (
                <div className="space-y-3">
                  {data.mastery.map((item) => (
                    <div key={`${item.subject}-${item.knowledgePoint}`}>
                      <div className="flex justify-between text-sm">
                        <span>{item.knowledgePoint}</span>
                        <span>{pct(item.mastery)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-slate-100">
                        <div
                          className="h-2 rounded bg-brand-600"
                          style={{
                            width: `${Math.max(0, Math.min(100, item.mastery))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="错误模式">
              {data?.errorPatterns?.length ? (
                <div className="space-y-3">
                  {data.errorPatterns.map((item) => (
                    <div
                      key={`${item.errorType}-${item.knowledgePoint}`}
                      className="rounded-xl bg-rose-50 p-3"
                    >
                      <div className="font-medium text-rose-800">{errorTypeLabel(item.errorType)}</div>
                      <div className="text-xs text-rose-600">
                        {item.knowledgePoint} · 出现 {item.occurrenceCount} 次
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="测验趋势">
              {data?.quizTrend?.length ? (
                <div className="divide-y">
                  {data.quizTrend.map((item) => (
                    <div key={item.id} className="flex justify-between py-3 text-sm">
                      <span>{item.subject || "未分类测验"}</span>
                      <span>
                        {item.correct_count}/{item.total_count} · {fmt(item.submitted_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="路径历史">
              {data?.path.versions?.length ? (
                <div className="divide-y">
                  {data.path.versions.map((item) => (
                    <div key={item.version} className="py-3">
                      <div className="font-medium">
                        V{item.version} · {item.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.change_reason} · {fmt(item.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="学习资源（思维导图 / PPTX）">
              {data?.resources?.length ? (
                <div className="divide-y">
                  {data.resources.map((item) => (
                    <div key={item.id} className="flex justify-between py-3">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-slate-500">
                          {item.resource_type} · V{item.current_version} · {item.stage_key}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">
                        {item.progress_status || item.status} {item.progress_percent ?? 0}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="RAG 检索活动">
              {data?.retrievalActivity?.length ? (
                <div className="divide-y">
                  {data.retrievalActivity.map((item) => (
                    <div key={item.id} className="py-3">
                      <div className="font-medium">
                        {item.subject} · {item.knowledge_point || "综合问题"}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500">{item.query_text}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {item.retrieval_strategy} · {item.result_count} 条证据 · {fmt(item.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="最近学习活动">
              {data?.recentActivity?.length ? (
                <div className="divide-y">
                  {data.recentActivity.map((item, index: number) => (
                    <div key={`${item.event_type}-${item.created_at}-${index}`} className="py-3">
                      <div className="font-medium">{item.event_type}</div>
                      <div className="text-xs text-slate-500">
                        {item.subject || "未分类"} · {item.knowledge_point || "综合活动"} ·{" "}
                        {fmt(item.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Panel>
            <Panel title="引用问答活动">
              <div className="text-sm text-slate-600">
                已记录 <CountUp to={data?.citationAnswerCount ?? 0} mode="scramble" /> 次带引用的生成活动
              </div>
            </Panel>
          </div>
          <Panel title="学习建议" wide>
            {
              <ul className="space-y-2 text-sm text-slate-600">
                {!data?.recommendations?.length && (
                  <li>暂无可生成建议的学习证据，完成测验或学习资源后再查看。</li>
                )}
                {data?.recommendations?.map((item: string) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            }
          </Panel>
        </RevealOnScroll>
      </State>
    </>
  );
}
function Panel({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-2xl border bg-white p-5 ${wide ? "mt-6" : ""}`}
      data-reveal
    >
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Empty() {
  return <p className="text-sm text-slate-400">暂无真实记录</p>;
}
function plainValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "暂无数据";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}
