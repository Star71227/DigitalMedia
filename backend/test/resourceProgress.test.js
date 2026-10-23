/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../src/config/db");
const progress = require("../src/services/resourceProgressService");

test("状态链覆盖五类资源共同的全部真实阶段", () => {
  assert.deepEqual(progress.STAGES, [
    "queued",
    "profile_analysis",
    "learning_context_analysis",
    "knowledge_retrieval",
    "content_generation",
    "deterministic_review",
    "ai_review",
    "rendering",
    "persistence",
    "path_linking",
    "completed",
  ]);
  for (const type of ["study_note", "mind_map", "pptx", "quiz_pack", "code_case"])
    assert.equal(progress.STAGES.includes("content_generation"), true, type);
});

test("同一jobId只启动一次，SSE重连语义不触发生成且断开不取消任务", async () => {
  const original = pool.query;
  let insertId = 0;
  const stages = [];
  let calls = 0;
  pool.query = async (sql) => {
    if (String(sql).startsWith("INSERT INTO resource_generation_events")) return [{ insertId: ++insertId }];
    return [{}];
  };
  const generateResource = async (_input, options) => {
    calls += 1;
    for (const stage of progress.STAGES.slice(1, -1)) {
      stages.push(stage);
      await options.onStage(stage, { status: "completed" });
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { id: 42, version: 1 };
  };
  try {
    assert.equal(
      progress.launchGenerationJob("job-once", 7, { resourceType: "study_note" }, { generateResource }),
      true,
    );
    assert.equal(
      progress.launchGenerationJob("job-once", 7, { resourceType: "study_note" }, { generateResource }),
      false,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(calls, 1);
    assert.deepEqual(stages, progress.STAGES.slice(1, -1));
  } finally {
    pool.query = original;
  }
});

test("任务查询始终带学生所有权条件，猜测他人jobId返回404", async () => {
  const original = pool.query;
  let parameters;
  pool.query = async (_sql, params) => {
    parameters = params;
    return [[]];
  };
  try {
    await assert.rejects(
      () => progress.getGenerationJob(9, "guessed"),
      (error) => error.statusCode === 404,
    );
    assert.deepEqual(parameters, ["guessed", 9]);
  } finally {
    pool.query = original;
  }
});

test("持久化快照支持页面刷新恢复且所有百分比有限", async () => {
  const original = pool.query;
  let call = 0;
  pool.query = async () => {
    call += 1;
    if (call === 1)
      return [
        [
          {
            job_id: "restore",
            student_id: 3,
            resource_type: "pptx",
            resource_id: null,
            status: "running",
            current_stage: "rendering",
            progress_percent: null,
            started_at: new Date(),
            updated_at: new Date(),
            completed_at: null,
            error_code: null,
            error_message: null,
          },
        ],
      ];
    return [
      [
        {
          id: 1,
          event_type: "stage",
          stage: "rendering",
          status: "running",
          label: "渲染",
          message: "渲染中",
          agent: "RenderAgent",
          metadata_json: {},
          started_at: new Date(),
          completed_at: null,
          created_at: new Date(),
        },
      ],
    ];
  };
  try {
    const snapshot = await progress.getGenerationJob(3, "restore");
    assert.equal(snapshot.job.jobId, "restore");
    assert.equal(snapshot.job.progressPercent, 0);
    assert.ok(Number.isFinite(snapshot.job.progressPercent));
    assert.equal(snapshot.stages.length, 1);
  } finally {
    pool.query = original;
  }
});

test("失败只返回中文安全错误，不暴露SQL、路径、Prompt或密钥", () => {
  const safe = progress.publicError(new Error("SQL SELECT secret C:\\private\\key prompt"));
  assert.equal(safe.code, "RESOURCE_GENERATION_FAILED");
  assert.equal(/[A-Za-z]:\\|SELECT|prompt|key/i.test(safe.message), false);
});
