/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { teacherApi } from "../api/teacher";
import { PageTitle, State, fmt } from "../components/Ui";
import type { ClassJoinRequest } from "../types";

const TABS: Array<{ id: "pending" | "approved" | "rejected"; label: string }> = [
  { id: "pending", label: "待审核" },
  { id: "approved", label: "已通过" },
  { id: "rejected", label: "已拒绝" },
];

export function ClassRequestsPage() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [data, setData] = useState<ClassJoinRequest[] | undefined>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const load = useCallback(async (next: string) => {
    setError("");
    try {
      const result = await teacherApi.classRequests({ status: next });
      setData(result.data);
      setCounts(result.counts || {});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "入班申请读取失败");
      setData([]);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  const review = async (request: ClassJoinRequest, decision: "approve" | "reject") => {
    setBusyId(request.requestId);
    setActionError("");
    setActionMessage("");
    try {
      await teacherApi.reviewClassRequest(request.requestId, decision, notes[request.requestId] || "");
      setActionMessage(
        decision === "approve"
          ? `已通过 ${request.studentName} 加入「${request.className}」，该学生已进入班级与工作台统计。`
          : `已拒绝 ${request.studentName} 加入「${request.className}」。`,
      );
      await load(status);
      // 通知侧边栏角标刷新待审核数
      window.dispatchEvent(new Event("learnmate:class-requests-changed"));
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "审核失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageTitle
        title="入班申请"
        description="学生在学生端提交申请后在这里审核；通过后学生立即出现在对应班级、工作台与学生管理中"
        action={
          <button
            type="button"
            onClick={() => void load(status)}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} aria-hidden="true" />
            刷新
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatus(tab.id)}
            aria-current={status === tab.id ? "page" : undefined}
            className={`h-11 rounded-md border px-4 text-sm ${status === tab.id ? "border-brand-300 bg-brand-50 font-semibold text-brand-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {tab.label}
            {typeof counts[tab.id] === "number" ? `（${counts[tab.id]}）` : ""}
          </button>
        ))}
      </div>

      {actionMessage && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div
          className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <State
        loading={!data && !error}
        error={error}
        empty={Boolean(data && data.length === 0)}
        onRetry={() => void load(status)}
      >
        <ul className="space-y-3">
          {(data || []).map((request) => (
            <li key={request.requestId} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">
                    {request.studentName}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {request.studentUsername} · {request.studentNo}
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    申请加入「{request.className}」（{request.subject}）· 提交于 {fmt(request.createdAt)}
                  </p>
                  {request.message && (
                    <p className="mt-2 text-sm text-slate-600">学生留言：{request.message}</p>
                  )}
                  {request.reviewNote && (
                    <p className="mt-1 text-xs text-slate-400">审核备注：{request.reviewNote}</p>
                  )}
                </div>
                {request.status === "pending" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={notes[request.requestId] || ""}
                      onChange={(event) => setNotes({ ...notes, [request.requestId]: event.target.value })}
                      placeholder="审核备注（可选）"
                      maxLength={200}
                      className="h-11 w-48 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => void review(request, "approve")}
                      disabled={busyId === request.requestId}
                      className="inline-flex h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                    >
                      <Check size={16} aria-hidden="true" />
                      通过
                    </button>
                    <button
                      type="button"
                      onClick={() => void review(request, "reject")}
                      disabled={busyId === request.requestId}
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      <X size={16} aria-hidden="true" />
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </State>
    </>
  );
}
