/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPptxFallbackContent } = require("../src/services/pptService");
const { validatePptDeckQuality } = require("../src/services/pptQualityService");

function context(overrides = {}) {
  return {
    resourceType: "pptx",
    subject: "数据结构",
    knowledgePoint: "红黑树旋转",
    stageTitle: "红黑树旋转阶段",
    stageGoals: ["理解左旋", "理解右旋", "能手推父子指针变化"],
    mastery: 58,
    errorPatterns: [{ errorType: "旋转前后父子关系混淆" }],
    explanationPreference: "图解讲解",
    resourcePreferences: ["课件", "例题"],
    priorKnowledge: ["二叉搜索树"],
    learningGoals: ["掌握红黑树调整"],
    paceAndTimeBudget: { pacePreference: "稳步推进", weeklyTimeBudgetMinutes: 120 },
    estimatedMinutes: 30,
    difficulty: "intermediate",
    allowedQuestionIds: [],
    allowedCodeExerciseIds: [],
    questionEvidence: [],
    codeEvidence: [],
    ...overrides,
  };
}

function deck() {
  return buildPptxFallbackContent(context());
}

function issueCodes(result) {
  return result.issues.map((item) => item.code);
}

test("deterministic PPT deck passes the 14-18 page teaching quality gate", () => {
  const content = deck();
  const result = validatePptDeckQuality({ content, context: context() });
  assert.equal(result.passed, true);
  assert.equal(result.slideCount, 16);
  assert.ok(result.exampleSlideCount >= 2);
  assert.ok(result.notesCoverage >= 0.8);
  assert.ok(result.usedSlideTypes.includes("references"));
});

test("PPT quality gate rejects invalid slide counts and missing canonical sections", () => {
  const short = deck();
  short.slides = short.slides.slice(0, 13);
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: short, context: context() })).includes(
      "invalid_slide_count",
    ),
  );

  const missing = deck();
  missing.slides = missing.slides.filter((slide) => slide.slideType !== "practice");
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: missing, context: context() })).includes("missing_practice"),
  );
});

test("PPT quality gate rejects weak teaching slides and unsafe payloads", () => {
  const noNotes = deck();
  noNotes.slides.forEach((slide) => {
    slide.speakerNotes = "";
  });
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: noNotes, context: context() })).includes(
      "insufficient_speaker_notes",
    ),
  );

  const placeholder = deck();
  placeholder.slides[3].body = "TODO";
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: placeholder, context: context() })).includes(
      "placeholder_found",
    ),
  );

  const unsafe = deck();
  unsafe.slides[3].body = "<script>alert(1)</script>";
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: unsafe, context: context() })).includes("unsafe_content"),
  );
});

test("PPT quality gate rejects duplicate, overdense and source-forged decks", () => {
  const duplicate = deck();
  duplicate.slides[4].title = duplicate.slides[3].title;
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: duplicate, context: context() })).includes(
      "duplicate_titles",
    ),
  );

  const dense = deck();
  dense.slides[3].body = "红黑树旋转".repeat(80);
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: dense, context: context() })).includes("overdense_slide"),
  );

  const forged = deck();
  forged.slides[3].sourceRefs = ["unknown:source"];
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: forged, context: context() })).includes(
      "dangling_source_ref",
    ),
  );
});

test("PPT quality gate rejects private code and quiz fields", () => {
  const privateField = deck();
  privateField.slides[3].correctAnswer = "A";
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: privateField, context: context() })).includes(
      "private_field_leaked",
    ),
  );

  const privateText = deck();
  privateText.slides[3].body = "本页包含 reference solution 和 hidden tests。";
  assert.ok(
    issueCodes(validatePptDeckQuality({ content: privateText, context: context() })).includes(
      "internal_terms_leaked",
    ),
  );
});

test("PPT content hash changes when public teaching content changes", () => {
  const first = validatePptDeckQuality({ content: deck(), context: context() });
  const changed = deck();
  changed.slides[3].body += " 这里补充一个可见的教学结论。";
  const second = validatePptDeckQuality({ content: changed, context: context() });
  assert.notEqual(first.contentHash, second.contentHash);
});
