/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { cleanText, titleSize, truncateText } = require("./textUtils");

const PAGE = {
  width: 13.333,
  height: 7.5,
  left: 0.58,
  right: 12.75,
  top: 0.42,
  contentTop: 1.28,
  contentBottom: 6.92,
};
const FONT_FACE = "Microsoft YaHei";

function addText(slide, text, options = {}) {
  const value = cleanText(text);
  if (!value) return;
  slide.addText(value, { fontFace: FONT_FACE, margin: 0, valign: "mid", breakLine: false, ...options });
}

function addRect(slide, pptx, options = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    radius: 0.06,
    line: { color: options.line?.color || "FFFFFF", transparency: options.line ? 0 : 100 },
    ...options,
  });
}

function addHeader(slide, pptx, data, theme, section = "个性化学习课件") {
  addText(slide, section, {
    x: PAGE.left,
    y: 0.28,
    w: 3.8,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: theme.primary,
    charSpacing: 1.2,
  });
  addText(slide, truncateText(data.title || "学习内容", 150), {
    x: PAGE.left,
    y: 0.55,
    w: 11.95,
    h: 0.56,
    fontSize: titleSize(data.title),
    bold: true,
    color: theme.text,
    fit: "resize",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: PAGE.left,
    y: 1.16,
    w: 12.17,
    h: 0,
    line: { color: theme.border, width: 1 },
  });
}

function addFooter(slide, data, theme, pageNumber, citationCatalog = []) {
  const labels = (data.citations || [])
    .map((id) => citationCatalog.find((item) => Number(item.chunkId) === Number(id))?.label)
    .filter(Boolean)
    .map((label) => `[${label}]`)
    .join(" ");
  addText(slide, labels || "LearnMate · 当前学生个性化生成", {
    x: PAGE.left,
    y: 7.08,
    w: 8.8,
    h: 0.2,
    fontSize: 8,
    color: theme.muted,
  });
  addText(slide, String(pageNumber).padStart(2, "0"), {
    x: 11.82,
    y: 7.04,
    w: 0.9,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: theme.primary,
    align: "right",
  });
}

function createSlide(pptx, data, theme, pageNumber, citationCatalog, options = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: theme.background };
  if (!options.cover) addHeader(slide, pptx, data, theme, options.section);
  addFooter(slide, data, theme, pageNumber, citationCatalog);
  return slide;
}

function addCard(
  slide,
  pptx,
  theme,
  { x, y, w, h, title, body, index, tone = "primary", titleSize: cardTitleSize = 17, bodySize = 14 },
) {
  const color = theme[tone] || theme.primary;
  addRect(slide, pptx, {
    x,
    y,
    w,
    h,
    fill: { color: theme.surface },
    line: { color: theme.border, width: 1 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: 0.07,
    h,
    fill: { color },
    line: { color, transparency: 100 },
  });
  if (index !== undefined) {
    addText(slide, String(index).padStart(2, "0"), {
      x: x + 0.23,
      y: y + 0.18,
      w: 0.62,
      h: 0.3,
      fontSize: 13,
      bold: true,
      color,
    });
  }
  const textX = x + (index !== undefined ? 0.92 : 0.28);
  addText(slide, truncateText(title, 72), {
    x: textX,
    y: y + 0.16,
    w: w - (textX - x) - 0.22,
    h: body ? 0.4 : h - 0.3,
    fontSize: cardTitleSize,
    bold: true,
    color: theme.text,
    fit: "resize",
  });
  if (body)
    addText(slide, truncateText(body, 190), {
      x: x + 0.28,
      y: y + 0.7,
      w: w - 0.56,
      h: h - 0.88,
      fontSize: bodySize,
      color: theme.muted,
      valign: "top",
      breakLine: true,
      fit: "resize",
    });
}

function addNotes(slide, data) {
  const notes = [cleanText(data.speakerNotes)];
  if (data.__fullCode) notes.push(`完整代码（主页面为保证可读性已裁剪）：\n${data.__fullCode}`);
  const value = notes.filter(Boolean).join("\n\n");
  if (value) slide.addNotes(value);
}

module.exports = { PAGE, FONT_FACE, addCard, addFooter, addHeader, addNotes, addRect, addText, createSlide };
