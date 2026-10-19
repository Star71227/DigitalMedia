/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addCard, addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { arrayOfText, cleanText, truncateText } = require("./textUtils");

function renderConceptSlide({ pptx, data, theme, pageNumber, citationCatalog, personalization }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "核心概念" });
  addRect(slide, pptx, {
    x: 0.72,
    y: 1.48,
    w: 5.05,
    h: 4.82,
    fill: { color: theme.surfaceAlt },
    line: { color: theme.border, width: 1 },
  });
  addText(slide, "中心概念", {
    x: 1.02,
    y: 1.8,
    w: 1.55,
    h: 0.28,
    fontSize: 11,
    bold: true,
    color: theme.primary,
  });
  addText(slide, cleanText(data.title, "核心概念"), {
    x: 1.02,
    y: 2.28,
    w: 4.4,
    h: 0.82,
    fontSize: 27,
    bold: true,
    color: theme.text,
    fit: "resize",
  });
  addText(slide, cleanText(data.body, "从定义、条件、结构与结果四个方面建立完整理解。"), {
    x: 1.02,
    y: 3.35,
    w: 4.38,
    h: 1.55,
    fontSize: 17,
    color: theme.muted,
    valign: "top",
    breakLine: true,
    fit: "resize",
  });
  addText(slide, personalization.mastery, {
    x: 1.02,
    y: 5.55,
    w: 4.35,
    h: 0.35,
    fontSize: 12,
    bold: true,
    color: theme.primary,
    fit: "resize",
  });
  const features = arrayOfText(data.bullets);
  const cards = (features.length ? features : ["定义与边界", "适用条件", "关键结构", "结果验证"]).slice(0, 4);
  cards.forEach((item, index) => {
    const text = cleanText(item);
    const compact =
      text.length > 34
        ? { title: `要点 ${index + 1}`, body: truncateText(text, 96), titleSize: 14, bodySize: 11.5 }
        : { title: text, titleSize: text.length > 22 ? 14 : 17 };
    addCard(slide, pptx, theme, {
      x: 6.12 + (index % 2) * 3.15,
      y: 1.48 + Math.floor(index / 2) * 2.43,
      w: 2.86,
      h: 2.12,
      index: index + 1,
      ...compact,
    });
  });
  addNotes(slide, data);
}
module.exports = renderConceptSlide;
