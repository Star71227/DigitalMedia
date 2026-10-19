/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { steps, text } from "./types";
export default function ProcessSlide({
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
  const values = steps(slide.steps);
  if (!values.length)
    values.push(
      { title: "理解", description: slide.body },
      { title: "应用", description: "按顺序执行关键操作" },
      { title: "验证", description: "检查结果并复盘错误" },
    );
  const columns = values.length === 1 ? "grid-cols-1" : values.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="过程与步骤">
      <div className={`grid h-full content-center gap-[4%] pt-[3%] ${columns}`}>
        {values.slice(0, 6).map((step, index) => (
          <React.Fragment key={index}>
            <div
              className="relative min-w-0 rounded-lg border p-[7%]"
              style={{ background: theme.surface, borderColor: theme.border }}
            >
              <span
                className="inline-flex size-[clamp(14px,2.3vw,23px)] items-center justify-center rounded-full text-[clamp(6px,.9vw,9px)] font-bold"
                style={{ background: theme.primary, color: theme.background }}
              >
                {index + 1}
              </span>
              <strong className="ml-[5%] text-[clamp(8px,1.3vw,13px)]">
                {text(step.title, `步骤 ${index + 1}`)}
              </strong>
              <p
                className="mt-[9%] line-clamp-3 text-[clamp(6px,1vw,10px)] leading-relaxed"
                style={{ color: theme.muted }}
              >
                {text(step.description, "按本步骤完成学习任务")}
              </p>
              {index < values.length - 1 && (
                <span
                  className="absolute -right-[8%] top-1/2 hidden -translate-y-1/2 text-[clamp(10px,2vw,20px)] font-bold sm:block"
                  style={{ color: theme.accent }}
                >
                  ›
                </span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </SlideCanvas>
  );
}
