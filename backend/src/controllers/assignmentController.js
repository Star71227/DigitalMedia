/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const assignments = require("../services/assignmentService");
const questionBank = require("../services/teacherQuestionBankService");

function fail(res, error) {
  const status = Number(error.statusCode) || 500;
  const requestId = res.req?.requestId;
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      status,
      area: "assignment",
      code: error.code || "ERROR",
      message: status < 500 ? String(error.message).slice(0, 200) : "assignment operation failed",
    }),
  );
  return res.status(status).json({
    error: status < 500 ? error.message : "作业操作失败",
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

function requireStudent(req) {
  const role = String(req.user?.role || "").toUpperCase();
  if (role !== "STUDENT") {
    const error = new Error("该接口仅学生账号可用");
    error.statusCode = 403;
    throw error;
  }
  return req.user;
}

async function options(req, res) {
  return respond(res, async () => ({
    classes: await assignments.listManagedClasses(req.user),
    subjects: await questionBank.listQuestionBankSubjects(req.user),
    maxQuestions: assignments.MAX_QUESTIONS_PER_ASSIGNMENT,
    maxCodeExercises: assignments.MAX_CODE_EXERCISES_PER_ASSIGNMENT,
  }));
}

// 发布作业时可选用的 CodeLab 代码题（可按科目过滤）
async function codeExercises(req, res) {
  return respond(res, () =>
    assignments.listAssignmentCodeExercises(req.user, { subject: req.query.subject }),
  );
}

// 发布作业时可选用的简答题（open_question_bank，可按科目过滤）
async function openQuestions(req, res) {
  return respond(res, () =>
    assignments.listAssignmentOpenQuestions(req.user, { subject: req.query.subject }),
  );
}

async function create(req, res) {
  return respond(
    res,
    async () => ({ assignment: await assignments.createAssignment(req.user, req.body || {}) }),
    201,
  );
}

async function list(req, res) {
  return respond(res, async () => ({ data: await assignments.listTeacherAssignments(req.user) }));
}

async function detail(req, res) {
  return respond(res, () => assignments.getTeacherAssignmentDetail(req.user, req.params.assignmentId));
}

async function listMine(req, res) {
  return respond(res, async () => ({ data: await assignments.listStudentAssignments(requireStudent(req)) }));
}

async function myDetail(req, res) {
  return respond(res, () => assignments.getStudentAssignment(requireStudent(req), req.params.assignmentId));
}

async function submit(req, res) {
  return respond(
    res,
    async () =>
      await assignments.submitStudentAssignment(requireStudent(req), req.params.assignmentId, req.body || {}),
  );
}

// 作业内代码题：学生提交源码 → 后台判题（公开 + 隐藏用例）→ 记录到 code_submissions
async function submitCode(req, res) {
  return respond(
    res,
    async () =>
      await assignments.submitStudentCode(
        requireStudent(req),
        req.params.assignmentId,
        req.params.exerciseId,
        req.body || {},
      ),
  );
}

module.exports = {
  codeExercises,
  create,
  detail,
  list,
  listMine,
  myDetail,
  openQuestions,
  options,
  submit,
  submitCode,
};
