/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addCard, addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { arrayOfText, cleanText } = require("./textUtils");

function renderSummarySlide({ pptx, data, theme, pageNumber, citationCatalog, personalization }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "学习总结" });
  const learned = arrayOfText(data.bullets);
  const cards = [
    ["已学内容", learned.slice(0, 2).join("；") || cleanText(data.body, "已建立核心概念与知识结构")],
    ["关键结论", learned.slice(2, 4).join("；") || "条件、过程和验证共同决定正确结论"],
    ["易错提醒", personalization.weakness],
  ];
  cards.forEach(([title, body], index) =>
    addCard(slide, pptx, theme, {
      x: 0.72 + index * 4.08,
      y: 1.55,
      w: 3.72,
      h: 3.65,
      title,
      body,
      index: index + 1,
      bodySize: 15,
      tone: index === 2 ? "warning" : "primary",
    }),
  );
  addRect(slide, pptx, {
    x: 0.72,
    y: 5.55,
    w: 11.88,
    h: 1.05,
    fill: { color: theme.surfaceAlt },
    line: { color: theme.success, width: 1 },
  });
  addText(slide, "学习目标检查", {
    x: 1.05,
    y: 5.87,
    w: 1.85,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: theme.success,
  });
  addText(
    slide,
    data.nextSteps?.length
      ? "已完成本节学习，请按下一步建议进行练习与验收。"
      : "请用自己的语言复述核心概念，并通过练习确认是否达到目标。",
    { x: 3.12, y: 5.8, w: 8.95, h: 0.42, fontSize: 15, color: theme.text, fit: "resize" },
  );
  addNotes(slide, data);
}
module.exports = renderSummarySlide;
