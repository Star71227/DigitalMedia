/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

const AGENT_LABELS = {
  ProfileAgent: "学习画像智能体",
  PlannerAgent: "路径规划智能体",
  ResourceAgent: "资源生成智能体",
  QuizAgent: "测验生成智能体",
  ReviewAgent: "内容审核智能体",
  FeedbackAgent: "错题反馈智能体",
  TutorAgent: "智能辅导智能体",
  AssessmentAgent: "学习评估智能体",
  CodeRunner: "代码运行智能体",
  coordinator: "系统协调智能体",
};

const TASK_LABELS = {
  chat: "AI 问答",
  resource_generation: "资源生成",
  resource_review: "内容审核",
  path_planning: "路径规划",
  adaptive_quiz: "自适应测验",
  quiz_generation: "练习题生成",
  quiz_hint: "题目提示",
  wrong_question_feedback: "错题反馈",
  profile_update: "学习画像更新",
  assessment: "学习评估",
  code_run: "代码运行",
  code_explain: "运行结果解释",
};

const STATUS_LABELS = {
  success: "已完成",
  fallback: "已兜底",
  failed: "失败",
};

const TASK_SUMMARIES = {
  adaptive_quiz: {
    input: "读取目标课程、知识点、难度和题目数量。",
    analysis: "结合题库与学生薄弱点生成自适应测验。",
    output: "已生成或抽取测验题。",
  },
  quiz_generation: {
    input: "读取目标课程、知识点、难度和题目数量。",
    analysis: "结合题库与学生薄弱点生成练习题。",
    output: "已生成或抽取练习题。",
  },
  resource_generation: {
    input: "读取目标课程、知识点、材料类型和难度。",
    analysis: "多智能体协同生成学习资料并完成质量审核。",
    output: "已生成可学习的资源内容。",
  },
  wrong_question_feedback: {
    input: "读取学生作答、正确答案、题目解析和开放题评分点。",
    analysis: "识别错因、遗漏知识点和下一步复习方向。",
    output: "已生成错因分析与复习建议。",
  },
  profile_update: {
    input: "读取本次作答结果。",
    analysis: "根据答题表现更新知识点掌握度。",
    output: "学习画像已更新。",
  },
  code_run: {
    input: "读取代码练习编号、语言、标准输入和源码摘要。",
    analysis: "使用本地示例运行器生成结果，不真实执行用户代码。",
    output: "已生成本地运行结果并记录提交。",
  },
  code_explain: {
    input: "读取代码练习、源码摘要、标准输出和错误信息。",
    analysis: "结合题目目标解释运行结果与下一步修改方向。",
    output: "已生成代码运行结果解释。",
  },
};

const DEFAULT_SUMMARY = {
  input: "读取课程、知识点、难度和学生状态。",
  analysis: "结合学习画像、开放追问素材和题库内容进行处理。",
  output: "已完成对应任务。",
};

async function logAgentRun({
  agentName,
  taskType,
  inputText,
  outputText,
  status,
  durationMs,
  source,
  traceId,
  stepIndex,
  agentRole,
} = {}) {
  try {
    await pool.query(
      `
        INSERT INTO agent_run_logs (
          agent_name,
          task_type,
          input_text,
          output_text,
          status,
          duration_ms,
          source,
          student_id,
          resource_id,
          path_version,
          trace_id,
          step_index,
          agent_role
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        ensureText(agentName) || "coordinator",
        ensureText(taskType),
        toLongText(inputText),
        toLongText(outputText),
        normalizeStatus(status),
        normalizeDuration(durationMs),
        ensureText(source) || "agent",
        positiveOrNull(arguments[0]?.studentId || pick(inputText, ["studentId", "student_id"])),
        positiveOrNull(arguments[0]?.resourceId || pick(inputText, ["resourceId", "resource_id"])),
        positiveOrNull(arguments[0]?.pathVersion || pick(inputText, ["pathVersion", "path_version"])),
        ensureText(traceId) ? ensureText(traceId).slice(0, 64) : null,
        Number.isFinite(Number(stepIndex)) ? Math.max(0, Math.trunc(Number(stepIndex))) : 0,
        ensureText(agentRole) ? ensureText(agentRole).slice(0, 50) : null,
      ],
    );
  } catch (error) {
    console.warn("agent_run_logs write failed:", error.message);
  }
}

async function listAgentLogs({ limit, studentId } = {}) {
  const owner = positiveOrNull(studentId);
  const [rows] = await pool.query(
    `
      SELECT
        id,
        agent_name,
        task_type,
        input_text,
        output_text,
        status,
        duration_ms,
        source,
        created_at
      FROM agent_run_logs
      ${owner ? "WHERE student_id = ?" : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    owner ? [owner, normalizeLimit(limit)] : [normalizeLimit(limit)],
  );

  return rows;
}

function buildAgentLogSummary(log = {}) {
  const taskType = ensureText(log.task_type);
  const status = normalizeStatus(log.status);
  const taskSummary = TASK_SUMMARIES[taskType] || DEFAULT_SUMMARY;
  const inputData = parseMaybeJson(log.input_text);
  const outputData = parseMaybeJson(log.output_text);

  return {
    id: log.id,
    agent_name: ensureText(log.agent_name) || "coordinator",
    agent_label: AGENT_LABELS[log.agent_name] || `${ensureText(log.agent_name) || "系统"}智能体`,
    task_type: taskType,
    task_label: TASK_LABELS[taskType] || "协同任务",
    status,
    status_label: STATUS_LABELS[status] || "已完成",
    input_summary: buildInputSummary(taskType, inputData, taskSummary.input),
    analysis_summary: buildAnalysisSummary(taskType, inputData, outputData, taskSummary.analysis),
    output_summary: buildOutputSummary(taskType, outputData, taskSummary.output, status),
    duration_ms: normalizeDuration(log.duration_ms),
    created_at: log.created_at,
  };
}

function buildInputSummary(taskType, inputData, fallback) {
  const subject = pick(inputData, ["subject", "domain", "raw.subject", "raw.domain"]);
  const topic = pick(inputData, [
    "knowledgePoint",
    "knowledge_point",
    "topic",
    "raw.knowledgePoint",
    "raw.topic",
  ]);
  const difficulty = pick(inputData, ["difficulty", "raw.difficulty"]);
  const resourceType = pick(inputData, ["resourceType", "raw.resourceType"]);

  if (taskType === "adaptive_quiz" || taskType === "quiz_generation") {
    return joinSentence(["读取目标课程", subject, "知识点", topic, "难度", difficulty], fallback);
  }

  if (taskType === "resource_generation") {
    return joinSentence(
      ["读取目标课程", subject, "知识点", topic, "材料类型", resourceType, "难度", difficulty],
      fallback,
    );
  }

  if (taskType === "wrong_question_feedback") {
    const selected = pick(inputData, ["selectedAnswer", "selected_answer"]);
    const correct = pick(inputData, ["correctAnswer", "correct_answer"]);
    return joinSentence(["读取学生作答", selected, "正确答案", correct, "题目解析和开放题评分点"], fallback);
  }

  if (taskType === "profile_update") {
    const isCorrect = pick(inputData, ["isCorrect"]);
    const result = isCorrect === "" ? "" : isCorrect ? "答对" : "答错";
    return joinSentence(["读取本次作答结果", result, "知识点", topic], fallback);
  }

  if (taskType === "code_run") {
    const exerciseId = pick(inputData, ["exerciseId", "context.exerciseId"]);
    const language = pick(inputData, ["language", "context.language"]);
    return joinSentence(["读取代码练习", exerciseId, "语言", language], fallback);
  }

  if (taskType === "code_explain") {
    const exerciseId = pick(inputData, ["exerciseId", "context.exerciseId"]);
    const title = pick(inputData, ["exerciseTitle", "context.exerciseTitle"]);
    return joinSentence(["解释代码练习", exerciseId, "题目", title], fallback);
  }

  return fallback;
}

function buildAnalysisSummary(taskType, inputData, outputData, fallback) {
  if (taskType === "wrong_question_feedback") {
    const checkpoints = pickArray(inputData, ["openQuestionCheckpoints"]);
    if (checkpoints.length > 0) {
      return truncate(`结合开放追问评分点识别错因：${checkpoints.slice(0, 3).join("；")}。`, 120);
    }
  }

  return fallback;
}

function buildOutputSummary(taskType, outputData, fallback, status) {
  if (status === "failed") {
    return "本次任务执行失败，已记录错误信息。";
  }

  if (taskType === "adaptive_quiz" || taskType === "quiz_generation") {
    const count = countQuestions(outputData);
    return count > 0 ? `已生成或抽取 ${count} 道测验题。` : fallback;
  }

  if (taskType === "wrong_question_feedback") {
    const reason = pick(outputData, ["error_reason", "errorReason", "reason"]);
    return reason ? truncate(`已生成错因分析：${reason}`, 120) : fallback;
  }

  if (taskType === "profile_update") {
    const mastery = pick(outputData, ["mastery"]);
    return mastery === "" ? fallback : `学习画像已更新，当前掌握度约为 ${mastery}。`;
  }

  if (taskType === "code_run") {
    const runStatus = pick(outputData, ["status"]);
    const stdout = pick(outputData, ["stdout"]);
    if (runStatus) {
      return truncate(`本地运行器已返回 ${runStatus}，示例输出：${stdout || "无"}`, 120);
    }
  }

  if (taskType === "code_explain") {
    return truncate(ensureText(outputData) || fallback, 120);
  }

  return fallback;
}

function countQuestions(value) {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (!value || typeof value !== "object") {
    return 0;
  }

  if (Array.isArray(value.data)) {
    return value.data.length;
  }

  if (Array.isArray(value.questions)) {
    return value.questions.length;
  }

  if (value.question_id || value.id || value.question) {
    return 1;
  }

  return 0;
}

function parseMaybeJson(value) {
  const text = cleanText(value);
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const objectStart = text.indexOf("{");
    const arrayStart = text.indexOf("[");
    const candidates = [objectStart, arrayStart].filter((index) => index >= 0);
    if (candidates.length === 0) {
      return text;
    }

    const start = Math.min(...candidates);
    const endChar = text[start] === "[" ? "]" : "}";
    const end = text.lastIndexOf(endChar);
    if (end <= start) {
      return text;
    }

    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
      return text;
    }
  }
}

function cleanText(value) {
  return ensureText(value)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/\bundefined\b/gi, "")
    .replace(/\bnull\b/gi, "")
    .trim();
}

function pick(source, paths) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return current[key];
      }

      return undefined;
    }, source);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function pickArray(source, paths) {
  const value = pick(source, paths);
  return Array.isArray(value) ? value.map((item) => ensureText(item)).filter(Boolean) : [];
}

function joinSentence(parts, fallback) {
  const pairs = [];

  for (let index = 0; index < parts.length; index += 2) {
    const label = parts[index];
    const value = parts[index + 1];
    if (value !== undefined && value !== null && value !== "") {
      pairs.push(`${label}：${ensureText(value)}`);
    }
  }

  if (pairs.length === 0) {
    return fallback;
  }

  return truncate(`${pairs.join("，")}。`, 120);
}

function toLongText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function truncate(value, maxLength) {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function normalizeStatus(status) {
  return ["success", "fallback", "failed"].includes(status) ? status : "success";
}

function normalizeDuration(durationMs) {
  const value = Number(durationMs || 0);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function normalizeLimit(limit) {
  const value = Number(limit || 10);
  if (!Number.isFinite(value) || value <= 0) {
    return 10;
  }

  return Math.min(Math.floor(value), 50);
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function positiveOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

module.exports = {
  logAgentRun,
  listAgentLogs,
  buildAgentLogSummary,
};
