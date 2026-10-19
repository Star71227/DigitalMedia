/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
export default function SourceCard({ source }: { source: import("../../api").KnowledgeSource }) {
  return (
    <article className="rounded-xl border bg-white p-3 text-xs">
      <h4 className="font-bold text-slate-900">{source.title}</h4>
      <p className="mt-1 text-slate-500">
        {source.author} · {source.publisher}
      </p>
      <p className="mt-2 text-blue-700">
        {source.license_name} · V{source.version} · {source.source_type}
      </p>
    </article>
  );
}
