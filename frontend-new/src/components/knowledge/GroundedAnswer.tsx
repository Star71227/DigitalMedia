/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import CitationPanel, { type Citation } from "./CitationPanel";
export type GroundedAnswerData = Pick<
  import("../../api").GroundedAnswerResponse,
  "status" | "answer" | "confidence" | "coverage" | "retrievalRunId" | "citations"
>;
export default function GroundedAnswer({ data }: { data: GroundedAnswerData }) {
  const ok = data.status === "grounded";
  return (
    <div
      className={`rounded-xl border p-4 ${ok ? "border-emerald-100 bg-white" : "border-amber-200 bg-amber-50"}`}
    >
      <div className="flex items-center gap-2 text-xs font-bold">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        <span>{ok ? `置信度：${data.confidence}` : "证据不足"}</span>
        <span className="ml-auto text-[10px] text-slate-400">
          检索 #{data.retrievalRunId} · 引用覆盖 {Math.round(data.coverage * 100)}%
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{data.answer}</p>
      <CitationPanel citations={data.citations} />
    </div>
  );
}
