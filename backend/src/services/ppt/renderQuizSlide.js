/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { arrayOfText, cleanText, truncateText } = require("./textUtils");

function renderQuizSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "阶段自测" });
  const question = cleanText(
    data.body,
    data.subtitle || "请选择最符合本节核心概念与适用条件的选项。答题后再查看解析。",
  );
  addRect(slide, pptx, {
    x: 0.72,
    y: 1.45,
    w: 7.7,
    h: 1.55,
    fill: { color: theme.surfaceAlt },
    line: { color: theme.border, width: 1 },
  });
  addText(slide, "题目", {
    x: 1.02,
    y: 1.75,
    w: 0.75,
    h: 0.28,
    fontSize: 11,
    bold: true,
    color: theme.primary,
  });
  addText(slide, truncateText(question, 260), {
    x: 1.02,
    y: 2.12,
    w: 7.05,
    h: 0.57,
    fontSize: 17,
    bold: true,
    color: theme.text,
    fit: "resize",
  });
  const options = arrayOfText(data.bullets).length
    ? arrayOfText(data.bullets).slice(0, 4)
    : ["A. 根据定义与条件判断", "B. 只根据表面形式判断", "C. 忽略边界情况", "D. 跳过验证直接作答"];
  options.forEach((option, index) => {
    addRect(slide, pptx, {
      x: 0.72 + (index % 2) * 3.95,
      y: 3.3 + Math.floor(index / 2) * 1.2,
      w: 3.58,
      h: 0.92,
      fill: { color: theme.surface },
      line: { color: theme.border, width: 1 },
    });
    addText(slide, truncateText(option, 82), {
      x: 1.0 + (index % 2) * 3.95,
      y: 3.48 + Math.floor(index / 2) * 1.2,
      w: 3.04,
      h: 0.52,
      fontSize: 14,
      color: theme.text,
      fit: "resize",
    });
  });
  addRect(slide, pptx, {
    x: 8.75,
    y: 1.45,
    w: 3.85,
    h: 4.95,
    fill: { color: theme.surface },
    line: { color: theme.accent, width: 1 },
  });
  addText(slide, "思考提示", {
    x: 9.1,
    y: 1.82,
    w: 2.9,
    h: 0.35,
    fontSize: 18,
    bold: true,
    color: theme.accent,
  });
  addText(
    slide,
    cleanText(data.explanation, "先找出题目中的条件，再排除违反定义或忽略边界的选项。主页面不直接展示答案。"),
    { x: 9.1, y: 2.42, w: 3.0, h: 1.5, fontSize: 14, color: theme.muted, valign: "top", fit: "resize" },
  );
  const ids = arrayOfText(data.questionIds);
  addText(slide, "题目 ID", {
    x: 9.1,
    y: 4.55,
    w: 1.0,
    h: 0.25,
    fontSize: 11,
    bold: true,
    color: theme.primary,
  });
  addText(slide, ids.length ? ids.join("  ·  ") : "本页为概念自测，暂无绑定题库 ID", {
    x: 9.1,
    y: 5.0,
    w: 2.95,
    h: 0.72,
    fontSize: 13,
    color: theme.text,
    fit: "resize",
  });
  addNotes(slide, data);
}
module.exports = renderQuizSlide;
