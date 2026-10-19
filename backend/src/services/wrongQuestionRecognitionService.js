/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const { pool } = require("../config/db");
const { generateJson, isAIEnabled, getAIStatus } = require("./aiService");
const { retrieveCourseEvidence } = require("./personalKnowledgeService");
const { scheduleReview } = require("./reviewScheduleService");

async function analyzeWrongQuestion({
  studentId,
  subject,
  questionText,
  imageDataUrl,
  studentAnswer,
  correctAnswer,
}) {
  const owner = positiveId(studentId, "studentId");
  const normalizedSubject = requiredText(subject, "subject", 120);
  let recognizedText = String(questionText || "").trim();
  const aiStatus = getAIStatus();
  if (imageDataUrl) {
    assertImageDataUrl(imageDataUrl);
    if (!isAIEnabled())
      throw serviceError("VISION_MODEL_NOT_CONFIGURED", "错题图片识别需要配置支持视觉的模型 API。", 424);
    const vision = await generateJson({
      capability: "wrong_question_vision",
      messages: [
        {
          role: "system",
          content: "你是教材错题 OCR 与结构化识别器。忠实抄录图片，不补写看不清的内容。只返回 JSON。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `课程：${normalizedSubject}\n请返回 {questionText, options, studentAnswer, correctAnswer, unreadableParts}。看不清的字段使用空字符串。`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
      temperature: 0.05,
      maxTokens: 1800,
      model: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL,
    });
    recognizedText = String(vision?.questionText || "").trim();
    if (Array.isArray(vision?.options) && vision.options.length)
      recognizedText += `\n选项：${vision.options.join("；")}`;
    studentAnswer = studentAnswer || vision?.studentAnswer;
    correctAnswer = correctAnswer || vision?.correctAnswer;
  }
  if (!recognizedText) throw requestError("没有识别到可分析的题目文字");

  const evidence = await retrieveCourseEvidence({
    studentId: owner,
    subject: normalizedSubject,
    query: recognizedText,
    limit: 10,
  });
  const textbookEvidence = evidence.filter((item) => item.scope === "course");
  const personalEvidence = evidence.filter((item) => item.scope === "personal");
  let result;
  let sourceMode;
  if (isAIEnabled() && textbookEvidence.length) {
    result = await generateGroundedClassification({
      subject: normalizedSubject,
      recognizedText,
      studentAnswer,
      correctAnswer,
      evidence,
    });
    sourceMode = imageDataUrl ? "vision_private_rag" : "text_private_rag";
  } else {
    const best = evidence[0];
    result = {
      knowledgePoints: best ? [best.section || best.chapter || "待确认知识点"] : [],
      errorReason: "模型 API 尚未配置，系统只完成了本地资料检索，未生成推测性讲解。",
      explanation: best
        ? `已找到可能相关的课程资料“${best.sourceTitle}”，请配置模型后进行严格的教材证据归因。`
        : "课程私有知识库中没有找到足够证据，请先导入对应教材资料。",
      citations: best ? [best.label] : [],
      confidence: best ? "low" : "insufficient",
    };
    sourceMode = best ? "local_retrieval_only" : "insufficient_course_evidence";
  }
  const allowed = new Set(evidence.map((item) => item.label));
  const citations = [
    ...new Set((Array.isArray(result.citations) ? result.citations : []).map(String)),
  ].filter((label) => allowed.has(label));
  if (sourceMode.includes("rag") && !citations.some((label) => label.startsWith("T"))) {
    throw serviceError("TEXTBOOK_CITATION_REQUIRED", "模型回答没有引用课程教材原文，结果已被拒绝。", 502);
  }
  const citationDetails = citations
    .map((label) => evidence.find((item) => item.label === label))
    .filter(Boolean);
  const knowledgePoints = normalizeStringArray(result.knowledgePoints).slice(0, 6);
  const primaryPoint =
    knowledgePoints[0] || textbookEvidence[0]?.section || textbookEvidence[0]?.chapter || "待识别知识点";
  const questionId = `upload-${owner}-${Date.now()}-${sha256(recognizedText).slice(0, 8)}`;
  const connection = await pool.getConnection();
  let wrongQuestionId;
  let analysisId;
  try {
    await connection.beginTransaction();
    const [wrongInsert] = await connection.query(
      `INSERT INTO wrong_questions
        (student_id,question_id,subject,knowledge_point,difficulty,question_text,selected_answer,
         correct_answer,analysis,error_reason,feedback_suggestion,recommended_action,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'待复习')`,
      [
        owner,
        questionId,
        normalizedSubject,
        primaryPoint,
        "待评估",
        recognizedText,
        String(studentAnswer || "").slice(0, 200),
        String(correctAnswer || "").slice(0, 200),
        String(result.explanation || "").slice(0, 12000),
        String(result.errorReason || "").slice(0, 3000),
        `复习 ${primaryPoint} 的教材原文并完成针对性测验`,
        "加入滚动复习队列",
      ],
    );
    wrongQuestionId = Number(wrongInsert.insertId);
    const [analysisInsert] = await connection.query(
      `INSERT INTO wrong_question_ai_analyses
        (student_id,wrong_question_id,subject,recognized_text,student_answer,correct_answer,
         knowledge_points_json,explanation_text,citations_json,retrieval_context_json,source_mode,model_name)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        owner,
        wrongQuestionId,
        normalizedSubject,
        recognizedText,
        studentAnswer || null,
        correctAnswer || null,
        JSON.stringify(knowledgePoints),
        String(result.explanation || ""),
        JSON.stringify(citationDetails),
        JSON.stringify({ textbookEvidence, personalEvidence }),
        sourceMode,
        aiStatus.model || null,
      ],
    );
    analysisId = Number(analysisInsert.insertId);
    await scheduleReview(
      {
        studentId: owner,
        subject: normalizedSubject,
        knowledgePoint: primaryPoint,
        sourceType: "wrong_question",
        sourceId: String(wrongQuestionId),
        priority: 95,
      },
      connection,
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
  return {
    analysisId,
    wrongQuestionId,
    recognizedText,
    subject: normalizedSubject,
    knowledgePoints,
    errorReason: String(result.errorReason || ""),
    explanation: String(result.explanation || ""),
    confidence: ["high", "medium", "low", "insufficient"].includes(result.confidence)
      ? result.confidence
      : "low",
    citations: citationDetails,
    sourceMode,
    evidencePolicy: "course_and_student_private_only",
    model: sourceMode.includes("rag") ? aiStatus.model : null,
  };
}

/**
 * 只做「图片 → 文字」的识别（不写错题本、不做 RAG 归因）。
 * 学习助手在「学生上传图片 + 自己提了问题」时走这条：识别出题目后，
 * 把图片内容与原问题一起交给常规对话链路，学生问什么就答什么（包括要求写代码）。
 */
async function recognizeImageText({ subject, imageDataUrl, extraInstruction }) {
  assertImageDataUrl(imageDataUrl);
  if (!isAIEnabled())
    throw serviceError("VISION_MODEL_NOT_CONFIGURED", "图片识别需要配置支持视觉的模型 API。", 424);
  const vision = await generateJson({
    capability: "wrong_question_vision",
    messages: [
      {
        role: "system",
        content:
          "你是题目图片的 OCR 转写器。忠实抄录图片中的全部文字（题干、选项、代码、输入输出样例、学生作答痕迹），" +
          "保留必要的换行与程序结构，不补写图片里看不清的内容，也不要作答。只返回 JSON。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${subject ? `课程：${subject}\n` : ""}请返回 {questionText, options, studentAnswer, correctAnswer, unreadableParts}。questionText 里请完整抄录题干与代码；看不清的字段使用空字符串。${extraInstruction ? `\n补充要求：${extraInstruction}` : ""}`,
          },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
    temperature: 0.05,
    maxTokens: 2000,
    model: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL,
  });
  let recognized = String(vision?.questionText || "").trim();
  if (Array.isArray(vision?.options) && vision.options.length)
    recognized += `\n选项：${vision.options.join("；")}`;
  if (vision?.studentAnswer) recognized += `\n学生作答：${String(vision.studentAnswer).trim()}`;
  return recognized;
}

async function generateGroundedClassification({
  subject,
  recognizedText,
  studentAnswer,
  correctAnswer,
  evidence,
}) {
  const payload = evidence.map((item) => ({
    label: item.label,
    scope: item.scope,
    sourceTitle: item.sourceTitle,
    chapter: item.chapter,
    section: item.section,
    excerpt: item.excerpt,
  }));
  const result = await generateJson({
    capability: "wrong_question_vision",
    messages: [
      {
        role: "system",
        content:
          "你是课程私有知识库错题分析器。只能依据提供的教材与学生私有资料，不得使用模型通用知识补充事实。每个专业结论必须引用证据标签，且至少引用一个 T 开头的教材标签。只返回 JSON。",
      },
      {
        role: "user",
        content: [
          `课程：${subject}`,
          `错题：${recognizedText}`,
          `学生答案：${studentAnswer || "未提供"}`,
          `正确答案：${correctAnswer || "未提供"}`,
          `私有证据：${JSON.stringify(payload)}`,
          "返回 {knowledgePoints:[string],errorReason:string,explanation:string,citations:[string],confidence:'high|medium|low|insufficient'}。引用只能使用给定标签。",
        ].join("\n"),
      },
    ],
    temperature: 0.08,
    maxTokens: 2200,
    model: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL,
  });
  if (!result || typeof result !== "object")
    throw serviceError("AI_RESPONSE_INVALID", "模型没有返回合法的错题分析结构。", 502);
  return result;
}

function assertImageDataUrl(value) {
  const text = String(value || "");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(text);
  if (!match) throw requestError("imageDataUrl 只支持 PNG、JPEG 或 WebP 的 base64 data URL");
  if (match[2].length > 9_000_000) throw requestError("错题图片不能超过约 6MB");
}
function normalizeStringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}
function requiredText(value, name, max) {
  const text = String(value || "").trim();
  if (!text) throw requestError(`${name} 不能为空`);
  return text.slice(0, max);
}
function positiveId(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw requestError(`${name} 无效`);
  return number;
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function requestError(message) {
  return serviceError("INVALID_WRONG_QUESTION_INPUT", message, 400);
}
function serviceError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

module.exports = { analyzeWrongQuestion, recognizeImageText, assertImageDataUrl };
