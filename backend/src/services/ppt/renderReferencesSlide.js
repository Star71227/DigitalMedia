/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { addNotes, addRect, addText, createSlide } = require("./layoutUtils");
const { cleanText, truncateText } = require("./textUtils");

function renderReferencesSlide({ pptx, data, theme, pageNumber, citationCatalog }) {
  const slide = createSlide(pptx, data, theme, pageNumber, citationCatalog, { section: "参考资料" });
  const references = Array.isArray(data.references) ? data.references.slice(0, 6) : [];
  const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;
  references.forEach((reference, index) => {
    const y = 1.45 + index * 0.86;
    addRect(slide, pptx, {
      x: 0.72,
      y,
      w: 11.88,
      h: 0.68,
      fill: { color: theme.surface },
      line: { color: theme.border, width: 1 },
    });
    addText(slide, `[${offset + index + 1}]`, {
      x: 0.98,
      y: y + 0.18,
      w: 0.58,
      h: 0.26,
      fontSize: 12,
      bold: true,
      color: theme.primary,
      align: "center",
    });
    addText(slide, truncateText(reference.title || reference.sourceKey || "未命名来源", 100), {
      x: 1.75,
      y: y + 0.12,
      w: 4.1,
      h: 0.42,
      fontSize: 14,
      bold: true,
      color: theme.text,
      fit: "resize",
    });
    const locator =
      [reference.chapter && `章节：${reference.chapter}`, reference.section && `小节：${reference.section}`]
        .filter(Boolean)
        .join("  ·  ") || "章节信息未提供";
    addText(slide, locator, {
      x: 6.08,
      y: y + 0.12,
      w: 2.8,
      h: 0.42,
      fontSize: 11,
      color: theme.muted,
      fit: "resize",
    });
    addText(
      slide,
      `版本：${cleanText(reference.version, "未提供")}  ·  许可证：${cleanText(reference.license, "未提供")}`,
      {
        x: 9.05,
        y: y + 0.12,
        w: 3.2,
        h: 0.42,
        fontSize: 11,
        color: theme.muted,
        align: "right",
        fit: "resize",
      },
    );
  });
  if (!references.length)
    addText(slide, "当前资源未附带参考资料。", {
      x: 0.82,
      y: 2.0,
      w: 11.5,
      h: 0.5,
      fontSize: 18,
      color: theme.muted,
      align: "center",
    });
  addNotes(slide, data);
}
module.exports = renderReferencesSlide;
