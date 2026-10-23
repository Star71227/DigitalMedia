/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
export type PptThemeName = "academic-blue" | "technology-dark" | "learning-light";

export interface PptTheme {
  name: PptThemeName;
  background: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  codeBackground: string;
  codeText: string;
}

export interface SlidePart {
  title?: unknown;
  items?: unknown;
}
export interface SlideStep {
  title?: unknown;
  description?: unknown;
}
export interface PptSlide {
  slideType?: unknown;
  title?: unknown;
  subtitle?: unknown;
  body?: unknown;
  bullets?: unknown;
  steps?: unknown;
  left?: SlidePart;
  right?: SlidePart;
  items?: unknown;
  language?: unknown;
  code?: unknown;
  explanation?: unknown;
  questionIds?: unknown;
  nextSteps?: unknown;
  citations?: unknown;
  sourceRefs?: unknown;
  references?: unknown;
}

export const THEMES: Record<PptThemeName, PptTheme> = {
  "academic-blue": {
    name: "academic-blue",
    background: "#f7faff",
    surface: "#fff",
    surfaceAlt: "#eaf2ff",
    primary: "#1f5aa6",
    accent: "#2f80ed",
    text: "#172033",
    muted: "#5b6b82",
    border: "#b9cbe6",
    success: "#167c5a",
    warning: "#b45309",
    danger: "#b42318",
    codeBackground: "#101c33",
    codeText: "#e8f0ff",
  },
  "technology-dark": {
    name: "technology-dark",
    background: "#0b1220",
    surface: "#111c30",
    surfaceAlt: "#162642",
    primary: "#65b7ff",
    accent: "#3dd6c6",
    text: "#f3f7ff",
    muted: "#a8b6cb",
    border: "#2d486c",
    success: "#64d7a6",
    warning: "#f2c66d",
    danger: "#ff8f86",
    codeBackground: "#070d18",
    codeText: "#dceaff",
  },
  "learning-light": {
    name: "learning-light",
    background: "#fffdf8",
    surface: "#fff",
    surfaceAlt: "#f3f7ea",
    primary: "#28745a",
    accent: "#f09a3e",
    text: "#20302a",
    muted: "#63726b",
    border: "#c9dccf",
    success: "#28745a",
    warning: "#a75b12",
    danger: "#b43a35",
    codeBackground: "#17241f",
    codeText: "#f2fff8",
  },
};

export function resolveTheme(value: unknown): PptTheme {
  const name =
    typeof value === "string"
      ? value
      : typeof value === "object" && value
        ? String((value as { name?: unknown }).name || "")
        : "";
  if (name === "technology-dark" || name === "learning-light" || name === "academic-blue")
    return THEMES[name];
  return THEMES["academic-blue"];
}

export const text = (value: unknown, fallback = "") =>
  value === null || value === undefined || String(value).trim() === "" ? fallback : String(value).trim();
export const strings = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
export const steps = (value: unknown): SlideStep[] =>
  Array.isArray(value)
    ? value.filter((item): item is SlideStep => Boolean(item && typeof item === "object"))
    : [];
export interface Personalization {
  mastery: string;
  preference: string;
  weakness: string;
}
export function inferPersonalization(slides: PptSlide[]): Personalization {
  const corpus = slides
    .flatMap((slide) => [
      text(slide.subtitle),
      text(slide.body),
      ...strings(slide.bullets),
      ...(Array.isArray(slide.items)
        ? slide.items.map((item) =>
            typeof item === "string"
              ? item
              : text((item as Record<string, unknown>)?.mistake || (item as Record<string, unknown>)?.title),
          )
        : []),
    ])
    .filter(Boolean);
  return {
    mastery: corpus.find((item) => /掌握度|掌握水平/.test(item)) || "掌握度：以当前学习画像为依据",
    preference:
      corpus.find((item) => /偏好|图解|实践|代码|复习/.test(item)) || "学习偏好：按当前学习路径适配",
    weakness: corpus.find((item) => /薄弱|错误|易错|混淆/.test(item)) || "薄弱点：结合本课件内容重点巩固",
  };
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
function continued(slide: PptSlide, index: number): PptSlide {
  return index ? { ...slide, title: `${text(slide.title, "学习内容")}（续 ${index + 1}）` } : { ...slide };
}
export function expandSlides(slides: PptSlide[]) {
  const result: PptSlide[] = [];
  for (const slide of slides) {
    const rawType = text(slide.slideType, "concept");
    const type = rawType === "misconceptions" ? "misconception" : rawType;
    const base = { ...slide, slideType: type };
    const processSteps = steps(slide.steps);
    if ((type === "process" || type === "roadmap") && processSteps.length > 6) {
      result.push(
        ...chunk(processSteps, 6).map((items, index) => ({ ...continued(base, index), steps: items })),
      );
      continue;
    }
    const items = Array.isArray(slide.items) ? slide.items : [];
    if ((type === "misconception" || type === "mistakes") && items.length > 4) {
      result.push(...chunk(items, 4).map((values, index) => ({ ...continued(base, index), items: values })));
      continue;
    }
    const bullets = strings(slide.bullets);
    const bulletSize = type === "summary" || type === "answers" ? 4 : 6;
    if (bullets.length > bulletSize) {
      result.push(
        ...chunk(bullets, bulletSize).map((values, index) => ({
          ...continued(base, index),
          bullets: values,
        })),
      );
      continue;
    }
    const nextSteps = strings(slide.nextSteps);
    if (type === "next_steps" && nextSteps.length > 4) {
      result.push(
        ...chunk(nextSteps, 4).map((values, index) => ({ ...continued(base, index), nextSteps: values })),
      );
      continue;
    }
    if (type === "comparison") {
      const left = strings(slide.left?.items);
      const right = strings(slide.right?.items);
      const pages = Math.ceil(Math.max(left.length, right.length) / 6);
      if (pages > 1) {
        result.push(
          ...Array.from({ length: pages }, (_, index) => ({
            ...continued(base, index),
            left: { ...slide.left, items: left.slice(index * 6, index * 6 + 6) },
            right: { ...slide.right, items: right.slice(index * 6, index * 6 + 6) },
          })),
        );
        continue;
      }
    }
    result.push(base);
  }
  return result;
}
