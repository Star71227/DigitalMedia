/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { analyze } = require("../scripts/verifyQuestionBank");
const { validateQuestionSet } = require("../scripts/seedBaseQuestionBank");

const DATA_PATH = path.resolve(__dirname, "../data/question-banks/trusted_core_question_bank.json");
const questions = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

test("可信核心题库满足规模、知识点、难度和内容质量硬门禁", () => {
  const result = analyze(questions);
  assert.equal(result.passed, true, result.hardFailures.join("；"));
  assert.equal(result.coreTotal, 272);
  assert.equal(result.publishedCount, 272);
  assert.equal(result.optionAnomalyCount, 0);
  assert.equal(result.answerAnomalyCount, 0);
  assert.equal(result.shortAnalysisCount, 0);
  assert.equal(result.duplicateKeyCount, 0);
  assert.equal(result.duplicateStemCount, 0);
  assert.equal(result.nearDuplicateCount, 0);
});

test("五门课程都达到题量和知识点覆盖门槛", () => {
  const result = analyze(questions);
  for (const [subject, count] of Object.entries(result.subjectCounts)) {
    assert.ok(count >= 35, `${subject}: ${count}`);
    const pointCounts = Object.values(result.knowledgePointCounts[subject]);
    assert.ok(pointCounts.length >= 6, `${subject}: ${pointCounts.length} knowledge points`);
    assert.ok(Math.min(...pointCounts) >= 4, `${subject}: minimum ${Math.min(...pointCounts)}`);
  }
});

test("seed 校验拒绝重复题号、重复选项和非法答案", () => {
  assert.throws(() => validateQuestionSet([questions[0], { ...questions[0] }]), /题号重复/);
  assert.throws(
    () => validateQuestionSet([{ ...questions[0], option_b: questions[0].option_a }]),
    /互不重复/,
  );
  assert.throws(() => validateQuestionSet([{ ...questions[0], answer: "E" }]), /A\/B\/C\/D/);
});

test("题库验证拒绝重复题干、空题干和空解析", () => {
  const duplicateStem = analyze([...questions, { ...questions[0], question_id: "TEST_DUPLICATE_STEM" }]);
  assert.equal(duplicateStem.passed, false);
  assert.ok(duplicateStem.duplicateStemCount > 0);

  const emptyStem = questions.map((question, index) => (index === 0 ? { ...question, stem: "" } : question));
  assert.equal(analyze(emptyStem).passed, false);

  const emptyAnalysis = questions.map((question, index) =>
    index === 0 ? { ...question, analysis: "" } : question,
  );
  assert.equal(analyze(emptyAnalysis).passed, false);
});

test("未发布题不会计入正式题数并被标记为不可组卷", () => {
  const draft = questions.map((question, index) =>
    index === 0 ? { ...question, is_published: false } : question,
  );
  const result = analyze(draft);
  assert.equal(result.publishedCount, 271);
  assert.equal(result.unpublishedCount, 1);
  assert.equal(result.unusableForQuizPackCount, 1);
});
