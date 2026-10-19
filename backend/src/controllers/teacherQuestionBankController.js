/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const bank = require("../services/teacherQuestionBankService");

function fail(res, error) {
  const status = Number(error.statusCode) || 500;
  const requestId = res.req?.requestId;
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      status,
      area: "teacher-question-bank",
      code: error.code || "ERROR",
      message: status < 500 ? String(error.message).slice(0, 200) : "question bank operation failed",
    }),
  );
  return res.status(status).json({
    error: status < 500 ? error.message : "题库操作失败",
    code: error.code || (status === 403 ? "FORBIDDEN" : undefined),
    requestId,
  });
}

async function respond(res, work, status = 200) {
  try {
    return res.status(status).json(await work());
  } catch (error) {
    return fail(res, error);
  }
}

async function subjects(req, res) {
  return respond(res, async () => ({
    subjects: await bank.listQuestionBankSubjects(req.user),
    difficulties: bank.DIFFICULTIES,
  }));
}

async function list(req, res) {
  return respond(res, () =>
    bank.listQuestions(req.user, {
      subject: req.query.subject,
      difficulty: req.query.difficulty,
      questionType: req.query.questionType,
      keyword: req.query.keyword,
      scope: req.query.scope,
      limit: req.query.limit,
    }),
  );
}

async function create(req, res) {
  return respond(res, async () => ({ question: await bank.createQuestion(req.user, req.body || {}) }), 201);
}

async function remove(req, res) {
  return respond(res, () => bank.deleteQuestion(req.user, req.params.questionId));
}

module.exports = { create, list, remove, subjects };
