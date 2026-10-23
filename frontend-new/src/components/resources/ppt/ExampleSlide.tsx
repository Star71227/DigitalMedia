/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { steps, strings, text } from "./types";
export default function ExampleSlide({
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
  const values = steps(slide.steps).map((item) => `${text(item.title)}：${text(item.description)}`);
  const bullets = strings(slide.bullets);
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="例题与应用">
      <div className="grid h-full grid-cols-[.9fr_1.5fr] gap-[4%] pt-[4%]">
        <div
          className="min-w-0 rounded-lg border p-[7%]"
          style={{ background: theme.surfaceAlt, borderColor: theme.border }}
        >
          <strong className="text-[clamp(7px,1.1vw,11px)]" style={{ color: theme.primary }}>
            题目
          </strong>
          <p className="mt-[8%] line-clamp-6 text-[clamp(8px,1.35vw,14px)] font-bold leading-relaxed">
            {text(
              slide.body,
              slide.subtitle ? text(slide.subtitle) : "结合本节概念完成分析，并说明判断依据。",
            )}
          </p>
        </div>
        <div className="grid min-w-0 grid-rows-3 gap-[4%]">
          {[
            ["思路", values[0] || bullets[0] || "识别核心概念与约束"],
            ["步骤", values.slice(1).join("；") || bullets.slice(1).join("；") || "按顺序执行并记录状态"],
            ["结论", text(slide.explanation, "回代条件验证结果与边界")],
          ].map(([title, body], index) => (
            <div
              key={title}
              className="grid min-w-0 grid-cols-[.25fr_1fr] items-center rounded-lg border p-[4%]"
              style={{ background: theme.surface, borderColor: index === 2 ? theme.success : theme.border }}
            >
              <strong
                className="text-[clamp(7px,1.1vw,11px)]"
                style={{ color: index === 2 ? theme.success : theme.primary }}
              >
                {title}
              </strong>
              <p className="line-clamp-3 text-[clamp(6px,1vw,10px)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </SlideCanvas>
  );
}
