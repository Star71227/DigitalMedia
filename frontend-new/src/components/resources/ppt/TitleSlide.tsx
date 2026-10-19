/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas from "./SlideCanvas";
import type { Personalization, PptSlide, PptTheme } from "./types";
import { text } from "./types";

export default function TitleSlide({
  slide,
  theme,
  page,
  citationLabels,
  personalization,
}: {
  slide: PptSlide;
  theme: PptTheme;
  page: number;
  citationLabels?: string;
  personalization: Personalization;
}) {
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} cover>
      <div className="grid h-full min-w-0 grid-cols-[1.65fr_1fr] gap-[6%] pt-[2%]">
        <div className="flex min-w-0 flex-col">
          <p
            className="text-[clamp(6px,1vw,10px)] font-bold tracking-[.16em]"
            style={{ color: theme.primary }}
          >
            LEARNMATE · 智课研伴
          </p>
          <h4 className="mt-[9%] line-clamp-3 text-[clamp(16px,3.4vw,34px)] font-black leading-tight">
            {text(slide.title, "个性化学习课件")}
          </h4>
          <p className="mt-[5%] line-clamp-2 text-[clamp(7px,1.35vw,14px)]" style={{ color: theme.muted }}>
            {text(slide.subtitle, "基于当前课程知识点与学习路径生成")}
          </p>
          <div className="mt-auto">
            <span className="text-[clamp(6px,.9vw,9px)] font-bold" style={{ color: theme.primary }}>
              本课件重点
            </span>
            <p className="mt-1 line-clamp-2 text-[clamp(7px,1.15vw,12px)]">
              理解核心概念、建立结构联系并完成针对性巩固
            </p>
          </div>
        </div>
        <div
          className="min-w-0 self-center rounded-lg border p-[9%]"
          style={{ background: theme.surface, borderColor: theme.border }}
        >
          <strong className="text-[clamp(8px,1.35vw,14px)]">本次学习画像</strong>
          <div className="mt-[12%] space-y-[9%] text-[clamp(6px,1vw,10px)]" style={{ color: theme.muted }}>
            <p>● {personalization.mastery}</p>
            <p>● {personalization.preference}</p>
            <p>● {personalization.weakness}</p>
          </div>
          <div
            className="mt-[12%] rounded-md p-[6%] text-[clamp(6px,.9vw,9px)] font-bold"
            style={{ background: theme.surfaceAlt, color: theme.primary }}
          >
            预计学习时间：以学习路径安排为准
          </div>
        </div>
      </div>
    </SlideCanvas>
  );
}
