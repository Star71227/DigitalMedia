/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { arrayOfText, cleanText, truncateText } = require("./textUtils");

function renderExampleSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "例题与应用" });
  addRect(slide, pptx, {
    x: 0.72,
    y: 1.48,
    w: 4.35,
    h: 5.0,
    fill: { color: theme.surfaceAlt },
    line: { color: theme.border, width: 1 },
  });
  addText(slide, "题目", {
    x: 1.02,
    y: 1.82,
    w: 0.9,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color: theme.primary,
  });
  addText(slide, cleanText(data.body, data.subtitle || "结合本节概念完成分析，并说明判断依据。"), {
    x: 1.02,
    y: 2.3,
    w: 3.75,
    h: 2.35,
    fontSize: 18,
    bold: true,
    color: theme.text,
    valign: "top",
    fit: "resize",
  });
  addText(slide, "先明确输入、条件与目标，再开始求解。", {
    x: 1.02,
    y: 5.55,
    w: 3.7,
    h: 0.4,
    fontSize: 12,
    color: theme.muted,
    fit: "resize",
  });
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const ideas = steps.length
    ? steps.map((step) => `${step.title}：${step.description}`)
    : arrayOfText(data.bullets);
  const sections = [
    ["思路", ideas[0] || "识别题目涉及的核心概念与约束"],
    ["步骤", ideas.slice(1).join("；") || "按顺序执行，并记录关键状态变化"],
    ["结论", data.explanation || "回代条件验证结果，确认边界情况"],
  ];
  sections.forEach(([title, body], index) => {
    addRect(slide, pptx, {
      x: 5.42,
      y: 1.48 + index * 1.7,
      w: 7.18,
      h: 1.42,
      fill: { color: theme.surface },
      line: { color: index === 2 ? theme.success : theme.border, width: 1 },
    });
    addText(slide, title, {
      x: 5.72,
      y: 1.75 + index * 1.7,
      w: 0.85,
      h: 0.3,
      fontSize: 14,
      bold: true,
      color: index === 2 ? theme.success : theme.primary,
    });
    addText(slide, truncateText(body, 210), {
      x: 6.72,
      y: 1.67 + index * 1.7,
      w: 5.5,
      h: 0.88,
      fontSize: 14,
      color: theme.text,
      fit: "resize",
    });
  });
  addNotes(slide, data);
}
module.exports = renderExampleSlide;
