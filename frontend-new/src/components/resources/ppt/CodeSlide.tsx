/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { text } from "./types";
export default function CodeSlide({
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
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="代码实践">
      <div className="grid h-full grid-cols-[1.65fr_.75fr] gap-[4%] pt-[4%]">
        <div
          className="min-w-0 rounded-lg border p-[5%]"
          style={{ background: theme.codeBackground, borderColor: theme.border, color: theme.codeText }}
        >
          <span
            className="text-[clamp(5px,.8vw,8px)] font-bold tracking-[.14em]"
            style={{ color: theme.accent }}
          >
            {text(slide.language, "CODE").toUpperCase()}
          </span>
          <pre className="mt-[4%] max-h-[82%] overflow-hidden whitespace-pre-wrap font-mono text-[clamp(5px,.84vw,9px)] leading-relaxed">
            {text(slide.code, "// 当前课件未提供代码")}
          </pre>
        </div>
        <div className="grid min-w-0 grid-rows-[1.4fr_.8fr] gap-[6%]">
          <div
            className="rounded-lg border p-[8%]"
            style={{ background: theme.surface, borderColor: theme.border }}
          >
            <strong className="text-[clamp(8px,1.25vw,13px)]">代码解释</strong>
            <p
              className="mt-[8%] line-clamp-6 text-[clamp(6px,.95vw,10px)] leading-relaxed"
              style={{ color: theme.muted }}
            >
              {text(slide.explanation, "关注输入、状态变化与返回结果。")}
            </p>
          </div>
          <div
            className="rounded-lg border p-[8%]"
            style={{ background: theme.surfaceAlt, borderColor: theme.warning }}
          >
            <strong className="text-[clamp(6px,1vw,10px)]" style={{ color: theme.warning }}>
              复杂度与边界
            </strong>
            <p className="mt-[6%] line-clamp-3 text-[clamp(5px,.8vw,8px)]">
              检查空输入、规模上界与循环终止条件。
            </p>
          </div>
        </div>
      </div>
    </SlideCanvas>
  );
}
