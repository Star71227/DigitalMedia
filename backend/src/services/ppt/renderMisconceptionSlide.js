/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { cleanText, truncateText } = require("./textUtils");

function normalize(item) {
  if (typeof item === "string")
    return {
      mistake: item,
      reason: "该认识忽略了适用条件或关键步骤。",
      correction: "回到定义、条件和验证过程重新判断。",
    };
  return {
    mistake: item?.mistake || item?.title || "常见错误",
    reason: item?.description || "该认识与条件、过程或结果不一致。",
    correction: item?.correction || "使用正确条件逐步验证结论。",
  };
}

function renderMisconceptionSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "易错点纠正" });
  const items = (
    Array.isArray(data.items) && data.items.length ? data.items : [data.body || "将相似概念视为完全相同"]
  )
    .slice(0, 4)
    .map(normalize);
  const h = items.length <= 2 ? 2.18 : 2.03;
  items.forEach((item, index) => {
    const twoColumns = items.length > 2;
    const col = twoColumns ? index % 2 : 0;
    const row = twoColumns ? Math.floor(index / 2) : index;
    const x = twoColumns ? 0.72 + col * 6.15 : 0.82;
    const y = 1.46 + row * (h + 0.28);
    const w = twoColumns ? 5.78 : 11.7;
    addRect(slide, pptx, {
      x,
      y,
      w,
      h,
      fill: { color: theme.surface },
      line: { color: theme.danger, width: 1 },
    });
    addText(slide, `错误认识：${truncateText(item.mistake, twoColumns ? 42 : 70)}`, {
      x: x + 0.28,
      y: y + 0.18,
      w: w - 0.56,
      h: 0.32,
      fontSize: twoColumns ? 13 : 15,
      bold: true,
      color: theme.danger,
      fit: "resize",
    });
    addText(slide, `为什么错误：${truncateText(item.reason, twoColumns ? 62 : 105)}`, {
      x: x + 0.28,
      y: y + 0.68,
      w: w - 0.56,
      h: 0.42,
      fontSize: twoColumns ? 10.5 : 12.5,
      color: theme.muted,
      fit: "resize",
    });
    addText(slide, `正确理解：${truncateText(item.correction, twoColumns ? 86 : 130)}`, {
      x: x + 0.28,
      y: y + 1.22,
      w: w - 0.56,
      h: 0.58,
      fontSize: twoColumns ? 11.5 : 13,
      bold: true,
      color: theme.success,
      breakLine: true,
      fit: "resize",
    });
  });
  addNotes(slide, data);
}
module.exports = renderMisconceptionSlide;
