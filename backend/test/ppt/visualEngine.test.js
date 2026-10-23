/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  expandSlides,
  generatePptx,
  resolveTheme,
  validatePptxFile,
} = require("../../src/services/pptxService");

test("三种主题与未知主题使用稳定安全映射", () => {
  assert.equal(resolveTheme({ name: "academic-blue" }).name, "academic-blue");
  assert.equal(resolveTheme({ name: "technology-dark" }).name, "technology-dark");
  assert.equal(resolveTheme({ name: "learning-light" }).name, "learning-light");
  assert.equal(resolveTheme({ name: "not-installed" }).name, "academic-blue");
  assert.equal(resolveTheme({ name: "academic-light" }).name, "academic-blue");
});

test("过多流程、普通项目和代码会拆页或可读裁剪", () => {
  const slides = expandSlides([
    {
      slideType: "process",
      title: "流程",
      steps: Array.from({ length: 13 }, (_, index) => ({ title: String(index), description: "步骤" })),
    },
    {
      slideType: "objectives",
      title: "目标",
      bullets: Array.from({ length: 8 }, (_, index) => `目标${index}`),
    },
    {
      slideType: "code",
      title: "代码",
      code: Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n"),
    },
  ]);
  assert.equal(slides.filter((slide) => slide.slideType === "process").length, 3);
  assert.equal(slides.filter((slide) => slide.slideType === "objectives").length, 2);
  const code = slides.find((slide) => slide.slideType === "code");
  assert.ok(code.code.split("\n").length <= 24);
  assert.match(code.__fullCode, /line 39/);
});

test("空可选字段和全部页面语义可生成有效 PPTX", async () => {
  const types = [
    "title",
    "objectives",
    "concept",
    "process",
    "comparison",
    "misconception",
    "example",
    "code",
    "quiz",
    "summary",
    "next_steps",
  ];
  const file = path.join(os.tmpdir(), `learnmate-visual-${Date.now()}.pptx`);
  const slides = types.map((slideType) => ({
    slideType,
    title: `${slideType} 中文页`,
    subtitle: "",
    body: "",
    bullets: [],
    items: [],
    steps: [],
    questionIds: [],
    nextSteps: [],
    speakerNotes: `备注 ${slideType}`,
  }));
  try {
    await generatePptx(
      {
        theme: { name: "technology-dark" },
        slides,
        references: [
          {
            sourceKey: "ref",
            title: "参考资料",
            chapter: "第一章",
            section: "第一节",
            version: "1",
            license: "CC-BY-4.0",
          },
        ],
      },
      file,
    );
    const result = await validatePptxFile(file);
    assert.equal(result.slideCount, 12);
    assert.ok(result.notesCount >= 11);
    assert.deepEqual(result.externalRelationships, []);
  } finally {
    await fs.rm(file, { force: true });
  }
});
