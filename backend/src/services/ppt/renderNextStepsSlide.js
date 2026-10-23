/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addCard, addNotes, addText, createSlide } = require("./layoutUtils");
const { arrayOfText } = require("./textUtils");

function renderNextStepsSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "下一步学习路径" });
  const values = arrayOfText(data.nextSteps).length ? arrayOfText(data.nextSteps) : arrayOfText(data.bullets);
  const cards = [
    ["下一知识点", values[0] || "沿当前学习路径进入后续知识点"],
    ["推荐资源", values[1] || "复习本课件中的概念、流程与易错点"],
    ["推荐练习", values[2] || "完成阶段自测或关联 CodeLab 练习"],
    ["预计时间", values[3] || "以当前学习路径安排为准"],
  ];
  cards.forEach(([title, body], index) => {
    addCard(slide, pptx, theme, {
      x: 0.78 + index * 3.02,
      y: 2.0,
      w: 2.7,
      h: 3.65,
      title,
      body,
      index: index + 1,
      bodySize: 14,
      tone: index === 3 ? "accent" : "primary",
    });
    if (index < 3)
      slide.addShape(pptx.ShapeType.chevron, {
        x: 3.55 + index * 3.02,
        y: 3.6,
        w: 0.25,
        h: 0.38,
        fill: { color: theme.accent },
        line: { color: theme.accent, transparency: 100 },
      });
  });
  addText(slide, "完成练习后回到学习路径更新掌握度，形成“学习—练习—反馈—再学习”闭环。", {
    x: 1.1,
    y: 6.2,
    w: 11.1,
    h: 0.38,
    fontSize: 13,
    color: theme.muted,
    align: "center",
    fit: "resize",
  });
  addNotes(slide, data);
}
module.exports = renderNextStepsSlide;
