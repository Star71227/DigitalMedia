/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { cleanText } = require("./textUtils");

function renderProcessSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "过程与步骤" });
  const steps =
    Array.isArray(data.steps) && data.steps.length
      ? data.steps.slice(0, 6)
      : [
          { title: "理解", description: data.body || "确认输入、目标与边界" },
          { title: "应用", description: "按顺序执行关键操作" },
          { title: "验证", description: "检查结果并复盘错误" },
        ];
  const columns = steps.length <= 3 ? steps.length : 3;
  const cardW = columns === 1 ? 7 : columns === 2 ? 5.6 : 3.72;
  const cardH = steps.length <= 3 ? 3.55 : 2.12;
  steps.forEach((step, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = steps.length <= 2 ? 0.9 + col * 6 : 0.72 + col * 4.05;
    const y = 1.62 + row * 2.46;
    addRect(slide, pptx, {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: { color: theme.surface },
      line: { color: theme.border, width: 1 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.25,
      y: y + 0.27,
      w: 0.55,
      h: 0.55,
      fill: { color: theme.primary },
      line: { color: theme.primary, transparency: 100 },
    });
    addText(slide, String(index + 1), {
      x: x + 0.25,
      y: y + 0.37,
      w: 0.55,
      h: 0.22,
      fontSize: 12,
      bold: true,
      color: theme.background,
      align: "center",
    });
    addText(slide, cleanText(step.title, `步骤 ${index + 1}`), {
      x: x + 1.0,
      y: y + 0.27,
      w: cardW - 1.25,
      h: 0.45,
      fontSize: 17,
      bold: true,
      color: theme.text,
      fit: "resize",
    });
    addText(slide, cleanText(step.description, "按本步骤完成学习任务"), {
      x: x + 0.3,
      y: y + 1.02,
      w: cardW - 0.6,
      h: cardH - 1.28,
      fontSize: 14,
      color: theme.muted,
      valign: "top",
      fit: "resize",
    });
    if (index < steps.length - 1 && col < columns - 1)
      slide.addShape(pptx.ShapeType.chevron, {
        x: x + cardW + 0.09,
        y: y + cardH / 2 - 0.13,
        w: 0.2,
        h: 0.26,
        fill: { color: theme.accent },
        line: { color: theme.accent, transparency: 100 },
      });
  });
  addNotes(slide, data);
}
module.exports = renderProcessSlide;
