/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas, { Card } from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { strings, text } from "./types";
export default function SummarySlide({
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
  const learned = strings(slide.bullets);
  const cards = [
    ["已学内容", learned.slice(0, 2).join("；") || text(slide.body, "已建立核心概念与知识结构")],
    ["关键结论", learned.slice(2, 4).join("；") || "条件、过程和验证共同决定结论"],
    ["易错提醒", "结合当前薄弱点再次核对适用条件"],
  ];
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="学习总结">
      <div className="grid h-full grid-cols-3 content-center gap-[4%] pt-[1%]">
        {cards.map(([title, body], index) => (
          <Card
            key={title}
            theme={theme}
            title={title}
            body={body}
            index={index + 1}
            tone={index === 2 ? theme.warning : theme.primary}
          />
        ))}
      </div>
      <div
        className="absolute bottom-[10%] left-[5%] right-[5%] truncate rounded-md border px-3 py-1.5 text-center text-[clamp(6px,1vw,10px)] font-bold"
        style={{ background: theme.surfaceAlt, borderColor: theme.success, color: theme.success }}
      >
        学习目标检查：用自己的语言复述并通过练习验证
      </div>
    </SlideCanvas>
  );
}
