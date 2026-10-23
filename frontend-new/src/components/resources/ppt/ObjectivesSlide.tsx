/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import SlideCanvas, { Card } from "./SlideCanvas";
import type { PptSlide, PptTheme } from "./types";
import { strings, text } from "./types";

/** 同 ConceptSlide：「标签：说明」拆成标题与正文，正文缺省时保留模板话术。 */
function splitGoal(value: string) {
  const match = /^(.{2,18}?)[：:]\s*(.+)$/.exec(value.trim());
  if (!match) return { title: value, body: "完成后能够说明并应用" };
  return { title: match[1], body: match[2] };
}

export default function ObjectivesSlide({
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
  const goals = strings(slide.bullets);
  if (!goals.length) goals.push(text(slide.body, "明确核心知识并完成学习检查"));
  return (
    <SlideCanvas slide={slide} theme={theme} page={page} citationLabels={citationLabels} section="学习目标">
      <div
        className={`grid h-full content-center gap-[3%] pt-[3%] ${goals.length <= 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {goals.slice(0, 6).map((goal, index) => {
          const { title, body } = splitGoal(goal);
          return <Card key={`${goal}-${index}`} theme={theme} title={title} body={body} index={index + 1} />;
        })}
      </div>
    </SlideCanvas>
  );
}
