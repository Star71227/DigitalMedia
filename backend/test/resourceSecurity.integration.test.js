/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
process.env.JWT_SECRET = "resource-test-secret-with-more-than-32-characters";
process.env.AI_ENABLED = "false";
process.env.MULTIMODAL_RESOURCE_AI_ENABLED = "false";
process.env.MULTIMODAL_REVIEW_AI_ENABLED = "false";
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const fs = require("fs/promises");
const app = require("../src/app");
const { pool } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const { initLearningPathDB } = require("../src/config/initLearningPathDB");
const { initLearningResourceDB } = require("../src/config/initLearningResourceDB");
const { createOrAdjustLearningPath } = require("../src/services/learningPathService");
const { STORAGE_ROOT } = require("../src/services/resourceStorageService");
let studentId, otherId, token, otherToken, path, stage, mind, ppt, quiz;
const fixtureQuestionIds = [];
const username = `resource_test_${Date.now()}`;
test.before(async () => {
  await initDB();
  await initLearningPathDB(pool);
  await initLearningResourceDB(pool);
  const [u] = await pool.query(
    "INSERT INTO users(student_no,username,display_name,password_hash) VALUES(?,?,?,'test')",
    [`RT-${Date.now()}`, username, "资源测试用户"],
  );
  studentId = u.insertId;
  const [o] = await pool.query(
    "INSERT INTO users(student_no,username,display_name,password_hash) VALUES(?,?,?,'test')",
    [`RO-${Date.now()}`, `${username}_other`, "其他用户"],
  );
  otherId = o.insertId;
  await pool.query(
    "INSERT INTO student_profiles(student_id,current_course,learning_goals_json,resource_preferences_json,profile_completeness,current_version) VALUES(?,'数据结构',?, ?,1,1)",
    [studentId, JSON.stringify(["掌握数据结构"]), JSON.stringify(["思维导图", "课件"])],
  );
  const [[q]] = await pool.query(
    "SELECT subject,knowledge_point FROM code_exercises WHERE exercise_id='DS_CODE_RBT_001' LIMIT 1",
  );
  await pool.query(
    "INSERT INTO student_knowledge_mastery(student_id,subject,knowledge_point,mastery,wrong_count,practice_count) VALUES(?,?,?,?,1,1)",
    [studentId, q.subject, q.knowledge_point, 40],
  );
  await pool.query("UPDATE student_profiles SET current_course=? WHERE student_id=?", [q.subject, studentId]);
  path = await createOrAdjustLearningPath({ studentId, reason: "资源测试路径", sourceType: "test" });
  stage = path.stages[0];
  const mechanisms = [
    "机制A",
    "机制B",
    "机制C",
    "机制D",
    "机制E",
    "机制F",
    "流程推演",
    "误区辨析",
    "场景分析",
    "边界判断",
    "状态变化",
    "代码过程",
    "应用迁移",
    "概念区分",
  ];
  for (let index = 0; index < 14; index += 1) {
    const id = `RESOURCE-${Date.now()}-${index}`;
    fixtureQuestionIds.push(id);
    const mechanism = mechanisms[index];
    await pool.query(
      "INSERT INTO question_bank(question_id,subject,knowledge_point,question_type,difficulty,stem,option_a,option_b,option_c,option_d,answer,analysis,hint,ability_dimension,tags,source,option_error_types) VALUES(?,?,?,'single_choice',?,?, '正确机制选项','混淆概念选项','忽略条件选项','错误流程选项','A',?,?,?,?, 'resource_test', ?)",
      [
        id,
        stage.subject,
        stage.knowledgePoints[0],
        index < 6 ? "基础" : index < 10 ? "提高" : "综合",
        `资源测试场景题${index + 1}：如果执行过程出现状态变化，应该如何判断${mechanism}？`,
        `真实题库解析：本题考查${mechanism}，需要先确认题干中的对象、条件、执行顺序和边界，再把四个选项逐一核对。错误选项通常混淆概念边界或忽略关键状态，复盘时应画出过程线并说明为什么正确机制满足题干限制。`,
        `先回到${mechanism}的条件和过程，不要直接猜答案。`,
        mechanism,
        JSON.stringify([mechanism, index % 3 === 0 ? "场景题" : index % 3 === 1 ? "误区辨析" : "过程推演"]),
        JSON.stringify({ B: "concept_misunderstanding", C: "condition_missing", D: "procedure_confusion" }),
      ],
    );
  }
  token = jwt.sign({ sub: String(studentId), username }, process.env.JWT_SECRET, { expiresIn: "1h" });
  otherToken = jwt.sign({ sub: String(otherId), username: `${username}_other` }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
});
function payload(type) {
  return {
    resourceType: type,
    subject: stage.subject,
    knowledgePoint: stage.knowledgePoints[0],
    stageKey: stage.key,
    pathVersion: path.version,
    studentId: otherId,
    mastery: 100,
    errorPatterns: [],
  };
}
function binaryParser(res, callback) {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}
const PRIVATE_FIELDS = [
  "correctAnswer",
  "correct_answer",
  "answer",
  "answerIndex",
  "answerKey",
  "answer_key",
  "standardAnswer",
  "standard_answer",
  "solution",
  "solutions",
  "referenceAnswer",
  "reference_answer",
  "analysis",
  "explanation",
  "scoringPoints",
  "scoring_points",
  "rubric",
  "internalExplanation",
  "internal_explanation",
  "teacherNotes",
  "teacher_notes",
  "hiddenHints",
  "hidden_hints",
  "hiddenTests",
  "hidden_tests",
  "isCorrect",
  "is_correct",
  "correctOption",
  "correct_option",
  "optionWeight",
  "option_weight",
  "expectedOutput",
  "expected_output",
  "contentJson",
  "content_json",
  "reviewJson",
  "review_json",
  "requestSnapshot",
  "request_snapshot",
  "profileSnapshot",
  "profile_snapshot",
  "qualityAttempts",
  "quality_attempts",
  "correctedContent",
  "corrected_content",
  "prompt",
  "promptText",
  "prompt_text",
  "systemPrompt",
  "system_prompt",
];
function privateFieldHits(value, path = "$", hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => privateFieldHits(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_FIELDS.includes(key)) hits.push(`${path}.${key}`);
      privateFieldHits(child, `${path}.${key}`, hits);
    }
  }
  return hits;
}
function assertNoPrivateFields(value, label) {
  assert.deepEqual(privateFieldHits(value), [], label);
}
function assertPublicQuizPackSafe(resource) {
  assert.ok(resource.content.questions.length >= 12);
  assertNoPrivateFields(resource.content, "quiz_pack public content must not expose private fields");
  assertNoPrivateFields(resource.quality, "quiz_pack public quality must not expose private fields");
  assertNoPrivateFields(resource.review, "quiz_pack public review must not expose private fields");
}
const PPT_PRIVATE_TERMS = [
  "correctAnswer",
  "answerKey",
  "standardAnswer",
  "solution",
  "referenceSolution",
  "hiddenTests",
  "privateTests",
  "judgeConfig",
  "compilerCommand",
  "runCommand",
  "containerImage",
  "workingDirectory",
  "systemPrompt",
  "prompt",
  "profileSnapshot",
  "requestSnapshot",
  "qualityAttempts",
  "correctedContent",
  "modelRawOutput",
  "chunkId",
  "retrievalRunId",
  "服务器绝对路径",
  "API Key",
  "Token",
  "密码",
];
function pptPrivateTermHits(value, path = "$", hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => pptPrivateTermHits(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      for (const term of PPT_PRIVATE_TERMS) if (key.includes(term)) hits.push(`${path}.${key}:${term}`);
      pptPrivateTermHits(child, `${path}.${key}`, hits);
    }
  } else if (typeof value === "string") {
    for (const term of PPT_PRIVATE_TERMS) if (value.includes(term)) hits.push(`${path}:${term}`);
  }
  return hits;
}
function assertNoPptPrivateTerms(value, label) {
  assert.deepEqual(pptPrivateTermHits(value), [], label);
}
test("未登录不能生成或下载资源", async () => {
  assert.equal((await request(app).post("/api/resources/generate").send(payload("mind_map"))).status, 401);
  assert.equal((await request(app).get("/api/resources/999/download")).status, 401);
});
test("后端读取真实路径上下文并忽略伪造画像", async () => {
  const response = await request(app)
    .post("/api/resources/generate")
    .set("Authorization", `Bearer ${token}`)
    .send(payload("mind_map"));
  assert.equal(response.status, 200);
  mind = response.body.resource;
  assert.equal(mind.resourceType, "mind_map");
  assert.ok(mind.targetLearnerSummary.includes("40"));
  assert.equal(mind.stageKey, stage.key);
  const duplicate = await request(app)
    .post("/api/resources/generate")
    .set("Authorization", `Bearer ${token}`)
    .send(payload("mind_map"));
  assert.equal(duplicate.body.resource.id, mind.id);
  assert.equal(duplicate.body.resource.version, mind.version);
});
test("study_note, quiz_pack, and code_case are generated, saved, and read safely", async () => {
  for (const type of ["study_note", "quiz_pack", "code_case"]) {
    const generated = await request(app)
      .post("/api/resources/generate")
      .set("Authorization", `Bearer ${token}`)
      .send(payload(type));
    assert.equal(generated.status, 200, JSON.stringify(generated.body));
    const resource = generated.body.resource;
    assert.equal(resource.resourceType, type);
    assert.ok(resource.version >= 1);
    assert.ok(Number.isFinite(resource.review.score));
    const read = await request(app)
      .get(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.resource.id, resource.id);
    if (type === "quiz_pack") {
      quiz = resource;
      assertPublicQuizPackSafe(resource);
      assertPublicQuizPackSafe(read.body.resource);
      const list = await request(app)
        .get("/api/resources?resourceType=quiz_pack")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(list.status, 200);
      const listed = list.body.data.find((item) => item.id === resource.id);
      assert.ok(listed);
      assertPublicQuizPackSafe(listed);
      const versions = await request(app)
        .get(`/api/resources/${resource.id}/versions`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(versions.status, 200);
      assertNoPrivateFields(versions.body, "quiz_pack version list must not expose private fields");
      const versionDetail = await request(app)
        .get(`/api/resources/${resource.id}/versions/${resource.version}`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(versionDetail.status, 200);
      assertPublicQuizPackSafe(versionDetail.body.resource);
      for (const question of resource.content.questions) {
        const [[exists]] = await pool.query("SELECT question_id FROM question_bank WHERE question_id=?", [
          question.questionId,
        ]);
        assert.ok(exists);
      }
    }
    if (type === "code_case" && resource.content.codeExerciseId) {
      const [[exists]] = await pool.query("SELECT exercise_id FROM code_exercises WHERE exercise_id=?", [
        resource.content.codeExerciseId,
      ]);
      assert.ok(exists);
    }
  }
});
test("quiz public questions, legacy single question, and hint do not expose private fields before submit", async () => {
  const list = await request(app)
    .get(
      `/api/quiz/questions?subject=${encodeURIComponent(stage.subject)}&knowledgePoint=${encodeURIComponent(stage.knowledgePoints[0])}&limit=14`,
    )
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length >= 12);
  assertNoPrivateFields(list.body, "public quiz question list must not expose private fields");
  const single = await request(app)
    .post("/api/generate-question")
    .set("Authorization", `Bearer ${token}`)
    .send({ domain: stage.subject, knowledgePoint: stage.knowledgePoints[0], difficulty: "basic" });
  assert.equal(single.status, 200);
  assertNoPrivateFields(single.body, "legacy generated question must not expose private fields");
  const first = quiz.content.questions[0];
  const hint = await request(app)
    .post("/api/quiz-hint")
    .set("Authorization", `Bearer ${token}`)
    .send({ question: first.stem, options: first.options });
  assert.equal(hint.status, 200);
  assertNoPrivateFields(hint.body, "quiz hint must not expose private fields");
  assert.equal(
    /(?:answer|select|choose)\s*[A-D]|[A-D]\s*(?:is\s*correct|answer)/i.test(String(hint.body.hint || "")),
    false,
  );
});
test("并发生成、普通重复和无语义变化的 regenerate 不创建重复版本", async () => {
  const [a, b] = await Promise.all([
    request(app)
      .post("/api/resources/generate")
      .set("Authorization", `Bearer ${token}`)
      .send(payload("mind_map")),
    request(app)
      .post("/api/resources/generate")
      .set("Authorization", `Bearer ${token}`)
      .send(payload("mind_map")),
  ]);
  assert.equal(a.body.resource.id, b.body.resource.id);
  const regenerated = await request(app)
    .post("/api/resources/generate")
    .set("Authorization", `Bearer ${token}`)
    .send({ ...payload("mind_map"), regenerate: true });
  assert.equal(regenerated.body.resource.version, mind.version);
  const history = await request(app)
    .get(`/api/resources/${mind.id}/versions`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(history.body.data.length, 1);
});
test("上下文发生真实变化时资源版本正确递增", async () => {
  await pool.query(
    "UPDATE student_knowledge_mastery SET mastery=85 WHERE student_id=? AND subject=? AND knowledge_point=?",
    [studentId, stage.subject, stage.knowledgePoints[0]],
  );
  const regenerated = await request(app)
    .post("/api/resources/generate")
    .set("Authorization", `Bearer ${token}`)
    .send({ ...payload("mind_map"), regenerate: true });
  assert.equal(regenerated.status, 200);
  assert.equal(regenerated.body.resource.version, mind.version + 1);
  const history = await request(app)
    .get(`/api/resources/${mind.id}/versions`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(history.body.data.length, 2);
});
test("伪造路径版本、阶段和知识点被拒绝", async () => {
  for (const invalid of [
    { ...payload("mind_map"), pathVersion: 99999 },
    { ...payload("mind_map"), stageKey: "fake-stage" },
    { ...payload("mind_map"), knowledgePoint: "不存在" },
  ])
    assert.ok(
      (
        await request(app)
          .post("/api/resources/generate")
          .set("Authorization", `Bearer ${token}`)
          .send(invalid)
      ).status >= 400,
    );
});
test("生成真实 PPTX、校验下载 MIME、ZIP 头和 checksum", async () => {
  const response = await request(app)
    .post("/api/resources/generate")
    .set("Authorization", `Bearer ${token}`)
    .send(payload("pptx"));
  assert.equal(response.status, 200);
  ppt = response.body.resource;
  assert.ok(ppt.content.slides.length >= 14 && ppt.content.slides.length <= 18);
  assert.equal(ppt.quality.passed, true);
  assert.equal(ppt.quality.pptxGenerated, true);
  assert.equal(ppt.quality.pptxValid, true);
  assert.equal(ppt.quality.pptxSlideCount, ppt.content.slides.length);
  assert.deepEqual(
    privateFieldHits(ppt.content).filter((hit) => !/\.slides\[\d+\]\.explanation$/.test(hit)),
    [],
    "pptx public content must not expose private fields",
  );
  assertNoPrivateFields(ppt.quality, "pptx public quality must not expose private fields");
  assertNoPptPrivateTerms(response.body, "pptx generation response must not expose private terms");
  const detail = await request(app).get(`/api/resources/${ppt.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(detail.status, 200);
  assertNoPptPrivateTerms(detail.body, "pptx detail must not expose private terms");
  const list = await request(app)
    .get("/api/resources?resourceType=pptx")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  assertNoPptPrivateTerms(list.body, "pptx list must not expose private terms");
  const versions = await request(app)
    .get(`/api/resources/${ppt.id}/versions`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(versions.status, 200);
  assertNoPptPrivateTerms(versions.body, "pptx version list must not expose private terms");
  const versionDetail = await request(app)
    .get(`/api/resources/${ppt.id}/versions/${ppt.version}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(versionDetail.status, 200);
  assertNoPptPrivateTerms(versionDetail.body, "pptx version detail must not expose private terms");
  const download = await request(app)
    .get(`/api/resources/${ppt.id}/download`)
    .set("Authorization", `Bearer ${token}`)
    .buffer(true)
    .parse(binaryParser);
  assert.equal(download.status, 200);
  assert.equal(
    download.headers["content-type"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  assert.match(
    download.headers["content-disposition"] || "",
    /^attachment;\s*filename\*=UTF-8''[^;]+\.pptx$/i,
  );
  assert.equal(download.body[0], 0x50);
  assert.equal(download.body[1], 0x4b);
  const [[file]] = await pool.query(
    "SELECT checksum_sha256 FROM learning_resource_files WHERE resource_id=?",
    [ppt.id],
  );
  const crypto = require("crypto");
  assert.equal(crypto.createHash("sha256").update(download.body).digest("hex"), file.checksum_sha256);
});
test("其他学生不能读取或下载私人资源", async () => {
  assert.equal(
    (await request(app).get(`/api/resources/${mind.id}`).set("Authorization", `Bearer ${otherToken}`)).status,
    404,
  );
  assert.equal(
    (await request(app).get(`/api/resources/${ppt.id}/download`).set("Authorization", `Bearer ${otherToken}`))
      .status,
    404,
  );
});
test("资源打开、阅读进度、完成证据和路径联动均持久化", async () => {
  await request(app).post(`/api/resources/${mind.id}/open`).set("Authorization", `Bearer ${token}`);
  await pool.query(
    "UPDATE learning_resource_progress SET last_activity_at=DATE_SUB(NOW(),INTERVAL 35 SECOND) WHERE student_id=? AND resource_id=?",
    [studentId, mind.id],
  );
  await request(app)
    .post(`/api/resources/${mind.id}/progress`)
    .set("Authorization", `Bearer ${token}`)
    .send({ progressPercent: 100, activeSeconds: 999999 });
  const complete = await request(app)
    .post(`/api/resources/${mind.id}/complete`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(complete.status, 200);
  assert.equal(complete.body.resource.progress.status, "completed");
  assert.equal(stage.completion.type, "resource");
  const [evidence] = await pool.query(
    "SELECT r.resource_type,p.status,p.completed_at FROM learning_resources r JOIN learning_resource_progress p ON p.resource_id=r.id AND p.resource_version=r.current_version WHERE r.student_id=? AND r.path_version=? AND r.stage_key=?",
    [studentId, path.version, stage.key],
  );
  assert.ok(evidence.some((item) => item.resource_type === "mind_map" && item.status === "completed"));
  const current = await request(app).get("/api/path/me").set("Authorization", `Bearer ${token}`);
  const linkedStage = current.body.stages.find((item) => item.key === stage.key);
  assert.equal(linkedStage.status, "completed", JSON.stringify({ completion: stage.completion, evidence }));
});
test("generated 代码完成后不会形成路径自动完成证据", async () => {
  const list = await request(app)
    .get("/api/resources?resourceType=code_case")
    .set("Authorization", `Bearer ${token}`);
  const codeCase = list.body.data[0];
  if (codeCase.content.verificationStatus !== "generated") return;
  await request(app).post(`/api/resources/${codeCase.id}/open`).set("Authorization", `Bearer ${token}`);
  await pool.query(
    "UPDATE learning_resource_progress SET last_activity_at=DATE_SUB(NOW(),INTERVAL 35 SECOND) WHERE student_id=? AND resource_id=?",
    [studentId, codeCase.id],
  );
  await request(app)
    .post(`/api/resources/${codeCase.id}/progress`)
    .set("Authorization", `Bearer ${token}`)
    .send({ progressPercent: 100 });
  const complete = await request(app)
    .post(`/api/resources/${codeCase.id}/complete`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(complete.status, 200);
  assert.equal(complete.body.resource.progress.status, "completed_unverified");
  const [[progress]] = await pool.query(
    "SELECT evidence_json FROM learning_resource_progress WHERE resource_id=? AND resource_version=?",
    [codeCase.id, codeCase.version],
  );
  const evidence =
    typeof progress.evidence_json === "string" ? JSON.parse(progress.evidence_json) : progress.evidence_json;
  assert.equal(evidence.pathCompletionEligible, false);
});
test("quiz_pack question IDs can be submitted through the official quiz API", async () => {
  assert.ok(quiz?.content?.questions?.length >= 12);
  const ids = quiz.content.questions.map((question) => question.questionId);
  const [rows] = await pool.query(
    `SELECT question_id,answer FROM question_bank WHERE question_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const correctById = new Map(
    rows.map((row) => [
      row.question_id,
      String(row.answer || "")
        .trim()
        .toUpperCase(),
    ]),
  );
  const answers = quiz.content.questions.map((question, index) => {
    const correct = correctById.get(question.questionId) || "A";
    return {
      questionId: question.questionId,
      answer: index === 1 ? wrongChoice(correct) : correct,
      durationSeconds: 30,
    };
  });
  const key = `resource-security-${Date.now()}`;
  const submitted = await request(app)
    .post("/api/quiz/submit")
    .set("Authorization", `Bearer ${token}`)
    .send({ idempotencyKey: key, subject: quiz.subject, answers, submittedAt: new Date().toISOString() });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.totalCount, quiz.content.questions.length);
  assert.equal(submitted.body.correctCount, quiz.content.questions.length - 1);
  assert.equal(
    submitted.body.score,
    Math.round(((quiz.content.questions.length - 1) / quiz.content.questions.length) * 100),
  );
  for (const item of submitted.body.questionResults) {
    const submittedAnswer = answers.find((answer) => answer.questionId === item.questionId).answer;
    assert.equal(item.correctAnswer, correctById.get(item.questionId));
    assert.equal(item.isCorrect, submittedAnswer === item.correctAnswer);
    assert.ok(String(item.analysis || "").length > 0);
  }
  const duplicate = await request(app)
    .post("/api/quiz/submit")
    .set("Authorization", `Bearer ${token}`)
    .send({
      idempotencyKey: key,
      subject: quiz.subject,
      answers: answers.map((item) => ({ ...item, answer: wrongChoice(item.answer) })),
      submittedAt: new Date().toISOString(),
    });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.attemptId, submitted.body.attemptId);
  assert.deepEqual(duplicate.body.questionResults, submitted.body.questionResults);
});
function wrongChoice(answer) {
  return { A: "B", B: "C", C: "D", D: "A" }[String(answer || "A").toUpperCase()] || "B";
}
test("code_case public projection exposes only trusted summary, not private judge data", async () => {
  const list = await request(app)
    .get("/api/resources?resourceType=code_case")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const codeCase = list.body.data[0];
  assert.ok(codeCase);
  assert.equal(codeCase.content.verificationStatus, "verified");
  assert.equal(codeCase.content.qualitySummary.trusted, true);
  assert.ok(codeCase.content.qualitySummary.publicTestCount >= 3);
  assert.ok(codeCase.content.qualitySummary.hiddenTestCount >= 6);
  const serialized = JSON.stringify(codeCase);
  for (const secret of [
    "referenceSolution",
    "reference_solution",
    "hiddenTests",
    "hidden_tests",
    "judgeConfig",
    "judge_config",
    "judgeFingerprint",
    "judge_fingerprint",
    "runnerImage",
    "runner_image",
    "learnmate/code-runner-c",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});
test.after(async () => {
  if (studentId) {
    const [files] = await pool.query("SELECT storage_path FROM learning_resource_files WHERE student_id=?", [
      studentId,
    ]);
    await pool.query("DELETE FROM learning_resource_progress WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM learning_resource_stage_links WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM learning_resource_files WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM learning_resource_versions WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM learning_resources WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM learning_path_adjustment_events WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM learning_path_versions WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM student_learning_paths WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM student_knowledge_mastery WHERE student_id=?", [studentId]);
    await pool.query("DELETE FROM student_profiles WHERE student_id=?", [studentId]);
    for (const f of files) {
      const dir = f.storage_path.split("/").slice(0, 2).join("/");
      await fs.rm(require("path").join(STORAGE_ROOT, dir), { recursive: true, force: true });
    }
  }
  if (fixtureQuestionIds.length)
    await pool.query(
      `DELETE FROM question_bank WHERE question_id IN (${fixtureQuestionIds.map(() => "?").join(",")})`,
      fixtureQuestionIds,
    );
  await pool.query("DELETE FROM users WHERE id IN (?,?)", [studentId || 0, otherId || 0]);
  await pool.end();
});
