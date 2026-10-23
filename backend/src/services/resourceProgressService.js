/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { EventEmitter } = require("events");
const { pool } = require("../config/db");

const emitter = new EventEmitter();
emitter.setMaxListeners(500);
const runningJobs = new Set();
const STAGES = [
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
];
const STAGE_PERCENT = {
  queued: 0,
  profile_analysis: 8,
  learning_context_analysis: 16,
  knowledge_retrieval: 27,
  content_generation: 48,
  deterministic_review: 60,
  ai_review: 70,
  rendering: 80,
  persistence: 89,
  path_linking: 96,
  completed: 100,
  failed: 100,
};
const STAGE_LABELS = {
  queued: "资源任务已排队",
  profile_analysis: "正在建立学习上下文",
  learning_context_analysis: "正在分析薄弱知识点",
  knowledge_retrieval: "正在检索课程知识库",
  content_generation: "正在生成个性化内容",
  deterministic_review: "正在进行规则审核",
  ai_review: "正在进行模型审核",
  rendering: "正在渲染资源文件",
  persistence: "正在安全保存资源",
  path_linking: "正在关联学习路径",
  completed: "资源生成完成",
  failed: "资源生成失败",
};
const STAGE_AGENTS = {
  queued: "Coordinator",
  profile_analysis: "ProfileAgent",
  learning_context_analysis: "ContextAgent",
  knowledge_retrieval: "RetrievalAgent",
  content_generation: "ResourceAgent",
  deterministic_review: "ReviewRules",
  ai_review: "ReviewAgent",
  rendering: "RenderAgent",
  persistence: "StorageAgent",
  path_linking: "PlannerAgent",
  completed: "Coordinator",
  failed: "Coordinator",
};

async function createGenerationJob(studentId, input) {
  if (!studentId) throw apiError("无法确认学生身份", 403, "STUDENT_REQUIRED");
  const resourceType = String(input?.resourceType || "");
  if (!new Set(["study_note", "mind_map", "pptx", "quiz_pack", "code_case"]).has(resourceType))
    throw apiError("不支持的资源类型", 422, "INVALID_RESOURCE_TYPE");
  const jobId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO resource_generation_jobs
    (job_id,student_id,resource_type,status,current_stage,progress_percent,input_json,started_at)
    VALUES (?, ?, ?, 'queued', 'queued', 0, ?, NOW())`,
    [jobId, studentId, resourceType, JSON.stringify({ ...input, studentId: undefined })],
  );
  await insertEvent(
    jobId,
    "job",
    "queued",
    "running",
    STAGE_LABELS.queued,
    "任务已创建，等待后端执行。",
    STAGE_AGENTS.queued,
    {},
  );
  launchGenerationJob(jobId, studentId, { ...input, studentId });
  return { jobId, status: "queued" };
}

function launchGenerationJob(jobId, studentId, input, dependencies = {}) {
  if (runningJobs.has(jobId)) return false;
  runningJobs.add(jobId);
  const generate = dependencies.generateResource || require("./resourceGenerationService").generateResource;
  setImmediate(async () => {
    try {
      const resource = await generate(input, {
        onStage: (stage, details = {}) => recordStage(jobId, stage, details),
      });
      await recordStage(jobId, "completed", {
        status: "completed",
        message: "资源持久化、版本、权限和路径关联均已成功。",
        metadata: { resourceId: resource.id, version: resource.version },
      });
      await pool.query(
        "UPDATE resource_generation_jobs SET resource_id=?,status='completed',current_stage='completed',progress_percent=100,completed_at=NOW(),updated_at=NOW() WHERE job_id=? AND student_id=?",
        [resource.id, jobId, studentId],
      );
      await insertEvent(
        jobId,
        "resource",
        "completed",
        "completed",
        STAGE_LABELS.completed,
        "资源版本、权限和路径关联已全部完成。",
        STAGE_AGENTS.completed,
        { resourceId: resource.id, version: resource.version },
      );
      await insertEvent(
        jobId,
        "complete",
        "completed",
        "completed",
        STAGE_LABELS.completed,
        "资源生成完成。",
        STAGE_AGENTS.completed,
        { resourceId: resource.id },
      );
    } catch (error) {
      const safe = publicError(error);
      await pool
        .query(
          "UPDATE resource_generation_jobs SET status='failed',current_stage='failed',progress_percent=100,error_code=?,error_message=?,completed_at=NOW(),updated_at=NOW() WHERE job_id=? AND student_id=?",
          [safe.code, safe.message, jobId, studentId],
        )
        .catch(() => undefined);
      await insertEvent(
        jobId,
        "error",
        "failed",
        "failed",
        STAGE_LABELS.failed,
        safe.message,
        STAGE_AGENTS.failed,
        { errorCode: safe.code },
      ).catch(() => undefined);
      console.error(
        JSON.stringify({
          level: "error",
          area: "resource_job",
          jobId,
          code: safe.code,
          message: "resource generation job failed",
        }),
      );
    } finally {
      runningJobs.delete(jobId);
    }
  });
  return true;
}

async function recordStage(jobId, stage, details = {}) {
  if (!STAGES.includes(stage)) throw new Error(`unknown generation stage: ${stage}`);
  const status = details.status || "running";
  const message = safeMessage(details.message || STAGE_LABELS[stage]);
  const metadata = sanitizeMetadata(details.metadata || {});
  await pool.query(
    "UPDATE resource_generation_events SET status='completed',completed_at=NOW() WHERE job_id=? AND event_type='stage' AND status='running' AND stage<>?",
    [jobId, stage],
  );
  await pool.query(
    "UPDATE resource_generation_jobs SET status=?,current_stage=IF(progress_percent<=?,?,current_stage),progress_percent=GREATEST(progress_percent,?),updated_at=NOW() WHERE job_id=? AND status NOT IN ('completed','failed')",
    [
      stage === "completed" ? "completed" : "running",
      STAGE_PERCENT[stage],
      stage,
      STAGE_PERCENT[stage],
      jobId,
    ],
  );
  if (stage === "deterministic_review" || stage === "ai_review") {
    await insertEvent(
      jobId,
      "review",
      stage,
      status,
      STAGE_LABELS[stage],
      message,
      details.agent || STAGE_AGENTS[stage],
      metadata,
    );
  }
  return insertEvent(
    jobId,
    "stage",
    stage,
    status,
    STAGE_LABELS[stage],
    message,
    details.agent || STAGE_AGENTS[stage],
    metadata,
  );
}

async function getGenerationJob(studentId, jobId, options = {}) {
  assertStudent(studentId);
  const [[row]] = await pool.query(
    "SELECT * FROM resource_generation_jobs WHERE job_id=? AND student_id=? LIMIT 1",
    [jobId, studentId],
  );
  if (!row) throw apiError("资源任务不存在", 404, "JOB_NOT_FOUND");
  const [events] = await pool.query(
    "SELECT id,event_type,stage,status,label,message,agent,metadata_json,started_at,completed_at,created_at FROM resource_generation_events WHERE job_id=? ORDER BY id",
    [jobId],
  );
  let resource = null;
  if (row.resource_id && options.includeResource !== false) {
    resource = await require("./resourceGenerationService")
      .getResource(studentId, row.resource_id)
      .catch(() => null);
  }
  return { job: publicJob(row), stages: events.map(publicEvent), resource };
}

async function findLatestGenerationJob(studentId, filters = {}) {
  assertStudent(studentId);
  const clauses = ["student_id=?"],
    params = [studentId];
  if (filters.resourceType) {
    clauses.push("resource_type=?");
    params.push(filters.resourceType);
  }
  if (filters.activeOnly) clauses.push("status IN ('queued','running')");
  const [[row]] = await pool.query(
    `SELECT job_id FROM resource_generation_jobs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 1`,
    params,
  );
  return row ? getGenerationJob(studentId, row.job_id) : null;
}

function subscribe(jobId, listener) {
  emitter.on(jobId, listener);
  return () => emitter.off(jobId, listener);
}

async function insertEvent(jobId, eventType, stage, status, label, message, agent, metadata) {
  const completed = status === "completed" || status === "failed";
  const [result] = await pool.query(
    `INSERT INTO resource_generation_events
    (job_id,event_type,stage,status,label,message,agent,metadata_json,started_at,completed_at)
    VALUES (?,?,?,?,?,?,?,?,NOW(),${completed ? "NOW()" : "NULL"})`,
    [
      jobId,
      eventType,
      stage,
      status,
      safeMessage(label),
      safeMessage(message),
      safeMessage(agent),
      JSON.stringify(sanitizeMetadata(metadata)),
    ],
  );
  const event = {
    id: Number(result.insertId),
    eventType,
    stage,
    status,
    label: safeMessage(label),
    message: safeMessage(message),
    agent: safeMessage(agent),
    metadata: sanitizeMetadata(metadata),
    startedAt: new Date().toISOString(),
    completedAt: completed ? new Date().toISOString() : null,
  };
  emitter.emit(jobId, event);
  return event;
}

function publicJob(row) {
  return {
    jobId: row.job_id,
    studentId: Number(row.student_id),
    resourceType: row.resource_type,
    resourceId: row.resource_id === null ? null : Number(row.resource_id),
    status: row.status,
    currentStage: row.current_stage,
    progressPercent: finite(row.progress_percent),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}
function publicEvent(row) {
  return {
    id: Number(row.id),
    eventType: row.event_type,
    stage: row.stage,
    status: row.status,
    label: row.label,
    message: row.message,
    agent: row.agent,
    metadata: parseJson(row.metadata_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function finite(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Math.round(Number(value)))) : 0;
}
function sanitizeMetadata(metadata) {
  const allowed = [
    "resourceId",
    "version",
    "resourceType",
    "retrievalUsed",
    "chunkCount",
    "sourceCount",
    "modelReviewExecuted",
    "modelReviewStatus",
    "score",
    "passed",
    "fileRendered",
    "checksumVerified",
    "pathVersion",
    "stageKey",
    "profileVersion",
    "mastery",
    "errorPatternCount",
    "questionCount",
    "exerciseCount",
  ];
  return Object.fromEntries(
    Object.entries(metadata || {})
      .filter(([key]) => allowed.includes(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 200) : value]),
  );
}
function safeMessage(value) {
  return String(value || "")
    .replace(/(?:[A-Za-z]:)?[\\/][\w.\\/-]+/g, "[已隐藏]")
    .slice(0, 500);
}
function publicError(error) {
  const status = Number(error?.statusCode) || 500;
  if (error?.code === "RESOURCE_QUALITY_REJECTED")
    return {
      code: "RESOURCE_QUALITY_REJECTED",
      message: error.publicMessage || "学习讲义未通过质量检查，已拒绝保存为正式资源。",
    };
  if (error?.code === "MIND_MAP_QUALITY_REJECTED")
    return {
      code: "MIND_MAP_QUALITY_REJECTED",
      message: error.publicMessage || "思维导图未通过结构质量检查，已拒绝保存为正式资源。",
    };
  if (status === 422)
    return { code: error.code || "RESOURCE_REJECTED", message: "资源未通过可信审核，请查看审核问题后重试。" };
  if (status === 409) return { code: "RESOURCE_BUSY", message: "同类资源正在生成，请稍后查看任务进度。" };
  return { code: "RESOURCE_GENERATION_FAILED", message: "资源生成暂时失败，请稍后重试。" };
}
function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
function assertStudent(studentId) {
  if (!studentId) throw apiError("当前账号无权访问学生资源任务", 403, "STUDENT_REQUIRED");
}

module.exports = {
  STAGES,
  STAGE_PERCENT,
  STAGE_LABELS,
  createGenerationJob,
  launchGenerationJob,
  recordStage,
  getGenerationJob,
  findLatestGenerationJob,
  subscribe,
  publicError,
};
