/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { runChat } = require("../services/agentOrchestrator");
const { generateAgentTaskDescriptions } = require("../services/agentTaskDescriptionService");
const chatSessionService = require("../services/chatSessionService");
const { buildCompatibleParts } = require("../services/chatResponseCompatibility");
const { analyzeWrongQuestion, recognizeImageText } = require("../services/wrongQuestionRecognitionService");

function createHandleChat(dependencies = {}) {
  const runChatFn = dependencies.runChatFn || runChat;
  const analyzeWrongQuestionFn = dependencies.analyzeWrongQuestionFn || analyzeWrongQuestion;
  const recognizeImageTextFn = dependencies.recognizeImageTextFn || recognizeImageText;
  const sessions = Object.prototype.hasOwnProperty.call(dependencies, "sessionService")
    ? dependencies.sessionService
    : Object.prototype.hasOwnProperty.call(dependencies, "runChatFn")
      ? null
      : chatSessionService;

  return async function handleChatRequest(req, res, next) {
    let persistedSessionId = null;
    let heartbeat;
    const streaming = req.body?.stream === true;
    const abort = new AbortController();
    const emit = (type, data) => {
      if (res.headersSent && !res.destroyed && !res.writableEnded)
        res.write(JSON.stringify({ type, ...data }) + "\n");
    };
    const startStream = () => {
      if (!streaming) return;
      res
        .status(200)
        .set({
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        });
      res.flushHeaders();
      res.on("close", () => {
        if (!res.writableEnded) abort.abort();
        clearInterval(heartbeat);
      });
      heartbeat = setInterval(() => emit("status", { message: "正在生成并核验回答" }), 10000);
      emit("status", { message: "正在检索课程资料", sessionId: persistedSessionId });
    };
    const streamOptions = streaming
      ? {
          onDelta: (text) => emit("delta", { text }),
          onReset: (message) => emit("reset", { message }),
          signal: abort.signal,
        }
      : {};
    try {
      const { message, history = [], sessionId, wrongQuestion } = req.body || {};
      const wrongQuestionInput = normalizeWrongQuestionInput(wrongQuestion, req.body || {});

      if ((typeof message !== "string" || !message.trim()) && !wrongQuestionInput) {
        return res.status(400).json({ error: "INVALID_CHAT_MESSAGE", message: "message is required" });
      }

      const normalizedMessage =
        typeof message === "string" && message.trim()
          ? message.trim().slice(0, 4000)
          : `请识别并分析我上传的${wrongQuestionInput?.subject || "课程"}错题`;

      /**
       * 图片 + 学生自己的提问：先识别图片文字，再把「图片内容 + 学生问题」交给常规对话链路。
       * 这样学生问什么就答什么（例如「照这道题写一份 C 语言代码」），而不是被固定成错题归因模板；
       * 只发图片不带问题时，仍走原来的错题归因链路（会写入错题本与复习队列）。
       */
      let chatMessage = normalizedMessage;
      let wrongQuestionPath = Boolean(wrongQuestionInput);
      if (wrongQuestionInput?.imageDataUrl && typeof message === "string" && message.trim()) {
        const recognizedImageText = await recognizeImageTextFn({
          subject: wrongQuestionInput.subject,
          imageDataUrl: wrongQuestionInput.imageDataUrl,
        }).catch((recognitionError) => {
          console.warn(
            JSON.stringify({
              level: "warn",
              event: "chat_image_recognition_failed",
              code: String(recognitionError?.code || "UNKNOWN"),
              message: String(recognitionError?.message || "").slice(0, 160),
            }),
          );
          return "";
        });
        if (recognizedImageText) {
          chatMessage = [
            "【学生上传图片中识别出的题目】",
            recognizedImageText,
            "",
            "【学生的问题】",
            message.trim(),
            "",
            "请直接回答学生的问题：该写代码就给完整可运行的代码（用 Markdown 代码块并标注语言），该讲解就分步骤讲清楚，不要套用错题归因模板。",
          ]
            .join("\n")
            .slice(0, 4000);
          wrongQuestionPath = false;
        }
      }

      if (!sessions) {
        const answer = wrongQuestionPath
          ? buildWrongQuestionChatAnswer(
              await analyzeWrongQuestionFn({ studentId: req.user.studentId, ...wrongQuestionInput }),
            )
          : await runChatFn({ studentId: req.user.studentId, message: chatMessage, history });
        return res.json(answer);
      }

      const studentId = req.user.studentId;
      const hasSessionId = sessionId !== undefined && sessionId !== null;
      const session = hasSessionId
        ? await sessions.assertSessionOwnership(studentId, sessionId, { requireActive: true })
        : await sessions.createSession(studentId);
      persistedSessionId = session.id;
      const userMessage = await sessions.saveUserMessage(studentId, session.id, chatMessage);
      const databaseHistory = await sessions.buildSessionHistory(studentId, session.id, {
        excludeMessageId: userMessage.id,
      });
      const trustedHistory = hasSessionId
        ? databaseHistory
        : databaseHistory.length
          ? databaseHistory
          : history;

      startStream();
      let answer;
      try {
        answer = wrongQuestionPath
          ? buildWrongQuestionChatAnswer(await analyzeWrongQuestionFn({ studentId, ...wrongQuestionInput }))
          : await runChatFn({ studentId, message: chatMessage, history: trustedHistory, ...streamOptions });
      } catch (error) {
        await sessions
          .saveFailedAssistantMessage(studentId, session.id, { errorCode: error?.code })
          .catch(() => {
            console.warn("chat failed response could not be persisted");
          });
        throw error;
      }

      await sessions.saveAssistantMessage(studentId, session.id, answer);
      const result = { ...buildPublicChatAnswer(answer), sessionId: session.id };
      if (streaming) {
        emit("done", { answer: result });
        return res.end();
      }
      return res.json(result);
    } catch (error) {
      if (res.headersSent) {
        emit("error", {
          code: error.code || "CHAT_FAILED",
          message: error.publicMessage || "回答中断，请检查模型服务后重试。",
          status: error.statusCode || 503,
          sessionId: persistedSessionId,
        });
        return res.end();
      }
      if (isPublicAIError(error)) {
        return res.status(error.statusCode || 503).json({
          error: error.code,
          message: error.publicMessage || "AI 学习助手暂时不可用，请稍后重试。",
          requestId: req.requestId,
          ...(persistedSessionId ? { sessionId: persistedSessionId } : {}),
        });
      }
      return next(error);
    } finally {
      clearInterval(heartbeat);
    }
  };
}

function normalizeWrongQuestionInput(value, body) {
  const input =
    value && typeof value === "object" && !Array.isArray(value) ? value : body.imageDataUrl ? body : null;
  if (!input) return null;
  return {
    subject: String(input.subject || "")
      .trim()
      .slice(0, 120),
    questionText: String(input.questionText || "")
      .trim()
      .slice(0, 20000),
    imageDataUrl: String(input.imageDataUrl || ""),
    studentAnswer: String(input.studentAnswer || "")
      .trim()
      .slice(0, 500),
    correctAnswer: String(input.correctAnswer || "")
      .trim()
      .slice(0, 500),
  };
}

function buildWrongQuestionChatAnswer(result) {
  const points = Array.isArray(result.knowledgePoints) ? result.knowledgePoints : [];
  const citations = Array.isArray(result.citations)
    ? result.citations.map((item) => ({
        label: item.label,
        chunkId: item.chunkId,
        sourceKey: item.sourceKey,
        sourceTitle: item.sourceTitle,
        chapter: item.chapter,
        section: item.section,
        license: item.scope === "course" ? "课程授权资料" : "学生私有资料",
        version: item.version,
        excerpt: item.excerpt,
        supportScore: item.score,
      }))
    : [];
  const citationLabels = citations.map((item) => `[${item.label}]`).join(" ");
  return {
    answerMarkdown: [
      "# 错题识别与教材归因",
      "",
      `**识别题目：** ${result.recognizedText}`,
      "",
      `**关联知识点：** ${points.join("、") || "课程资料证据不足，待确认"}`,
      "",
      `## 错因分析\n${result.errorReason || "未提供作答信息，暂时无法确定具体错因。"}`,
      "",
      `## 基于课程私有知识库的讲解\n${result.explanation || "没有足够教材证据，未生成通用知识回答。"} ${citationLabels}`,
      "",
      `已写入错题本（编号 ${result.wrongQuestionId}）并加入滚动复习队列。`,
    ].join("\n"),
    sourceMode: result.model ? "rag_model" : "deterministic_fallback",
    subject: result.subject,
    knowledgePoint: points[0] || "",
    knowledgeNotice: "回答仅使用课程本地知识库和当前学生私有资料；T 为教材引用，P 为个人资料引用。",
    citations,
    codeBlocks: [],
    followups: ["为这道错题生成三道变式题", "把相关知识点加入学习路径", "安排下一次复习"],
    profileSuggestions: [],
    trace: { collapsed: true, summary: "错题识别、私有检索、教材引用校验与复习入队已完成", steps: [] },
    quality: { passed: result.confidence !== "insufficient", issues: [] },
    modelAvailable: Boolean(result.model),
  };
}

function buildPublicChatAnswer(answer = {}) {
  const sanitized = chatSessionService.sanitizePublicAnswer(answer);
  const messageId = String(answer?.messageId || "").trim();
  const compatibleSource = Array.isArray(answer?.parts) && answer.parts[0] ? answer.parts[0] : {};
  return {
    ...(/^[A-Za-z0-9._:-]{1,64}$/.test(messageId) ? { messageId } : {}),
    ...sanitized,
    parts: buildCompatibleParts({
      ...sanitized,
      retrievalRunId: positiveNumberOrNull(compatibleSource.retrievalRunId),
      retrievalConfidence: safeConfidence(compatibleSource.confidence),
      citationCoverage: finiteNumberOrNull(compatibleSource.coverage),
    }),
  };
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeConfidence(value) {
  const confidence = String(value || "");
  return ["high", "medium", "low", "insufficient"].includes(confidence) ? confidence : null;
}

function isPublicAIError(error) {
  return ["AI_SERVICE_UNAVAILABLE", "AI_RESPONSE_QUALITY_FAILED"].includes(error?.code);
}

async function createChatSession(req, res, next) {
  try {
    return res.status(201).json({ session: await chatSessionService.createSession(req.user.studentId) });
  } catch (error) {
    return next(error);
  }
}

async function listChatSessions(req, res, next) {
  try {
    return res.json(
      await chatSessionService.listSessions(req.user.studentId, {
        status: req.query.status,
        limit: req.query.limit,
        page: req.query.page,
      }),
    );
  } catch (error) {
    return next(error);
  }
}

async function listChatMessages(req, res, next) {
  try {
    return res.json(
      await chatSessionService.listMessages(req.user.studentId, req.params.sessionId, {
        limit: req.query.limit,
        beforeId: req.query.beforeId,
      }),
    );
  } catch (error) {
    return next(error);
  }
}

async function renameChatSession(req, res, next) {
  try {
    const session = await chatSessionService.renameSession(
      req.user.studentId,
      req.params.sessionId,
      req.body?.title,
    );
    return res.json({ session });
  } catch (error) {
    return next(error);
  }
}

async function archiveChatSession(req, res, next) {
  try {
    const session = await chatSessionService.archiveSession(req.user.studentId, req.params.sessionId);
    return res.json({ session });
  } catch (error) {
    return next(error);
  }
}

const handleChat = createHandleChat();

async function handleAgentTaskDescriptions(req, res) {
  const { question } = req.body || {};

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  const descriptions = await generateAgentTaskDescriptions(question);
  return res.json(descriptions);
}

module.exports = {
  handleChat,
  createHandleChat,
  createChatSession,
  listChatSessions,
  listChatMessages,
  renameChatSession,
  archiveChatSession,
  handleAgentTaskDescriptions,
};
