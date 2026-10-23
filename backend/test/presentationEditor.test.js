/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { validateDocument, render } = require("../src/services/presentationEditorService");
const { pool } = require("../src/config/db");
const document = {
  title: "红黑树复习",
  slides: [
    {
      background: "#ffffff",
      notes: "先说明旋转条件",
      elements: [
        {
          text: "左右旋转 & 边界",
          left: 60,
          top: 45,
          width: 880,
          height: 100,
          fontSize: 36,
          color: "#1849c6",
          bold: true,
        },
      ],
    },
  ],
};
after(() => pool.end());
test("reject malformed decks and off-canvas geometry", () => {
  assert.throws(() => validateDocument({ ...document, slides: [] }));
  assert.throws(() => validateDocument({ ...document, slides: Array(61).fill(document.slides[0]) }));
  const invalid = structuredClone(document);
  invalid.slides[0].elements[0].left = 950;
  assert.throws(() => validateDocument(invalid), /超出页面/);
  invalid.slides[0].elements[0].left = NaN;
  assert.throws(() => validateDocument(invalid), /超出范围/);
});
test("export real editable PPTX text, position, background and speaker notes", async () => {
  const bytes = await render(document);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.match(xml, /左右旋转 &amp; 边界/);
  assert.match(xml, /1849C6/i);
  assert.match(xml, /cx="10728960"/);
  const notes = await zip.file("ppt/notesSlides/notesSlide1.xml").async("string");
  assert.match(notes, /先说明旋转条件/);
});
