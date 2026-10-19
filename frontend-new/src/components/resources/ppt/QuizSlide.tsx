/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { strings, text } from "./types";
export default function QuizSlide({
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
  const options = strings(slide.bullets);
  if (!options.length)
    options.push("A. 根据定义与条件判断", "B. 只根据表面形式判断", "C. 忽略边界情况", "D. 跳过验证直接作答");
  const count = strings(slide.questionIds).length;
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="阶段自测">
      <div className="grid h-full grid-cols-[1.55fr_.75fr] gap-[4%] pt-[4%]">
        <div className="min-w-0">
          <div
            className="rounded-lg border p-[4%]"
            style={{ background: theme.surfaceAlt, borderColor: theme.border }}
          >
            <strong className="text-[clamp(6px,.9vw,9px)]" style={{ color: theme.primary }}>
              题目
            </strong>
            <p className="mt-[3%] line-clamp-3 text-[clamp(8px,1.3vw,13px)] font-bold">
              {text(
                slide.body,
                slide.subtitle ? text(slide.subtitle) : "请选择最符合核心概念与适用条件的选项。",
              )}
            </p>
          </div>
          <div className="mt-[4%] grid grid-cols-2 gap-[4%]">
            {options.slice(0, 4).map((option, index) => (
              <div
                key={`${option}-${index}`}
                className="line-clamp-2 rounded-lg border p-[5%] text-[clamp(6px,1vw,10px)]"
                style={{ background: theme.surface, borderColor: theme.border }}
              >
                {option}
              </div>
            ))}
          </div>
        </div>
        <aside
          className="min-w-0 rounded-lg border p-[8%]"
          style={{ background: theme.surface, borderColor: theme.accent }}
        >
          <strong className="text-[clamp(8px,1.2vw,12px)]" style={{ color: theme.accent }}>
            思考提示
          </strong>
          <p
            className="mt-[10%] line-clamp-6 text-[clamp(6px,.95vw,10px)] leading-relaxed"
            style={{ color: theme.muted }}
          >
            {text(slide.explanation, "先找出条件，再排除违反定义或忽略边界的选项。")}
          </p>
          <p className="mt-[14%] text-[clamp(5px,.8vw,8px)] font-bold" style={{ color: theme.primary }}>
            练习来源
          </p>
          <p className="mt-[4%] line-clamp-2 text-[clamp(6px,.9vw,9px)]">
            {count ? `${count} 道真实题库练习` : "概念自测"}
          </p>
        </aside>
      </div>
    </SlideCanvas>
  );
}
