/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { LearningResourceReview } from "../../api";
import ReviewScoreCard from "./ReviewScoreCard";

export default function ResourceReviewPanel({ review }: { review: LearningResourceReview }) {
  const status = reviewStatus(review.status);
  const score = Number.isFinite(review.score) ? review.score : 0;

  return (
    <section className={`rounded-lg border p-4 ${status.className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">可信度说明：{status.label}</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{review.summary}</p>
          <p
            role="status"
            className="mt-2 inline-flex rounded-full border bg-white px-3 py-1 text-xs font-semibold"
          >
            {modelReviewLabel(review)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            此标记描述本次审核的实际执行情况，不代表全部内容均由模型生成。
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-900">{score}/100</span>
      </div>

      <details className="mt-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-900">查看审核细节</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            通过阈值 {review.passThreshold ?? 75} · {modelReviewLabel(review)}
          </p>
          <ReviewScoreCard review={review} />
          {review.checks?.length > 0 && (
            <div className="space-y-2">
              {review.checks.map((check) => (
                <div key={check.name} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                  <strong className={check.passed ? "text-emerald-700" : "text-amber-800"}>
                    {check.passed ? "通过" : "需复核"} · {check.name}
                  </strong>
                  <p className="mt-1 leading-5 text-slate-600">{check.detail}</p>
                </div>
              ))}
            </div>
          )}
          {review.issues.length > 0 && (
            <div>
              <strong className="text-xs text-amber-900">发现的问题</strong>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
                {review.issues.map((issue, index) => (
                  <li key={`${issue.message}-${index}`}>{String(issue.message || "存在待复核问题")}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function reviewStatus(status: LearningResourceReview["status"]) {
  if (status === "approved") return { label: "可学习", className: "border-emerald-100 bg-emerald-50" };
  if (status === "needs_revision") return { label: "建议复核", className: "border-amber-100 bg-amber-50" };
  return { label: "未通过", className: "border-rose-100 bg-rose-50" };
}

function modelReviewLabel(review: LearningResourceReview) {
  if (review.modelReviewExecuted) return "模型复核已完成";
  if (review.modelReviewStatus === "unavailable") return "模型复核不可用，保留规则审核结果";
  return "使用规则审核结果";
}
