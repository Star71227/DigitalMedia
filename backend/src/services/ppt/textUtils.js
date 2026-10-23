/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const MAX_TITLE = 54;

function cleanText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const result = String(value).replace(/\r/g, "").trim();
  return result || fallback;
}

function truncateText(value, max, suffix = "…") {
  const text = cleanText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - suffix.length)).trim()}${suffix}`;
}

function titleSize(value, preferred = 25) {
  const length = cleanText(value).length;
  if (length > 120) return 18;
  if (length > 80) return 20;
  if (length > MAX_TITLE) return 22;
  return preferred;
}

function arrayOfText(value) {
  return Array.isArray(value) ? value.map((item) => cleanText(item)).filter(Boolean) : [];
}

function chunks(items, size = 6) {
  if (!items.length) return [[]];
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function continuedTitle(title, pageIndex) {
  return pageIndex ? `${truncateText(title, 120)}（续 ${pageIndex + 1}）` : title;
}

function expandSlides(slides = []) {
  return slides.flatMap((raw) => {
    const slide = raw && typeof raw === "object" ? { ...raw } : { slideType: "concept", title: "学习内容" };
    const type = slide.slideType === "misconceptions" ? "misconception" : slide.slideType || "concept";
    slide.slideType = type;
    if (type === "process" && Array.isArray(slide.steps) && slide.steps.length > 6) {
      return chunks(slide.steps, 6).map((steps, index) => ({
        ...slide,
        title: continuedTitle(slide.title, index),
        steps,
      }));
    }
    if (type === "comparison") {
      const leftItems = arrayOfText(slide.left?.items);
      const rightItems = arrayOfText(slide.right?.items);
      const pages = Math.max(1, Math.ceil(Math.max(leftItems.length, rightItems.length) / 6));
      return Array.from({ length: pages }, (_, index) => ({
        ...slide,
        title: continuedTitle(slide.title, index),
        left: slide.left ? { ...slide.left, items: leftItems.slice(index * 6, index * 6 + 6) } : undefined,
        right: slide.right
          ? { ...slide.right, items: rightItems.slice(index * 6, index * 6 + 6) }
          : undefined,
      }));
    }
    for (const field of ["items", "bullets", "nextSteps", "questionIds"]) {
      const pageSize =
        type === "misconception" && field === "items"
          ? 4
          : (type === "next_steps" && field === "nextSteps") || (type === "summary" && field === "bullets")
            ? 4
            : 6;
      if (Array.isArray(slide[field]) && slide[field].length > pageSize) {
        return chunks(slide[field], pageSize).map((items, index) => ({
          ...slide,
          title: continuedTitle(slide.title, index),
          [field]: items,
        }));
      }
    }
    if (type === "code" && cleanText(slide.code).split("\n").length > 24) {
      const fullCode = cleanText(slide.code);
      slide.code = `${fullCode.split("\n").slice(0, 23).join("\n")}\n// …其余代码见演讲者备注`;
      slide.__fullCode = fullCode;
    }
    return [slide];
  });
}

function inferPersonalization(slides = []) {
  const corpus = slides
    .flatMap((slide) => [slide.subtitle, slide.body, ...(slide.bullets || [])])
    .map(cleanText)
    .filter(Boolean);
  const mastery = corpus.find((text) => /掌握度|掌握水平/.test(text));
  const preference = corpus.find((text) => /偏好|图解|实践|代码|复习/.test(text));
  const weakness = corpus.find((text) => /薄弱|错误|易错|混淆/.test(text));
  return {
    mastery: mastery ? truncateText(mastery, 36) : "掌握度：以当前学习画像为依据",
    preference: preference ? truncateText(preference, 36) : "学习偏好：按当前学习路径适配",
    weakness: weakness ? truncateText(weakness, 44) : "薄弱点：结合本课件内容重点巩固",
  };
}

module.exports = { arrayOfText, cleanText, expandSlides, inferPersonalization, titleSize, truncateText };
