/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas, { Card } from "./SlideCanvas";
import type { Personalization, PptSlide, PptTheme } from "./types";
import { strings, text } from "./types";

/** 把「标签：说明」形式的要点拆成卡片标题与正文；没有冒号时正文留默认说明。 */
function splitFeature(value: string) {
  const match = /^(.{2,18}?)[：:]\s*(.+)$/.exec(value.trim());
  if (!match) return { title: value, body: "用结构化线索完成理解" };
  return { title: match[1], body: match[2] };
}

export default function ConceptSlide({
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
  personalization?: Personalization;
}) {
  const features = strings(slide.bullets);
  if (!features.length) features.push("定义与边界", "适用条件", "关键结构", "结果验证");
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="核心概念">
      <div className="grid h-full grid-cols-[1.1fr_1.4fr] gap-[4%] pt-[4%]">
        <div
          className="min-w-0 rounded-lg border p-[7%]"
          style={{ background: theme.surfaceAlt, borderColor: theme.border }}
        >
          <span className="text-[clamp(6px,.9vw,9px)] font-bold" style={{ color: theme.primary }}>
            中心概念
          </span>
          <h5 className="mt-[9%] line-clamp-2 text-[clamp(12px,2.2vw,22px)] font-black">
            {text(slide.title, "核心概念")}
          </h5>
          <p
            className="mt-[8%] line-clamp-4 text-[clamp(7px,1.1vw,11px)] leading-relaxed"
            style={{ color: theme.muted }}
          >
            {text(slide.body, "从定义、条件、结构与结果四个方面建立完整理解。")}
          </p>
          {personalization && (
            <p
              className="mt-[7%] line-clamp-2 text-[clamp(5px,.8vw,8px)] font-bold"
              style={{ color: theme.primary }}
            >
              {personalization.mastery}
            </p>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-[4%]">
          {features.slice(0, 4).map((item, index) => {
            // 要点写成「标签：说明」时把说明放进卡片正文，否则一律用默认说明，
            // 否则一段完整表述会被卡片的标题行截断，正文反而只有模板话术。
            const { title, body } = splitFeature(item);
            return (
              <Card key={`${item}-${index}`} theme={theme} title={title} body={body} index={index + 1} />
            );
          })}
        </div>
      </div>
    </SlideCanvas>
  );
}
