/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");
const { generatePptx, validatePptxFile } = require("../src/services/pptxService");
const { buildFallback } = require("../src/services/agents/multimodalResourceAgent");
test("PPTX 页脚引用和真实参考资料页写入 OOXML", async () => {
  const context = {
    resourceType: "pptx",
    subject: "数据结构",
    knowledgePoint: "红黑树旋转",
    stageTitle: "红黑树旋转",
    stageGoals: ["理解左旋", "理解右旋"],
    mastery: 50,
    errorPatterns: [],
    explanationPreference: "图解",
    resourcePreferences: ["课件"],
    priorKnowledge: [],
    estimatedMinutes: 30,
    difficulty: "advanced",
    allowedQuestionIds: [],
    allowedCodeExerciseIds: [],
    questionEvidence: [],
    codeEvidence: [],
  };
  const envelope = buildFallback(context);
  envelope.content.slides[2].citations = [143];
  const reference = {
    sourceKey: "ds-team-notes-balanced-tree",
    title: "数据结构课程讲义：红黑树与旋转",
    chapter: "红黑树",
    section: "左旋",
    version: "1.0.0",
    license: "CC-BY-4.0",
  };
  envelope.content.references = [reference];
  const referenceSlide = envelope.content.slides.find((slide) => slide.slideType === "references");
  referenceSlide.references = [reference];
  const catalog = [{ label: "S1", chunkId: 143 }];
  const file = path.join(os.tmpdir(), `learnmate-citations-${Date.now()}.pptx`);
  try {
    await generatePptx(envelope.content, file, catalog);
    const verified = await validatePptxFile(file);
    const zip = await JSZip.loadAsync(await fs.readFile(file));
    const slideNames = verified.entries.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const xml = await Promise.all(slideNames.map((name) => zip.file(name).async("string")));
    assert.ok(xml.some((value) => value.includes("[S1]")));
    const referenceXml = xml.at(-1);
    assert.ok(referenceXml.includes("参考资料"));
    assert.equal(referenceXml.includes("[NaN]"), false);
    assert.ok(referenceXml.includes("[1]"));
    assert.ok(referenceXml.includes("CC-BY-4.0"));
    assert.ok(referenceXml.includes("数据结构课程讲义：红黑树与旋转"));
  } finally {
    await fs.rm(file, { force: true });
  }
});
