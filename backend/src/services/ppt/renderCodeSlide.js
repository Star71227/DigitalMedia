/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { FONT_FACE, addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { cleanText, truncateText } = require("./textUtils");

function renderCodeSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "代码实践" });
  addRect(slide, pptx, {
    x: 0.72,
    y: 1.45,
    w: 8.1,
    h: 5.35,
    fill: { color: theme.codeBackground },
    line: { color: theme.border, width: 1 },
  });
  addText(slide, cleanText(data.language, "CODE").toUpperCase(), {
    x: 1.02,
    y: 1.68,
    w: 1.35,
    h: 0.28,
    fontSize: 10,
    bold: true,
    color: theme.accent,
    charSpacing: 1.4,
  });
  addText(slide, cleanText(data.code, "// 当前课件未提供代码，请结合练习补充。"), {
    x: 1.02,
    y: 2.12,
    w: 7.48,
    h: 4.32,
    fontFace: "Consolas",
    fontSize: 12,
    color: theme.codeText,
    valign: "top",
    breakLine: true,
    margin: 0.06,
  });
  addRect(slide, pptx, {
    x: 9.15,
    y: 1.45,
    w: 3.45,
    h: 3.25,
    fill: { color: theme.surface },
    line: { color: theme.border, width: 1 },
  });
  addText(slide, "代码解释", {
    x: 9.48,
    y: 1.8,
    w: 2.8,
    h: 0.35,
    fontSize: 17,
    bold: true,
    color: theme.text,
  });
  addText(
    slide,
    truncateText(data.explanation || "关注输入、状态变化、返回结果以及与核心概念的对应关系。", 310),
    { x: 9.48, y: 2.4, w: 2.78, h: 1.8, fontSize: 14, color: theme.muted, valign: "top", fit: "resize" },
  );
  addRect(slide, pptx, {
    x: 9.15,
    y: 4.95,
    w: 3.45,
    h: 1.85,
    fill: { color: theme.surfaceAlt },
    line: { color: theme.warning, width: 1 },
  });
  addText(slide, "复杂度与边界提醒", {
    x: 9.48,
    y: 5.28,
    w: 2.75,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: theme.warning,
  });
  addText(slide, "检查空输入、规模上界、循环终止条件与时间/空间开销。", {
    x: 9.48,
    y: 5.82,
    w: 2.72,
    h: 0.55,
    fontSize: 12,
    color: theme.text,
    fit: "resize",
    fontFace: FONT_FACE,
  });
  addNotes(slide, data);
}
module.exports = renderCodeSlide;
