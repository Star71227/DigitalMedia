/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptSlide, PptTheme, SlidePart } from "./types";
import { strings, text } from "./types";
function Column({ part, theme, tone }: { part?: SlidePart; theme: PptTheme; tone: string }) {
  const items = strings(part?.items);
  return (
    <div
      className="min-w-0 rounded-lg border p-[6%]"
      style={{ background: theme.surface, borderColor: tone }}
    >
      <h5 className="line-clamp-2 text-[clamp(10px,1.7vw,17px)] font-black" style={{ color: tone }}>
        {text(part?.title, "对比对象")}
      </h5>
      <ul className="mt-[7%] space-y-[4%] text-[clamp(6px,1vw,10px)]">
        {items.slice(0, 6).map((item, index) => (
          <li key={`${item}-${index}`} className="flex min-w-0 gap-2">
            <span style={{ color: tone }}>●</span>
            <span className="line-clamp-2">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
export default function ComparisonSlide({
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
  const left = strings(slide.left?.items);
  const right = strings(slide.right?.items);
  const shared = left.find((item) => right.includes(item)) || "目标或核心问题一致";
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="对比分析">
      <div className="grid h-full grid-cols-2 gap-[4%] pb-[10%] pt-[4%]">
        <Column part={slide.left} theme={theme} tone={theme.primary} />
        <Column part={slide.right} theme={theme} tone={theme.accent} />
      </div>
      <div
        className="absolute bottom-[9%] left-[5%] right-[5%] grid grid-cols-3 gap-[2%] text-[clamp(5px,.75vw,8px)]"
        style={{ color: theme.muted }}
      >
        <span className="truncate rounded px-1 py-1 text-center" style={{ background: theme.surfaceAlt }}>
          相同点：{shared}
        </span>
        <span className="truncate rounded px-1 py-1 text-center" style={{ background: theme.surfaceAlt }}>
          不同点：结构、约束与代价不同
        </span>
        <span className="truncate rounded px-1 py-1 text-center" style={{ background: theme.surfaceAlt }}>
          适用场景：{text(slide.body, "根据问题条件选择")}
        </span>
      </div>
    </SlideCanvas>
  );
}
