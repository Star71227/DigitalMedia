/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../src/config/db");
const { generatePersonalizedQuiz, findRelevantSources } = require("../src/services/personalizedQuizService");

test("C language search accepts spacing differences and falls back to RSS after HTML failure", async (t) => {
  const previous = { enabled: process.env.WEB_SEARCH_ENABLED, provider: process.env.WEB_SEARCH_PROVIDER };
  process.env.WEB_SEARCH_ENABLED = "true";
  process.env.WEB_SEARCH_PROVIDER = "baidu-html";
  t.after(() => {
    for (const [key, value] of [
      ["WEB_SEARCH_ENABLED", previous.enabled],
      ["WEB_SEARCH_PROVIDER", previous.provider],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  t.mock.method(global, "fetch", async (url) => {
    if (String(url).includes("baidu")) return { ok: true, text: async () => "<html>no results</html>" };
    return {
      ok: true,
      text: async () =>
        "<rss><channel><item><title>C语言指针习题</title><link>https://example.edu/c</link><description>C语言程序设计练习与指针解析</description></item></channel></rss>",
    };
  });
  const sources = await findRelevantSources("C 语言程序设计 练习题 答案", "C 语言程序设计");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, "C语言指针习题");
});

test("search and model failures still return exact unique quiz count with truthful source notice", async (t) => {
  const before = { ...process.env };
  Object.assign(process.env, {
    WEB_SEARCH_ENABLED: "true",
    WEB_SEARCH_PROVIDER: "baidu-html",
    AI_ENABLED: "false",
  });
  t.after(() => {
    for (const key of ["WEB_SEARCH_ENABLED", "WEB_SEARCH_PROVIDER", "AI_ENABLED"]) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  });
  const bank = Array.from({ length: 20 }, (_, i) => ({
    question_id: `verified-${i}`,
    subject: "C 语言程序设计",
    knowledge_point: "指针",
    stem: `第 ${i} 题：指针的合法使用方式是？`,
    option_a: "甲",
    option_b: "乙",
    option_c: "丙",
    option_d: "丁",
    answer: "A",
    analysis: "指针保存对象的地址，解引用前必须确保指针有效且指向仍然存活的对象。",
    difficulty: "基础",
    source: "base",
    owner_student_id: null,
  }));
  t.mock.method(global, "fetch", async () => {
    throw new Error("search offline");
  });
  t.mock.method(pool, "query", async (sql) => {
    if (sql.includes("FROM question_bank")) return [bank];
    return [[]];
  });
  const result = await generatePersonalizedQuiz({
    studentId: 1,
    subject: "C 语言程序设计",
    questionCount: 20,
  });
  assert.equal(result.generatedCount, 20);
  assert.equal(new Set(result.questions.map((item) => item.question_id)).size, 20);
  assert.equal(result.sources.length, 0);
  assert.equal(result.mode, "rules_course_ranked_verified_bank");
  assert.match(result.sourceNotice, /没有使用联网题源/);
  assert.match(result.sourceNotice, /未使用模型选题/);
});
