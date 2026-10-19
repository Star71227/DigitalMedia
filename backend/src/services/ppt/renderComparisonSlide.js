/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { arrayOfText, cleanText, truncateText } = require("./textUtils");

function renderColumn(slide, pptx, theme, part, x, accent) {
  addRect(slide, pptx, {
    x,
    y: 1.52,
    w: 5.72,
    h: 4.86,
    fill: { color: theme.surface },
    line: { color: accent, width: 1.5 },
  });
  addText(slide, cleanText(part?.title, "对比对象"), {
    x: x + 0.35,
    y: 1.83,
    w: 5.0,
    h: 0.48,
    fontSize: 21,
    bold: true,
    color: accent,
    fit: "resize",
  });
  arrayOfText(part?.items)
    .slice(0, 6)
    .forEach((item, index) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x + 0.38,
        y: 2.68 + index * 0.56,
        w: 0.18,
        h: 0.18,
        fill: { color: accent },
        line: { color: accent, transparency: 100 },
      });
      addText(slide, truncateText(item, 85), {
        x: x + 0.76,
        y: 2.55 + index * 0.56,
        w: 4.55,
        h: 0.42,
        fontSize: 14,
        color: theme.text,
        fit: "resize",
      });
    });
}

function renderComparisonSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "对比分析" });
  renderColumn(slide, pptx, theme, data.left, 0.72, theme.primary);
  renderColumn(slide, pptx, theme, data.right, 6.9, theme.accent);
  const shared =
    arrayOfText(data.left?.items).find((item) => arrayOfText(data.right?.items).includes(item)) ||
    "目标或核心问题一致";
  const insights = [
    ["相同点", shared],
    ["不同点", "结构、约束与实现代价不同"],
    ["适用场景", cleanText(data.body, "根据问题条件选择方案")],
  ];
  insights.forEach(([label, value], index) => {
    addRect(slide, pptx, {
      x: 0.72 + index * 4.05,
      y: 6.18,
      w: 3.72,
      h: 0.5,
      fill: { color: theme.surfaceAlt },
      line: { color: theme.border, width: 1 },
    });
    addText(slide, `${label}：${truncateText(value, 42)}`, {
      x: 0.93 + index * 4.05,
      y: 6.31,
      w: 3.28,
      h: 0.22,
      fontSize: 11,
      bold: true,
      color: theme.muted,
      align: "center",
      fit: "resize",
    });
  });
  addNotes(slide, data);
}
module.exports = renderComparisonSlide;
