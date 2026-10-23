/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptTheme } from "./types";
import { text } from "./types";
export default function ReferencesSlide({
  references,
  offset = 0,
  theme,
  page,
}: {
  key?: React.Key;
  references: Array<Record<string, string>>;
  offset?: number;
  theme: PptTheme;
  page: number;
}) {
  const slide = {
    slideType: "references",
    title: offset ? `参考资料（续 ${Math.floor(offset / 6) + 1}）` : "参考资料",
  };
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} section="参考资料">
      <div className="grid h-full content-center gap-[2%] pt-[2%]">
        {references.slice(0, 6).map((reference, index) => (
          <div
            key={`${reference.sourceKey}-${index}`}
            className="grid min-w-0 grid-cols-[auto_1.3fr_1fr_1fr] items-center gap-[3%] rounded-md border px-[3%] py-[1.5%] text-[clamp(5px,.85vw,9px)]"
            style={{ background: theme.surface, borderColor: theme.border }}
          >
            <b style={{ color: theme.primary }}>[{offset + index + 1}]</b>
            <strong className="truncate">{text(reference.title, reference.sourceKey || "未命名来源")}</strong>
            <span className="truncate" style={{ color: theme.muted }}>
              {reference.chapter || "章节未提供"}
              {reference.section ? ` / ${reference.section}` : ""}
            </span>
            <span className="truncate text-right" style={{ color: theme.muted }}>
              V{reference.version || "未提供"} · {reference.license || "未提供"}
            </span>
          </div>
        ))}
      </div>
    </SlideCanvas>
  );
}
