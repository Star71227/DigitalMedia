/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { runQuestionGeneration, runQuizHint } = require("../services/agentOrchestrator");
const {
  listQuestions,
  pickRandomQuestions,
  countAvailableQuestions,
  toPublicQuestion,
  toPublicFrontendQuestion,
  normalizeSubject,
  normalizeDifficulty,
} = require("../services/questionBankService");
const { logAgentRun } = require("../services/agentLogService");
const { submitQuiz } = require("../services/quizSubmissionService");

async function generateQuestion(req, res, next) {
  try {
    const { domain, knowledgePoint, difficulty } = req.body || {};
    const subject = normalizeSubject(domain);
    const normalizedDifficulty = normalizeDifficulty(difficulty);

    try {
      const bankQuestions = await listQuestions({
        studentId: req.user.studentId,
        subject,
        knowledgePoint,
        difficulty: normalizedDifficulty,
        limit: 1,
      });

      if (bankQuestions.length > 0) {
        const question = toPublicFrontendQuestion(bankQuestions[0]);
        await logAgentRun({
          agentName: "QuizAgent",
          taskType: "quiz_generation",
          inputText: {
            domain,
            knowledgePoint,
            difficulty,
          },
          outputText: question,
          status: "success",
          durationMs: 0,
          source: "question_bank",
        });

        return res.json({ question });
      }
    } catch (error) {
      console.error(`题库查询失败，/api/generate-question 将回退到 QuizAgent：${error.message}`);
    }

    const question = toPublicGeneratedQuestion(
      await runQuestionGeneration({
        domain,
        knowledgePoint,
        difficulty,
      }),
    );

    return res.json({ question });
  } catch (error) {
    return next(error);
  }
}

async function generateQuizHint(req, res, next) {
  try {
    const { question, code, options } = req.body || {};
    const hint = await runQuizHint({ question, code, options });

    return res.json({ hint });
  } catch (error) {
    return next(error);
  }
}

async function listQuizQuestions(req, res) {
  try {
    const subject = req.query.subject;
    const knowledgePoint = req.query.knowledge_point || req.query.knowledgePoint;
    const difficulty = req.query.difficulty;
    const limit = req.query.limit;

    if (!subject) {
      return res.status(400).json({ error: "subject is required" });
    }

    const questions = await listQuestions({
      studentId: req.user.studentId,
      subject,
      knowledgePoint,
      difficulty,
      limit,
    });

    return res.json({
      data: questions.map(toPublicQuestion),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询题库失败",
    });
  }
}

function clampCount(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(Math.floor(number), max));
}

/**
 * 学生自测组卷（走题库，不走模型）：
 * GET /api/quiz/paper?subject=数据结构&choice=6&blank=4[&reveal=1]
 * 返回单选题 + 填空题；默认不含答案与解析（判分在 /api/quiz/submit），
 * 带 reveal=1 时把答案与解析一并返回，供「边答边批改」的练习模式使用。
 */
async function getQuizPaper(req, res) {
  try {
    const subject = normalizeSubject(req.query.subject);
    const choiceCount = clampCount(req.query.choice, 6, 20);
    const blankCount = clampCount(req.query.blank, 4, 10);
    const reveal = String(req.query.reveal || "") === "1" || req.query.reveal === "true";

    const [choiceQuestions, blankQuestions, available] = await Promise.all([
      choiceCount
        ? pickRandomQuestions({
            subject,
            questionType: "single_choice",
            limit: choiceCount,
            studentId: req.user.studentId,
          })
        : Promise.resolve([]),
      blankCount
        ? pickRandomQuestions({
            subject,
            questionType: "fill_blank",
            limit: blankCount,
            studentId: req.user.studentId,
          })
        : Promise.resolve([]),
      countAvailableQuestions({ subject, studentId: req.user.studentId }),
    ]);

    if (!choiceQuestions.length && !blankQuestions.length) {
      return res.status(422).json({
        error: `「${subject}」题库里暂时没有可用于自测的题目。`,
        code: "EMPTY_QUIZ_PAPER",
      });
    }

    // 交替混排，避免先做完所有单选再一口气填空
    const merged = [];
    const max = Math.max(choiceQuestions.length, blankQuestions.length);
    for (let i = 0; i < max; i += 1) {
      if (choiceQuestions[i]) merged.push(choiceQuestions[i]);
      if (blankQuestions[i]) merged.push(blankQuestions[i]);
    }

    return res.json({
      subject,
      choiceCount: choiceQuestions.length,
      blankCount: blankQuestions.length,
      available,
      reveal,
      questions: merged.map((row) => {
        const question = toPublicQuestion(row);
        if (!reveal) return question;
        return { ...question, answer: row.answer || "", analysis: row.analysis || "" };
      }),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "组卷失败" });
  }
}

async function submitQuizAnswer(req, res) {
  try {
    const { idempotencyKey, quizId, courseId, subject, answers, startedAt, submittedAt } = req.body || {};
    const result = await submitQuiz({
      studentId: req.user.studentId,
      idempotencyKey: idempotencyKey || quizId,
      courseId,
      subject,
      answers,
      startedAt,
      submittedAt,
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "提交测验失败" });
  }
}

function toPublicGeneratedQuestion(question) {
  if (!question || typeof question !== "object" || Array.isArray(question)) return question;
  const {
    answerIndex,
    answer,
    correctAnswer,
    correct_answer,
    answerKey,
    answer_key,
    explanation,
    analysis,
    solution,
    solutions,
    ...publicQuestion
  } = question;
  return publicQuestion;
}

module.exports = {
  generateQuestion,
  generateQuizHint,
  listQuizQuestions,
  getQuizPaper,
  submitQuizAnswer,
};
