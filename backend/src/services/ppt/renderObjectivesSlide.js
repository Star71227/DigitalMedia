/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addCard, addNotes, addText, createSlide } = require("./layoutUtils");
const { arrayOfText } = require("./textUtils");

function renderObjectivesSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "学习目标" });
  const goals = arrayOfText(data.bullets).length
    ? arrayOfText(data.bullets)
    : [data.body || "明确本节核心知识并完成学习检查"];
  const columns = goals.length <= 3 ? 3 : 2;
  const w = columns === 3 ? 3.78 : 5.75;
  const h = goals.length <= 3 ? 3.45 : 2.12;
  goals.slice(0, 6).forEach((goal, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    addCard(slide, pptx, theme, {
      x: 0.72 + col * (w + 0.32),
      y: 1.62 + row * (h + 0.34),
      w,
      h,
      title: goal,
      index: index + 1,
      titleSize: 18,
    });
  });
  addText(slide, "目标不是阅读清单，而是本节课后的可验证学习结果。", {
    x: 0.78,
    y: 6.55,
    w: 10.8,
    h: 0.28,
    fontSize: 12,
    color: theme.muted,
  });
  addNotes(slide, data);
}
module.exports = renderObjectivesSlide;
