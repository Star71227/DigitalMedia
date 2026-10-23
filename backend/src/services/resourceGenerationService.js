/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");
const { buildResourceContext } = require("./resourceContextService");
const { validateResourceEnvelope, fingerprint } = require("./resourceSchema");
const { generateStructuredResource } = require("./agents/multimodalResourceAgent");
const { reviewStructuredResource } = require("./agents/multimodalReviewAgent");
const { generatePptx, MIME } = require("./pptxService");
const { recordAgentStep, runWithCollaboration } = require("./agentCollaborationService");
const storage = require("./resourceStorageService");
const { groundResource } = require("./groundedResourceService");
const { persistCitations } = require("./citationValidationService");
const { PROMPT_VERSION: STUDY_NOTE_PROMPT_VERSION } = require("./studyNotePromptService");
const { VALIDATOR_VERSION: STUDY_NOTE_VALIDATOR_VERSION } = require("./studyNoteQualityService");
const { PROMPT_VERSION: MIND_MAP_PROMPT_VERSION } = require("./mindMapPromptService");
const { VALIDATOR_VERSION: MIND_MAP_VALIDATOR_VERSION } = require("./mindMapQualityService");
const { PROMPT_VERSION: QUIZ_PACK_PROMPT_VERSION } = require("./quizPackPromptService");
const { VALIDATOR_VERSION: QUIZ_PACK_VALIDATOR_VERSION } = require("./quizPackQualityService");
const {
  PROMPT_VERSION: CODE_CASE_PROMPT_VERSION,
  VALIDATOR_VERSION: CODE_CASE_VALIDATOR_VERSION,
} = require("./codeCaseService");
const {
  PROMPT_VERSION: PPT_PROMPT_VERSION,
  VALIDATOR_VERSION: PPT_VALIDATOR_VERSION,
} = require("./pptService");
const instantSample = require("./instantSampleResourceService");

const PROMPT_VERSION = "resource-five-types-v3";

/**
 * 真实资源生成入口（讲义 / 课件 PPT / 思维导图 / 练习包 / 代码案例都走这里）。
 * 整条流水线包在一次协作作用域内：画像 → 结构化生成 → 双层审核 → （课件）渲染，
 * 每一步都会写进同一个 trace，学生端/教师端可以回放「这次资源是谁生成的、审核过没过」。
 */
async function generateResource(input, options = {}) {
  return runWithCollaboration(
    { pipelineKey: "structured_resource", studentId: Number(input?.studentId) || null },
    () => generateResourceInner(input, options),
  );
}

async function generateResourceInner(input, options = {}) {
  const stage = async (name, details = {}) => options.onStage?.(name, details);
  await stage("profile_analysis", {
    message: "正在读取学习画像、学习偏好、资源偏好与学习节奏。",
    metadata: {},
  });
  const profileStartedAt = Date.now();
  const context = await buildResourceContext(input);
  // 课堂演示通道：INSTANT_SAMPLE_RESOURCES=true 时，课件 / 思维导图用预置样例秒出，
  // 讲义直接复用学生已有的那一份；未命中就继续走下面的真实生成链路。
  const instant = await instantSample.buildInstantResource(context, { stage });
  if (instant) {
    await stage("deterministic_review", {
      message: "预置样例内容校验通过。",
      metadata: { instant: true, resourceId: instant.resourceId },
    });
    await stage("path_linking", { message: "已关联到当前学习路径阶段。", metadata: { instant: true } });
    return getResource(context.studentId, instant.resourceId);
  }
  await recordAgentStep({
    agent: "ProfileAgent",
    role: "profiler",
    taskType: "resource_profile",
    durationMs: Date.now() - profileStartedAt,
    summary: `读取画像：掌握度 ${context.mastery}，错误模式 ${context.errorPatterns.length} 条，路径阶段 ${context.stageKey}，资源类型 ${context.resourceType}`,
  });
  await stage("learning_context_analysis", {
    message: `已读取当前掌握度、错误模式、路径阶段、最近测验与CodeLab证据。`,
    metadata: {
      mastery: context.mastery,
      errorPatternCount: context.errorPatterns.length,
      questionCount: context.allowedQuestionIds.length,
      exerciseCount: context.allowedCodeExerciseIds.length,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
    },
  });
  const fingerprintPromptVersion =
    context.resourceType === "study_note"
      ? `${STUDY_NOTE_PROMPT_VERSION}:${STUDY_NOTE_VALIDATOR_VERSION}`
      : context.resourceType === "mind_map"
        ? `${MIND_MAP_PROMPT_VERSION}:${MIND_MAP_VALIDATOR_VERSION}`
        : context.resourceType === "quiz_pack"
          ? `${QUIZ_PACK_PROMPT_VERSION}:${QUIZ_PACK_VALIDATOR_VERSION}`
          : context.resourceType === "code_case"
            ? `${CODE_CASE_PROMPT_VERSION}:${CODE_CASE_VALIDATOR_VERSION}`
            : context.resourceType === "pptx"
              ? `${PPT_PROMPT_VERSION}:${PPT_VALIDATOR_VERSION}`
              : PROMPT_VERSION;
  const contextFingerprint = fingerprint({
    studentId: context.studentId,
    resourceType: context.resourceType,
    subject: context.subject,
    knowledgePoint: context.knowledgePoint,
    pathVersion: context.pathVersion,
    stageKey: context.stageKey,
    stageGoals: context.stageGoals,
    pathKnowledgePoints: context.pathKnowledgePoints,
    masteryBucket: Math.floor(context.mastery / 10) * 10,
    errorPatterns: context.errorPatterns.map((item) => item.errorType),
    explanationPreference: context.explanationPreference,
    resourcePreferences: context.resourcePreferences,
    estimatedMinutes: context.estimatedMinutes,
    allowedQuestionIds: context.allowedQuestionIds,
    allowedCodeExerciseIds: context.allowedCodeExerciseIds,
    promptVersion: fingerprintPromptVersion,
  });
  const connection = await pool.getConnection();
  let lockName;
  let tempPath;
  let finalizedPath;
  // 这条记录在 try 里才会创建，但失败时要能按 id 精确回写状态，所以提到外面声明
  let resourceId = null;
  try {
    lockName = `learnmate-resource-${context.studentId}-${context.resourceType}-${context.pathVersion}-${context.stageKey}`;
    const [[lock]] = await connection.query("SELECT GET_LOCK(?,15) AS acquired", [lockName]);
    if (!lock.acquired) throw apiError("resource generation is busy", 409);
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO learning_resources (student_id,subject,knowledge_point,resource_type,title,status,current_version,context_fingerprint,source_type,path_version,stage_key,estimated_minutes)
      VALUES (?,?,?,?,?,'generating',0,?,'agent',?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [
        context.studentId,
        context.subject,
        context.knowledgePoint,
        context.resourceType,
        `${context.knowledgePoint}学习资源`,
        contextFingerprint,
        context.pathVersion,
        context.stageKey,
        context.estimatedMinutes,
      ],
    );
    resourceId =
      Number((await connection.query("SELECT LAST_INSERT_ID() AS id"))[0][0].id) ||
      Number(
        (
          await connection.query(
            "SELECT id FROM learning_resources WHERE student_id=? AND resource_type=? AND path_version=? AND stage_key=? FOR UPDATE",
            [context.studentId, context.resourceType, context.pathVersion, context.stageKey],
          )
        )[0][0].id,
      );
    const [[resource]] = await connection.query("SELECT * FROM learning_resources WHERE id=? FOR UPDATE", [
      resourceId,
    ]);
    if (
      !input.regenerate &&
      !options.forceArtifactRepair &&
      resource.status === "approved" &&
      resource.context_fingerprint === contextFingerprint
    ) {
      await connection.commit();
      await reportReuseStages(stage, context, resourceId);
      return getResource(context.studentId, resourceId);
    }
    await connection.query(
      "UPDATE learning_resources SET status='generating',context_fingerprint=?,error_summary=NULL WHERE id=?",
      [contextFingerprint, resourceId],
    );
    await connection.commit();

    const isStudyNote = context.resourceType === "study_note";
    const isMindMap = context.resourceType === "mind_map";
    const isQuizPack = context.resourceType === "quiz_pack";
    const isCodeCase = context.resourceType === "code_case";
    const isPptx = context.resourceType === "pptx";
    let studyNoteRetrieval = null;
    let mindMapRetrieval = null;
    let pptRetrieval = null;
    const retrievalUsed = isStudyNote || isMindMap || isPptx;
    await stage("knowledge_retrieval", {
      message: retrievalUsed ? "正在执行课程知识库检索。" : "该资源使用路径与题库证据，无需额外RAG检索。",
      metadata: { retrievalUsed, chunkCount: 0, sourceCount: 0 },
    });
    await stage("content_generation", {
      message: `ResourceAgent正在生成${context.resourceType}结构化内容。`,
      metadata: { resourceType: context.resourceType },
    });
    const generationStartedAt = Date.now();
    const generated = await generateStructuredResource(context, {
      onKnowledgeRetrieval: async (retrieval) => {
        if (isStudyNote) studyNoteRetrieval = retrieval;
        if (isMindMap) mindMapRetrieval = retrieval;
        if (isPptx) pptRetrieval = retrieval;
        const chunkCount = retrieval?.results?.length || 0;
        const typeLabel = isPptx ? "教学课件" : isMindMap ? "思维导图" : "学习讲义";
        await stage("knowledge_retrieval", {
          status: "completed",
          message: chunkCount
            ? `已检索到 ${chunkCount} 个${typeLabel}相关知识片段。`
            : `未检索到可验证课程资料，${typeLabel}不会生成虚假引用。`,
          metadata: {
            retrievalUsed: true,
            chunkCount,
            sourceCount: new Set((retrieval?.results || []).map((item) => item.sourceKey)).size,
          },
        });
      },
      onQualityAttempt: async ({ attempt, sourceMode, quality }) => {
        const label = isPptx
          ? "教学课件质量"
          : isMindMap
            ? "思维导图结构质量"
            : isQuizPack
              ? "智能测验质量"
              : "学习讲义质量";
        await stage("content_generation", {
          message: `${label}检测第 ${attempt} 次：${quality.passed ? "通过" : "未通过"}。`,
          metadata: { resourceType: context.resourceType, passed: quality.passed, sourceMode },
        });
      },
    });
    await recordAgentStep({
      agent: "ResourceAgent",
      role: "generator",
      taskType: "structured_resource_generation",
      durationMs: Date.now() - generationStartedAt,
      summary: `${context.resourceType} 结构化内容已生成（来源 ${generated?.source || "model"}，模型 ${generated?.model || "-"}）`,
    });
    let content = validateResourceEnvelope(generated.content, context);
    const grounding =
      !isStudyNote && !isMindMap && !isPptx && retrievalUsed
        ? await groundResource(pool, content, context)
        : null;
    if (grounding) {
      content = validateResourceEnvelope(grounding.envelope, context);
      const chunkCount = grounding.retrieval?.results?.length || 0;
      await stage("knowledge_retrieval", {
        status: "completed",
        message: `已检索到 ${chunkCount} 个相关知识片段。`,
        metadata: {
          retrievalUsed: true,
          chunkCount,
          sourceCount: new Set((content.citations || []).map((item) => item.sourceKey)).size,
        },
      });
    }
    const reviewContext = grounding
      ? {
          ...context,
          allowedCitationIds: grounding.retrieval.results.map((item) => Number(item.chunkId)),
          retrievalResults: grounding.retrieval.results,
        }
      : isStudyNote && studyNoteRetrieval
        ? {
            ...context,
            allowedCitationIds: studyNoteRetrieval.results.map((item) => Number(item.chunkId)),
            retrievalResults: studyNoteRetrieval.results,
          }
        : isMindMap && mindMapRetrieval
          ? {
              ...context,
              allowedCitationIds: mindMapRetrieval.results.map((item) => Number(item.chunkId)),
              retrievalResults: mindMapRetrieval.results,
            }
          : isPptx && pptRetrieval
            ? {
                ...context,
                allowedCitationIds: pptRetrieval.results.map((item) => Number(item.chunkId)),
                retrievalResults: pptRetrieval.results,
              }
            : context;
    const reviewStartedAt = Date.now();
    let review = await reviewStructuredResource(content, reviewContext, {
      onDeterministicReview: (result) =>
        stage("deterministic_review", {
          status: "completed",
          message: `规则审核得分 ${result.score}，${result.passed ? "通过" : "未通过"}。`,
          metadata: { score: result.score, passed: result.passed },
        }),
      onAiReview: (result) =>
        stage("ai_review", {
          status: "completed",
          message: result.modelReviewExecuted
            ? `模型审核已完成，综合得分 ${result.score}。`
            : result.modelReviewStatus === "disabled"
              ? "模型审核未执行，保留规则审核结果。"
              : "模型审核不可用，保留规则审核结果。",
          metadata: {
            score: result.score,
            passed: result.passed,
            modelReviewExecuted: result.modelReviewExecuted,
            modelReviewStatus: result.modelReviewStatus,
          },
        }),
    });
    await recordAgentStep({
      agent: "ReviewAgent",
      role: "reviewer",
      taskType: "structured_resource_review",
      durationMs: Date.now() - reviewStartedAt,
      status: review?.passed === false ? "fallback" : "success",
      summary: `双层审核：规则得分 ${review?.score ?? "-"}，${review?.passed === false ? "未通过（已回退到可用版本）" : "通过"}${review?.modelReviewExecuted ? "，含模型复核" : "，仅规则审核"}`,
    });
    if (isStudyNote) review = withStudyNoteReviewMetadata(review, generated, context, input);
    if (isMindMap) review = withMindMapReviewMetadata(review, generated, context, input);
    if (isQuizPack) review = withQuizPackReviewMetadata(review, generated, context, input);
    if (isCodeCase) review = withCodeCaseReviewMetadata(review, generated, context, input);
    if (isPptx) review = withPptReviewMetadata(review, generated, context, input);
    content = applyReview(content, review, context);
    const contentFingerprint = resourceFingerprint(content);
    const [[latest]] = await connection.query(
      "SELECT current_version,content_fingerprint FROM learning_resources WHERE id=?",
      [resourceId],
    );
    if (
      latest.current_version > 0 &&
      latest.content_fingerprint === contentFingerprint &&
      !options.forceArtifactRepair
    ) {
      await connection.query(
        "UPDATE learning_resources SET status='approved',error_summary=NULL WHERE id=?",
        [resourceId],
      );
      await stage("rendering", {
        status: "completed",
        message: "内容与已有版本一致，复用已验证渲染结果。",
        metadata: { fileRendered: false },
      });
      await stage("persistence", {
        status: "completed",
        message: "内容指纹一致，未创建重复资源版本。",
        metadata: { resourceId, version: latest.current_version, checksumVerified: true },
      });
      await stage("path_linking", {
        status: "completed",
        message: "复用已有学习路径关联。",
        metadata: { resourceId, pathVersion: context.pathVersion, stageKey: context.stageKey },
      });
      return getResource(context.studentId, resourceId);
    }

    const nextVersion = Number(latest.current_version) + 1;
    let fileMeta = null;
    let pptxValidation = null;
    await stage("rendering", {
      message:
        context.resourceType === "pptx"
          ? "正在调用PPTX视觉引擎渲染文件。"
          : "该资源为结构化内容，无需文件渲染。",
      metadata: { fileRendered: context.resourceType === "pptx" },
    });
    if (context.resourceType === "pptx") {
      tempPath = await storage.prepareTempFile("pptx");
      pptxValidation = await generatePptx(content.content, tempPath, content.citations);
      review = withPptxFileValidation(review, pptxValidation);
    }
    await stage("rendering", {
      status: "completed",
      message:
        context.resourceType === "pptx" ? "PPTX文件渲染完成，准备执行安全存储。" : "结构化资源无需文件渲染。",
      metadata: { fileRendered: context.resourceType === "pptx" },
    });

    await stage("persistence", {
      message: "正在执行版本保存、安全存储、checksum与原子移动。",
      metadata: { resourceId, version: nextVersion },
    });
    await connection.beginTransaction();
    await connection.query("SELECT id FROM learning_resources WHERE id=? FOR UPDATE", [resourceId]);
    if (tempPath) {
      fileMeta = await storage.finalizeFile(tempPath, {
        studentId: context.studentId,
        resourceId,
        version: nextVersion,
        fileType: "pptx",
      });
      tempPath = null;
      finalizedPath = fileMeta.absolutePath;
      review = withPptxFileMeta(review, fileMeta, pptxValidation);
    }
    await connection.query(
      `INSERT INTO learning_resource_versions (resource_id,student_id,version,content_json,review_json,content_fingerprint,generator_source,model_name,prompt_version,retrieval_run_id,citations_json,code_exercise_id,code_case_candidate_key)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        resourceId,
        context.studentId,
        nextVersion,
        JSON.stringify(content),
        JSON.stringify(review),
        contentFingerprint,
        generated.source,
        generated.model,
        generated.promptVersion || PROMPT_VERSION,
        studyNoteRetrieval?.retrievalRunId ||
          mindMapRetrieval?.retrievalRunId ||
          pptRetrieval?.retrievalRunId ||
          grounding?.retrieval.retrievalRunId ||
          null,
        JSON.stringify(content.citations || []),
        codeCaseExerciseId(content),
        codeCaseCandidateKey(content),
      ],
    );
    if (grounding)
      await persistCitations(connection, {
        studentId: context.studentId,
        generationType: context.resourceType,
        generationId: String(resourceId),
        generationVersion: nextVersion,
        validation: grounding.validation,
      });
    if (
      isStudyNote &&
      generated.citationValidation?.approved &&
      generated.citationValidation.citations?.length
    )
      await persistCitations(connection, {
        studentId: context.studentId,
        generationType: context.resourceType,
        generationId: String(resourceId),
        generationVersion: nextVersion,
        validation: generated.citationValidation,
      });
    if (isMindMap && generated.citationValidation?.approved && generated.citationValidation.citations?.length)
      await persistCitations(connection, {
        studentId: context.studentId,
        generationType: context.resourceType,
        generationId: String(resourceId),
        generationVersion: nextVersion,
        validation: generated.citationValidation,
      });
    if (isPptx && generated.citationValidation?.approved && generated.citationValidation.citations?.length)
      await persistCitations(connection, {
        studentId: context.studentId,
        generationType: context.resourceType,
        generationId: String(resourceId),
        generationVersion: nextVersion,
        validation: generated.citationValidation,
      });
    if (fileMeta) {
      await connection.query(
        `INSERT INTO learning_resource_files (resource_id,resource_version,student_id,file_type,storage_path,original_filename,mime_type,file_size,checksum_sha256)
        VALUES (?,?,?,'pptx',?,?,?,?,?)`,
        [
          resourceId,
          nextVersion,
          context.studentId,
          fileMeta.storagePath,
          safeDownloadName(content.title, "pptx"),
          MIME,
          fileMeta.fileSize,
          fileMeta.checksum,
        ],
      );
    }
    await stage("persistence", {
      status: "completed",
      message: "资源版本与安全存储记录已写入，checksum校验完成。",
      metadata: { resourceId, version: nextVersion, checksumVerified: true },
    });
    await stage("path_linking", {
      message: "正在关联当前学习路径阶段并初始化资源学习进度。",
      metadata: {
        resourceId,
        version: nextVersion,
        pathVersion: context.pathVersion,
        stageKey: context.stageKey,
      },
    });
    await connection.query(
      "INSERT INTO learning_resource_stage_links (student_id,resource_id,resource_version,path_version,stage_key) VALUES (?,?,?,?,?)",
      [context.studentId, resourceId, nextVersion, context.pathVersion, context.stageKey],
    );
    await connection.query(
      "INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent) VALUES (?,?,?,'not_started',0)",
      [context.studentId, resourceId, nextVersion],
    );
    await connection.query(
      "UPDATE learning_resources SET title=?,status='approved',current_version=?,content_fingerprint=?,estimated_minutes=? WHERE id=?",
      [content.title, nextVersion, contentFingerprint, content.estimatedMinutes, resourceId],
    );
    await connection.commit();
    finalizedPath = null;
    return getResource(context.studentId, resourceId);
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    // 生成失败必须把资源行从 generating 落回 failed，否则它会永久卡在 generating，
    // 而没有版本记录的行会让「资源列表」整页 500（listResources 逐条加载会抛 404）。
    // 按 id 回写是唯一可靠的做法：以前用 input.pathVersion/stageKey 匹配，
    // 调用方不传这两个字段时 WHERE 里是 NULL，一条也更新不到。
    const summary = String(error.message).slice(0, 255);
    if (resourceId) {
      await pool
        .query(
          "UPDATE learning_resources SET status=IF(current_version>0,'approved','failed'),error_summary=? WHERE id=?",
          [summary, resourceId],
        )
        .catch(() => undefined);
    } else if (input.studentId) {
      await pool
        .query(
          "UPDATE learning_resources SET status=IF(current_version>0,'approved','failed'),error_summary=? WHERE student_id=? AND resource_type=? AND path_version=? AND stage_key=?",
          [
            summary,
            input.studentId,
            input.resourceType,
            context?.pathVersion ?? input.pathVersion,
            context?.stageKey ?? input.stageKey,
          ],
        )
        .catch(() => undefined);
    }
    await storage.cleanupFile(tempPath);
    await storage.cleanupFile(finalizedPath);
    throw error;
  } finally {
    if (lockName) await connection.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
    connection.release();
  }
}

async function reportReuseStages(stage, context, resourceId) {
  await stage("knowledge_retrieval", {
    status: "completed",
    message: "上下文指纹未变化，复用已有检索证据。",
    metadata: { retrievalUsed: false },
  });
  await stage("content_generation", {
    status: "completed",
    message: "上下文指纹未变化，复用已生成内容。",
    metadata: { resourceType: context.resourceType },
  });
  await stage("deterministic_review", {
    status: "completed",
    message: "复用已有规则审核证据。",
    metadata: {},
  });
  await stage("ai_review", { status: "completed", message: "复用已有模型审核状态。", metadata: {} });
  await stage("rendering", {
    status: "completed",
    message: "复用已有渲染结果。",
    metadata: { fileRendered: false },
  });
  await stage("persistence", {
    status: "completed",
    message: "复用已有安全存储版本，未重复持久化。",
    metadata: { resourceId, checksumVerified: true },
  });
  await stage("path_linking", {
    status: "completed",
    message: "复用已有学习路径关联。",
    metadata: { resourceId, pathVersion: context.pathVersion, stageKey: context.stageKey },
  });
}

async function listResources(studentId, filters = {}) {
  const where = ["student_id=?"],
    params = [studentId];
  for (const [field, column] of [
    ["resourceType", "resource_type"],
    ["subject", "subject"],
    ["knowledgePoint", "knowledge_point"],
    ["stageKey", "stage_key"],
    ["status", "status"],
  ])
    if (filters[field]) {
      where.push(`${column}=?`);
      params.push(String(filters[field]));
    }
  const limit = Math.max(1, Math.min(100, Number(filters.limit) || 30));
  const [rows] = await pool.query(
    `SELECT id FROM learning_resources WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ${limit}`,
    params,
  );
  // 逐条加载时用 allSettled：某条资源缺少版本记录（例如生成中途失败留下的行）不应该让
  // 整个「资源列表」页面 500 —— 跳过读不出来的行，其余照常返回。
  const settled = await Promise.allSettled(rows.map((row) => getResource(studentId, row.id)));
  return settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
}
async function getResource(studentId, resourceId, version = null) {
  const [[resource]] = await pool.query(
    "SELECT * FROM learning_resources WHERE id=? AND student_id=? LIMIT 1",
    [resourceId, studentId],
  );
  if (!resource) throw apiError("resource not found", 404);
  const selected = version ? Number(version) : Number(resource.current_version);
  const [[resourceVersion]] = await pool.query(
    "SELECT * FROM learning_resource_versions WHERE resource_id=? AND student_id=? AND version=? LIMIT 1",
    [resource.id, studentId, selected],
  );
  if (!resourceVersion) throw apiError("resource version not found", 404);
  const [[progress]] = await pool.query(
    "SELECT * FROM learning_resource_progress WHERE student_id=? AND resource_id=? AND resource_version=?",
    [studentId, resource.id, selected],
  );
  return toPublic(resource, resourceVersion, progress);
}
async function listVersions(studentId, resourceId) {
  await assertOwner(studentId, resourceId);
  const [rows] = await pool.query(
    "SELECT version,review_json,created_at FROM learning_resource_versions WHERE resource_id=? AND student_id=? ORDER BY version DESC",
    [resourceId, studentId],
  );
  return rows.map((row) => ({
    version: safeNumber(row.version),
    createdAt: row.created_at,
    review: toPublicReview(parse(row.review_json), row.created_at),
  }));
}
async function getDownload(studentId, resourceId, version = null) {
  const resource = await getResource(studentId, resourceId, version);
  const [[file]] = await pool.query(
    "SELECT * FROM learning_resource_files WHERE resource_id=? AND student_id=? AND resource_version=? AND file_type='pptx'",
    [resourceId, studentId, resource.version],
  );
  if (!file) throw apiError("download not available", 404);
  await pool.query(
    "UPDATE learning_resource_progress SET downloaded_at=NOW(),last_activity_at=NOW(),status=IF(status='not_started','opened',status) WHERE student_id=? AND resource_id=? AND resource_version=?",
    [studentId, resourceId, resource.version],
  );
  return { ...file, absolutePath: storage.resolveStoredFile(file.storage_path) };
}
async function openResource(studentId, resourceId) {
  const resource = await getResource(studentId, resourceId);
  await pool.query(
    "UPDATE learning_resource_progress SET opened_at=COALESCE(opened_at,NOW()),last_activity_at=NOW(),status=IF(status='not_started','opened',status) WHERE student_id=? AND resource_id=? AND resource_version=?",
    [studentId, resourceId, resource.version],
  );
  return getResource(studentId, resourceId);
}
async function updateProgress(studentId, resourceId, { progressPercent }) {
  const resource = await getResource(studentId, resourceId);
  const percent = Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)));
  await pool.query(
    "UPDATE learning_resource_progress SET progress_percent=GREATEST(progress_percent,?),accumulated_seconds=accumulated_seconds+LEAST(60,GREATEST(0,TIMESTAMPDIFF(SECOND,last_activity_at,NOW()))),last_activity_at=NOW(),status=IF(status IN ('completed','completed_unverified'),status,IF(?=100,'in_progress',IF(status='not_started','opened',status))) WHERE student_id=? AND resource_id=? AND resource_version=?",
    [percent, percent, studentId, resourceId, resource.version],
  );
  return getResource(studentId, resourceId);
}
async function completeResource(studentId, resourceId) {
  const resource = await getResource(studentId, resourceId);
  const [[progress]] = await pool.query(
    "SELECT * FROM learning_resource_progress WHERE student_id=? AND resource_id=? AND resource_version=?",
    [studentId, resourceId, resource.version],
  );
  if (!progress) throw apiError("resource progress not found", 404);
  const accessOk =
    Boolean(progress.opened_at) || (resource.resourceType === "pptx" && progress.downloaded_at);
  if (!accessOk || Number(progress.progress_percent) < 100 || Number(progress.accumulated_seconds) < 30)
    throw apiError("completion requirements not met", 422);
  const pathCompletionEligible = !(
    resource.resourceType === "code_case" && resource.content?.verificationStatus === "generated"
  );
  const progressStatus = pathCompletionEligible ? "completed" : "completed_unverified";
  await pool.query(
    "UPDATE learning_resource_progress SET status=?,completed_at=NOW(),last_activity_at=NOW(),evidence_json=? WHERE id=?",
    [
      progressStatus,
      JSON.stringify({
        openedAt: progress.opened_at,
        downloadedAt: progress.downloaded_at,
        progressPercent: Number(progress.progress_percent) || 0,
        accumulatedSeconds: Number(progress.accumulated_seconds) || 0,
        pathCompletionEligible,
        verificationStatus: resource.content?.verificationStatus || null,
      }),
      progress.id,
    ],
  );
  return getResource(studentId, resourceId);
}
async function stageResources(studentId, pathVersion, stageKey) {
  return listResources(studentId, { stageKey, status: "approved", limit: 50 }).then((items) =>
    items.filter((item) => item.pathVersion === Number(pathVersion)),
  );
}
async function assertOwner(studentId, id) {
  const [[resource]] = await pool.query("SELECT id FROM learning_resources WHERE id=? AND student_id=?", [
    id,
    studentId,
  ]);
  if (!resource) throw apiError("resource not found", 404);
}
function toPublic(resource, version, progress) {
  const content = parse(version.content_json);
  const review = parse(version.review_json);
  const storedCitations = parse(version.citations_json);
  const citations =
    Array.isArray(storedCitations) && storedCitations.length
      ? storedCitations
      : Array.isArray(content.citations)
        ? content.citations
        : [];
  const isPptx = resource.resource_type === "pptx";
  const quality = toPublicQuality(resource.resource_type, review);
  const publicContent =
    resource.resource_type === "quiz_pack"
      ? redactQuizPackAnswers(content.content || {})
      : resource.resource_type === "code_case"
        ? redactCodeCaseContent(content.content || {})
        : isPptx
          ? redactPptContent(content.content || {}, citations)
          : content.content || {};
  const publicCitations = isPptx ? redactPptCitations(citations) : citations;
  const publicReview = toPublicReview(review, version.created_at);
  const result = {
    id: safeNumber(resource.id),
    version: safeNumber(version.version),
    generationId: review.generationId || String(resource.id),
    resourceType: resource.resource_type,
    title: resource.title,
    status: resource.status,
    subject: resource.subject,
    knowledgePoint: resource.knowledge_point,
    stageKey: resource.stage_key,
    pathVersion: safeNumber(resource.path_version),
    estimatedMinutes: safeNumber(resource.estimated_minutes),
    generationRationale: Array.isArray(content.generationRationale) ? content.generationRationale : [],
    content: publicContent,
    citations: publicCitations,
    learningObjectives: Array.isArray(content.learningObjectives) ? content.learningObjectives : [],
    targetLearnerSummary: content.targetLearnerSummary || "",
    sourceMode: review.sourceMode || version.generator_source,
    modelAvailable:
      review.modelAvailable === undefined ? Boolean(version.model_name) : Boolean(review.modelAvailable),
    knowledgeNotice: review.knowledgeNotice || "",
    quality,
    retryCount: safeNumber(review.retryCount),
    review: publicReview,
    progress: progress
      ? {
          status: progress.status,
          progressPercent: safeNumber(progress.progress_percent),
          accumulatedSeconds: safeNumber(progress.accumulated_seconds),
          openedAt: progress.opened_at,
          completedAt: progress.completed_at,
          downloadedAt: progress.downloaded_at,
        }
      : null,
    createdAt: version.created_at,
  };
  if (!isPptx) result.retrievalRunId = safeNullableNumber(version.retrieval_run_id || content.retrievalRunId);
  return result;
}
function applyReview(content, review, context) {
  if (review.status === "rejected") {
    // 以前这里只抛一句 "resource rejected by review"，日志里也看不到原因，
    // 排查时完全不知道是模型审核还是规则审核、卡在哪一条。现在把判定依据打出来。
    const issues = Array.isArray(review.issues) ? review.issues.slice(0, 8) : [];
    console.error(
      `[resource] 审核判定 rejected：resourceType=${context?.resourceType} score=${review.score ?? "-"} modelReviewExecuted=${Boolean(review.modelReviewExecuted)} issues=${JSON.stringify(issues).slice(0, 900)}`,
    );
    throw apiError("resource rejected by review", 422, "RESOURCE_REJECTED");
  }
  const corrected =
    review.status === "needs_revision" && review.correctedContent ? review.correctedContent : content;
  return validateResourceEnvelope(corrected, context);
}
function parse(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function redactPptContent(content, citations) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return {};
  const labelByChunk = new Map(
    (Array.isArray(citations) ? citations : [])
      .map((item) => [Number(item?.chunkId), item?.label])
      .filter(([id, label]) => Number.isFinite(id) && label),
  );
  const slides = Array.isArray(content.slides)
    ? content.slides.map((slide) => {
        if (!slide || typeof slide !== "object" || Array.isArray(slide)) return slide;
        const labels = Array.isArray(slide.citations)
          ? slide.citations.map((id) => labelByChunk.get(Number(id))).filter(Boolean)
          : [];
        return { ...slide, citations: labels };
      })
    : [];
  return { ...content, slides };
}
function redactPptCitations(citations) {
  return Array.isArray(citations)
    ? citations.map((item) => ({
        label: item?.label,
        sourceKey: item?.sourceKey,
        sourceTitle: item?.sourceTitle,
        chapter: item?.chapter,
        section: item?.section,
        license: item?.license,
        version: item?.version,
        excerpt: item?.excerpt,
        supportScore: item?.supportScore,
      }))
    : [];
}
const QUIZ_PRIVATE_PUBLIC_FIELDS = new Set([
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
]);
function redactQuizPackAnswers(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return {};
  const questions = Array.isArray(content.questions) ? content.questions.map(toPublicQuizPackQuestion) : [];
  return { ...content, questions };
}
function toPublicQuizPackQuestion(question = {}) {
  if (!question || typeof question !== "object" || Array.isArray(question)) return {};
  return Object.fromEntries(Object.entries(question).filter(([key]) => !QUIZ_PRIVATE_PUBLIC_FIELDS.has(key)));
}
function toPublicReview(review = {}, reviewedAt) {
  return {
    status: review.status || "needs_revision",
    score: safeNumber(review.score),
    totalScore: safeNumber(review.totalScore ?? review.score),
    passThreshold: safeNumber(review.passThreshold || 75),
    summary: review.summary || "legacy review is missing a complete audit record",
    issues: publicReviewItems(review.issues),
    ruleIssues: publicReviewItems(review.ruleIssues),
    modelIssues: publicReviewItems(review.modelIssues),
    dimensions: Array.isArray(review.dimensions) ? review.dimensions.map(publicReviewDimension) : [],
    checks: publicChecks(review.checks),
    modelReviewExecuted: Boolean(review.modelReviewExecuted),
    modelReviewStatus: review.modelReviewStatus || "legacy",
    reviewVersion: review.reviewVersion || "legacy",
    reviewedAt: review.reviewedAt || reviewedAt,
  };
}
function toPublicQuality(resourceType, review = {}) {
  const quality = review.studyNoteQuality || review.quality || null;
  if (resourceType === "code_case") return publicCodeCaseQuality(quality);
  if (resourceType !== "quiz_pack" || !quality || typeof quality !== "object" || Array.isArray(quality))
    return quality;
  return {
    passed: Boolean(quality.passed),
    questionCount: safeNumber(quality.questionCount),
    difficultyTotal: safeNumber(quality.difficultyTotal),
    uniqueQuestionIds: safeNumber(quality.uniqueQuestionIds),
    duplicateQuestionIds: safeNumber(quality.duplicateQuestionIds),
    knowledgePointCount: safeNumber(quality.knowledgePointCount),
    maxKnowledgePointShare: safeNumber(quality.maxKnowledgePointShare),
    understandingApplicationCount: safeNumber(quality.understandingApplicationCount),
    understandingApplicationShare: safeNumber(quality.understandingApplicationShare),
    scenarioProcessCount: safeNumber(quality.scenarioProcessCount),
    misconceptionCount: safeNumber(quality.misconceptionCount),
    duplicateStemCount: safeNumber(quality.duplicateStemCount),
    duplicateStemRatio: safeNumber(quality.duplicateStemRatio),
    similarStemPairs: safeNumber(quality.similarStemPairs),
    issues: publicReviewItems(quality.issues),
    checks: publicChecks(quality.checks),
    checkedAt: quality.checkedAt,
    validatorVersion: quality.validatorVersion,
  };
}
function redactCodeCaseContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return {};
  const quality =
    content.qualitySummary &&
    typeof content.qualitySummary === "object" &&
    !Array.isArray(content.qualitySummary)
      ? {
          trusted: Boolean(content.qualitySummary.trusted),
          language: content.qualitySummary.language,
          executionMode: content.qualitySummary.executionMode,
          publicTestCount: safeNumber(content.qualitySummary.publicTestCount),
          hiddenTestCount: safeNumber(content.qualitySummary.hiddenTestCount),
          boundaryCategories: Array.isArray(content.qualitySummary.boundaryCategories)
            ? content.qualitySummary.boundaryCategories.map((item) => String(item || "").slice(0, 120))
            : [],
          referenceAccepted: Boolean(content.qualitySummary.referenceAccepted),
          knownBugCaught: Boolean(content.qualitySummary.knownBugCaught),
          fixedOutputCaught: Boolean(content.qualitySummary.fixedOutputCaught),
          validatorVersion: content.qualitySummary.validatorVersion,
          checkedAt: content.qualitySummary.checkedAt,
        }
      : null;
  return {
    exerciseTitle: content.exerciseTitle,
    caseBackground: content.caseBackground,
    learningObjectives: Array.isArray(content.learningObjectives) ? content.learningObjectives : [],
    language: content.language,
    starterCode: content.starterCode,
    tasks: Array.isArray(content.tasks) ? content.tasks : [],
    inputDescription: content.inputDescription,
    outputDescription: content.outputDescription,
    testCases: Array.isArray(content.testCases)
      ? content.testCases.map((item) => ({
          input: item?.input || "",
          expectedOutput: item?.expectedOutput || "",
          description: item?.description || "",
        }))
      : [],
    boundaryConditions: Array.isArray(content.boundaryConditions) ? content.boundaryConditions : [],
    aiExplanation: content.aiExplanation,
    commonErrors: Array.isArray(content.commonErrors) ? content.commonErrors : [],
    advancedChallenges: Array.isArray(content.advancedChallenges) ? content.advancedChallenges : [],
    verificationStatus: content.verificationStatus,
    codeExerciseId: content.codeExerciseId,
    codeLabEntry:
      content.codeLabEntry && typeof content.codeLabEntry === "object"
        ? {
            exerciseId: content.codeLabEntry.exerciseId,
            route: content.codeLabEntry.route,
          }
        : null,
    sourceMode: content.sourceMode,
    modelAvailable: Boolean(content.modelAvailable),
    candidateCount: safeNumber(content.candidateCount),
    selectedCandidateKey: content.selectedCandidateKey,
    selectionReason: content.selectionReason,
    knowledgeNotice: content.knowledgeNotice,
    qualitySummary: quality,
  };
}
function publicCodeCaseQuality(quality) {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  return {
    passed: Boolean(quality.passed),
    trusted: Boolean(quality.trusted),
    candidateCount: safeNumber(quality.candidateCount),
    selectedCandidateKey: quality.selectedCandidateKey || null,
    publicTestCount: safeNumber(quality.publicTestCount),
    hiddenTestCount: safeNumber(quality.hiddenTestCount),
    boundaryCategoryCount: safeNumber(quality.boundaryCategoryCount),
    referenceAccepted: Boolean(quality.referenceAccepted),
    knownBugCaught: Boolean(quality.knownBugCaught),
    fixedOutputCaught: Boolean(quality.fixedOutputCaught),
    executionMode: quality.executionMode,
    validatorVersion: quality.validatorVersion,
    checkedAt: quality.checkedAt,
    issues: publicReviewItems(quality.issues),
    checks: publicChecks(quality.checks),
  };
}
function publicReviewItems(items) {
  return Array.isArray(items)
    ? items.map((item) =>
        item && typeof item === "object"
          ? {
              severity: item.severity,
              category: item.category,
              dimension: item.dimension,
              location: item.location,
              message: item.message,
              suggestedFix: item.suggestedFix,
              source: item.source,
            }
          : item,
      )
    : [];
}
function publicReviewDimension(item = {}) {
  return {
    dimension: item.dimension,
    label: item.label,
    score: safeNumber(item.score),
    maxScore: safeNumber(item.maxScore),
    status: item.status,
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((entry) => ({
          dimension: entry.dimension,
          rule: entry.rule,
          detail: entry.detail,
        }))
      : [],
    issues: publicReviewItems(item.issues),
    suggestions: Array.isArray(item.suggestions)
      ? item.suggestions.map((value) => String(value || "").slice(0, 500))
      : [],
  };
}
function publicChecks(checks) {
  return Array.isArray(checks)
    ? checks.map((check) => ({
        name: check?.name,
        passed: Boolean(check?.passed),
        detail: check?.detail,
      }))
    : [];
}
function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function safeNullableNumber(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}
function resourceFingerprint(content) {
  return fingerprint({
    ...content,
    retrievalRunId: undefined,
    citations: (content.citations || []).map(({ supportScore, ...citation }) => citation),
  });
}
function safeDownloadName(title, extension) {
  return `${
    String(title)
      .replace(/[\\/:*?"<>|\r\n]/g, "_")
      .slice(0, 80) || "LearnMate"
  }.${extension}`;
}
function apiError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}
function codeCaseExerciseId(content) {
  return content?.resourceType === "code_case" ? content?.content?.codeExerciseId || null : null;
}
function codeCaseCandidateKey(content) {
  return content?.resourceType === "code_case" ? content?.content?.selectedCandidateKey || null : null;
}
function withStudyNoteReviewMetadata(review, generated, context, input) {
  return {
    ...review,
    studyNoteQuality: generated.quality,
    sourceMode: generated.sourceMode,
    modelAvailable: Boolean(generated.modelAvailable),
    knowledgeNotice: generated.knowledgeNotice,
    retryCount: generated.retryCount,
    qualityAttempts: generated.qualityAttempts,
    generationId: generated.generationId,
    generationReason: "study_note_detailed_quality_gate",
    profileSnapshot: {
      profileVersion: context.profileVersion,
      major: context.major,
      grade: context.grade,
      currentCourse: context.currentCourse,
      priorKnowledge: context.priorKnowledge,
      learningGoals: context.learningGoals,
      explanationPreference: context.explanationPreference,
      resourcePreferences: context.resourcePreferences,
      paceAndTimeBudget: context.paceAndTimeBudget,
      mastery: context.mastery,
      errorPatterns: context.errorPatterns,
    },
    requestSnapshot: {
      resourceType: input.resourceType,
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
      regenerate: Boolean(input.regenerate),
    },
  };
}

function withMindMapReviewMetadata(review, generated, context, input) {
  return {
    ...review,
    quality: generated.quality,
    mindMapQuality: generated.quality,
    sourceMode: generated.sourceMode,
    modelAvailable: Boolean(generated.modelAvailable),
    knowledgeNotice: generated.knowledgeNotice,
    retryCount: generated.retryCount,
    qualityAttempts: generated.qualityAttempts,
    generationId: generated.generationId,
    generationReason: "mind_map_structured_quality_gate",
    profileSnapshot: {
      profileVersion: context.profileVersion,
      major: context.major,
      grade: context.grade,
      currentCourse: context.currentCourse,
      priorKnowledge: context.priorKnowledge,
      learningGoals: context.learningGoals,
      explanationPreference: context.explanationPreference,
      resourcePreferences: context.resourcePreferences,
      paceAndTimeBudget: context.paceAndTimeBudget,
      mastery: context.mastery,
      errorPatterns: context.errorPatterns,
    },
    requestSnapshot: {
      resourceType: input.resourceType,
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
      regenerate: Boolean(input.regenerate),
    },
  };
}

function withQuizPackReviewMetadata(review, generated, context, input) {
  return {
    ...review,
    quality: generated.quality,
    quizPackQuality: generated.quality,
    sourceMode: generated.sourceMode,
    modelAvailable: Boolean(generated.modelAvailable),
    knowledgeNotice: generated.knowledgeNotice,
    retryCount: generated.retryCount,
    qualityAttempts: generated.qualityAttempts,
    generationId: generated.generationId,
    generationReason: "quiz_pack_trustworthy_quality_gate",
    profileSnapshot: {
      profileVersion: context.profileVersion,
      major: context.major,
      grade: context.grade,
      currentCourse: context.currentCourse,
      priorKnowledge: context.priorKnowledge,
      learningGoals: context.learningGoals,
      explanationPreference: context.explanationPreference,
      resourcePreferences: context.resourcePreferences,
      paceAndTimeBudget: context.paceAndTimeBudget,
      mastery: context.mastery,
      errorPatterns: context.errorPatterns,
    },
    requestSnapshot: {
      resourceType: input.resourceType,
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
      regenerate: Boolean(input.regenerate),
    },
  };
}

function withCodeCaseReviewMetadata(review, generated, context, input) {
  return {
    ...review,
    quality: generated.quality,
    codeCaseQuality: generated.quality,
    sourceMode: generated.sourceMode || "deterministic_fallback",
    modelAvailable: false,
    knowledgeNotice: generated.knowledgeNotice,
    retryCount: generated.retryCount || 0,
    qualityAttempts: generated.qualityAttempts || [],
    generationId: generated.generationId,
    generationReason: "trusted_c_code_case_quality_gate",
    selectedCandidateKey: generated.quality?.selectedCandidateKey || null,
    requestSnapshot: {
      resourceType: input.resourceType,
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
      regenerate: Boolean(input.regenerate),
    },
  };
}

function withPptReviewMetadata(review, generated, context, input) {
  return {
    ...review,
    quality: generated.quality,
    pptQuality: generated.quality,
    sourceMode: generated.sourceMode,
    modelAvailable: Boolean(generated.modelAvailable),
    knowledgeNotice: generated.knowledgeNotice,
    retryCount: generated.retryCount,
    qualityAttempts: generated.qualityAttempts,
    generationId: generated.generationId,
    generationReason: "ppt_deck_quality_and_pptx_gate",
    requestSnapshot: {
      resourceType: input.resourceType,
      subject: context.subject,
      knowledgePoint: context.knowledgePoint,
      pathVersion: context.pathVersion,
      stageKey: context.stageKey,
      regenerate: Boolean(input.regenerate),
    },
  };
}

function withPptxFileValidation(review, validation = {}) {
  const quality = {
    ...(review.quality || {}),
    pptxGenerated: true,
    pptxValid: validation.packageValid === true,
    pptxSlideCount: safeNumber(validation.slideCount),
    pptxNotesCount: safeNumber(validation.notesCount),
    pptxMediaCount: safeNumber(validation.mediaCount),
    pptxRelationshipCount: safeNumber(validation.relationshipCount),
    pptxRelationshipErrorCount: safeNumber(validation.relationshipErrorCount),
    pptxExternalRelationshipCount: Array.isArray(validation.externalRelationships)
      ? validation.externalRelationships.length
      : 0,
    pptxPrivateFieldLeakCount: safeNumber(validation.privateFieldLeakCount),
    pptxPackageValidatorVersion: "pptx-package-v1",
  };
  return { ...review, quality, pptQuality: quality };
}

function withPptxFileMeta(review, fileMeta = {}, validation = {}) {
  const quality = {
    ...(review.quality || {}),
    pptxGenerated: true,
    pptxValid: validation?.packageValid === true,
    pptxFileSize: safeNumber(fileMeta.fileSize),
    pptxChecksumSha256: fileMeta.checksum || "",
  };
  return { ...review, quality, pptQuality: quality };
}

module.exports = {
  generateResource,
  listResources,
  getResource,
  listVersions,
  getDownload,
  openResource,
  updateProgress,
  completeResource,
  stageResources,
  applyReview,
};
