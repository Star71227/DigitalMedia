/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

export type { KnowledgeCitation as Citation } from "../../api";
import type { KnowledgeCitation as Citation } from "../../api";

export default function CitationPanel({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!citations.length) return null;

  return (
    <section className="mt-3 rounded-lg border border-blue-100 bg-blue-50/30 p-3">
      <h4 className="flex items-center gap-2 text-xs font-bold text-blue-950">
        <BookOpen className="h-4 w-4" />
        引用与证据
      </h4>
      <div className="mt-2 space-y-2">
        {citations.map((citation) => (
          <article
            key={`${citation.label}-${citation.chunkId}`}
            className="rounded-lg border border-slate-200 bg-white"
          >
            <button
              className="flex min-h-11 w-full items-center gap-2 p-2 text-left text-xs"
              onClick={() => setOpen(open === citation.chunkId ? null : citation.chunkId)}
            >
              <span className="rounded bg-blue-600 px-1.5 py-0.5 font-bold text-white">
                [{citation.label}]
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                {citation.sourceTitle}
              </span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              {open === citation.chunkId ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {open === citation.chunkId && (
              <div className="border-t border-slate-100 p-3 text-xs leading-5 text-slate-600">
                <p>
                  {citation.chapter}
                  {citation.section ? ` / ${citation.section}` : ""}
                </p>
                <p className="mt-1">
                  来源版本：{citation.version || "未标注"} · 许可：{citation.license || "未标注"}
                </p>
                <blockquote className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 leading-relaxed">
                  {citation.excerpt}
                </blockquote>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
