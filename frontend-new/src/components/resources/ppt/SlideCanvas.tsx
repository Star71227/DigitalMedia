/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { PptSlide, PptTheme } from "./types";
import { text } from "./types";

export default function SlideCanvas({
  slide,
  theme,
  page,
  citationLabels,
  section = "个性化学习课件",
  cover = false,
  children,
}: {
  slide: PptSlide;
  theme: PptTheme;
  page: number;
  citationLabels?: string;
  section?: string;
  cover?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className="relative aspect-video w-full min-w-0 overflow-hidden rounded-lg border"
      style={{ background: theme.background, borderColor: theme.border, color: theme.text }}
    >
      <div className="absolute inset-0 flex min-w-0 flex-col p-[4.5%] pb-[6%]">
        {!cover && (
          <header className="shrink-0 border-b pb-[2%]" style={{ borderColor: theme.border }}>
            <p
              className="text-[clamp(6px,1.05vw,10px)] font-bold uppercase tracking-[0.16em]"
              style={{ color: theme.primary }}
            >
              {section}
            </p>
            <h4 className="mt-[1%] line-clamp-2 text-[clamp(12px,2.3vw,22px)] font-bold leading-tight">
              {text(slide.title, "学习内容")}
            </h4>
          </header>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
        <footer
          className="absolute bottom-[2.5%] left-[4.5%] right-[4.5%] flex items-center justify-between text-[clamp(5px,.8vw,8px)]"
          style={{ color: theme.muted }}
        >
          <span className="max-w-[80%] truncate">{citationLabels || "智课研伴 · 当前学生个性化生成"}</span>
          <span className="font-bold" style={{ color: theme.primary }}>
            {String(page).padStart(2, "0")}
          </span>
        </footer>
      </div>
    </article>
  );
}

export function Card({
  theme,
  title,
  body,
  index,
  tone,
}: {
  key?: React.Key;
  theme: PptTheme;
  title: string;
  body?: string;
  index?: number;
  tone?: string;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border p-[5%]"
      style={{ background: theme.surface, borderColor: tone || theme.border }}
    >
      <div className="flex min-w-0 items-start gap-2">
        {index !== undefined && (
          <span
            className="shrink-0 text-[clamp(7px,1vw,11px)] font-bold"
            style={{ color: tone || theme.primary }}
          >
            {String(index).padStart(2, "0")}
          </span>
        )}
        <strong className="line-clamp-2 min-w-0 text-[clamp(8px,1.4vw,14px)] leading-tight">{title}</strong>
      </div>
      {body && (
        <p
          className="mt-[7%] line-clamp-4 text-[clamp(6px,1vw,10px)] leading-relaxed"
          style={{ color: theme.muted }}
        >
          {body}
        </p>
      )}
    </div>
  );
}
