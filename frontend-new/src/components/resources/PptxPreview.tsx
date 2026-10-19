/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { Citation } from "../knowledge/CitationPanel";
import CodeSlide from "./ppt/CodeSlide";
import ComparisonSlide from "./ppt/ComparisonSlide";
import ConceptSlide from "./ppt/ConceptSlide";
import ExampleSlide from "./ppt/ExampleSlide";
import MisconceptionSlide from "./ppt/MisconceptionSlide";
import NextStepsSlide from "./ppt/NextStepsSlide";
import ObjectivesSlide from "./ppt/ObjectivesSlide";
import ProcessSlide from "./ppt/ProcessSlide";
import QuizSlide from "./ppt/QuizSlide";
import ReferencesSlide from "./ppt/ReferencesSlide";
import SummarySlide from "./ppt/SummarySlide";
import TitleSlide from "./ppt/TitleSlide";
import type { Personalization, PptSlide, PptTheme } from "./ppt/types";
import { expandSlides, inferPersonalization, resolveTheme, strings, text } from "./ppt/types";

interface PptxContent {
  theme?: unknown;
  slides?: Array<Record<string, unknown>>;
  references?: Array<Record<string, string>>;
}
interface SlideProps {
  key?: React.Key;
  slide: PptSlide;
  theme: PptTheme;
  page: number;
  citationLabels?: string;
  personalization: Personalization;
}

function SlideByType(props: SlideProps) {
  const base = {
    slide: props.slide,
    theme: props.theme,
    page: props.page,
    citationLabels: props.citationLabels,
  };
  switch (text(props.slide.slideType, "concept")) {
    case "cover":
    case "title":
      return <TitleSlide {...base} personalization={props.personalization} />;
    case "objectives":
      return <ObjectivesSlide {...base} />;
    case "roadmap":
    case "process":
      return <ProcessSlide {...base} />;
    case "comparison":
      return <ComparisonSlide {...base} />;
    case "mistakes":
    case "misconception":
    case "misconceptions":
      return <MisconceptionSlide {...base} />;
    case "example":
      return <ExampleSlide {...base} />;
    case "code":
      return <CodeSlide {...base} />;
    case "practice":
    case "quiz":
      return <QuizSlide {...base} />;
    case "answers":
      return <ConceptSlide {...base} personalization={props.personalization} />;
    case "summary":
      return <SummarySlide {...base} />;
    case "next_steps":
      return <NextStepsSlide {...base} />;
    case "references":
      return (
        <ReferencesSlide
          references={(props.slide.references || []) as Array<Record<string, string>>}
          theme={props.theme}
          page={props.page}
        />
      );
    default:
      return <ConceptSlide {...base} personalization={props.personalization} />;
  }
}

export default function PptxPreview({
  content,
  citations = [],
}: {
  content: PptxContent;
  citations?: Citation[];
}) {
  const theme = resolveTheme(content.theme);
  const sourceSlides = (content.slides || []) as PptSlide[];
  const slides = expandSlides(sourceSlides);
  const personalization = inferPersonalization(sourceSlides);
  const referenceGroups: Array<Array<Record<string, string>>> = [];
  const hasReferenceSlide = slides.some((slide) => text(slide.slideType) === "references");
  if (!hasReferenceSlide)
    for (let index = 0; index < (content.references || []).length; index += 6)
      referenceGroups.push((content.references || []).slice(index, index + 6));
  return (
    <div className="lm-ppt-grid grid min-w-0 gap-3 overflow-x-hidden sm:grid-cols-2">
      {slides.map((slide, index) => {
        const citationTokens = strings(slide.citations);
        const ids = citationTokens.map(Number).filter(Number.isFinite);
        const directLabels = citationTokens
          .filter((item) => !Number.isFinite(Number(item)))
          .map(citationLabel);
        const matchedLabels = citations
          .filter((item) => Number.isFinite(Number(item.chunkId)) && ids.includes(Number(item.chunkId)))
          .map((item) => citationLabel(item.label));
        const labels = [...directLabels, ...matchedLabels].join(" ");
        return (
          <SlideByType
            key={`${text(slide.slideType)}-${index}`}
            slide={slide}
            theme={theme}
            page={index + 1}
            citationLabels={labels}
            personalization={personalization}
          />
        );
      })}
      {referenceGroups.map((references, index) => (
        <ReferencesSlide
          key={`references-${index}`}
          references={references}
          offset={index * 6}
          theme={theme}
          page={slides.length + index + 1}
        />
      ))}
    </div>
  );
}

function citationLabel(value: string) {
  const textValue = text(value);
  if (!textValue) return "";
  return textValue.startsWith("[") ? textValue : `[${textValue}]`;
}
