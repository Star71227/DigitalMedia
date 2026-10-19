/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { ResourceGenerationSnapshot } from "../../api";
import GenerationTimeline from "./GenerationTimeline";

const TYPE_LABELS: Record<string, string> = {
  study_note: "学习讲义",
  mind_map: "思维导图",
  pptx: "个性化课件",
  quiz_pack: "练习包",
  code_case: "代码案例",
};

export default function GenerationProgressPanel({
  snapshot,
  connectionState,
  onRetry,
}: {
  snapshot: ResourceGenerationSnapshot;
  connectionState: string;
  onRetry?: () => void;
}) {
  const { job, stages } = snapshot;
  const latest = [...stages]
    .reverse()
    .find((item) => item.eventType === "stage" || item.eventType === "error");
  const percent = Math.max(0, Math.min(100, Number(job.progressPercent) || 0));

  return (
    <section className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-700">
            正在生成{TYPE_LABELS[job.resourceType] || "学习资源"}
          </p>
          <h3 className="mt-1 break-words font-bold text-slate-950">{latest?.label || "资源任务已排队"}</h3>
          <p className="mt-1 break-words text-sm leading-6 text-slate-600">
            {latest?.message || "等待后端开始处理。"}
          </p>
        </div>
        <div className="text-right">
          <strong className={`text-xl ${job.status === "failed" ? "text-rose-700" : "text-blue-700"}`}>
            {percent}%
          </strong>
          <p className="text-xs text-slate-500">
            {job.status === "completed" ? "已完成" : job.status === "failed" ? "生成失败" : "处理中"}
          </p>
        </div>
      </div>

      <div className="my-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full transition-[width] ${job.status === "failed" ? "bg-rose-500" : "bg-blue-600"}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <GenerationTimeline events={stages} currentStage={job.currentStage} />

      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">查看任务连接状态</summary>
        <div className="mt-2 space-y-1">
          <p>资源类型：{TYPE_LABELS[job.resourceType] || "学习资源"}</p>
          <p>进度通道：{connectionLabel(connectionState)}</p>
          <p>当前阶段：{latest?.label || "等待开始"}</p>
        </div>
      </details>

      {job.status === "failed" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
          <span>{job.errorMessage || "资源生成失败，请稍后重试。"}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold"
            >
              重新生成
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function connectionLabel(state: string) {
  if (state === "streaming") return "实时更新";
  if (state === "polling") return "定时查询";
  if (state === "connecting") return "正在连接";
  if (state === "closed") return "已结束";
  return "待连接";
}
