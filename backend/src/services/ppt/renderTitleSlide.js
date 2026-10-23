/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { cleanText, truncateText } = require("./textUtils");

function renderTitleSlide(context) {
  const { pptx, data, theme, pageNumber, citationCatalog, personalization } = context;
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { cover: true });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: theme.accent },
    line: { color: theme.accent, transparency: 100 },
  });
  addText(slide, "LEARNMATE · 寻笺", {
    x: 0.72,
    y: 0.58,
    w: 4.4,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: theme.primary,
    charSpacing: 1.5,
  });
  addText(slide, "为当前学生个性化生成", {
    x: 9.55,
    y: 0.58,
    w: 2.95,
    h: 0.3,
    fontSize: 10,
    bold: true,
    color: theme.accent,
    align: "right",
  });
  addText(slide, truncateText(data.title || "个性化学习课件", 150), {
    x: 0.75,
    y: 1.18,
    w: 7.5,
    h: 1.45,
    fontSize: cleanText(data.title).length > 60 ? 29 : 38,
    bold: true,
    color: theme.text,
    valign: "bottom",
    fit: "resize",
  });
  addText(slide, cleanText(data.subtitle, "基于当前课程知识点与学习路径生成"), {
    x: 0.8,
    y: 2.85,
    w: 7.25,
    h: 0.72,
    fontSize: 18,
    color: theme.muted,
    valign: "top",
    fit: "resize",
  });
  addRect(slide, pptx, {
    x: 8.65,
    y: 1.25,
    w: 3.85,
    h: 4.85,
    fill: { color: theme.surface },
    line: { color: theme.border, width: 1.2 },
  });
  addText(slide, "本次学习画像", {
    x: 9.02,
    y: 1.62,
    w: 3.05,
    h: 0.35,
    fontSize: 17,
    bold: true,
    color: theme.text,
  });
  const profile = [personalization.mastery, personalization.preference, personalization.weakness];
  profile.forEach((item, index) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 9.02,
      y: 2.3 + index * 0.86,
      w: 0.34,
      h: 0.34,
      fill: { color: index === 2 ? theme.warning : theme.accent },
      line: { color: theme.background, transparency: 100 },
    });
    addText(slide, truncateText(item, 48), {
      x: 9.55,
      y: 2.22 + index * 0.86,
      w: 2.48,
      h: 0.55,
      fontSize: 13,
      color: theme.muted,
      fit: "resize",
    });
  });
  addRect(slide, pptx, {
    x: 9.0,
    y: 5.12,
    w: 3.13,
    h: 0.65,
    fill: { color: theme.surfaceAlt },
    line: { color: theme.surfaceAlt, transparency: 100 },
  });
  addText(slide, "预计学习时间：以当前学习路径安排为准", {
    x: 9.22,
    y: 5.28,
    w: 2.7,
    h: 0.28,
    fontSize: 11,
    bold: true,
    color: theme.primary,
    fit: "resize",
  });
  addText(slide, "课程与知识点", {
    x: 0.8,
    y: 4.4,
    w: 2.2,
    h: 0.25,
    fontSize: 10,
    bold: true,
    color: theme.primary,
  });
  addText(slide, truncateText(data.title || "当前学习主题", 80), {
    x: 0.8,
    y: 4.78,
    w: 6.7,
    h: 0.52,
    fontSize: 22,
    bold: true,
    color: theme.text,
    fit: "resize",
  });
  addText(slide, "本课件重点：理解核心概念、建立结构联系并完成针对性巩固", {
    x: 0.8,
    y: 5.65,
    w: 7.25,
    h: 0.48,
    fontSize: 15,
    color: theme.muted,
    fit: "resize",
  });
  addNotes(slide, data);
}

module.exports = renderTitleSlide;
