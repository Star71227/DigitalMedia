/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { generatePptx, validatePptxFile, MIME } = require("../src/services/pptxService");
const { buildFallback } = require("../src/services/agents/multimodalResourceAgent");
test("生成真实可解压 PPTX 并包含 OOXML 核心条目", async () => {
  const context = {
    resourceType: "pptx",
    subject: "数据结构",
    knowledgePoint: "树",
    stageTitle: "树阶段",
    stageGoals: ["理解树", "掌握遍历"],
    mastery: 50,
    errorPatterns: [],
    explanationPreference: "图解",
    resourcePreferences: ["课件"],
    priorKnowledge: [],
    estimatedMinutes: 30,
    difficulty: "foundation",
    allowedQuestionIds: ["Q1"],
    allowedCodeExerciseIds: [],
    questionEvidence: [],
    codeEvidence: [],
  };
  const file = path.join(os.tmpdir(), `learnmate-${Date.now()}.pptx`);
  try {
    await generatePptx(buildFallback(context).content, file);
    const result = await validatePptxFile(file);
    const bytes = await fs.readFile(file);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.ok(result.entries.includes("[Content_Types].xml"));
    assert.ok(result.entries.includes("ppt/presentation.xml"));
    assert.ok(result.entries.includes("ppt/slides/slide1.xml"));
    assert.equal(MIME, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  } finally {
    await fs.rm(file, { force: true });
  }
});
