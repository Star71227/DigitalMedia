/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const {
  listExercises,
  getPublishedExerciseById,
  getExercisePrivateConfig,
} = require("../services/codeExerciseService");
const { runPublicCode, judgeSubmission, assertSupportedLanguage } = require("../services/codeJudgeService");
const {
  findSubmissionByIdempotency,
  getSubmissionByIdForStudent,
  listSubmissionsForStudent,
  normalizeIdempotencyKey,
  saveCodeSubmission,
} = require("../services/codeSubmissionService");
const { logAgentRun } = require("../services/agentLogService");
const { getCodeExecutionConfig } = require("../config/runtimeConfig");

/** 当前生效的判题执行模式（docker / local / disabled），用于日志与接口回显。 */
function activeExecutionMode() {
  try {
    return getCodeExecutionConfig().mode;
  } catch {
    return "docker";
  }
}
const { orchestrateTutor } = require("../services/agentOrchestrator");
const { isAIEnabled } = require("../services/aiService");
const { safelyAdjustLearningPath } = require("../services/learningPathService");

async function listCodeExercises(req, res) {
  try {
    const exercises = await listExercises({
      subject: req.query.subject,
      knowledgePoint: req.query.knowledge_point || req.query.knowledgePoint,
      difficulty: req.query.difficulty,
    });

    return res.json({ data: exercises.map(toStudentExerciseView) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询代码练习失败",
    });
  }
}

async function getCodeExercise(req, res) {
  try {
    const exercise = await getPublishedExerciseById(req.params.id);

    if (!exercise) {
      return res.status(404).json({ error: "code exercise not found" });
    }

    return res.json({ data: toStudentExerciseView(exercise) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询代码练习详情失败",
    });
  }
}

// 学生做题阶段不下发 explanation（讲解里含解法与答案），
// 只有正式提交过一次后，才通过 /api/code/exercises/:id/solution 解锁。
function toStudentExerciseView(exercise = {}) {
  const { explanation, ...rest } = exercise;
  return rest;
}

async function getCodeExerciseSolution(req, res) {
  try {
    const exercise = await getPublishedExerciseById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ error: "code exercise not found", code: "CODE_EXERCISE_NOT_FOUND" });
    }

    const submissions = await listSubmissionsForStudent(req.user.studentId, {
      exerciseId: exercise.exercise_id,
      mode: "submit",
      limit: 1,
    });

    if (!submissions.length) {
      return res.status(403).json({
        error: "完成一次正式提交后才能查看参考答案与讲解。",
        code: "CODE_SOLUTION_LOCKED",
      });
    }

    const privateConfig = await getExercisePrivateConfig(exercise.exercise_id);
    return res.json({
      data: {
        exerciseId: exercise.exercise_id,
        unlocked: true,
        explanation: ensureText(exercise.explanation),
        referenceSolution: privateConfig ? ensureText(privateConfig.referenceSolution) : "",
        latestStatus: ensureText(submissions[0].status),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询参考答案失败",
      code: error.code || "CODE_SOLUTION_FAILED",
    });
  }
}

async function runCode(req, res) {
  const startTime = Date.now();

  try {
    const { exerciseId, language = "c", sourceCode = "", stdin = "", runMode = "public" } = req.body || {};

    const result = await runPublicCode({
      exerciseId,
      language,
      sourceCode,
      stdin,
      runMode,
    });

    const submission = await saveCodeSubmission({
      studentId: req.user.studentId,
      exerciseId,
      language,
      sourceCode,
      stdin,
      result,
      mode: "run",
      executionMode: result.executionMode,
    });

    await safeLogAgentRun({
      agentName: "CodeRunner",
      taskType: "code_run",
      inputText: {
        exerciseId,
        language,
        stdinBytes: Buffer.byteLength(ensureText(stdin), "utf8"),
        sourceBytes: Buffer.byteLength(ensureText(sourceCode), "utf8"),
      },
      outputText: result,
      status: result.status === "accepted" ? "success" : "failed",
      durationMs: Date.now() - startTime,
      source: result.executionMode || "docker",
    });

    return res.json({ ...result, submissionId: submission.id });
  } catch (error) {
    await safeLogAgentRun({
      agentName: "CodeRunner",
      taskType: "code_run",
      inputText: safeCodeInput(req.body || {}),
      outputText: error.message,
      status: "failed",
      durationMs: Date.now() - startTime,
      source: activeExecutionMode(),
    });

    return res.status(error.statusCode || 500).json({
      error: error.message || "代码运行失败",
      code: error.code || "CODE_RUN_FAILED",
    });
  }
}

async function submitCode(req, res) {
  const startTime = Date.now();

  try {
    const {
      exerciseId,
      language = "c",
      sourceCode = "",
      idempotencyKey = req.get("Idempotency-Key") || "",
    } = req.body || {};
    assertSupportedLanguage(language);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const existing = await findSubmissionByIdempotency(req.user.studentId, key);
    if (existing) {
      return res.json({ submission: existing, result: existing.result, reused: true });
    }

    const result = await judgeSubmission({
      exerciseId,
      language,
      sourceCode,
    });
    const submission = await saveCodeSubmission({
      studentId: req.user.studentId,
      exerciseId,
      language,
      sourceCode,
      stdin: "",
      result,
      mode: "submit",
      idempotencyKey: key,
      executionMode: result.executionMode,
    });

    if (result.status === "accepted") {
      void safelyAdjustLearningPath({
        studentId: req.user.studentId,
        reason: `CodeLab 正式提交 ${submission.id} 通过后动态调整`,
        sourceType: "code_submission",
        sourceEventId: String(submission.id),
      }).catch(() => undefined);
    }

    await safeLogAgentRun({
      agentName: "CodeRunner",
      taskType: "code_submit",
      inputText: {
        exerciseId,
        language,
        idempotencyKey: key,
        sourceBytes: Buffer.byteLength(ensureText(sourceCode), "utf8"),
      },
      outputText: { status: result.status, passedCount: result.passedCount, totalCount: result.totalCount },
      status: result.status === "accepted" ? "success" : "failed",
      durationMs: Date.now() - startTime,
      source: result.executionMode || "docker",
    });

    return res.json({ submission, result, reused: false });
  } catch (error) {
    await safeLogAgentRun({
      agentName: "CodeRunner",
      taskType: "code_submit",
      inputText: safeCodeInput(req.body || {}),
      outputText: error.message,
      status: "failed",
      durationMs: Date.now() - startTime,
      source: "docker",
    });

    return res.status(error.statusCode || 500).json({
      error: error.message || "代码提交失败",
      code: error.code || "CODE_SUBMIT_FAILED",
    });
  }
}

async function listCodeSubmissions(req, res) {
  try {
    const data = await listSubmissionsForStudent(req.user.studentId, {
      exerciseId: req.query.exerciseId,
      mode: req.query.mode,
      limit: req.query.limit,
    });
    return res.json({ data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询提交记录失败",
      code: error.code || "CODE_SUBMISSION_LIST_FAILED",
    });
  }
}

async function getCodeSubmission(req, res) {
  try {
    const submission = await getSubmissionByIdForStudent(req.user.studentId, req.params.id);
    if (!submission)
      return res.status(404).json({ error: "submission not found", code: "CODE_SUBMISSION_NOT_FOUND" });
    return res.json({ data: submission });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询提交记录失败",
      code: error.code || "CODE_SUBMISSION_GET_FAILED",
    });
  }
}

async function explainCodeRun(req, res) {
  const startTime = Date.now();

  try {
    const { exerciseId, sourceCode = "", stdout = "", stderr = "", compileOutput = "" } = req.body || {};

    const exercise = exerciseId ? await getPublishedExerciseById(exerciseId) : null;
    const context = {
      message: "请解释代码实验室运行结果。",
      exerciseId,
      exerciseTitle: exercise ? exercise.title : "",
      knowledgePoint: exercise ? exercise.knowledge_point : "",
      sourceCode: truncate(sourceCode, 2000),
      stdout,
      stderr,
      compileOutput,
    };

    let explanation = "";
    let logStatus = "success";

    if (isAIEnabled()) {
      try {
        explanation = await orchestrateTutor(
          context,
          [
            "请用中文解释这次代码运行结果。",
            "先判断运行状态，再说明 stdout、stderr、compileOutput 的含义。",
            "如果代码只通过公开测试，请提示学生继续补充边界条件再正式提交。",
          ].join("\n"),
        );
      } catch (error) {
        logStatus = "fallback";
        explanation = buildExplainFallback(context);
      }
    } else {
      logStatus = "fallback";
      explanation = buildExplainFallback(context);
    }

    await safeLogAgentRun({
      agentName: "TutorAgent",
      taskType: "code_explain",
      inputText: context,
      outputText: explanation,
      status: logStatus,
      durationMs: Date.now() - startTime,
      source: "codelab",
    });

    return res.json({ explanation });
  } catch (error) {
    await safeLogAgentRun({
      agentName: "TutorAgent",
      taskType: "code_explain",
      inputText: req.body || {},
      outputText: error.message,
      status: "failed",
      durationMs: Date.now() - startTime,
      source: "codelab",
    });

    return res.status(error.statusCode || 500).json({
      error: error.message || "解释运行结果失败",
    });
  }
}

function buildExplainFallback(context = {}) {
  const hasError = Boolean(ensureText(context.stderr) || ensureText(context.compileOutput));
  const output = ensureText(context.stdout) || "本次没有标准输出。";

  if (hasError) {
    return [
      "本次代码实验室使用受控 Docker 容器执行，适用于当前比赛现场和本地受控环境。",
      `系统检测到错误信息：${ensureText(context.stderr || context.compileOutput)}`,
      "建议先确认是否包含 main 函数、头文件是否完整，以及核心数据结构函数是否已经补全。",
    ].join("\n");
  }

  return [
    "本次代码实验室使用受控 Docker 容器执行，适用于当前比赛现场和本地受控环境。",
    `当前公开运行标准输出为：${output}`,
    "如果输出与样例一致，说明你可以继续关注顺序表、链表、栈、队列或树遍历等核心逻辑的补全。",
  ].join("\n");
}

function safeCodeInput(body = {}) {
  return {
    exerciseId: ensureText(body.exerciseId),
    language: ensureText(body.language || "c"),
    stdinBytes: Buffer.byteLength(ensureText(body.stdin), "utf8"),
    sourceBytes: Buffer.byteLength(ensureText(body.sourceCode), "utf8"),
    hasIdempotencyKey: Boolean(body.idempotencyKey),
  };
}

async function safeLogAgentRun(payload) {
  try {
    await logAgentRun(payload);
  } catch (error) {
    console.warn("CodeLab agent log failed:", error.message);
  }
}

function truncate(value, maxLength) {
  const text = ensureText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

module.exports = {
  listCodeExercises,
  getCodeExercise,
  getCodeExerciseSolution,
  runCode,
  submitCode,
  listCodeSubmissions,
  getCodeSubmission,
  explainCodeRun,
};
