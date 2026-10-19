/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { text } from "./types";
function normalize(item: unknown) {
  if (typeof item === "string")
    return { mistake: item, reason: "忽略了适用条件或关键步骤", correction: "回到定义与条件逐步验证" };
  const value = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    mistake: text(value.mistake || value.title, "常见错误"),
    reason: text(value.description, "与条件、过程或结果不一致"),
    correction: text(value.correction, "使用正确条件逐步验证结论"),
  };
}
export default function MisconceptionSlide({
  slide,
  theme,
  page,
  citationLabels,
}: {
  slide: PptSlide;
  theme: PptTheme;
  page: number;
  citationLabels?: string;
}) {
  const raw =
    Array.isArray(slide.items) && slide.items.length ? slide.items : [slide.body || "将相似概念视为完全相同"];
  const items = raw.slice(0, 6).map(normalize);
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="易错点纠正">
      <div
        className={`grid h-full content-center gap-[3%] pt-[3%] ${items.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className="grid min-w-0 grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-[2%] rounded-lg border p-[4%]"
            style={{ background: theme.surface, borderColor: theme.danger }}
          >
            <p className="line-clamp-3 text-[clamp(6px,1vw,10px)] font-bold" style={{ color: theme.danger }}>
              错误认识
              <br />
              {item.mistake}
            </p>
            <b style={{ color: theme.warning }}>→</b>
            <p className="line-clamp-3 text-[clamp(5px,.85vw,9px)]" style={{ color: theme.muted }}>
              为什么错误
              <br />
              {item.reason}
            </p>
            <b style={{ color: theme.success }}>→</b>
            <p className="line-clamp-3 text-[clamp(5px,.9vw,9px)] font-bold" style={{ color: theme.success }}>
              正确理解
              <br />
              {item.correction}
            </p>
          </div>
        ))}
      </div>
    </SlideCanvas>
  );
}
