/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { AgentLog } from "../types";
import { useEffect, useState } from "react";
import { teacherApi } from "../api/teacher";
import { PageTitle, State, fmt } from "../components/Ui";
export function AgentLogsPage() {
  const [data, setData] = useState<AgentLog[]>([]),
    [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 }),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [taskType, setTaskType] = useState(""),
    [filters, setFilters] = useState({ status: "", taskType: "" }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    teacherApi
      .agentLogs({ page, pageSize: 20, ...filters })
      .then((r) => {
        setData(r.data);
        setPagination(r.pagination);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, filters]);
  return (
    <>
      <PageTitle title="智能体运行日志" description="任务执行记录与处理状态" />
      <form
        className="mb-5 flex flex-wrap gap-3 rounded-2xl border bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilters({ status, taskType: taskType.trim() });
        }}
      >
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border px-3 py-2 text-sm"
          aria-label="日志状态"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="fallback">降级</option>
          <option value="failed">失败</option>
        </select>
        <input
          value={taskType}
          onChange={(event) => setTaskType(event.target.value)}
          maxLength={100}
          placeholder="任务类型"
          className="min-w-52 flex-1 rounded-xl border px-3 py-2 text-sm"
        />
        <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white">
          筛选日志
        </button>
      </form>
      <State loading={loading} error={error} empty={!data.length}>
        <div className="space-y-3">
          {data.map((item) => (
            <article key={item.id} className="rounded-2xl border bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{item.agentName}</span>
                  <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs">{item.taskType}</span>
                </div>
                <span
                  className={`text-xs ${item.status === "failed" ? "text-rose-600" : "text-emerald-600"}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <p>{item.inputSummary}</p>
                <p>{item.outputSummary}</p>
              </div>
              <div className="mt-3 text-xs text-slate-400">
                {fmt(item.createdAt)} · {item.duration} ms · 来源 {item.source}
                {item.relatedStudentId ? ` · 学生 #${item.relatedStudentId}` : ""}
              </div>
            </article>
          ))}
          <div className="flex items-center justify-between rounded-2xl border bg-white p-4 text-xs text-slate-500">
            <span>共 {pagination.total} 条日志</span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={pagination.page * pagination.pageSize >= pagination.total}
                onClick={() => setPage((value) => value + 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </State>
    </>
  );
}
