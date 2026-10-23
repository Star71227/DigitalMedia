/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas, { Card } from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { strings } from "./types";
export default function NextStepsSlide({
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
  const values = strings(slide.nextSteps).length ? strings(slide.nextSteps) : strings(slide.bullets);
  const cards = [
    ["下一知识点", values[0] || "进入后续知识点"],
    ["推荐资源", values[1] || "复习概念、流程与易错点"],
    ["推荐练习", values[2] || "完成阶段自测或 CodeLab"],
    ["预计时间", values[3] || "以学习路径安排为准"],
  ];
  return (
    <SlideCanvas
      slide={slide}
      theme={theme}
      page={page}
      citationLabels={citationLabels}
      section="下一步学习路径"
    >
      <div className="grid h-full grid-cols-4 content-center gap-[3%] pt-[1%]">
        {cards.map(([title, body], index) => (
          <div key={title} className="relative min-w-0">
            <Card
              theme={theme}
              title={title}
              body={body}
              index={index + 1}
              tone={index === 3 ? theme.accent : theme.primary}
            />
            {index < 3 && (
              <span
                className="absolute -right-[10%] top-1/2 -translate-y-1/2 font-bold"
                style={{ color: theme.accent }}
              >
                ›
              </span>
            )}
          </div>
        ))}
      </div>
    </SlideCanvas>
  );
}
