/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { LearningResourceReview } from "../../api";

export default function ReviewScoreCard({ review }: { review: LearningResourceReview }) {
  const dimensions = review.dimensions || [];
  if (!dimensions.length) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">维度</th>
            <th className="px-3 py-2 font-semibold">结果</th>
            <th className="px-3 py-2 font-semibold">得分</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map((item) => (
            <tr key={item.dimension} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2 font-semibold text-slate-900">{item.label}</td>
              <td className="px-3 py-2 text-slate-600">
                {item.status === "passed" ? "通过" : String(item.issues?.[0]?.message || "需复核")}
              </td>
              <td className="px-3 py-2 text-slate-700">
                {Number.isFinite(item.score) ? item.score : 0}/{item.maxScore}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
